"use strict";
/* ============================================================================
   Nhập file .bravin.json từ Antifact ("Gửi sang Bravin"): mỗi layer của Antifact
   thành 1 track video phủ riêng, đúng vị trí, độ mờ, chế độ hòa trộn và thứ tự lớp.
   Định dạng: { format:"bravin-project", canvas:{width,height,background},
     timeline:{fps,duration,trackOrder:"bottom-to-top"}, tracks:[{name,enabled,locked,clips:[{start,duration,opacity,blendMode,
     position:{x,y,width,height}, media:{type:"image", encoding:"data-url", data}}]}] }
   ============================================================================ */
const AF_MAX_LAYERS = 300;
const AF_BLEND = new Set(["multiply", "screen", "overlay", "soft-light", "hard-light", "darken", "lighten", "color-dodge", "color-burn", "difference", "exclusion", "hue", "saturation", "color", "luminosity"]);
const afIs = o => !!o && o.format === "bravin-project" && Array.isArray(o.tracks);
function afBlob(dataUrl) {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl || ""); if (!m) throw new Error("data");
  const mime = m[1] || "image/png", bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return new Blob([u8], { type: mime });
}
function afAspect(w, h) { const r = Math.log(w / h), c = ["9:16", "16:9", "1:1", "4:5"].map(a => { const [x, y] = a.split(":").map(Number); return [Math.abs(Math.log(x / y) - r), a]; }); c.sort((a, b) => a[0] - b[0]); return c[0][1]; }
async function afSolid(w, h, color) { const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d"); x.fillStyle = color; x.fillRect(0, 0, w, h); return await new Promise(r => c.toBlob(r, "image/png")); }

/* thêm các layer của Antifact vào dự án đang mở. Trả về số layer đã nhập. */
async function afApply(o, opt = {}) {
  const cw = +(o.canvas && o.canvas.width) || 0, ch = +(o.canvas && o.canvas.height) || 0;
  if (!(cw > 0 && ch > 0)) throw new Error("Thiếu kích thước canvas.");
  const W = cv.width, H = cv.height, k = Math.min(W / cw, H / ch), ox = (W - cw * k) / 2, oy = (H - ch * k) / 2;
  const t0 = opt.at || 0, list = o.tracks.slice(0, AF_MAX_LAYERS), news = []; let n = 0, skipped = 0;
  pushUndo();
  for (let i = 0; i < list.length; i++) {
    const L = list[i], cl = (L.clips || [])[0]; if (!cl || !cl.media || cl.media.type !== "image" || !cl.media.data || !cl.position) { skipped++; continue; }
    let blob; try { blob = afBlob(cl.media.data); } catch (_) { skipped++; continue; }
    const name = String(L.name || cl.name || "Layer " + (i + 1)).slice(0, 60);
    const m = await addMediaFile(blob, name.replace(/[\\/:*?"<>|]/g, "_") + ".png"); if (!m) { skipped++; continue; }
    const bw = +cl.position.width || (m.img ? m.img.naturalWidth : 1), bh = +cl.position.height || (m.img ? m.img.naturalHeight : 1);
    const iw = m.img ? m.img.naturalWidth : bw, ih = m.img ? m.img.naturalHeight : bh, base = Math.min(W / iw, H / ih), sc = (bw * k) / iw;
    const pcx = ox + ((+cl.position.x || 0) + bw / 2) * k, pcy = oy + ((+cl.position.y || 0) + bh / 2) * k;
    const tr = { id: nid("o"), type: "overlay", name, auto: false }; if (L.enabled === false) tr.off = true; if (L.locked) tr.lock = true;
    const dur = Math.max(MINLEN, +cl.duration || +(o.timeline && o.timeline.duration) || 5);
    const c = { id: nid("c"), track: tr.id, type: "video", mediaId: m.id, start: Math.max(0, t0 + (+cl.start || 0)), in: 0, out: dur, vol: 0, muted: false, zoom: "none", fit: "contain", scale: sc / base, x: (pcx - W / 2) / W, y: (pcy - H / 2) / H };
    if (cl.opacity != null && +cl.opacity < 1) c.opacity = Math.max(0, +cl.opacity);
    if (AF_BLEND.has(cl.blendMode)) c.blend = cl.blendMode;
    news.push({ tr, c, idx: +L.index || i }); n++;
  }
  if (!news.length) throw new Error("Không có layer ảnh nào để nhập.");
  // Antifact: index 0 = dưới cùng. Trong Bravin, track đứng đầu danh sách nằm trên cùng.
  news.sort((a, b) => b.idx - a.idx);
  const bg = o.canvas && o.canvas.background;
  if (bg && /^#[0-9a-f]{3,8}$/i.test(bg) && opt.background !== false) {
    const bm = await addMediaFile(await afSolid(W, H, bg), "Nền " + bg + ".png");
    if (bm) { const tr = { id: nid("o"), type: "overlay", name: "Nền " + bg, auto: false }; news.push({ tr, c: { id: nid("c"), track: tr.id, type: "video", mediaId: bm.id, start: Math.max(0, t0), in: 0, out: Math.max(MINLEN, +(o.timeline && o.timeline.duration) || 5), vol: 0, muted: false, zoom: "none", fit: "contain" } }); }
  }
  tracks.unshift(...news.map(x => x.tr)); news.forEach(x => C.push(x.c)); sel = null; msel && msel.clear && msel.clear();
  renderBin(); renderAll(); toast("Đã nhập " + n + " layer từ Antifact" + (skipped ? " (bỏ qua " + skipped + " layer không đọc được)" : "") + ". Mỗi layer là 1 track riêng, đúng vị trí và thứ tự.");
  return n;
}
/* mở file .bravin.json thành một dự án mới (từ Trang chủ / nút Mở dự án) */
async function afOpenAsProject(o, fname) {
  const cw = +(o.canvas && o.canvas.width) || 0, ch = +(o.canvas && o.canvas.height) || 0;
  if (!(cw > 0 && ch > 0)) { toast("File Antifact thiếu kích thước canvas."); return false; }
  await saveCurrent(true); const id = await createProjectRecord(String(fname || "Từ Antifact").replace(/\.bravin\.json$|\.json$/i, ""), afAspect(cw, ch));
  await openProjectById(id); if (typeof hideHome === "function") hideHome();
  try { const n = await afApply(o); if (n) await saveCurrent(true); return n > 0; } catch (e) { toast("Không nhập được file Antifact: " + (e.message || "file lỗi") + "."); return false; }
}
/* nhận 1 file .json bất kỳ: trả true nếu là file Antifact/Bravin-project đã xử lý */
async function afHandleFile(f, asProject) {
  let o = null; try { o = JSON.parse(await f.text()); } catch (_) { return false; }
  if (o && o.format === "antifact-project") { toast("Đây là file dự án của Antifact. Trong Antifact chọn Xuất → Gửi sang Bravin để lấy file .bravin.json rồi nhập vào đây."); return true; }
  if (!afIs(o)) return false;
  if (asProject) await afOpenAsProject(o, f.name);
  else { try { await afApply(o, { at: typeof t === "number" ? t : 0 }); } catch (e) { toast("Không nhập được file Antifact: " + (e.message || "file lỗi") + "."); } }
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
  for (const f of js) { const ok = await afHandleFile(f, false); if (!ok) toast("File " + f.name + " không phải file Antifact. Mở dự án Bravin bằng nút Mở dự án."); }
  if (rest.length) await _importFiles0(rest);
};
