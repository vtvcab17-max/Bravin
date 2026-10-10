"use strict";
/* ============================================================================
   Phông chữ (Bravin tự viết).
   - Không nhúng sẵn font nào ngoài vài phông gốc, để app nhẹ. Người dùng tự cài.
   - Thư viện Google: danh mục 1.908 họ phông (fonts_catalog.js, chỉ siêu dữ liệu).
     Bấm "Cài" thì tải đúng phông đó (chỉ bộ ký tự latin, latin-ext, vietnamese,
     tuỳ chọn thêm cyrillic / hy lạp) rồi lưu trong IndexedDB "bravin-fonts".
     Nguồn tải: Google Fonts CSS API, dự phòng jsDelivr (Fontsource).
   - Nhập từ máy: .ttf .otf .woff .woff2, đọc tên họ / độ đậm / nghiêng từ file.
   - Cài một lần là dùng offline được. Phông được nạp vào FONTS nên mọi chỗ chọn
     phông (Thuộc tính chữ, lời bài hát) thấy ngay.
   - Dự án dùng phông chưa có trên máy → hỏi cài (nếu có trong thư viện).
   ========================================================================== */
const FM = { dbp: null, fam: new Map(), faces: new Map(), ready: null };
const FM_GENERIC = { s: "sans-serif", r: "serif", d: "sans-serif", h: "cursive", m: "monospace" };
const FM_CATN = { s: "Không chân", r: "Có chân", d: "Trang trí", h: "Viết tay", m: "Đơn cách" };
const FM_BASE = ["latin", "latin-ext", "vietnamese"], FM_EXTRA = ["cyrillic", "cyrillic-ext", "greek", "greek-ext"];
const FM_BYNAME = (() => { const m = new Map(); (typeof GF_CAT !== "undefined" ? GF_CAT.d : []).forEach(r => m.set(r[0].toLowerCase(), r)); return m; })();
const fmEsc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmMB = n => n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB";

/* ---------- IndexedDB ---------- */
function fmDB() {
  return FM.dbp || (FM.dbp = new Promise((res, rej) => {
    if (!window.indexedDB) { rej(new Error("no idb")); return; }
    const r = indexedDB.open("bravin-fonts", 1);
    r.onupgradeneeded = () => { r.result.createObjectStore("faces", { keyPath: "id" }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
}
async function fmAll() { const db = await fmDB(); return new Promise((res, rej) => { const q = db.transaction("faces").objectStore("faces").getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => rej(q.error); }); }
async function fmPut(recs) { const db = await fmDB(); return new Promise((res, rej) => { const t = db.transaction("faces", "readwrite"), s = t.objectStore("faces"); recs.forEach(r => s.put(r)); t.oncomplete = () => res(); t.onerror = t.onabort = () => rej(t.error); }); }
async function fmDelIds(ids) { const db = await fmDB(); return new Promise((res, rej) => { const t = db.transaction("faces", "readwrite"), s = t.objectStore("faces"); ids.forEach(i => s.delete(i)); t.oncomplete = () => res(); t.onerror = t.onabort = () => rej(t.error); }); }

/* ---------- đăng ký phông vào trình duyệt ---------- */
function fmStack(family, cat) { return `"${family}", ${FM_GENERIC[cat] || "sans-serif"}`; }
async function fmRegister(rec) {
  const old = FM.faces.get(rec.id); if (old) { try { document.fonts.delete(old); } catch (_) {} }
  const ff = new FontFace(rec.family, await rec.blob.arrayBuffer(), { weight: rec.weight, style: rec.style, unicodeRange: rec.range || "U+0-10FFFF" });
  await ff.load(); document.fonts.add(ff); FM.faces.set(rec.id, ff);
  let e = FM.fam.get(rec.family); if (!e) { e = { family: rec.family, cat: rec.cat || "s", src: rec.src, prev: FONTS[rec.family], recs: new Map() }; FM.fam.set(rec.family, e); }
  e.recs.set(rec.id, { id: rec.id, weight: rec.weight, style: rec.style, subset: rec.subset, size: rec.size || (rec.blob && rec.blob.size) || 0 });
  FONTS[rec.family] = fmStack(rec.family, e.cat);
  return ff;
}
function fmInit() {
  if (FM.ready) return FM.ready;
  FM.ready = (async () => {
    let recs = []; try { recs = await fmAll(); } catch (_) { return; }
    await Promise.all(recs.map(r => fmRegister(r).catch(e => console.warn("font", r.family, e))));
  })();
  return FM.ready;
}
const fmInstalled = f => FM.fam.has(f);
const fmRedraw = () => { try { drawFrame(); } catch (_) {} try { renderInspector(); } catch (_) {} };

/* ---------- gỡ ---------- */
async function fmRemove(family) {
  const e = FM.fam.get(family); if (!e) return;
  const ids = [...e.recs.keys()];
  await fmDelIds(ids).catch(() => {});
  ids.forEach(i => { const ff = FM.faces.get(i); if (ff) { try { document.fonts.delete(ff); } catch (_) {} FM.faces.delete(i); } });
  FM.fam.delete(family); if (e.prev) FONTS[family] = e.prev; else delete FONTS[family];
  fmRedraw();
}

/* ---------- cài từ Google ---------- */
function fmPlan(e, opt) {
  const [name, id, cat, vi, ws, it, wmin, wmax] = e, list = String(ws).split(",").filter(Boolean).map(Number);
  const italic = !!(opt.italic && it);
  let weights;
  if (wmax) weights = [`${wmin}..${wmax}`];
  else if (opt.allW) weights = list.slice();
  else { weights = [400, 700].filter(w => list.includes(w)); if (!weights.length) weights = [list.includes(400) ? 400 : (list[0] || 400)]; }
  const subsets = FM_BASE.filter(s => s !== "vietnamese" || vi).concat(opt.extra ? FM_EXTRA : []);
  return { name, id, cat, vi, variable: !!wmax, wmin, wmax, weights, italic, subsets };
}
function fmGoogleUrl(p) {
  const enc = encodeURIComponent(p.name).replace(/%20/g, "+"), ws = p.weights.slice().sort((a, b) => parseInt(a) - parseInt(b));
  const axis = p.italic ? "ital,wght@" + [0, 1].flatMap(i => ws.map(w => `${i},${w}`)).join(";") : "wght@" + ws.join(";");
  return `https://fonts.googleapis.com/css2?family=${enc}:${axis}&display=swap`;
}
async function fmFetch(url, kind, ms = 20000) {
  const ac = new AbortController(), tm = setTimeout(() => ac.abort(), ms);
  try { const r = await fetch(url, { signal: ac.signal }); if (!r.ok) throw new Error("HTTP " + r.status); return kind === "text" ? await r.text() : await r.blob(); }
  finally { clearTimeout(tm); }
}
function fmParseCss(css, keep) {
  const out = [], re = /\/\*\s*([a-z-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g; let m;
  while ((m = re.exec(css))) {
    const subset = m[1], body = m[2]; if (!keep.includes(subset)) continue;
    const url = (/url\(([^)]+)\)\s*format\(['"]?woff2/.exec(body) || /url\(([^)]+)\)/.exec(body) || [])[1]; if (!url) continue;
    const style = (/font-style:\s*([a-z]+)/.exec(body) || [])[1] || "normal";
    const weight = ((/font-weight:\s*([0-9 ]+);/.exec(body) || [])[1] || "400").trim();
    const range = (/unicode-range:\s*([^;]+);/.exec(body) || [])[1] || (GF_CAT.ur[subset] || "");
    out.push({ url: url.replace(/['"]/g, ""), weight, style, subset, range });
  }
  return out;
}
/* dự phòng: Fontsource qua jsDelivr (không có trong CSS nên tự ghép tên file) */
async function fmCdnFaces(p) {
  const base = "https://cdn.jsdelivr.net/fontsource/fonts/", out = [], styles = p.italic ? ["normal", "italic"] : ["normal"];
  const tryOne = async (url, meta) => { try { const blob = await fmFetch(url, "blob"); out.push({ blob, ...meta }); } catch (_) {} };
  for (const subset of p.subsets) for (const style of styles) {
    const range = GF_CAT.ur[subset] || "";
    if (p.variable) await tryOne(`${base}${p.id}:vf@latest/${subset}-wght-${style}.woff2`, { weight: `${p.wmin} ${p.wmax}`, style, subset, range });
    if (!p.variable || !out.some(o => o.subset === subset && o.style === style))
      for (const w of (p.variable ? [400, 700] : p.weights)) await tryOne(`${base}${p.id}@latest/${subset}-${w}-${style}.woff2`, { weight: String(w), style, subset, range });
  }
  return out;
}
async function fmInstallGoogle(entry, opt = {}, prog = () => {}) {
  let p = fmPlan(entry, opt); let faces = [], blobs = [];
  try { faces = fmParseCss(await fmFetch(fmGoogleUrl(p), "text"), p.subsets); } catch (_) {}
  if (!faces.length && p.italic) { p = fmPlan(entry, { ...opt, italic: false }); try { faces = fmParseCss(await fmFetch(fmGoogleUrl(p), "text"), p.subsets); } catch (_) {} }
  if (faces.length) {
    let done = 0; prog(0, faces.length);
    blobs = await Promise.all(faces.map(async f => { const b = await fmFetch(f.url, "blob"); prog(++done, faces.length); return { blob: b, ...f }; }));
  } else {
    prog(0, 1); blobs = await fmCdnFaces(p); prog(1, 1);
    if (!blobs.some(b => b.subset === "latin")) throw new Error("Không tải được phông. Kiểm tra kết nối mạng rồi thử lại.");
  }
  if (FM.fam.has(p.name)) await fmRemove(p.name);
  const recs = blobs.map(b => ({ id: `${p.name}|${b.weight}|${b.style}|${b.subset}`, family: p.name, weight: b.weight, style: b.style, subset: b.subset, range: b.range, cat: p.cat, src: "google", blob: b.blob, size: b.blob.size, t: Date.now() }));
  await fmPut(recs); for (const r of recs) await fmRegister(r);
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (_) {}
  fmRedraw(); return p.name;
}

/* ---------- nhập từ máy ---------- */
const FM_WORDS = [["thin", 100], ["hairline", 100], ["extralight", 200], ["ultralight", 200], ["light", 300], ["regular", 400], ["medium", 500], ["semibold", 600], ["demibold", 600], ["extrabold", 800], ["ultrabold", 800], ["bold", 700], ["black", 900], ["heavy", 900]];
function fmFromName(fn) {
  let b = fn.replace(/\.[^.]+$/, ""), low = b.toLowerCase().replace(/[\s_-]/g, ""), weight = 400;
  for (const [w, v] of FM_WORDS) if (low.includes(w)) { weight = v; break; }
  const italic = /italic|oblique/i.test(b);
  let fam = b.replace(/[-_](thin|hairline|extralight|ultralight|light|regular|medium|semibold|demibold|extrabold|ultrabold|bold|black|heavy|italic|oblique|variable|vf)+/gi, "").replace(/[-_]+/g, " ").trim();
  fam = fam.replace(/([a-z])([A-Z])/g, "$1 $2");
  return { family: fam || b, weight: String(weight), style: italic ? "italic" : "normal" };
}
function fmParseSfnt(buf) {
  try {
    const v = new DataView(buf), tag = n => String.fromCharCode(v.getUint8(n), v.getUint8(n + 1), v.getUint8(n + 2), v.getUint8(n + 3));
    const sig = tag(0); if (!["\0\u0001\0\0", "OTTO", "true"].includes(sig)) return null;
    const n = v.getUint16(4), T = {}; for (let i = 0; i < n; i++) { const o = 12 + i * 16; T[tag(o)] = { off: v.getUint32(o + 8), len: v.getUint32(o + 12) }; }
    const res = {};
    if (T.name) {
      const o = T.name.off, cnt = v.getUint16(o + 2), so = o + v.getUint16(o + 4), names = {};
      for (let i = 0; i < cnt; i++) {
        const r = o + 6 + i * 12, pid = v.getUint16(r), id = v.getUint16(r + 6), len = v.getUint16(r + 8), off = v.getUint16(r + 10);
        if (pid !== 3 && pid !== 1) continue; if (names[id] && pid !== 3) continue;
        let s = ""; if (pid === 3) for (let k = 0; k < len; k += 2) s += String.fromCharCode(v.getUint16(so + off + k)); else for (let k = 0; k < len; k++) s += String.fromCharCode(v.getUint8(so + off + k));
        names[id] = s;
      }
      res.family = names[16] || names[1] || ""; res.sub = names[17] || names[2] || "";
    }
    if (T["OS/2"]) { const o = T["OS/2"].off; res.weight = v.getUint16(o + 4); res.italic = !!(v.getUint16(o + 62) & 1); }
    if (T.fvar) {
      const o = T.fvar.off, ao = v.getUint16(o + 4), ac = v.getUint16(o + 8), as = v.getUint16(o + 10);
      for (let i = 0; i < ac; i++) { const a = o + ao + i * as; if (tag(a) === "wght") { res.wmin = Math.round(v.getInt32(a + 4) / 65536); res.wmax = Math.round(v.getInt32(a + 12) / 65536); } }
    }
    return res;
  } catch (_) { return null; }
}
async function fmReadFile(f) {
  if (f.size > 40 * 1048576) throw new Error(`${f.name}: quá lớn (trên 40 MB)`);
  const buf = await f.arrayBuffer(), g = fmFromName(f.name), s = fmParseSfnt(buf);
  let family = g.family, weight = g.weight, style = g.style;
  if (s) {
    if (s.family) family = s.family;
    if (s.wmin && s.wmax && s.wmax > s.wmin) weight = `${s.wmin} ${s.wmax}`;
    else { if (s.weight) weight = String(Math.min(900, Math.max(100, Math.round(s.weight / 100) * 100))); }
    if (s.italic) style = "italic";
    else if (s.sub && /italic|oblique/i.test(s.sub)) style = "italic";
  }
  try { const t = new FontFace("bravin-test", buf.slice(0)); await t.load(); } catch (_) { throw new Error(`${f.name}: không phải file phông chữ hợp lệ`); }
  return { name: f.name, size: f.size, buf, family, weight, style };
}
async function fmInstallUser(items) {
  const names = new Set();
  for (const it of items) {
    const fam = it.family.trim(); if (!fam) throw new Error("Thiếu tên họ phông.");
    const rec = { id: `${fam}|${it.weight}|${it.style}|user`, family: fam, weight: it.weight, style: it.style, subset: "user", range: "", cat: "s", src: "user", blob: new Blob([it.buf]), size: it.size, t: Date.now() };
    await fmPut([rec]); await fmRegister(rec); names.add(fam);
  }
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (_) {}
  fmRedraw(); return [...names];
}

/* ---------- phông đang dùng trong dự án ---------- */
function fmUsedFamilies() { const s = new Set(); try { (typeof allClipsDeep === "function" ? allClipsDeep() : C).forEach(c => { if (c && c.font) s.add(c.font); }); } catch (_) {} return s; }
async function fmEnsureUsed() {
  await (FM.ready || Promise.resolve());
  const jobs = []; try { (typeof allClipsDeep === "function" ? allClipsDeep() : C).forEach(c => { if (c && c.font && FONTS[c.font]) jobs.push(document.fonts.load(`${c.italic ? "italic " : ""}${c.weight || 800} 40px ${FONTS[c.font]}`, String(c.text || "Aa ă â ê ô ơ ư đ"))); }); } catch (_) {}
  await Promise.race([Promise.all(jobs), new Promise(r => setTimeout(r, 3000))]);
}
async function fmCheckProject() {
  await (FM.ready || Promise.resolve());
  const miss = [...fmUsedFamilies()].filter(f => !FONTS[f]); if (!miss.length || document.querySelector(".fmmiss")) return;
  const avail = miss.filter(f => FM_BYNAME.has(f.toLowerCase())), local = miss.filter(f => !FM_BYNAME.has(f.toLowerCase()));
  const ov = document.createElement("div"); ov.className = "overlay fmmiss";
  ov.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="fmmT"><h2 id="fmmT">Dự án dùng phông chưa cài</h2>
    <p class="note">Tạm hiển thị bằng phông mặc định cho tới khi bạn cài các phông sau.</p>
    <ul class="fmlist">${avail.map(f => `<li><b>${fmEsc(f)}</b> <span>có trong thư viện Google</span></li>`).join("")}${local.map(f => `<li><b>${fmEsc(f)}</b> <span>không có trong thư viện, cần nhập file phông</span></li>`).join("")}</ul>
    <div class="row"><button type="button" class="primary" id="fmmGo"${avail.length ? "" : " hidden"}>Cài ${avail.length} phông</button><button type="button" id="fmmOpen">Mở trình quản lý</button><span class="spacer"></span><button type="button" class="no" data-close>Bỏ qua</button></div>
    <p class="note" id="fmmSt"></p></div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove(); ov.querySelector("[data-close]").onclick = close;
  ov.querySelector("#fmmOpen").onclick = () => { close(); openFonts(); };
  ov.querySelector("#fmmGo").onclick = async e => {
    e.target.disabled = true; const st = ov.querySelector("#fmmSt"); let ok = 0;
    for (const f of avail) { try { st.textContent = "Đang cài " + f + "…"; await fmInstallGoogle(FM_BYNAME.get(f.toLowerCase()), {}); ok++; } catch (x) { st.textContent = String(x.message || x); } }
    if (ok === avail.length) { close(); toast("Đã cài " + ok + " phông."); fmRedraw(); } else e.target.disabled = false;
  };
}

/* ---------- giao diện ---------- */
function openFonts(onPick) {
  if (document.querySelector(".fontdlg")) return;
  const ov = document.createElement("div"); ov.className = "overlay";
  ov.innerHTML = `<div class="dialog fontdlg" role="dialog" aria-modal="true" aria-labelledby="fmT">
    <div class="fmhead"><h2 id="fmT">Phông chữ</h2><button type="button" class="fmx" data-close aria-label="Đóng">✕</button></div>
    <div class="fmtabs" role="tablist"><button type="button" role="tab" data-t="in" aria-selected="true">Đã cài</button><button type="button" role="tab" data-t="gf" aria-selected="false">Thư viện Google · ${GF_CAT.n.toLocaleString("vi-VN")}</button><button type="button" role="tab" data-t="up" aria-selected="false">Nhập từ máy</button></div>
    <div class="fmbody"></div>
    <p class="note fmfoot">Phông Google dùng giấy phép mở (OFL, Apache), dùng cho video thương mại được. Phông nhập từ máy: bạn tự chịu trách nhiệm về bản quyền. Phông đã cài lưu trên thiết bị này và dùng được khi không có mạng.</p></div>`;
  document.body.appendChild(ov);
  const body = ov.querySelector(".fmbody"), tabs = [...ov.querySelectorAll(".fmtabs button")];
  const close = () => { ov.remove(); };
  ov.querySelector("[data-close]").onclick = close; ov.addEventListener("pointerdown", e => { if (e.target === ov) close(); });
  const pick = f => { if (onPick) { onPick(f); close(); } };
  let tab = "in"; const show = t => { tab = t; tabs.forEach(b => b.setAttribute("aria-selected", String(b.dataset.t === t))); ({ in: tIn, gf: tGf, up: tUp })[t](); };
  tabs.forEach(b => b.onclick = () => show(b.dataset.t));
  const sample = "Bravin Dựng video 123";

  /* --- Đã cài --- */
  function tIn() {
    const inst = [...FM.fam.values()].sort((a, b) => a.family.localeCompare(b.family));
    const total = inst.reduce((s, e) => s + [...e.recs.values()].reduce((a, r) => a + r.size, 0), 0);
    const builtin = Object.keys(FONTS).filter(k => !FM.fam.has(k));
    const nm = k => k === "sans-serif" ? "Không chân (hệ thống)" : k === "serif" ? "Có chân (hệ thống)" : k === "monospace" ? "Đơn cách (hệ thống)" : k === "cursive" ? "Viết tay (hệ thống)" : k;
    const row = (k, tag, rm) => `<div class="fmrow"><div class="fmprev" style="font-family:${fmEsc(FONTS[k] || k)}">${sample}</div><div class="fmmeta"><b>${fmEsc(nm(k))}</b><span>${tag}</span></div>${onPick ? `<button type="button" data-use="${fmEsc(k)}">Dùng</button>` : ""}${rm ? `<button type="button" class="fmdel" data-rm="${fmEsc(k)}" aria-label="Gỡ ${fmEsc(k)}">Gỡ</button>` : ""}</div>`;
    body.innerHTML = `<p class="note">${inst.length ? `Đã cài ${inst.length} phông, chiếm ${fmMB(total)} trên thiết bị này.` : "Bạn chưa cài phông nào. Mở tab Thư viện Google để cài, hoặc nhập file phông của bạn."}</p>
      <div class="fmlist2">${inst.map(e => row(e.family, `${e.src === "user" ? "Nhập từ máy" : "Google"} · ${fmMB([...e.recs.values()].reduce((a, r) => a + r.size, 0))}`, true)).join("")}${builtin.map(k => row(k, "Có sẵn trong Bravin", false)).join("")}</div>`;
    body.querySelectorAll("[data-use]").forEach(b => b.onclick = () => pick(b.dataset.use));
    body.querySelectorAll("[data-rm]").forEach(b => b.onclick = async () => { if (!b.dataset.arm) { b.dataset.arm = "1"; b.textContent = "Bấm lần nữa để gỡ"; setTimeout(() => { if (b.isConnected) { delete b.dataset.arm; b.textContent = "Gỡ"; } }, 3500); return; } await fmRemove(b.dataset.rm); toast("Đã gỡ " + b.dataset.rm + ". Chữ dùng phông này tạm hiện bằng phông mặc định."); tIn(); });
  }

  /* --- Thư viện Google --- */
  const gfState = { q: "", cat: "", vi: true, italic: false, allW: false, extra: false, n: 40 };
  function tGf() {
    body.innerHTML = `<div class="fmctl"><input type="search" id="fmQ" placeholder="Tìm trong ${GF_CAT.n.toLocaleString("vi-VN")} họ phông" aria-label="Tìm phông" value="${fmEsc(gfState.q)}">
      <select id="fmCat" aria-label="Nhóm phông"><option value="">Mọi nhóm</option>${Object.entries(FM_CATN).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></div>
      <div class="fmopts"><label><input type="checkbox" id="fmVi"> Chỉ phông có tiếng Việt</label><label><input type="checkbox" id="fmIt"> Kèm chữ nghiêng</label><label><input type="checkbox" id="fmAw"> Mọi độ đậm</label><label><input type="checkbox" id="fmEx"> Thêm Cyrillic, Hy Lạp</label></div>
      <p class="note" id="fmCnt"></p><div class="fmlist2" id="fmL"></div>`;
    const q = body.querySelector("#fmQ"), c = body.querySelector("#fmCat"), L = body.querySelector("#fmL"), cnt = body.querySelector("#fmCnt");
    c.value = gfState.cat; [["fmVi", "vi"], ["fmIt", "italic"], ["fmAw", "allW"], ["fmEx", "extra"]].forEach(([id, k]) => { const x = body.querySelector("#" + id); x.checked = gfState[k]; x.onchange = () => { gfState[k] = x.checked; if (k === "vi") { gfState.n = 40; draw(); } }; });
    const io = "IntersectionObserver" in window ? new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { io.unobserve(en.target); fmPreview(en.target); } }), { root: L, rootMargin: "120px" }) : null;
    function list() { const s = gfState.q.trim().toLowerCase(); return GF_CAT.d.filter(r => (!gfState.cat || r[2] === gfState.cat) && (!gfState.vi || r[3]) && (!s || r[0].toLowerCase().includes(s))); }
    function draw() {
      const all = list(), shown = all.slice(0, gfState.n);
      cnt.textContent = all.length ? `${all.length.toLocaleString("vi-VN")} họ phông` : "Không có phông nào khớp.";
      L.innerHTML = shown.map((r, i) => {
        const has = fmInstalled(r[0]), w = r[7] ? `độ đậm ${r[6]}–${r[7]} (1 file)` : r[4].split(",").length > 1 ? `${r[4].split(",").length} độ đậm` : "1 kiểu";
        return `<div class="fmrow" data-i="${i}"><div class="fmprev" data-fam="${fmEsc(r[0])}" style="${has ? "font-family:" + fmEsc(FONTS[r[0]]) : ""}">${sample}</div><div class="fmmeta"><b>${fmEsc(r[0])}</b><span>${FM_CATN[r[2]]} · ${w}${r[3] ? " · VI" : ""}</span></div>${has ? (onPick ? `<button type="button" data-use="${fmEsc(r[0])}">Dùng</button>` : `<span class="fmok">Đã cài ✓</span>`) : `<button type="button" class="primary" data-in="${fmEsc(r[0])}">Cài</button>`}</div>`;
      }).join("") + (all.length > shown.length ? `<button type="button" id="fmMore" class="fmmore">Xem thêm (${all.length - shown.length})</button>` : "");
      if (io) L.querySelectorAll(".fmprev:not([style*=font-family])").forEach(x => io.observe(x));
      L.querySelectorAll("[data-use]").forEach(b => b.onclick = () => pick(b.dataset.use));
      L.querySelectorAll("[data-in]").forEach(b => b.onclick = async () => {
        const e = FM_BYNAME.get(b.dataset.in.toLowerCase()); b.disabled = true; const t0 = b.textContent;
        try { await fmInstallGoogle(e, gfState, (d, n) => { b.textContent = n > 1 ? `${d}/${n}` : "…"; }); toast("Đã cài " + e[0] + "."); draw(); }
        catch (x) { b.disabled = false; b.textContent = t0; toast(String(x.message || x).includes("Failed to fetch") || x.name === "AbortError" ? "Không tải được phông. Kiểm tra kết nối mạng rồi thử lại." : String(x.message || x)); }
      });
      const m = L.querySelector("#fmMore"); if (m) m.onclick = () => { gfState.n += 60; draw(); };
    }
    let tm; q.oninput = () => { clearTimeout(tm); tm = setTimeout(() => { gfState.q = q.value; gfState.n = 40; draw(); }, 160); }; c.onchange = () => { gfState.cat = c.value; gfState.n = 40; draw(); };
    draw();
  }
  function fmPreview(el) {
    const fam = el.dataset.fam; if (!fam || FM.prev && FM.prev.has(fam) || navigator.onLine === false) return; (FM.prev = FM.prev || new Set()).add(fam);
    const l = document.createElement("link"); l.rel = "stylesheet"; l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fam).replace(/%20/g, "+")}&text=${encodeURIComponent(sample)}&display=swap`;
    l.onload = () => { el.style.fontFamily = `"${fam}", sans-serif`; }; l.onerror = () => { l.remove(); }; document.head.appendChild(l);
  }

  /* --- Nhập từ máy --- */
  let staged = [];
  function tUp() {
    body.innerHTML = `<p class="note">Chọn file .ttf, .otf, .woff hoặc .woff2. Bravin đọc tên họ, độ đậm và kiểu nghiêng từ file; bạn sửa lại được trước khi cài. Có thể chọn nhiều file cùng lúc (ví dụ Regular, Bold, Italic của một họ phông).</p>
      <div class="fmdrop" id="fmDrop" tabindex="0"><button type="button" class="primary" id="fmPickF">Chọn file phông…</button><span>hoặc kéo thả file vào đây</span><input type="file" id="fmFile" accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2" multiple hidden></div>
      <div id="fmStage"></div><p class="note warn" id="fmErr"></p>`;
    const inp = body.querySelector("#fmFile"), drop = body.querySelector("#fmDrop"), err = body.querySelector("#fmErr");
    body.querySelector("#fmPickF").onclick = () => inp.click();
    const add = async files => {
      err.textContent = ""; const bad = [];
      for (const f of files) { if (!/\.(ttf|otf|woff2?)$/i.test(f.name)) { bad.push(`${f.name}: không phải .ttf, .otf, .woff, .woff2`); continue; } try { staged.push(await fmReadFile(f)); } catch (x) { bad.push(String(x.message || x)); } }
      err.textContent = bad.join(" · "); renderStage();
    };
    inp.onchange = () => { const fs = [...inp.files]; inp.value = ""; add(fs); };
    drop.ondragover = e => { e.preventDefault(); drop.classList.add("on"); }; drop.ondragleave = () => drop.classList.remove("on");
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove("on"); add([...(e.dataTransfer.files || [])]); };
    renderStage();
    function renderStage() {
      const S = body.querySelector("#fmStage"); if (!staged.length) { S.innerHTML = ""; return; }
      const wopt = w => [100, 200, 300, 400, 500, 600, 700, 800, 900].map(x => `<option value="${x}"${String(x) === w ? " selected" : ""}>${x}</option>`).join("") + (/ /.test(w) ? `<option value="${w}" selected>${w.replace(" ", "–")}</option>` : "");
      S.innerHTML = `<div class="fmstage">${staged.map((s, i) => `<div class="fmst" data-i="${i}"><input class="fmf" value="${fmEsc(s.family)}" aria-label="Họ phông"><select class="fmw" aria-label="Độ đậm">${wopt(s.weight)}</select><select class="fms" aria-label="Kiểu"><option value="normal"${s.style === "normal" ? " selected" : ""}>Thẳng</option><option value="italic"${s.style === "italic" ? " selected" : ""}>Nghiêng</option></select><span class="fmsz">${fmEsc(s.name)} · ${fmMB(s.size)}</span><button type="button" class="fmdel" data-x="${i}" aria-label="Bỏ file">✕</button></div>`).join("")}</div>
        <div class="row"><button type="button" class="primary" id="fmGo">Cài ${staged.length} file</button><button type="button" id="fmClr">Xoá danh sách</button></div>`;
      S.querySelectorAll(".fmst").forEach(r => { const i = +r.dataset.i; r.querySelector(".fmf").oninput = e => staged[i].family = e.target.value; r.querySelector(".fmw").onchange = e => staged[i].weight = e.target.value; r.querySelector(".fms").onchange = e => staged[i].style = e.target.value; });
      S.querySelectorAll("[data-x]").forEach(b => b.onclick = () => { staged.splice(+b.dataset.x, 1); renderStage(); });
      S.querySelector("#fmClr").onclick = () => { staged = []; renderStage(); };
      S.querySelector("#fmGo").onclick = async e => {
        e.target.disabled = true; err.textContent = "";
        try { const names = await fmInstallUser(staged); staged = []; toast("Đã cài " + names.join(", ") + "."); if (onPick && names.length === 1) { pick(names[0]); return; } show("in"); }
        catch (x) { err.textContent = String(x.message || x); e.target.disabled = false; }
      };
    }
  }
  show("in");
}
window.openFonts = openFonts;
fmInit();
