"use strict";
/* ---------- Tiện ích: plugin của đội ngũ + cầu nối cho extension trình duyệt ----------
   • Plugin chạy trong iframe sandbox (không chạm được vào trang Bravin), nói chuyện qua postMessage (xem sdk/bravin-sdk.js).
   • Mỗi plugin khai báo quyền trong manifest; người dùng duyệt lúc cài. Gọi thiếu quyền → lỗi permission_denied.
   • Extension trình duyệt dùng cầu nối window.postMessage({bravin:"bridge"}) — người dùng cho phép từng extension một.
   Tài liệu: docs/PLUGIN_SDK.md */
(function () {
  const API_VERSION = 2, APP_NAME = "Bravin";
  const PERMS = {
    "timeline.read": "Đọc timeline (clip, thời lượng, vị trí kim)",
    "timeline.write": "Thêm, sửa, xoá clip trên timeline",
    "media.read": "Xem danh sách file trong Thư viện",
    "media.import": "Đưa file / ảnh / video vào Thư viện",
    "project.read": "Chụp khung hình đang xem",
    "playback": "Phát và dừng video",
    "ui": "Hiện thông báo, bảng riêng và lệnh trong menu",
    "network": "Truy cập mạng tới các địa chỉ plugin khai báo",
    "video.frames": "Đọc hình ảnh từng khung của clip (để theo dõi chuyển động, phân tích hình)"
  };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const perr = (code, message) => Object.assign(new Error(message), { code });
  const live = new Map();           // id -> {rec, wrap, frame, win, ready, subs:Set, cmds:[], status, err}
  let recs = [], sdkText = null, dbP = null;

  /* ===== lưu trữ (IndexedDB) ===== */
  function db() {
    if (dbP) return dbP;
    dbP = new Promise((res, rej) => { try { const r = indexedDB.open("bravin-plugins", 1); r.onupgradeneeded = () => r.result.createObjectStore("plugins", { keyPath: "id" }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } });
    return dbP;
  }
  async function dbAll() { try { const d = await db(); return await new Promise((res, rej) => { const q = d.transaction("plugins").objectStore("plugins").getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => rej(q.error); }); } catch (_) { return []; } }
  async function dbPut(rec) { const d = await db(); return new Promise((res, rej) => { const tx = d.transaction("plugins", "readwrite"); tx.objectStore("plugins").put(rec); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }
  async function dbDel(id) { const d = await db(); return new Promise((res, rej) => { const tx = d.transaction("plugins", "readwrite"); tx.objectStore("plugins").delete(id); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }

  /* ===== manifest ===== */
  function normManifest(m) {
    if (!m || typeof m !== "object") throw perr("bad_manifest", "Manifest không hợp lệ (cần file JSON).");
    const id = String(m.id || ""), name = String(m.name || "").trim();
    if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(id)) throw perr("bad_manifest", "id phải gồm chữ thường, số, dấu . _ - (3–64 ký tự), ví dụ com.doi-ngu.thong-ke.");
    if (!name) throw perr("bad_manifest", "Thiếu name.");
    const entry = String(m.entry || "index.html"); if (/^[a-z]+:|^\/\//i.test(entry) || entry.includes("..")) throw perr("bad_manifest", "entry phải là đường dẫn tương đối.");
    const permissions = [...new Set((Array.isArray(m.permissions) ? m.permissions : []).map(String))];
    const bad = permissions.find(p => !PERMS[p]); if (bad) throw perr("bad_manifest", "Quyền không có trong SDK: " + bad);
    const network = (Array.isArray(m.network) ? m.network : []).map(String).filter(h => /^(\*\.)?[a-z0-9.-]+(:\d+)?$/i.test(h));
    if (permissions.includes("network") && !network.length) throw perr("bad_manifest", "Có quyền network thì phải khai báo network: [\"api.example.com\"].");
    const commands = (Array.isArray(m.commands) ? m.commands : []).filter(c => c && /^[\w.-]{1,48}$/.test(c.id || "") && c.title).map(c => ({ id: c.id, title: String(c.title).slice(0, 60), context: ["global", "clip", "selection"].includes(c.context) ? c.context : "global" }));
    const panel = m.panel ? { title: String(m.panel.title || name).slice(0, 40), height: Math.max(160, Math.min(720, +m.panel.height || 420)), size: m.panel.size === "large" ? "large" : "normal" } : null;
    if ((+m.apiVersion || 1) > API_VERSION) throw perr("needs_update", "Plugin này cần Bravin mới hơn (SDK API v" + (+m.apiVersion) + "). Hãy cập nhật Bravin rồi cài lại.");
    return { id, name: name.slice(0, 60), version: String(m.version || "0.0.0").slice(0, 20), author: String(m.author || "").slice(0, 60), description: String(m.description || "").slice(0, 300), entry, permissions, network, commands, panel, apiVersion: +m.apiVersion || 1 };
  }
  async function plFetchText(url) {
    try { const r = await fetch(url, { cache: "no-store" }); if (!r.ok) throw perr("http", "Máy chủ trả về " + r.status + " cho " + url); return await r.text(); }
    catch (e) {
      if (e.code === "http") throw e;
      if (typeof dlHasProxy === "function" && dlHasProxy()) { const r = await fetch("/dl?url=" + encodeURIComponent(url), { headers: { "X-Bravin": "1" } }); if (r.ok) return await r.text(); }
      throw perr("network", "Không tải được " + url + ". Máy chủ plugin cần bật CORS (Access-Control-Allow-Origin: *), hoặc dùng file .bravinplugin.json.");
    }
  }
  /* từ URL hoặc nội dung JSON -> bản ghi chưa lưu */
  async function parseSource(text, srcUrl) {
    let o; try { o = JSON.parse(text); } catch (_) { throw perr("bad_manifest", "Nội dung không phải JSON. Cần manifest.json hoặc file .bravinplugin.json."); }
    if (o && o.format === "bravin-plugin") {
      const manifest = normManifest(o.manifest), files = o.files && typeof o.files === "object" ? o.files : {};
      if (typeof files[manifest.entry] !== "string") throw perr("bad_manifest", "Gói plugin thiếu file " + manifest.entry + ".");
      return { id: manifest.id, manifest, files, source: srcUrl || "file" };
    }
    const manifest = normManifest(o); if (!srcUrl) throw perr("bad_manifest", "manifest.json cần cài bằng URL (để tải entry). Với file hãy dùng gói .bravinplugin.json.");
    const baseUrl = new URL(".", srcUrl).href, html = await plFetchText(new URL(manifest.entry, baseUrl).href);
    return { id: manifest.id, manifest, baseUrl, html, source: srcUrl };
  }

  /* ===== hộp thoại chung ===== */
  function ask(title, bodyHtml, okText, cancelText) {
    return new Promise(res => {
      const ov = document.createElement("div"); ov.className = "overlay"; ov.style.zIndex = 80;
      ov.innerHTML = `<div class="dialog plugask" role="dialog" aria-modal="true" aria-labelledby="plaT"><h2 id="plaT">${esc(title)}</h2><div class="plabody">${bodyHtml}</div><div class="dlact"><button type="button" class="primary plok">${esc(okText || "Đồng ý")}</button><button type="button" class="plno">${esc(cancelText || "Huỷ")}</button></div></div>`;
      document.body.appendChild(ov);
      const done = v => { ov.remove(); res(v); };
      ov.querySelector(".plok").onclick = () => done(true); ov.querySelector(".plno").onclick = () => done(false);
      ov.addEventListener("pointerdown", e => { if (e.target === ov) done(false); });
      ov.addEventListener("keydown", e => { if (e.key === "Escape") done(false); });
      setTimeout(() => ov.querySelector(".plno").focus(), 30);
    });
  }
  function permList(m) { return m.permissions.length ? "<ul class='plperms'>" + m.permissions.map(p => `<li>${esc(PERMS[p])}${p === "network" ? ": <b>" + esc(m.network.join(", ")) + "</b>" : ""}</li>`).join("") + "</ul>" : "<p class='note'>Plugin này không xin quyền nào.</p>"; }

  /* ===== cài / gỡ ===== */
  async function install(parsed, opts = {}) {
    const old = recs.find(r => r.id === parsed.id), m = parsed.manifest;
    if (!opts.silent) {
      const ok = await ask(old ? "Cập nhật plugin?" : "Cài plugin?",
        `<p><b>${esc(m.name)}</b> <span class="note">v${esc(m.version)}${m.author ? " · " + esc(m.author) : ""}</span></p>${m.description ? "<p>" + esc(m.description) + "</p>" : ""}<p>Plugin này được phép:</p>${permList(m)}<p class="note">Nguồn: ${esc(parsed.source)}. Chỉ cài plugin do đội ngũ bạn tin cậy. Plugin chạy trong khung cách ly, không đọc được mật khẩu hay dữ liệu khác của Bravin.</p>`, old ? "Cập nhật" : "Cài đặt");
      if (!ok) return null;
    }
    const rec = Object.assign({}, parsed, { enabled: old ? old.enabled : true, granted: m.permissions.slice(), installedAt: old ? old.installedAt : Date.now(), updatedAt: Date.now() });
    await dbPut(rec); recs = recs.filter(r => r.id !== rec.id).concat(rec);
    unload(rec.id); if (rec.enabled) load(rec);
    refreshUi(); toast((old ? "Đã cập nhật " : "Đã cài ") + m.name); return rec;
  }
  async function installFromUrl(u) {
    let url; try { url = new URL(String(u).trim()); } catch (_) { throw perr("bad_url", "Link không hợp lệ."); }
    if (!(url.protocol === "https:" || (url.protocol === "http:" && /^(localhost|127\.0\.0\.1)$/.test(url.hostname)))) throw perr("bad_url", "Chỉ cài từ link https (hoặc http://localhost khi phát triển).");
    return install(await parseSource(await plFetchText(url.href), url.href));
  }
  async function installFromFile(f) { return install(await parseSource(await f.text(), null)); }
  async function remove(id) {
    const r = recs.find(x => x.id === id); if (!r) return;
    if (!await ask("Gỡ plugin?", `<p>Gỡ <b>${esc(r.manifest.name)}</b> và xoá dữ liệu nó đã lưu?</p>`, "Gỡ")) return;
    unload(id); await dbDel(id); recs = recs.filter(x => x.id !== id);
    try { Object.keys(localStorage).filter(k => k.startsWith("bravin-pl:" + id + ":")).forEach(k => localStorage.removeItem(k)); } catch (_) {}
    refreshUi(); toast("Đã gỡ " + r.manifest.name);
  }
  async function setEnabled(id, on) {
    const r = recs.find(x => x.id === id); if (!r) return; r.enabled = !!on; await dbPut(r);
    unload(id); if (on) load(r); refreshUi();
  }
  function reload(id) { const r = recs.find(x => x.id === id); if (!r) return; unload(id); if (r.enabled) load(r); refreshUi(); }

  /* ===== chạy plugin (iframe sandbox) ===== */
  async function getSdk() {
    if (sdkText) return sdkText;
    try { const r = await fetch("sdk/bravin-sdk.js"); if (r.ok) sdkText = await r.text(); } catch (_) {}
    if (!sdkText) throw perr("sdk", "Không tải được sdk/bravin-sdk.js.");
    return sdkText;
  }
  function inlineBundle(html, files) {
    html = html.replace(/<script\b([^>]*)>\s*<\/script>/gi, (m, a) => {
      const s = /\ssrc=["']([^"']+)["']/i.exec(" " + a); if (!s) return m;
      if (/bravin-sdk(\.js)?$/i.test(s[1])) return "";
      if (typeof files[s[1]] !== "string") return m;
      return "<script" + a.replace(/\ssrc=["'][^"']+["']/i, "") + ">" + files[s[1]].replace(/<\/script/gi, "<\\/script") + "</script>";
    });
    return html.replace(/<link\b[^>]*>/gi, m => { if (!/rel=["']?stylesheet/i.test(m)) return m; const h = /href=["']([^"']+)["']/i.exec(m); return h && typeof files[h[1]] === "string" ? "<style>" + files[h[1]].replace(/<\/style/gi, "<\\/style") + "</style>" : m; });
  }
  async function buildDoc(rec) {
    const m = rec.manifest, sdk = await getSdk();
    let html, orig = "";
    if (rec.files) html = inlineBundle(rec.files[m.entry], rec.files);
    else {
      try { html = await plFetchText(new URL(m.entry, rec.baseUrl).href); if (html !== rec.html) { rec.html = html; dbPut(rec).catch(() => {}); } } catch (e) { if (!rec.html) throw e; html = rec.html; }
      orig = new URL(rec.baseUrl).origin;
      html = html.replace(/<script\b[^>]*src=["'][^"']*bravin-sdk(\.js)?["'][^>]*>\s*<\/script>/gi, "");
    }
    const net = rec.granted.includes("network") ? m.network.map(h => "https://" + h).join(" ") : "";
    const csp = `default-src 'none'; script-src 'unsafe-inline' ${orig}; style-src 'unsafe-inline' ${orig}; img-src data: blob: ${orig} ${net}; font-src data: ${orig}; media-src data: blob: ${orig} ${net}; connect-src ${net || "'none'"}; form-action 'none'`;
    const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
    const theme = `:root{--bv-bg:${v("--bg") || "#0d1417"};--bv-panel:${v("--panel") || "#141e22"};--bv-line:${v("--line") || "#25363c"};--bv-fg:${v("--fg") || "#e6f0f2"};--bv-muted:${v("--muted") || "#87a0a7"};--bv-accent:${v("--accent") || "#0097cc"};color-scheme:dark}html,body{background:var(--bv-bg);color:var(--bv-fg);font:13px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;margin:0}`;
    const inj = `<meta http-equiv="Content-Security-Policy" content="${esc(csp)}">` + (rec.files ? "" : `<base href="${esc(rec.baseUrl)}">`) + `<style>${theme}</style><script>${sdk.replace(/<\/script/gi, "<\\/script")}</script>`;
    return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, h => h + inj) : "<!doctype html><html><head>" + inj + '<meta charset="utf-8"></head><body>' + html + "</body></html>";
  }
  function dock() {
    let d = document.getElementById("plugDock"); if (d) return d;
    d = document.createElement("div"); d.id = "plugDock"; document.body.appendChild(d); return d;
  }
  async function load(rec) {
    if (live.has(rec.id)) return;
    const m = rec.manifest, wrap = document.createElement("div"); wrap.className = "plugwrap"; wrap.dataset.id = rec.id; wrap.hidden = true;
    wrap.innerHTML = `<div class="plughead"><span class="plugtitle">${esc(m.panel ? m.panel.title : m.name)}</span><span class="plughb"><button type="button" class="plugsz" aria-label="Phóng to / thu nhỏ bảng" title="Phóng to / thu nhỏ">⤢</button><button type="button" class="plugx" aria-label="Đóng bảng">✕</button></span></div>`;
    if (m.panel) { wrap.style.setProperty("--ph", m.panel.height + "px"); if (m.panel.size === "large") wrap.classList.add("large"); }
    const L = { rec, wrap, frame: null, win: null, ready: false, subs: new Set(), cmds: m.commands.slice(), status: "loading", err: "", sessions: new Map() };
    wrap.querySelector(".plugsz").onclick = () => { wrap.classList.toggle("large"); syncDock(); };
    live.set(rec.id, L); dock().appendChild(wrap);
    wrap.querySelector(".plugx").onclick = () => panelToggle(rec.id, false);
    try {
      const fr = document.createElement("iframe"); fr.setAttribute("sandbox", "allow-scripts"); fr.setAttribute("title", m.name); fr.referrerPolicy = "no-referrer";
      fr.srcdoc = await buildDoc(rec); L.frame = fr; wrap.appendChild(fr); L.win = fr.contentWindow;
      setTimeout(() => { if (live.get(rec.id) === L && !L.ready) { L.status = "silent"; refreshUi(); } }, 6000);
    } catch (e) { L.status = "error"; L.err = e.message; }
    refreshUi();
  }
  function unload(id) { const L = live.get(id); if (!L) return; try { L.sessions.forEach(s => s.src && s.src.close()); } catch (_) {} try { L.wrap.remove(); } catch (_) {} live.delete(id); syncDock(); }
  function panelToggle(id, on) {
    const L = live.get(id); if (!L || !L.rec.manifest.panel) return false;
    if (on) live.forEach(o => { if (o !== L) o.wrap.hidden = true; });
    L.wrap.hidden = !on; syncDock(); return on;
  }
  function syncDock() { const d = document.getElementById("plugDock"); if (!d) return; const vis = [...live.values()].filter(L => !L.wrap.hidden); d.classList.toggle("open", vis.length > 0); d.classList.toggle("large", vis.some(L => L.wrap.classList.contains("large"))); }

  /* ===== RPC: plugin -> Bravin ===== */
  const need = (L, p) => { if (!L.rec.granted.includes(p)) throw perr("permission_denied", "Plugin chưa được cấp quyền “" + p + "”. Khai báo trong manifest rồi cài lại."); };
  const num = (v, name, d) => { if (v == null) return d; v = +v; if (!isFinite(v)) throw perr("bad_params", name + " phải là số."); return v; };
  function clipInfo(c, k, start) {
    const m = c.mediaId ? media.get(c.mediaId) : null;
    return { id: c.id, kind: k, type: c.type || "video", track: c.track || "v", start: Math.round(start * 1000) / 1000, dur: Math.round((k === "v" ? vlen(c) : clen(c)) * 1000) / 1000, mediaId: c.mediaId || null, mediaName: m ? m.name : null, text: c.line1 != null ? c.line1 : null, text2: c.line2 != null ? c.line2 : null, group: c.grp || null };
  }
  const clipStartOf = f => f.k === "v" ? vStarts()[V.indexOf(f.c)] : f.c.start;
  function timelineData() {
    const st = vStarts();
    return {
      playhead: t, duration: total(), playing: !!playing,
      tracks: tracks.map(x => ({ id: x.id, type: x.type, name: x.name || "", hidden: !!x.off, locked: !!x.lock })),
      clips: V.map((c, i) => clipInfo(c, "v", st[i])).concat(C.map(c => clipInfo(c, "c", c.start || 0))),
      selection: selectedClips().map(f => f.c.id)
    };
  }
  const EDIT_NUM = ["dur", "vol", "scale", "x", "y", "opacity", "speed", "rot", "size", "blur", "mosaic"], EDIT_STR = ["line1", "line2", "label"];
  const RPC = {
    "hello": (L) => { L.ready = true; L.status = "ready"; refreshUi(); return { app: APP_NAME, version: BRAVIN_VERSION(), apiVersion: API_VERSION, pluginId: L.rec.id, permissions: L.rec.granted.slice(), platform: window.VINCutAndroid ? "android" : /Windows/i.test(navigator.userAgent) ? "windows" : "web", panel: !!L.rec.manifest.panel }; },
    "app.info": (L) => RPC.hello(L),
    "events.subscribe": (L, p) => { const n = String(p.name || ""); if (/^(timeline\.changed|selection\.changed|playhead)$/.test(n)) need(L, "timeline.read"); L.subs.add(n); return true; },
    "timeline.get": (L) => { need(L, "timeline.read"); return timelineData(); },
    "timeline.seek": (L, p) => { need(L, "playback"); seek(num(p.time, "time", 0)); return t; },
    "timeline.addText": (L, p) => {
      need(L, "timeline.write"); const st = num(p.start, "start", t), dur = Math.max(0.2, num(p.dur, "dur", 2));
      pushUndo(); const tr = freeTrack("text", st, dur);
      const c = { id: nid("c"), track: tr.id, type: "text", style: p.style || "caption", start: Math.max(0, st), dur, line1: String(p.text != null ? p.text : "Nhập chữ").slice(0, 500), line2: String(p.text2 || "").slice(0, 500) };
      C.push(c); sel = { k: "c", id: c.id }; renderAll(); return { id: c.id };
    },
    "timeline.addMedia": (L, p) => {
      need(L, "timeline.write"); const m = media.get(p.mediaId); if (!m) throw perr("not_found", "Không có file này trong Thư viện: " + p.mediaId);
      appendMedia(m, null, p.overlay ? { overlay: true, start: num(p.start, "start", t) } : { start: num(p.start, "start", t) }); return { id: sel && sel.id };
    },
    "timeline.updateClip": (L, p) => {
      need(L, "timeline.write"); const f = clipById(p.id); if (!f) throw perr("not_found", "Không thấy clip " + p.id); const patch = p.patch || {}, ignored = [], set = {};
      for (const k of Object.keys(patch)) {
        if (EDIT_NUM.includes(k)) set[k] = num(patch[k], k); else if (EDIT_STR.includes(k)) set[k] = String(patch[k]).slice(0, 500);
        else if (k === "muted") set[k] = !!patch[k]; else if (k === "start" && f.k === "c") set[k] = Math.max(0, num(patch[k], k)); else ignored.push(k);
      }
      if (Object.keys(set).length) { if (!p.noUndo) pushUndo(); Object.assign(f.c, set); for (const k of ["blur", "mosaic"]) if (k in set && !(set[k] > 0)) delete f.c[k]; renderAll(); }
      return { ok: true, ignored };
    },
    "timeline.removeClip": (L, p) => { need(L, "timeline.write"); const f = clipById(p.id); if (!f) throw perr("not_found", "Không thấy clip " + p.id); sel = { k: f.k, id: f.c.id }; clearMsel(); deleteSel(); return true; },
    "timeline.select": (L, p) => {
      need(L, "timeline.read"); const ids = (p.ids || []).map(String).filter(i => clipById(i)); clearMsel(); sel = null;
      if (ids.length) { const f = clipById(ids[0]); sel = { k: f.k, id: f.c.id }; ids.forEach(i => msel.add(i)); if (ids.length < 2) msel.clear(); }
      renderTimeline(); renderInspector(); syncButtons(); return ids.length;
    },
    "timeline.undo": (L) => { need(L, "timeline.write"); undo(); return true; },
    "timeline.checkpoint": (L) => { need(L, "timeline.write"); pushUndo(); return true; },
    "timeline.getClip": (L, p) => {
      need(L, "timeline.read"); const f = clipById(p.id); if (!f) throw perr("not_found", "Không thấy clip " + p.id); const c = f.c, st = clipStartOf(f), m = c.mediaId ? media.get(c.mediaId) : null;
      if (typeof migrateMask === "function") migrateMask(c);
      return Object.assign(clipInfo(c, f.k, st), { in: c.in, out: c.out, speed: c.speed || 1, reverse: !!c.reverse, mediaKind: m ? m.kind : null, x: c.x || 0, y: c.y || 0, scale: c.scale == null ? 1 : c.scale, angle: c.angle || 0, masks: (c.masks || []).map(k => ({ id: k.id, name: k.name, type: k.type })), pinned: !!(c.pin && c.pin.keys), keyframes: Object.keys(c.kf || {}), fps: FPS, frameW: cv.width, frameH: cv.height });
    },
    "timeline.duplicateClip": (L, p) => {
      need(L, "timeline.write"); const f = clipById(p.id); if (!f) throw perr("not_found", "Không thấy clip " + p.id); const src = f.c;
      if (isDur(src)) throw perr("unsupported", "Chỉ nhân bản được clip video / ảnh.");
      if (!p.noUndo) pushUndo();
      const n = deep(src); for (const k of ["gap", "tr", "masks", "mask", "anim", "grp", "fadeIn", "fadeOut", "words", "audioOut"]) delete n[k];
      Object.assign(n, { id: nid("c"), type: "video", start: clipStartOf(f), muted: true });
      const si = f.k === "v" ? tracks.findIndex(x => x.id === "v") : tracks.findIndex(x => x.id === src.track), tr = addTrack("overlay", Math.max(0, si));
      if (p.name) tr.name = String(p.name).slice(0, 40), tr.auto = false;
      n.track = tr.id; C.push(n); renderAll(); return { id: n.id, track: tr.id };
    },
    "timeline.setMask": (L, p) => {
      need(L, "timeline.write"); const f = clipById(p.id); if (!f) throw perr("not_found", "Không thấy clip " + p.id); const c = f.c;
      if (isDur(c)) throw perr("unsupported", "Mask chỉ dùng cho clip video / ảnh.");
      const keys = (Array.isArray(p.keys) ? p.keys : []).slice(0, 20000).filter(k => k && Array.isArray(k.pts) && k.pts.length >= 3 && k.pts.length <= 400)
        .map(k => ({ t: Math.round(Math.max(0, num(k.t, "t", 0)) * 1000) / 1000, v: k.pts.map(q => [num(q[0], "x"), num(q[1], "y"), 0, 0, 0, 0]), e: "linear" })).sort((a, b) => a.t - b.t);
      if (!keys.length) throw perr("bad_params", "Cần keys: [{t, pts:[[x,y],…]}] (ít nhất 3 điểm, toạ độ 0..1 của khung hình).");
      if (!p.noUndo) pushUndo(); migrateMask(c); c.masks = c.masks || [];
      let m = p.maskId ? c.masks.find(x => x.id === p.maskId) : null;
      if (!m) { m = newMask("pen", c.masks.length + 1); c.masks.push(m); }
      if (p.name) m.name = String(p.name).slice(0, 40);
      m.pts = keys[0].v; m.closed = true; m.on = true; m.kf = m.kf || {}; if (keys.length > 1) m.kf.pts = keys; else delete m.kf.pts; if (!Object.keys(m.kf).length) delete m.kf;
      if (p.feather != null) m.feather = Math.max(0, Math.min(1, num(p.feather, "feather"))); if (p.expand != null) m.expand = num(p.expand, "expand");
      if (p.inv != null) m.inv = !!p.inv; if (p.mode && MASK_MODES[p.mode]) m.mode = p.mode; if (p.opacity != null) m.opacity = Math.max(0, Math.min(1, num(p.opacity, "opacity")));
      renderAll(); return { maskId: m.id, keys: keys.length };
    },
    "timeline.setPin": (L, p) => {
      need(L, "timeline.write"); const f = clipById(p.id); if (!f) throw perr("not_found", "Không thấy clip " + p.id); const c = f.c;
      if (isDur(c)) throw perr("unsupported", "Corner pin chỉ dùng cho clip video / ảnh.");
      if (!p.noUndo) pushUndo();
      if (!p.keys || !p.keys.length) { delete c.pin; renderAll(); return { keys: 0 }; }
      const st = clipStartOf(f), len = f.k === "v" ? vlen(c) : clen(c), keys = [];
      for (const k of p.keys.slice(0, 20000)) { if (!k || !Array.isArray(k.quad) || k.quad.length !== 8) continue; const lt = k.T != null ? num(k.T, "T") - st : num(k.t, "t"); if (lt < -1e-6 || lt > len + 1e-6) continue; keys.push({ t: Math.round(Math.max(0, lt) * 1000) / 1000, v: k.quad.map(v => num(v, "quad")) }); }
      if (!keys.length) throw perr("not_found", "Không có keyframe nào nằm trong thời gian của clip này.");
      keys.sort((a, b) => a.t - b.t); c.pin = { keys }; renderAll(); return { keys: keys.length };
    },
    "timeline.setKeyframes": (L, p) => {
      need(L, "timeline.write"); const f = clipById(p.id); if (!f) throw perr("not_found", "Không thấy clip " + p.id); const c = f.c, props = p.props || {}, ok = ["x", "y", "scale", "angle", "opacity", "blur", "mosaic"];
      if (!p.noUndo) pushUndo(); c.kf = c.kf || {};
      for (const k of Object.keys(props)) { if (!ok.includes(k)) continue; const L2 = (props[k] || []).slice(0, 20000).map(q => ({ t: Math.round(Math.max(0, num(q.t, "t")) * 1000) / 1000, v: num(q.v, k), e: q.e || p.ease || "linear" })).sort((a, b) => a.t - b.t); if (L2.length) c.kf[k] = L2; else delete c.kf[k]; }
      if (!Object.keys(c.kf).length) delete c.kf; renderAll(); return true;
    },
    "timeline.applyTrack": (L, p) => {
      need(L, "timeline.write"); const f = clipById(p.id); if (!f) throw perr("not_found", "Không thấy clip " + p.id); const c = f.c;
      if (f.k === "v") throw perr("unsupported", "Hãy gắn vào chữ, sticker hoặc clip ở track lớp phủ (không phải track chính).");
      const ref = p.ref || {}, W = cv.width, H = cv.height, len = clen(c), use = Object.assign({ rotation: true, scale: true }, p.use || {});
      const an = c.type === "text" && c.style !== "custom" && typeof LEGACY_ANCHOR !== "undefined" && LEGACY_ANCHOR[c.style], A = an ? [an[0] / 1080, an[1] / 1920] : [0.5, 0.5];
      const lr = Math.max(0, Math.min(len, num(ref.T, "ref.T") - c.start)), x0 = kfVal(c, "x", lr, c.x || 0), y0 = kfVal(c, "y", lr, c.y || 0), s0 = kfVal(c, "scale", lr, c.scale == null ? 1 : c.scale), a0 = kfVal(c, "angle", lr, c.angle || 0);
      const d0x = (A[0] + x0) * W - num(ref.cx, "ref.cx") * W, d0y = (A[1] + y0) * H - num(ref.cy, "ref.cy") * H, K = { x: [], y: [], angle: [], scale: [] };
      for (const s of (p.samples || []).slice(0, 20000)) {
        const lt = num(s.T, "T") - c.start; if (lt < -1e-6 || lt > len + 1e-6) continue;
        const da = use.rotation ? num(s.rot, "rot") - num(ref.rot, "ref.rot", 0) : 0, ks = use.scale ? num(s.scale, "scale") / num(ref.scale, "ref.scale", 1) : 1, r = da * Math.PI / 180, co = Math.cos(r) * ks, si = Math.sin(r) * ks;
        const t3 = Math.round(Math.max(0, lt) * 1000) / 1000, px = num(s.cx, "cx") * W + co * d0x - si * d0y, py = num(s.cy, "cy") * H + si * d0x + co * d0y;
        K.x.push({ t: t3, v: px / W - A[0], e: "linear" }); K.y.push({ t: t3, v: py / H - A[1], e: "linear" });
        if (use.rotation) K.angle.push({ t: t3, v: a0 + da, e: "linear" }); if (use.scale) K.scale.push({ t: t3, v: s0 * ks, e: "linear" });
      }
      if (!K.x.length) throw perr("not_found", "Clip này không nằm trong khoảng thời gian đã theo dõi.");
      if (!p.noUndo) pushUndo(); c.kf = c.kf || {}; c.kf.x = K.x; c.kf.y = K.y; if (use.rotation) c.kf.angle = K.angle; if (use.scale) c.kf.scale = K.scale;
      renderAll(); return { keys: K.x.length };
    },
    "frames.open": async (L, p) => {
      need(L, "video.frames"); const f = clipById(p.clipId); if (!f) throw perr("not_found", "Không thấy clip " + p.clipId);
      const c = f.c, m = c.mediaId ? media.get(c.mediaId) : null; if (!m || !m.url || m.kind !== "video") throw perr("unsupported", "Hãy chọn một clip video.");
      if (L.sessions.size >= 3) throw perr("quota", "Đang mở quá nhiều phiên đọc khung hình.");
      const mw = Math.max(160, Math.min(1920, +p.maxWidth || 960)), W0 = Math.min(mw, cv.width) & ~1, H0 = Math.max(16, Math.round(W0 * cv.height / cv.width)) & ~1;
      const src = await new ElemSource(m).init(), clean = Object.assign({}, c, { masks: undefined, mask: undefined, blend: undefined, nodes: undefined, anim: undefined, pin: undefined, mosaic: undefined, blur: undefined, opacity: 1 });
      if (c.kf) { clean.kf = Object.assign({}, c.kf); for (const k of ["blur", "mosaic", "opacity", "blend"]) delete clean.kf[k]; }
      const id = nid("fs"), st = clipStartOf(f), len = f.k === "v" ? vlen(c) : clen(c);
      L.sessions.set(id, { id, clipId: c.id, c, clean, isV: f.k === "v", src, W0, H0, len, q: Promise.resolve() });
      return { session: id, clipId: c.id, width: W0, height: H0, fps: FPS, duration: len, start: st, frameW: cv.width, frameH: cv.height, mediaName: m.name };
    },
    "frames.get": (L, p) => {
      need(L, "video.frames"); const s = L.sessions.get(p.session); if (!s) throw perr("not_found", "Phiên đọc khung hình đã đóng.");
      const run = async () => {
        const lt = Math.max(0, Math.min(s.len - 1e-3, num(p.t, "t", 0))), fr = await s.src.frameAt(srcTime(s.c, lt), FPS), work = scratch("plugFrames", s.W0, s.H0), km = renderMode, kp = frameProvider;
        try { renderMode = "export"; frameProvider = () => fr; work.ctx.globalAlpha = 1; work.ctx.fillStyle = "#000"; work.ctx.fillRect(0, 0, s.W0, s.H0); drawMediaLayer(work.ctx, s.clean, lt, 9, s.isV, 0); }
        finally { renderMode = km; frameProvider = kp; }
        const im = work.ctx.getImageData(0, 0, s.W0, s.H0); return { t: lt, width: s.W0, height: s.H0, data: im.data.buffer };
      };
      const pr = s.q.then(run, run); s.q = pr.catch(() => {}); return pr;
    },
    "frames.close": (L, p) => { const s = L.sessions.get(p.session); if (s) { try { s.src.close(); } catch (_) {} L.sessions.delete(p.session); } return true; },
    "playback.play": (L) => { need(L, "playback"); play(); return true; },
    "playback.pause": (L) => { need(L, "playback"); pause(); return true; },
    "media.list": (L) => { need(L, "media.read"); return [...media.values()].filter(m => !m.missing).map(m => ({ id: m.id, name: m.name, kind: m.kind, duration: m.duration || 0 })); },
    "media.import": async (L, p) => { need(L, "media.import"); const r = await importMedia(p); return r; },
    "project.snapshotFrame": (L, p) => {
      need(L, "project.read"); drawFrame(); const type = p.type === "image/png" ? "image/png" : "image/jpeg", mw = Math.min(+p.maxWidth || cv.width, cv.width);
      let src = cv; if (mw < cv.width) { src = document.createElement("canvas"); src.width = mw; src.height = Math.round(cv.height * mw / cv.width); src.getContext("2d").drawImage(cv, 0, 0, src.width, src.height); }
      return { dataUrl: src.toDataURL(type, num(p.quality, "quality", 0.85)), width: src.width, height: src.height };
    },
    "ui.toast": (L, p) => { need(L, "ui"); toast(String(p.message || "").slice(0, 200)); return true; },
    "ui.panel.open": (L, p) => { need(L, "ui"); if (!L.rec.manifest.panel) throw perr("unsupported", "Plugin chưa khai báo panel trong manifest."); if (p && p.size) L.wrap.classList.toggle("large", p.size === "large"); panelToggle(L.rec.id, true); return true; },
    "ui.panel.close": (L) => { panelToggle(L.rec.id, false); return true; },
    "ui.panel.setTitle": (L, p) => { need(L, "ui"); const el = L.wrap.querySelector(".plugtitle"); if (el) el.textContent = String(p.title || "").slice(0, 40); return true; },
    "ui.registerCommand": (L, p) => {
      need(L, "ui"); if (!/^[\w.-]{1,48}$/.test(p.id || "") || !p.title) throw perr("bad_params", "Lệnh cần id (chữ, số, . _ -) và title.");
      L.cmds = L.cmds.filter(c => c.id !== p.id).concat({ id: p.id, title: String(p.title).slice(0, 60), context: ["global", "clip", "selection"].includes(p.context) ? p.context : "global" }); refreshUi(); return true;
    },
    "storage.get": (L, p) => { try { const v = localStorage.getItem("bravin-pl:" + L.rec.id + ":" + p.key); return v == null ? null : JSON.parse(v); } catch (_) { return null; } },
    "storage.set": (L, p) => {
      const s = JSON.stringify(p.value === undefined ? null : p.value); if (s.length > 200000) throw perr("quota", "Giá trị quá lớn (tối đa 200 KB mỗi khoá).");
      const pre = "bravin-pl:" + L.rec.id + ":"; let tot = s.length; try { for (const k of Object.keys(localStorage)) if (k.startsWith(pre) && k !== pre + p.key) tot += localStorage.getItem(k).length; } catch (_) {}
      if (tot > 1000000) throw perr("quota", "Plugin đã dùng hết 1 MB bộ nhớ."); try { localStorage.setItem(pre + String(p.key).slice(0, 80), s); } catch (_) { throw perr("quota", "Không ghi được bộ nhớ."); } return true;
    },
    "storage.remove": (L, p) => { try { localStorage.removeItem("bravin-pl:" + L.rec.id + ":" + p.key); } catch (_) {} return true; },
    "storage.keys": (L) => { const pre = "bravin-pl:" + L.rec.id + ":"; try { return Object.keys(localStorage).filter(k => k.startsWith(pre)).map(k => k.slice(pre.length)); } catch (_) { return []; } },
    "net.fetch": async (L, p) => { need(L, "network"); return netFetch(L.rec.manifest.network, p); }
  };
  function BRAVIN_VERSION() { const e = document.querySelector('meta[name="bravin-version"]'); return e ? e.content : (window.BRAVIN_VER || "4.8"); }
  function hostOk(list, u) { return list.some(h => { h = h.toLowerCase(); const host = u.host.toLowerCase(); return h.startsWith("*.") ? host.endsWith(h.slice(1)) && host.length > h.length - 1 : host === h || u.hostname.toLowerCase() === h; }); }
  async function netFetch(allowed, p) {
    let u; try { u = new URL(String(p.url)); } catch (_) { throw perr("bad_params", "url không hợp lệ."); }
    if (!(u.protocol === "https:" || (u.protocol === "http:" && /^(localhost|127\.0\.0\.1)$/.test(u.hostname)))) throw perr("permission_denied", "Chỉ cho phép https.");
    if (!hostOk(allowed, u)) throw perr("permission_denied", u.host + " không nằm trong danh sách network của plugin.");
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 60000); let r;
    try { r = await fetch(u.href, { method: p.method || "GET", headers: p.headers || {}, body: p.body, signal: ctl.signal, credentials: "omit" }); }
    catch (e) {
      if (!(typeof dlHasProxy === "function" && dlHasProxy()) || (p.method && p.method !== "GET")) throw perr("network", "Không kết nối được " + u.host + " (có thể thiếu CORS).");
      r = await fetch("/dl?url=" + encodeURIComponent(u.href), { headers: { "X-Bravin": "1" }, signal: ctl.signal });
    } finally { clearTimeout(to); }
    const buf = await r.arrayBuffer(); if (buf.byteLength > 25 * 1048576) throw perr("too_large", "Phản hồi quá 25 MB.");
    const ct = r.headers.get("content-type") || "", out = { ok: r.ok, status: r.status, contentType: ct };
    if (p.as === "base64") { let s = ""; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); out.base64 = btoa(s); }
    else { out.text = new TextDecoder().decode(buf); if (p.as === "json") { try { out.json = JSON.parse(out.text); } catch (_) {} } }
    return out;
  }
  /* nhập media: dùng chung cho plugin và extension */
  async function importMedia(p) {
    let blob, name = String(p.name || "").slice(0, 120);
    if (p.url) {
      if (typeof dlFetch !== "function") throw perr("unsupported", "Chức năng tải link chưa sẵn sàng.");
      const r = await dlFetch(String(p.url)); blob = r.blob; name = name || r.name;
    } else if (p.dataUrl || p.base64) {
      let b64 = p.base64, mime = p.mime || "application/octet-stream";
      if (p.dataUrl) { const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(p.dataUrl); if (!m) throw perr("bad_params", "dataUrl không hợp lệ."); mime = m[1] || mime; b64 = m[2] ? m[3] : btoa(decodeURIComponent(m[3])); }
      const bin = atob(b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); blob = new Blob([u8], { type: mime });
      name = name || "tiện-ích-" + Date.now() + "." + (mime.split("/")[1] || "bin").replace(/[^a-z0-9]/gi, "");
    } else throw perr("bad_params", "Cần url, dataUrl hoặc base64.");
    const m = await addMediaFile(blob, name); if (!m) throw perr("unsupported", "Bravin không mở được file này.");
    if (p.addToTimeline) appendMedia(m, null, p.overlay ? { overlay: true } : {});
    return { mediaId: m.id, name: m.name, kind: m.kind, duration: m.duration || 0 };
  }

  window.addEventListener("message", async e => {
    const m = e.data; if (!m || m.bravin !== "plugin" || typeof m.method !== "string") return;
    let L = null; for (const x of live.values()) if (x.win && e.source === x.win) { L = x; break; }
    if (!L) return;
    const reply = o => { try { const r = o.result, tr = r && r.data instanceof ArrayBuffer ? [r.data] : []; e.source.postMessage(Object.assign({ bravin: "host", v: 1, type: "res", id: m.id }, o), "*", tr); } catch (_) {} };
    const fn = RPC[m.method]; if (!fn) return reply({ ok: false, error: { code: "unsupported", message: "Không có hàm " + m.method } });
    try { const r = await fn(L, m.params || {}); reply({ ok: true, result: r === undefined ? null : r }); }
    catch (er) { reply({ ok: false, error: { code: er.code || "error", message: er.message || String(er) } }); }
  });

  /* ===== sự kiện: Bravin -> plugin ===== */
  function sendEvt(L, name, data) { try { if (L.win) L.win.postMessage({ bravin: "host", v: 1, type: "evt", name, data }, "*"); } catch (_) {} }
  function broadcast(name, data) { live.forEach(L => { if (L.ready && L.subs.has(name)) sendEvt(L, name, data); }); }
  const anySub = n => [...live.values()].some(L => L.ready && L.subs.has(n));
  let lastSnap = "", lastSel = "", chTimer = 0, lastPh = 0;
  function onChange() {
    clearTimeout(chTimer);
    chTimer = setTimeout(() => {
      if (!anySub("timeline.changed") && !anySub("selection.changed")) return;
      const s = snapshot(); if (s !== lastSnap) { lastSnap = s; broadcast("timeline.changed", { duration: total(), clipCount: V.length + C.length }); }
      const sl = JSON.stringify([sel, [...msel]]); if (sl !== lastSel) { lastSel = sl; broadcast("selection.changed", { selection: selectedClips().map(f => f.c.id) }); }
    }, 120);
  }
  const _renderAll = renderAll; renderAll = function () { const r = _renderAll.apply(this, arguments); onChange(); return r; };
  const _placePlayhead = placePlayhead; placePlayhead = function () {
    const r = _placePlayhead.apply(this, arguments);
    if (live.size) { const n = performance.now(); if (n - lastPh > 120 && anySub("playhead")) { lastPh = n; broadcast("playhead", { time: t, playing: !!playing }); } }
    return r;
  };
  if (typeof hideHome === "function") { const _h = hideHome; hideHome = function () { const r = _h.apply(this, arguments); setTimeout(() => { lastSnap = ""; broadcast("project.loaded", { duration: total() }); onChange(); }, 200); return r; }; }

  /* ===== lệnh (menu chuột phải + màn Tiện ích) ===== */
  function commands(ctx) {
    const out = [];
    live.forEach(L => { if (L.status !== "error") L.cmds.forEach(c => { if (!ctx || c.context === ctx || (ctx === "clip" && c.context === "selection")) out.push({ pluginId: L.rec.id, plugin: L.rec.manifest.name, id: c.id, title: c.title, context: c.context }); }); });
    return out;
  }
  function runCommand(pluginId, id, extra) {
    const L = live.get(pluginId); if (!L) return toast("Plugin đang tắt."); if (!L.ready) return toast("Plugin chưa sẵn sàng. Thử Tải lại trong Tiện ích.");
    const data = Object.assign({ id, selection: selectedClips().map(f => f.c.id) }, extra || {});
    sendEvt(L, "command", data); sendEvt(L, "command:" + id, data);
  }
  const pluginMenu = (items, ctx, extra) => {
    const cs = commands(ctx); if (!cs.length) return items;
    const add = [{ h: "Tiện ích" }].concat(cs.map(c => ({ label: c.title + " · " + c.plugin, run: () => runCommand(c.pluginId, c.id, Object.assign({ context: ctx }, extra)) })));
    const i = items.findIndex(x => x.h === "Nhãn màu"); items.splice(i < 0 ? items.length : i, 0, ...add); return items;
  };
  if (typeof clipMenuItems === "function") { const _c = clipMenuItems; clipMenuItems = function (c, k) { return pluginMenu(_c.apply(this, arguments), "clip", { clipId: c.id }); }; }
  if (typeof multiMenuItems === "function") { const _m = multiMenuItems; multiMenuItems = function () { return pluginMenu(_m.apply(this, arguments), "selection"); }; }

  /* ===== cầu nối cho extension trình duyệt ===== */
  const BR_KEY = "bravin-bridge-ok", denied = new Map();
  const brGet = () => { try { return JSON.parse(localStorage.getItem(BR_KEY) || "{}"); } catch (_) { return {}; } };
  const brSet = o => { try { localStorage.setItem(BR_KEY, JSON.stringify(o)); } catch (_) {} };
  const BRIDGE = {
    "hello": () => ({ app: APP_NAME, version: BRAVIN_VERSION(), apiVersion: API_VERSION, methods: Object.keys(BRIDGE) }),
    "app.info": () => BRIDGE.hello(),
    "media.list": () => [...media.values()].filter(m => !m.missing).map(m => ({ id: m.id, name: m.name, kind: m.kind, duration: m.duration || 0 })),
    "media.import": p => importMedia(p),
    "timeline.addMedia": p => { const m = media.get(p.mediaId); if (!m) throw perr("not_found", "Không có file này trong Thư viện."); appendMedia(m, null, p.overlay ? { overlay: true } : {}); return true; },
    "openLink": p => { if (typeof openLinkDl !== "function") throw perr("unsupported", "Chưa có chức năng dán link."); openLinkDl(String(p.url || "")); return true; },
    "plugin.install": async p => { const r = await installFromUrl(p.url); return r ? { id: r.id } : { cancelled: true }; }
  };
  window.addEventListener("message", async e => {
    const m = e.data; if (e.source !== window || !m || m.bravin !== "bridge" || m.type === "res" || typeof m.method !== "string") return;
    const reply = o => window.postMessage(Object.assign({ bravin: "bridge-res", v: 1, id: m.id }, o), location.origin);
    const ext = m.ext && typeof m.ext === "object" ? { id: String(m.ext.id || "").slice(0, 80), name: String(m.ext.name || "").slice(0, 60) } : { id: "", name: "" };
    try {
      if (!ext.id) throw perr("bad_params", "Thiếu ext.id (id extension).");
      const fn = BRIDGE[m.method]; if (!fn) throw perr("unsupported", "Không có hàm " + m.method);
      let ok = brGet(); const d = denied.get(ext.id);
      if (!ok[ext.id]) {
        if (m.method !== "hello") throw perr("not_connected", "Chưa kết nối: gọi hello trước và chờ người dùng cho phép.");
        if (d && Date.now() - d < 60000) throw perr("permission_denied", "Người dùng đã từ chối.");
        const yes = await ask("Cho phép extension kết nối?", `<p>Extension <b>${esc(ext.name || ext.id)}</b> <span class="note">(${esc(ext.id)})</span> muốn gửi video, ảnh, âm thanh và link vào Thư viện Bravin của bạn.</p><p class="note">Chỉ cho phép extension do đội ngũ bạn phát triển hoặc tin cậy. Bạn thu hồi được trong Tiện ích.</p>`, "Cho phép", "Không");
        if (!yes) { denied.set(ext.id, Date.now()); throw perr("permission_denied", "Người dùng đã từ chối."); }
        ok = brGet(); ok[ext.id] = { name: ext.name, at: Date.now() }; brSet(ok); refreshUi();
      }
      reply({ ok: true, result: await fn(m.params || {}) });
    } catch (er) { reply({ ok: false, error: { code: er.code || "error", message: er.message || String(er) } }); }
  });
  function markReady() {
    document.documentElement.dataset.bravin = "1"; document.documentElement.dataset.bravinApi = String(API_VERSION);
    try { window.dispatchEvent(new CustomEvent("bravin:ready", { detail: { apiVersion: API_VERSION } })); } catch (_) {}
  }

  /* ===== giao diện quản lý ===== */
  function statusOf(L, r) { if (!r.enabled) return ["off", "Tắt"]; if (!L) return ["off", "Chưa chạy"]; return { loading: ["wait", "Đang tải…"], ready: ["ok", "Đang chạy"], silent: ["bad", "Không phản hồi"], error: ["bad", "Lỗi"] }[L.status] || ["wait", "…"]; }
  function refreshUi() { const d = document.querySelector(".plugdlg"), ov = d && d.parentElement; if (ov && ov._render) ov._render(); }
  function openPlugins() {
    if (document.querySelector(".plugdlg")) return;
    const ov = document.createElement("div"); ov.className = "overlay";
    ov.innerHTML = `<div class="dialog plugdlg" role="dialog" aria-modal="true" aria-labelledby="plgT">
      <div class="fmhead"><h2 id="plgT">Tiện ích</h2><button type="button" class="fmx" data-close aria-label="Đóng">✕</button></div>
      <div class="plglist"></div>
      <div class="plginst"><input type="text" class="dlin plgurl" inputmode="url" autocomplete="off" spellcheck="false" placeholder="Link manifest.json hoặc .bravinplugin.json" aria-label="Link plugin"><div class="dlact"><button type="button" class="primary plgadd">Cài từ link</button><button type="button" class="plgfile">Chọn file…</button></div><input type="file" class="plgpick" accept=".json,application/json" hidden></div>
      <p class="dlst plgst" role="status" aria-live="polite"></p>
      <div class="plgext"></div>
      <p class="note">Plugin và extension do đội ngũ phát triển kết nối qua SDK của Bravin. Xem docs/PLUGIN_SDK.md.</p></div>`;
    document.body.appendChild(ov);
    const $q = s => ov.querySelector(s), say = (t, bad) => { const st = $q(".plgst"); st.textContent = t || ""; st.classList.toggle("bad", !!bad); };
    const close = () => ov.remove(); $q("[data-close]").onclick = close; ov.addEventListener("pointerdown", e => { if (e.target === ov) close(); });
    ov.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
    ov._render = () => {
      const list = $q(".plglist");
      list.innerHTML = recs.length ? recs.map(r => {
        const L = live.get(r.id), [cls, txt] = statusOf(L, r), m = r.manifest, cmds = L ? L.cmds.filter(c => c.context === "global") : [];
        return `<div class="plgrow" data-id="${esc(r.id)}"><div class="plgtop"><span class="plgdot ${cls}" title="${esc(txt)}"></span><b>${esc(m.name)}</b><span class="note">v${esc(m.version)} · ${esc(txt)}</span></div>
          ${m.description ? `<div class="note">${esc(m.description)}</div>` : ""}${L && L.err ? `<div class="dlst bad">${esc(L.err)}</div>` : ""}
          <div class="plgchips">${m.permissions.map(p => `<span title="${esc(PERMS[p])}">${esc(p)}</span>`).join("") || "<span>không xin quyền</span>"}</div>
          <div class="plgact">${m.panel && r.enabled ? `<button type="button" data-a="panel">Mở bảng</button>` : ""}${cmds.map(c => `<button type="button" data-a="cmd" data-c="${esc(c.id)}">${esc(c.title)}</button>`).join("")}<button type="button" data-a="toggle">${r.enabled ? "Tắt" : "Bật"}</button><button type="button" data-a="reload">Tải lại</button><button type="button" data-a="rm">Gỡ</button></div></div>`;
      }).join("") : `<p class="note">Chưa có plugin nào. Dán link manifest của đội ngũ vào ô bên dưới, hoặc chọn file .bravinplugin.json.</p>`;
      const ex = brGet(), ids = Object.keys(ex);
      $q(".plgext").innerHTML = ids.length ? `<h3>Extension đã cho phép</h3>` + ids.map(i => `<div class="plgrow"><div class="plgtop"><b>${esc(ex[i].name || i)}</b><span class="note">${esc(i)}</span></div><div class="plgact"><button type="button" data-x="${esc(i)}">Thu hồi</button></div></div>`).join("") : "";
    };
    ov.addEventListener("click", async e => {
      const x = e.target.closest("[data-x]"); if (x) { const o = brGet(); delete o[x.dataset.x]; brSet(o); denied.clear(); ov._render(); return; }
      const b = e.target.closest("[data-a]"); if (!b) return; const id = b.closest(".plgrow").dataset.id, a = b.dataset.a;
      if (a === "panel") { close(); panelToggle(id, true); } else if (a === "cmd") { close(); runCommand(id, b.dataset.c, { context: "global" }); }
      else if (a === "toggle") setEnabled(id, !recs.find(r => r.id === id).enabled); else if (a === "reload") reload(id); else if (a === "rm") remove(id);
    });
    const go = async fn => { say("Đang tải…"); try { const r = await fn(); say(r ? "✓ Đã cài " + r.manifest.name : ""); } catch (er) { say(er.message || "Không cài được.", true); } };
    $q(".plgadd").onclick = () => { const v = $q(".plgurl").value.trim(); if (v) go(() => installFromUrl(v)); else say("Dán link vào ô trên.", true); };
    $q(".plgurl").addEventListener("keydown", e => { if (e.key === "Enter") $q(".plgadd").click(); });
    $q(".plgfile").onclick = () => $q(".plgpick").click();
    $q(".plgpick").onchange = e => { const f = e.target.files[0]; e.target.value = ""; if (f) go(() => installFromFile(f)); };
    ov._render();
  }

  /* ===== khởi động ===== */
  async function init() {
    markReady();
    recs = await dbAll(); recs.forEach(r => { if (r.enabled) load(r); });
    const h = new URLSearchParams(location.hash.replace(/^#/, "")), q = new URLSearchParams(location.search);
    const imp = h.get("import") || q.get("import"), plg = h.get("plugin") || q.get("plugin");
    if (imp || plg) { try { history.replaceState(null, "", location.pathname); } catch (_) {} }
    if (imp) setTimeout(() => { if (typeof openLinkDl === "function") openLinkDl(imp); }, 1200);
    if (plg) setTimeout(() => installFromUrl(plg).catch(er => toast(er.message)), 1500);
  }
  const bind = (sel, fn) => { const b = document.querySelector(sel); if (b) b.onclick = fn; };
  bind("#plugBtn", openPlugins);
  const nav = document.querySelector("#home .hnav");
  if (nav) { const b = document.createElement("button"); b.dataset.go = "plugins"; b.innerHTML = '<svg class="i" viewBox="0 0 24 24"><path d="M9 3v4M15 3v4M7 7h10v5a5 5 0 0 1-10 0zM12 17v4"/></svg>Tiện ích'; nav.appendChild(b); }
  if (typeof homeEl !== "undefined") {
    homeEl.addEventListener("click", e => { const b = e.target.closest('.hnav [data-go="plugins"]'); if (!b) return; e.stopImmediatePropagation(); homeEl.querySelectorAll(".hnav button").forEach(x => x.removeAttribute("aria-current")); homeEl.querySelector('.hnav [data-go="top"]')?.setAttribute("aria-current", "page"); openPlugins(); }, true);
  }
  window.BravinPlugins = { list: () => recs.map(r => ({ id: r.id, name: r.manifest.name, enabled: r.enabled, status: (live.get(r.id) || {}).status || "off" })), installFromUrl, installFromFile, installParsed: install, parseSource, remove, openManager: openPlugins, commands, runCommand, PERMS };
  window.openPlugins = openPlugins;
  init();
})();
