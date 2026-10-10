"use strict";
/* ---------- clip ops ---------- */
const TRACK_NAMES = { overlay: "Video phủ", text: "Chữ", audio: "Âm thanh", fx: "Hiệu ứng" };
function addTrack(type, pos) {
  const n = tracks.filter(x => x.type === type).length + 1, tr = { id: nid(type === "overlay" ? "o" : type === "fx" ? "x" : type[0]), type, name: TRACK_NAMES[type] + (n > 1 ? " " + n : "") }; if (type === "overlay") tr.auto = true;
  if (pos != null) tracks.splice(pos, 0, tr);
  else if (type === "overlay" || type === "text" || type === "fx") { const vi = type === "overlay" ? tracks.findIndex(x => x.id === "v") : type === "fx" ? tracks.findIndex(x => x.type === "overlay" || x.id === "v") : 0; tracks.splice(vi < 0 ? 0 : vi, 0, tr); }
  else tracks.push(tr);
  return tr;
}
function renameTrack(tr, span) { const inp = document.createElement("input"); inp.value = tr.name; span.replaceWith(inp); inp.focus(); inp.select(); const done = ok => { if (ok && inp.value.trim() && inp.value.trim() !== tr.name) { tr.name = inp.value.trim(); tr.auto = false; } renderTimeline(); }; inp.onkeydown = e => { if (e.key === "Enter") done(true); if (e.key === "Escape") done(false); e.stopPropagation(); }; inp.onblur = () => done(true); }
let menuEl = null;
function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; document.removeEventListener("pointerdown", menuOutside, true); } }
function menuOutside(e) { if (menuEl && !menuEl.contains(e.target)) closeMenu(); }
function openMenu(anchor, items) {
  closeMenu(); menuEl = document.createElement("div"); menuEl.className = "menu"; menuEl.setAttribute("role", "menu");
  for (const it of items) {
    if (it.h) { const h = document.createElement("div"); h.className = "mh"; h.textContent = it.h; menuEl.appendChild(h); continue; }
    const b = document.createElement("button"); b.setAttribute("role", "menuitem"); b.textContent = it.label; if (it.kbd) { const k = document.createElement("kbd"); k.textContent = it.kbd; b.appendChild(k); } if (it.disabled) b.disabled = true;
    b.onclick = () => { closeMenu(); it.run(); }; menuEl.appendChild(b);
  }
  document.body.appendChild(menuEl); const r = anchor.getBoundingClientRect(), mh = menuEl.offsetHeight, mw = menuEl.offsetWidth;
  menuEl.style.left = Math.min(window.innerWidth - mw - 8, r.left) + "px"; menuEl.style.top = (r.bottom + mh + 6 > window.innerHeight ? Math.max(8, r.top - mh - 6) : r.bottom + 6) + "px";
  setTimeout(() => document.addEventListener("pointerdown", menuOutside, true), 0); menuEl.querySelector("button")?.focus();
}
function trackMenu(tr, anchor) {
  const i = tracks.indexOf(tr), n = tr.id === "v" ? V.length : C.filter(c => c.track === tr.id).length;
  openMenu(anchor, [
    { label: "Đổi tên track", run: () => { const sp = rowsEl[tr.id]?.querySelector(".thead span"); if (sp) renameTrack(tr, sp); } },
    { label: "Thêm track " + (TRACK_NAMES[tr.type === "video" ? "overlay" : tr.type] || "").toLowerCase() + " bên trên", run: () => { pushUndo(); addTrack(tr.type === "video" ? "overlay" : tr.type, i); renderAll(); } },
    { label: "Chuyển track lên", disabled: i === 0, run: () => { pushUndo(); tracks.splice(i, 1); tracks.splice(i - 1, 0, tr); renderAll(); } },
    { label: "Chuyển track xuống", disabled: i === tracks.length - 1, run: () => { pushUndo(); tracks.splice(i, 1); tracks.splice(i + 1, 0, tr); renderAll(); } },
    { label: tr.lock ? "Mở khoá track" : "Khoá track", run: () => { tr.lock = !tr.lock; renderTimeline(); } },
    { label: tr.id === "v" ? "Track chính không xoá được" : `Xoá track${n ? " và " + n + " clip" : ""}`, disabled: tr.id === "v", run: () => { pushUndo(); C = C.filter(c => c.track !== tr.id); tracks.splice(i, 1); sel = null; renderAll(); toast("Đã xoá track. Ctrl+Z để lấy lại."); } }
  ]);
}
function firstTrack(type, name) { let tr = tracksOf(type)[0]; if (!tr) { tr = { id: nid(type[0]), type, name }; tracks.push(tr); } return tr; }
function appendMedia(m, index, opts = {}) {
  pushUndo();
  if (opts.overlay) {
    const tr = opts.newPos != null ? addTrack("overlay", opts.newPos) : (trackById(opts.overlay) || addTrack("overlay"));
    const c = { id: nid("c"), track: tr.id, type: "video", mediaId: m.id, start: opts.start != null ? opts.start : t, in: 0, out: m.kind === "image" ? 3 : m.duration, vol: 0, muted: false, zoom: "none", scale: 1 };
    C.push(c); sel = { k: "c", id: c.id }; renderAll(); return;
  }
  if (m.kind === "audio") {
    const tr = opts.track ? trackById(opts.track) : firstTrack("audio", "Âm thanh");
    const c = { id: nid("c"), track: tr.id, type: "audio", mediaId: m.id, start: opts.start != null ? opts.start : t, in: 0, out: m.duration, vol: 0 };
    C.push(c); sel = { k: "c", id: c.id };
  } else {
    if (!trackById("v")) tracks.unshift({ id: "v", type: "video", name: "Video" });
    const c = { id: nid("v"), mediaId: m.id, in: 0, out: m.kind === "image" ? 3 : m.duration, vol: 0, muted: false, zoom: "none" };
    const before = vMap(); if (index == null) V.push(c); else V.splice(index, 0, c); linkShift(before); sel = { k: "v", id: c.id };
  }
  renderAll();
}
function addText(opts = {}) {
  pushUndo(); const tr = opts.track ? trackById(opts.track) : firstTrack("text", "Chữ");
  const c = { id: nid("c"), track: tr.id, type: "text", style: opts.style || "caption", start: opts.start != null ? opts.start : t, dur: opts.dur || 2, line1: opts.line1 != null ? opts.line1 : "Nhập chữ", line2: opts.line2 || "" };
  C.push(c); sel = { k: "c", id: c.id }; renderAll(); showTab("insp"); return c;
}
function replaceClip(c, m) {
  const slot = vlen(c), sp = c.speed || 1;
  c.mediaId = m.id; delete c.reverse;
  if (m.kind === "image") { c.in = 0; c.out = slot * sp; }
  else { const L = Math.min(slot * sp, m.duration); c.in = 0; c.out = L; }
}
const deep = o => JSON.parse(JSON.stringify(o));
function splitParts(c, b, off) { // keyframes, animations, transitions, word timings follow the split
  const [ka, kb] = splitKf(c.kf, off); if (ka) c.kf = ka; else delete c.kf; if (kb) b.kf = kb; else delete b.kf;
  if (c.anim) { b.anim = deep(c.anim); if (c.anim.out) delete c.anim.out; if (b.anim.in) delete b.anim.in; }
  if (c.tr) { b.tr = c.tr; delete c.tr; }
  if (c.words) { b.words = c.words.filter(w => w[1] > off).map(w => [Math.max(0, w[0] - off), w[1] - off, w[2]]); c.words = c.words.filter(w => w[0] < off); }
  if (c.fadeOut) { b.fadeOut = c.fadeOut; delete c.fadeOut; } if (b.fadeIn) delete b.fadeIn;
}
function splitV(c, off) { // returns the right half, inserted after c
  const b = { ...deep(c), id: nid("v"), gap: 0 }, sp = c.speed || 1;
  if (c.freeze) { b.dur = c.dur - off; c.dur = off; }
  else if (c.reverse) { const cut = c.out - srcOffset(c, off); b.out = cut; c.in = cut; }
  else { const cut = c.in + srcOffset(c, off); b.in = cut; c.out = cut; }
  splitParts(c, b, off);
  V.splice(V.indexOf(c) + 1, 0, b); return b;
}
function splitC(c, at) {
  const off = at - c.start, b = { ...deep(c), id: nid("c"), start: at }, sp = c.speed || 1;
  if (isDur(c)) { b.dur = c.dur - off; c.dur = off; if (c.type === "compound") b.off = (c.off || 0) + off; } else { b.in = c.in + srcOffset(c, off); c.out = c.in + srcOffset(c, off); }
  splitParts(c, b, off); C.push(b); return b;
}
function vAt(time) { const st = vStarts(); const i = V.findIndex((c, k) => time > st[k] + 0.03 && time < st[k] + vlen(c) - 0.03); return i < 0 ? null : { c: V[i], i, start: st[i] }; }
function splitAtPlayhead() {
  const cur = findSel();
  if (cur && sel.k === "c" && !isLocked(cur.track) && t > cur.start + 0.03 && t < cend(cur) - 0.03) { pushUndo(); const b = splitC(cur, t); sel = { k: "c", id: b.id }; renderAll(); return true; }
  const h = isLocked("v") ? null : vAt(t);
  if (h) { pushUndo(); const b = splitV(h.c, t - h.start); sel = { k: "v", id: b.id }; renderAll(); return true; }
  toast("Đặt kim lên giữa một clip rồi bấm Tách."); return false;
}
function vMap() { const st = vStarts(), m = {}; V.forEach((c, i) => m[c.id] = [st[i], st[i] + vlen(c)]); return m; }
function linkShift(before) { // move short linked items (text, SFX, overlays ≤ 15 s) with the video clip they started on
  if (!linkOn || !before) return; const after = vMap();
  for (const c of C) {
    if (isLocked(c.track) || clen(c) > 15) continue;
    for (const id in before) { const [s0, e0] = before[id]; if (c.start >= s0 - 1e-3 && c.start < e0 - 1e-3) { const n = after[id]; if (n) c.start = Math.max(0, n[0] + (c.start - s0)); break; } }
  }
}
function deleteSide(side) {
  const cur = findSel();
  if (cur && sel.k === "c" && !isLocked(cur.track) && t > cur.start + 0.03 && t < cend(cur) - 0.03) {
    pushUndo(); const off = t - cur.start;
    const sp = cur.speed || 1;
    if (side === "left") { if (isDur(cur)) { cur.dur -= off; if (cur.type === "compound") cur.off = (cur.off || 0) + off; } else cur.in += srcOffset(cur, off); cur.start = t; const [, kb] = splitKf(cur.kf, off); if (kb) cur.kf = kb; else delete cur.kf; } else { if (isDur(cur)) cur.dur = off; else cur.out = cur.in + srcOffset(cur, off); }
    renderAll(); return;
  }
  const h = isLocked("v") ? null : vAt(t); if (!h) { toast("Đặt kim lên giữa một clip để xoá một phía."); return; }
  pushUndo(); const before = vMap(), c = h.c, off = t - h.start, L = vlen(c), sp = c.speed || 1;
  if (side === "left") {
    if (c.freeze) c.dur -= off; else if (c.reverse) c.out -= srcOffset(c, off); else c.in += srcOffset(c, off);
    { const [, kb] = splitKf(c.kf, off); if (kb) c.kf = kb; else delete c.kf; }
    if (!magnetOn) c.gap = (c.gap || 0) + off; else t = h.start;
  } else {
    if (c.freeze) c.dur = off; else if (c.reverse) c.in = c.out - srcOffset(c, off); else c.out = c.in + srcOffset(c, off);
    if (!magnetOn && V[h.i + 1]) V[h.i + 1].gap = (V[h.i + 1].gap || 0) + (L - off);
  }
  linkShift(before); renderAll();
}
function toggleMarker() { const k = markers.findIndex(m => Math.abs(m - t) < 0.05); pushUndo(); if (k >= 0) markers.splice(k, 1); else { markers.push(Math.round(t * 100) / 100); markers.sort((a, b) => a - b); } renderTimeline(); }
function targetVideo() { const c = findSel(); if (c && (sel.k === "v" || c.type === "video") && !isLocked(clipTrack(sel.k, c))) return { k: sel.k, c }; const h = isLocked("v") ? null : activeVideo(t); return h ? { k: "v", c: h.c } : null; }
function freezeFrame(dur = 3) {
  const h = isLocked("v") ? null : activeVideo(t); if (!h) { toast("Đặt kim lên một cảnh video để đứng hình."); return; }
  const m = media.get(h.c.mediaId); if (!m || m.kind !== "video") { toast("Đứng hình chỉ dùng cho video."); return; }
  pushUndo(); const before = vMap(); let a = h.c, off = t - h.start; const srcT = srcTime(a, off);
  let right = null; if (off > 0.03 && off < vlen(a) - 0.03) right = splitV(a, off);
  const f = { id: nid("v"), mediaId: a.mediaId, in: srcT, out: srcT + 0.04, freeze: true, dur, vol: 0, muted: true, zoom: "none", gap: 0 };
  const at = off <= 0.03 ? V.indexOf(a) : V.indexOf(a) + 1; V.splice(at, 0, f);
  // linked items after the freeze point move right by its length
  if (linkOn) for (const c of C) if (!isLocked(c.track) && clen(c) <= 15 && c.start >= t - 1e-3) c.start += dur;
  sel = { k: "v", id: f.id }; renderAll(); toast("Đã chèn khung đứng " + dur + " giây.");
}
function setProp(fn, msg) { const tv = targetVideo(); if (!tv) { toast("Chọn một clip video (hoặc đặt kim lên cảnh)."); return; } pushUndo(); fn(tv.c); sel = { k: tv.k, id: tv.c.id }; renderAll(); if (msg) toast(msg(tv.c)); }
async function setCover() {
  coverT = Math.round(t * 100) / 100; renderTimeline(); drawFrame();
  const saver = await getSaver(); if (!saver) { toast("Đã đặt ảnh bìa tại " + fmt(coverT) + "."); return; }
  cv.toBlob(async b => { try { await saver.save({ filename: "vincut-anh-bia.png", data: b }); toast("Đã đặt và lưu ảnh bìa tại " + fmt(coverT) + "."); } catch (e) { toast("Đã đặt ảnh bìa tại " + fmt(coverT) + "."); } }, "image/png");
}
function deleteSel() {
  if (sel && sel.k === "tr") { const v = V.find(x => x.id === sel.id); if (v && v.tr) { pushUndo(); delete v.tr; } sel = null; renderAll(); return; }
  const c = findSel(); if (!c) { toast("Chọn một clip trên timeline trước."); return; }
  if (isLocked(clipTrack(sel.k, c))) { toast("Track đang khoá."); return; }
  pushUndo();
  if (sel.k === "v") { const before = vMap(), i = V.indexOf(c); if (!magnetOn && V[i + 1]) V[i + 1].gap = (V[i + 1].gap || 0) + (c.gap || 0) + vlen(c); V = V.filter(x => x !== c); linkShift(before); }
  else C = C.filter(x => x !== c);
  sel = null; t = Math.min(t, total()); renderAll();
}
function duplicateSel() {
  const c = findSel(); if (!c) { toast("Chọn một clip trên timeline trước."); return; } pushUndo();
  if (sel.k === "v") { const b = { ...deep(c), id: nid("v") }; delete b.grp; V.splice(V.indexOf(c) + 1, 0, b); sel = { k: "v", id: b.id }; }
  else { const b = { ...deep(c), id: nid("c"), start: cend(c) }; delete b.grp; C.push(b); sel = { k: "c", id: b.id }; }
  renderAll();
}


/* ---------- add assets: text presets, stickers, effects, filters, transitions ---------- */
function freeTrack(type, start, dur) { // first track of this type with room at [start, start+dur], else a new one
  for (const tr of tracksOf(type)) if (!tr.lock && !C.some(x => x.track === tr.id && x.start < start + dur - 0.01 && cend(x) > start + 0.01)) return tr;
  return addTrack(type);
}
function addTextPreset(preset, start) {
  pushUndo(); const st = start != null ? start : t, dur = 3, tr = freeTrack("text", st, dur);
  const c = newTextClip(preset, st, dur, tr.id); C.push(c); sel = { k: "c", id: c.id }; renderAll(); if (typeof openSheet === "function") openSheet("insp"); else showTab("insp"); return c;
}
function addSticker(spec, start) {
  pushUndo(); const st = start != null ? start : t, dur = 3, tr = freeTrack("text", st, dur);
  const c = Object.assign({ id: nid("c"), track: tr.id, type: "sticker", start: st, dur, size: 240, x: 0, y: -0.15, anim: { in: { type: "pop", dur: 0.4 } } }, spec);
  C.push(c); sel = { k: "c", id: c.id }; renderAll(); return c;
}
function addEffect(key, start) {
  pushUndo(); const st = start != null ? start : t, dur = 2, tr = freeTrack("fx", st, dur);
  const c = { id: nid("c"), track: tr.id, type: "fx", effect: key, start: st, dur, amt: 1, speed: 1 };
  C.push(c); sel = { k: "c", id: c.id }; renderAll(); toast("Đã thêm hiệu ứng " + EFFECTS[key] + ". Kéo hai mép để đổi độ dài."); return c;
}
function addFilterLayer(key, start) {
  pushUndo(); const st = start != null ? start : t, dur = 3, tr = freeTrack("fx", st, dur);
  const c = { id: nid("c"), track: tr.id, type: "fx", fxType: "filter", filter: key, filterAmt: 1, start: st, dur };
  C.push(c); sel = { k: "c", id: c.id }; renderAll(); return c;
}
function applyFilterTo(c, key) { pushUndo(); c.filter = key; if (c.filterAmt == null) c.filterAmt = 1; renderInspector(); drawFrame(); }
function cutIndexNear(time) { // index i of the cut between V[i] and V[i+1] closest to time
  const st = vStarts(); let best = -1, bd = Infinity; for (let i = 0; i < V.length - 1; i++) { const d = Math.abs(st[i + 1] - time); if (d < bd) { bd = d; best = i; } } return best;
}
function applyTransition(type, i) {
  if (i == null) { const c = findSel(); i = c && sel.k === "v" ? V.indexOf(c) : cutIndexNear(t); if (i >= V.length - 1) i = V.length - 2; }
  if (i < 0) { toast("Cần ít nhất hai clip trên track chính."); return; }
  pushUndo(); V[i].tr = { type, dur: (V[i].tr && V[i].tr.dur) || 0.5 }; sel = { k: "tr", id: V[i].id }; renderAll(); seek(vStarts()[i + 1] - 0.4);
  toast("Chuyển cảnh " + TRANSITIONS[type] + " giữa cảnh " + (i + 1) + " và " + (i + 2) + ".");
}
function applyTransitionAll(type, dur) { pushUndo(); for (let i = 0; i < V.length - 1; i++) V[i].tr = { type, dur }; renderAll(); toast("Đã áp dụng cho " + (V.length - 1) + " điểm cắt."); }
function quickKeyframe() { // K: keyframe position/size/rotation/opacity at the playhead
  const c = findSel(); if (!c || (sel.k !== "v" && c.type === "audio")) { toast("Chọn một clip hình hoặc chữ để đặt keyframe."); return; }
  const st = sel.k === "v" ? vStarts()[V.indexOf(c)] : c.start, len = sel.k === "v" ? vlen(c) : clen(c), lt = clamp(t - st, 0, len);
  if (t < st - 0.01 || t > st + len + 0.01) { toast("Đặt kim vào trong clip đang chọn."); return; }
  pushUndo(); const def = { x: c.x || 0, y: c.y || 0, scale: c.scale == null ? 1 : c.scale, angle: c.angle || 0, opacity: c.opacity == null ? 1 : c.opacity };
  for (const p in def) setKf(c, p, lt, kfVal(c, p, lt, def[p]));
  renderAll(); toast("Đã đặt keyframe tại " + fmt(lt) + ". Dời kim rồi kéo vật thể trên khung xem trước để tạo chuyển động.");
}
