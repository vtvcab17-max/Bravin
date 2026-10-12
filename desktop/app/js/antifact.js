"use strict";
/* ============================================================================
   Nhập file "bravin-project" (Antifact → Gửi sang Bravin, hoặc ứng dụng khác).
   Schema 1: mỗi layer ảnh = 1 track lớp phủ, đúng vị trí, độ mờ, hoà trộn, thứ tự.
   Schema 2 (Bravin 4.9.1): thêm nhiều clip mỗi track, video / âm thanh, keyframe
   chuyển động (x, y, width, height, scale, rotation, opacity + easing), hiệu ứng
   vào / ra, camera 2D (x, y, zoom, rotation) và parallax theo lớp.
   Đặc tả đầy đủ: docs/BRAVIN_PROJECT_FORMAT.md
   ============================================================================ */
const AF_MAX_LAYERS = 300, AF_SAMPLE_FPS = 15;
const AF_BLEND = new Set(["multiply", "screen", "overlay", "soft-light", "hard-light", "darken", "lighten", "color-dodge", "color-burn", "difference", "exclusion", "hue", "saturation", "color", "luminosity"]);
const AF_EASE = { linear: "linear", "ease-in": "in", easein: "in", in: "in", "ease-out": "out", easeout: "out", out: "out", "ease-in-out": "inout", easeinout: "inout", ease: "inout", inout: "inout", smooth: "inout", hold: "hold", step: "hold", constant: "hold", back: "back", bounce: "bounce", elastic: "elastic" };
const AF_IN = { fade: "fade", "fade-in": "fade", "zoom-in": "zoomIn", zoom: "zoomIn", "zoom-out": "zoomOut", "slide-from-left": "slideL", "slide-from-right": "slideR", "slide-from-bottom": "slideU", "slide-from-top": "slideD", "slide-left": "slideR", "slide-right": "slideL", "slide-up": "slideU", "slide-down": "slideD", pop: "pop", rotate: "rotate", flip: "flip", blur: "blur", drop: "drop", swing: "swing" };
const AF_OUT = { fade: "fade", "fade-out": "fade", "zoom-in": "zoomIn", zoom: "zoomOut", "zoom-out": "zoomOut", "slide-to-left": "slideL", "slide-to-right": "slideR", "slide-to-top": "slideU", "slide-to-bottom": "slideD", "slide-left": "slideL", "slide-right": "slideR", "slide-up": "slideU", "slide-down": "slideD", pop: "pop", rotate: "rotate", flip: "flip", blur: "blur" };
const afIs = o => !!o && o.format === "bravin-project" && Array.isArray(o.tracks);
const afNum = (v, d) => { if (v == null || v === "") return d; v = +v; return isFinite(v) ? v : d; };
function afBlob(dataUrl) {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl || ""); if (!m) throw new Error("data");
  const mime = m[1] || "image/png", bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return new Blob([u8], { type: mime });
}
function afAspect(w, h) { const r = Math.log(w / h), c = ["9:16", "16:9", "1:1", "4:5"].map(a => { const [x, y] = a.split(":").map(Number); return [Math.abs(Math.log(x / y) - r), a]; }); c.sort((a, b) => a[0] - b[0]); return c[0][1]; }
async function afSolid(w, h, color) { const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d"); x.fillStyle = color; x.fillRect(0, 0, w, h); return await new Promise(r => c.toBlob(r, "image/png")); }
const afEase = e => AF_EASE[String(e || "").toLowerCase().replace(/[_\s]/g, "-")] || AF_EASE[String(e || "").toLowerCase().replace(/[-_\s]/g, "")] || "linear";
const afKind = md => { const t = String(md && (md.type || md.kind || md.mime) || "").toLowerCase(); return t.startsWith("video") ? "video" : t.startsWith("audio") ? "audio" : t.startsWith("image") || t === "img" ? "image" : null; };

/* lấy media của clip → bản ghi media trong Thư viện (null nếu không đọc được) */
async function afMedia(cl, name, rep, cache) {
  const md = cl.media; if (!md) return null; const kind = afKind(md), src = md.data || md.url || md.src;
  if (!kind || !src) return null; if (cache.has(src)) return cache.get(src);
  let blob = null;
  try {
    if (/^data:/.test(src)) blob = afBlob(src);
    else if (/^https?:/i.test(src)) blob = (typeof dlFetch === "function" ? (await dlFetch(src)).blob : await (await fetch(src)).blob());
  } catch (_) { rep.warn.push("Không tải được media của “" + name + "” (" + (String(src).slice(0, 60)) + "). Nên nhúng dạng data-url."); }
  if (!blob) { cache.set(src, null); return null; }
  const ext = (blob.type.split("/")[1] || (kind === "image" ? "png" : kind === "audio" ? "m4a" : "mp4")).replace(/[^a-z0-9]/gi, "").slice(0, 5);
  const m = await addMediaFile(blob, name.replace(/[\\/:*?"<>|]/g, "_") + "." + ext); cache.set(src, m); return m;
}
function afNatural(m, box) {
  if (m.img) return [m.img.naturalWidth, m.img.naturalHeight];
  const el = m.els && m.els[0]; if (el && el.videoWidth) return [el.videoWidth, el.videoHeight];
  return [box.width || 1, box.height || 1];
}
/* nội suy 1 thuộc tính theo keyframe (có easing của khoá trước) */
function afInterp(keys, p, t, def) {
  const L = keys.filter(k => k[p] != null); if (!L.length) return def;
  if (t <= L[0].time) return L[0][p]; if (t >= L[L.length - 1].time) return L[L.length - 1][p];
  for (let i = 0; i < L.length - 1; i++) { const a = L[i], b = L[i + 1]; if (t < b.time) { const q = (t - a.time) / Math.max(1e-6, b.time - a.time); return a[p] + (b[p] - a[p]) * (EASE[a.e] || EASE.linear)(q); } }
  return def;
}
function afCamKeys(o, rep) {
  const cam = o.camera; if (!cam) return null;
  const K = (Array.isArray(cam) ? cam : cam.keyframes || cam.keys || []).map(k => ({ time: afNum(k.time != null ? k.time : k.t, 0), x: afNum(k.x, null), y: afNum(k.y, null), zoom: afNum(k.zoom != null ? k.zoom : k.scale, null), rotation: afNum(k.rotation, null), e: afEase(k.easing || k.ease) })).sort((a, b) => a.time - b.time);
  if (!K.length && cam.x == null) return null;
  if (!K.length) K.push({ time: 0, x: afNum(cam.x, null), y: afNum(cam.y, null), zoom: afNum(cam.zoom, null), rotation: afNum(cam.rotation, null), e: "linear" });
  const f3 = [].concat(Array.isArray(cam) ? cam : cam.keyframes || cam.keys || [cam]).some(k => k && (k.z != null || k.tiltX != null || k.tiltY != null || k.fov != null || k.depth != null));
  if (f3) rep.warn.push("Camera 3D (z / tilt / fov) chưa hỗ trợ: Bravin dùng camera 2D (x, y, zoom, rotation); dùng “parallax” cho cảm giác 2.5D.");
  return K;
}

/* thêm nội dung file vào dự án đang mở. Trả về báo cáo. */
async function afApply(o, opt = {}) {
  const cw = afNum(o.canvas && o.canvas.width, 0), ch = afNum(o.canvas && o.canvas.height, 0);
  if (!(cw > 0 && ch > 0)) throw new Error("Thiếu kích thước canvas.");
  const rep = { schema: afNum(o.schema, 1), tracks: 0, clips: 0, keys: 0, transitions: 0, audio: 0, video: 0, camera: false, warn: [], skipped: 0 };
  if (rep.schema > 2) rep.warn.push("File dùng schema " + rep.schema + ", Bravin này đọc tới schema 2. Phần mới hơn có thể bị bỏ qua.");
  const W = cv.width, H = cv.height, k = Math.min(W / cw, H / ch), ox = (W - cw * k) / 2, oy = (H - ch * k) / 2;
  const t0 = opt.at || 0, list = o.tracks.slice(0, AF_MAX_LAYERS), news = [], cache = new Map();
  if (o.tracks.length > AF_MAX_LAYERS) rep.warn.push("Chỉ nhập " + AF_MAX_LAYERS + " track đầu.");
  const cam = afCamKeys(o, rep); if (cam) rep.camera = true;
  const camAt = (T, par) => { const cx = afInterp(cam, "x", T, cw / 2), cy = afInterp(cam, "y", T, ch / 2), z = afInterp(cam, "zoom", T, 1), r = afInterp(cam, "rotation", T, 0); return { cx: cw / 2 + (cx - cw / 2) * par, cy: ch / 2 + (cy - ch / 2) * par, z: 1 + (z - 1) * par, r: r * par }; };
  const tlDur = afNum(o.timeline && o.timeline.duration, 5);
  pushUndo();
  for (let i = 0; i < list.length; i++) {
    const L = list[i] || {}, clips = Array.isArray(L.clips) ? L.clips : [], tname = String(L.name || "Layer " + (i + 1)).slice(0, 60);
    const made = [];
    for (let j = 0; j < clips.length; j++) {
      const cl = clips[j] || {}, name = String(cl.name || tname).slice(0, 60), kind = afKind(cl.media);
      if (!kind) { rep.skipped++; if (cl.text != null || (cl.media && /text/i.test(cl.media.type || ""))) rep.warn.push("Lớp chữ “" + name + "” cần xuất dạng ảnh (media.type “image”)."); continue; }
      const m = await afMedia(cl, name, rep, cache); if (!m) { rep.skipped++; continue; }
      const start = Math.max(0, t0 + afNum(cl.start, 0)), dur = Math.max(MINLEN, afNum(cl.duration, tlDur));
      const trim = cl.media.trim || cl.trim || {}, tin = Math.max(0, afNum(trim.in != null ? trim.in : cl.in, 0));
      const vol = cl.volume != null || (cl.media && cl.media.volume != null) ? afNum(cl.volume != null ? cl.volume : cl.media.volume, 1) : 1, dB = vol <= 0.001 ? -40 : Math.max(-40, Math.min(12, 20 * Math.log10(vol)));
      if (kind === "audio") { made.push({ audio: true, c: { id: nid("c"), type: "audio", mediaId: m.id, start, in: tin, out: Math.min(m.duration || tin + dur, tin + dur), vol: Math.round(dB * 10) / 10, muted: !!cl.muted } }); rep.audio++; rep.clips++; continue; }
      const box = cl.position || cl.box || { x: 0, y: 0, width: cw, height: ch }, [iw, ih] = afNatural(m, box), base = Math.min(W / iw, H / ih);
      const par = afNum(cl.parallax != null ? cl.parallax : L.parallax, 1);
      // khoá chuyển động: trạng thái gốc + keyframes (thời gian tính từ đầu clip)
      const st = { x: afNum(box.x, 0), y: afNum(box.y, 0), width: afNum(box.width, iw), height: afNum(box.height, ih), scale: afNum(cl.scale, 1), rotation: afNum(cl.rotation, 0), opacity: afNum(cl.opacity, 1) };
      const KF = (Array.isArray(cl.keyframes) ? cl.keyframes : Array.isArray(cl.motion) ? cl.motion : []).map(q => ({ time: Math.max(0, Math.min(dur, afNum(q.time != null ? q.time : q.t, 0))), x: afNum(q.x, null), y: afNum(q.y, null), width: afNum(q.width, null), height: afNum(q.height, null), scale: afNum(q.scale, null), rotation: afNum(q.rotation, null), opacity: afNum(q.opacity, null), e: afEase(q.easing || q.ease) })).sort((a, b) => a.time - b.time);
      const stateAt = lt => { const g = p => afInterp(KF, p, lt, st[p]); return { x: g("x"), y: g("y"), w: g("width"), h: g("height"), s: g("scale"), r: g("rotation"), a: g("opacity") }; };
      const toBravin = (s, T) => { // canvas Antifact (+ camera) → toạ độ clip của Bravin
        let px = s.x + s.w / 2, py = s.y + s.h / 2, ww = s.w * s.s, ang = s.r;
        if (cam) { const C2 = camAt(T, par), rr = -C2.r * Math.PI / 180, dx = px - C2.cx, dy = py - C2.cy; px = cw / 2 + (dx * Math.cos(rr) - dy * Math.sin(rr)) * C2.z; py = ch / 2 + (dx * Math.sin(rr) + dy * Math.cos(rr)) * C2.z; ww *= C2.z; ang -= C2.r; }
        return { x: (ox + px * k - W / 2) / W, y: (oy + py * k - H / 2) / H, scale: (ww * k / iw) / base, angle: ang, opacity: Math.max(0, Math.min(1, s.a)) };
      };
      const tr0 = toBravin(stateAt(0), start - t0);
      const c = { id: nid("c"), type: "video", mediaId: m.id, start, in: kind === "video" ? tin : 0, out: kind === "video" ? Math.min(m.duration || tin + dur, tin + dur) : dur, vol: kind === "video" ? Math.round(dB * 10) / 10 : 0, muted: kind === "video" ? !!cl.muted : false, zoom: "none", fit: "contain", x: tr0.x, y: tr0.y, scale: tr0.scale };
      if (tr0.angle) c.angle = tr0.angle; if (tr0.opacity < 1) c.opacity = tr0.opacity;
      if (AF_BLEND.has(cl.blendMode)) c.blend = cl.blendMode;
      // keyframe: không camera → giữ đúng khoá + easing; có camera → lấy mẫu 15 lần/giây
      const times = new Set(KF.map(q => q.time));
      if (cam) { for (let s2 = 0; s2 <= dur + 1e-6; s2 += 1 / AF_SAMPLE_FPS) times.add(Math.min(dur, s2)); cam.forEach(q => { const lt = q.time - (start - t0); if (lt > 0 && lt < dur) times.add(lt); }); }
      const T2 = [...times].sort((a, b) => a - b);
      if (T2.length > 1) {
        const kf = { x: [], y: [], scale: [], angle: [], opacity: [] };
        for (const lt of T2) {
          const b = toBravin(stateAt(lt), start - t0 + lt), src = cam ? null : KF.find(q => q.time === lt), e = src ? src.e : "linear", tt = Math.round(lt * 1000) / 1000;
          for (const p of ["x", "y", "scale", "angle", "opacity"]) kf[p].push({ t: tt, v: p === "opacity" ? b.opacity : b[p], e });
        }
        const changes = p => kf[p].some(q => Math.abs(q.v - kf[p][0].v) > 1e-6);
        c.kf = {}; for (const p of Object.keys(kf)) if (changes(p)) c.kf[p] = kf[p];
        if (!Object.keys(c.kf).length) delete c.kf; else rep.keys += KF.length;
      }
      // hiệu ứng vào / ra
      const tin2 = cl.transitionIn || cl.in_transition || (cl.transitions && cl.transitions.in), tout = cl.transitionOut || cl.out_transition || (cl.transitions && cl.transitions.out);
      const anim = {}; const ty = x => String(x && (x.type || x.name || x) || "").toLowerCase().replace(/[_\s]/g, "-");
      if (tin2) { const a = AF_IN[ty(tin2)]; if (a) anim.in = { type: a, dur: Math.max(0.05, Math.min(dur / 2, afNum(tin2.duration, 0.5))) }; else rep.warn.push("Hiệu ứng vào “" + ty(tin2) + "” chưa có trong Bravin (“" + name + "”)."); }
      if (tout) { const a = AF_OUT[ty(tout)]; if (a) anim.out = { type: a, dur: Math.max(0.05, Math.min(dur / 2, afNum(tout.duration, 0.5))) }; else rep.warn.push("Hiệu ứng ra “" + ty(tout) + "” chưa có trong Bravin (“" + name + "”)."); }
      if (anim.in || anim.out) { c.anim = anim; rep.transitions += (anim.in ? 1 : 0) + (anim.out ? 1 : 0); }
      if (kind === "video") rep.video++;
      made.push({ c }); rep.clips++;
    }
    if (!made.length) continue;
    const vis = made.filter(x => !x.audio), aud = made.filter(x => x.audio);
    if (vis.length) { const tr = { id: nid("o"), type: "overlay", name: tname, auto: false }; if (L.enabled === false || L.visible === false) tr.off = true; if (L.locked) tr.lock = true; vis.forEach(x => x.c.track = tr.id); news.push({ tr, cs: vis.map(x => x.c), idx: afNum(L.index, i) }); rep.tracks++; }
    if (aud.length) { const tr = { id: nid("a"), type: "audio", name: tname, auto: false }; if (L.enabled === false) tr.off = true; aud.forEach(x => x.c.track = tr.id); news.push({ tr, cs: aud.map(x => x.c), audio: true }); rep.tracks++; }
  }
  if (!news.length) throw new Error("Không có layer nào đọc được (cần media ảnh, video hoặc âm thanh).");
  const visN = news.filter(x => !x.audio).sort((a, b) => b.idx - a.idx), audN = news.filter(x => x.audio);
  const bg = o.canvas && o.canvas.background;
  if (bg && /^#[0-9a-f]{3,8}$/i.test(bg) && opt.background !== false) {
    const bm = await addMediaFile(await afSolid(W, H, bg), "Nền " + bg + ".png");
    if (bm) { const tr = { id: nid("o"), type: "overlay", name: "Nền " + bg, auto: false }; visN.push({ tr, cs: [{ id: nid("c"), track: tr.id, type: "video", mediaId: bm.id, start: Math.max(0, t0), in: 0, out: Math.max(MINLEN, tlDur), vol: 0, muted: false, zoom: "none", fit: "contain" }] }); }
  }
  // Antifact: index 0 = dưới cùng. Trong Bravin, track lớp phủ đứng đầu danh sách nằm trên cùng.
  tracks.unshift(...visN.map(x => x.tr)); audN.forEach(x => tracks.push(x.tr)); news.concat(visN.filter(x => !news.includes(x))).forEach(x => x.cs.forEach(c => C.push(c)));
  sel = null; if (msel && msel.clear) msel.clear();
  renderBin(); renderAll();
  return rep;
}
function afReport(rep, fname) {
  const parts = [rep.tracks + " track", rep.clips + " clip"]; if (rep.video) parts.push(rep.video + " video"); if (rep.audio) parts.push(rep.audio + " âm thanh"); if (rep.keys) parts.push(rep.keys + " keyframe"); if (rep.transitions) parts.push(rep.transitions + " hiệu ứng vào/ra"); if (rep.camera) parts.push("camera đã chuyển thành chuyển động của từng lớp");
  if (!rep.warn.length && !rep.skipped) { toast("Đã nhập từ " + (fname || "Antifact") + ": " + parts.join(", ") + "."); return; }
  const ov = document.createElement("div"); ov.className = "overlay";
  ov.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="afT"><h2 id="afT">Đã nhập từ ${afEsc(fname || "Antifact")}</h2><p>${afEsc(parts.join(" · "))}${rep.skipped ? " · bỏ qua " + rep.skipped + " clip" : ""}</p>${rep.warn.length ? "<p><b>Cần lưu ý:</b></p><ul style='margin:0;padding-left:18px;line-height:1.5'>" + [...new Set(rep.warn)].slice(0, 12).map(w => "<li>" + afEsc(w) + "</li>").join("") + "</ul>" : ""}<div class="row"><button type="button" class="primary" data-close>Đóng</button></div></div>`;
  document.body.appendChild(ov); ov.querySelector("[data-close]").onclick = () => ov.remove(); ov.addEventListener("pointerdown", e => { if (e.target === ov) ov.remove(); });
}
function afEsc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
/* mở file thành một dự án mới (từ Trang chủ / nút Mở dự án / thả file vào Trang chủ) */
async function afOpenAsProject(o, fname) {
  const cw = afNum(o.canvas && o.canvas.width, 0), ch = afNum(o.canvas && o.canvas.height, 0);
  if (!(cw > 0 && ch > 0)) { toast("File thiếu kích thước canvas."); return false; }
  await saveCurrent(true); const id = await createProjectRecord(String(fname || "Từ Antifact").replace(/\.bravin\.json$|\.json$/i, ""), afAspect(cw, ch));
  await openProjectById(id); if (typeof hideHome === "function") hideHome();
  try { const rep = await afApply(o); await saveCurrent(true); afReport(rep, fname); return true; } catch (e) { toast("Không nhập được file: " + (e.message || "file lỗi") + "."); return false; }
}
/* nhận 1 file .json bất kỳ: trả true nếu là file bravin-project / Antifact đã xử lý */
async function afHandleFile(f, asProject) {
  let o = null; try { o = JSON.parse(await f.text()); } catch (_) { return false; }
  if (o && o.format === "antifact-project") { toast("Đây là file dự án của Antifact. Trong Antifact chọn Xuất → Bravin để lấy file .bravin.json rồi thả vào đây."); return true; }
  if (!afIs(o)) return false;
  if (asProject) await afOpenAsProject(o, f.name);
  else { try { afReport(await afApply(o, { at: typeof t === "number" ? t : 0 }), f.name); } catch (e) { toast("Không nhập được file: " + (e.message || "file lỗi") + "."); } }
  return true;
}
window.afHandleFile = afHandleFile;
/* Mở dự án / Nhập (Trang chủ): chặn trước trình xử lý cũ khi là file Antifact */
(function wireAf() {
  const pf = $("#projFile");
  if (pf && pf.onchange) { const old = pf.onchange; pf.onchange = async function (e) {
    const f = e.target.files && e.target.files[0]; let o = null; if (f) { try { o = JSON.parse(await f.text()); } catch (_) {} }
    if (o && (afIs(o) || o.format === "antifact-project")) { e.target.value = ""; await afHandleFile(f, true); return; }
    return old.call(pf, e); }; }
  const fl = $("#file"); if (fl) { fl.accept = "video/*,audio/*,image/*,.json,application/json"; }
})();
const _importFiles0 = importFiles;
importFiles = async function (files) {
  const list = [...files], js = list.filter(f => /\.json$/i.test(f.name) || f.type === "application/json"), rest = list.filter(f => !js.includes(f));
  for (const f of js) { const ok = await afHandleFile(f, false); if (!ok) toast("File " + f.name + " không phải file Antifact / bravin-project. Mở dự án Bravin bằng nút Mở dự án."); }
  if (rest.length) await _importFiles0(rest);
};
/* thả file vào BẤT KỲ đâu trong Bravin: Trang chủ → mở thành dự án mới; trong trình dựng → thêm vào dự án đang mở */
(function wireDrop() {
  let hint = null, depth = 0;
  const hasFiles = e => [...((e.dataTransfer && e.dataTransfer.types) || [])].includes("Files");
  const show = on => { if (on && !hint) { hint = document.createElement("div"); hint.className = "afdrop"; hint.textContent = document.body.classList.contains("athome") ? "Thả file Antifact (.bravin.json) để mở thành dự án mới, hoặc thả video / ảnh / nhạc" : "Thả vào đây để thêm vào dự án"; document.body.appendChild(hint); } if (!on && hint) { hint.remove(); hint = null; } };
  window.addEventListener("dragenter", e => { if (!hasFiles(e)) return; depth++; show(true); });
  window.addEventListener("dragleave", () => { depth = Math.max(0, depth - 1); if (!depth) show(false); });
  window.addEventListener("dragover", e => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener("drop", async e => {
    depth = 0; show(false); if (!hasFiles(e) || e.defaultPrevented) return; e.preventDefault();
    const files = [...e.dataTransfer.files]; if (!files.length) return;
    const atHome = document.body.classList.contains("athome"), js = files.filter(f => /\.json$/i.test(f.name) || f.type === "application/json");
    if (atHome && js.length) { for (const f of js) if (await afHandleFile(f, true)) return; toast("File không phải bravin-project. Dự án Bravin (.json) mở bằng nút Mở dự án."); return; }
    if (atHome && typeof hideHome === "function") hideHome();
    await importFiles(files);
  });
})();
