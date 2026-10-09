"use strict";
/* ============================================================================
   Masks (Premiere-style, own implementation)
   Several masks per clip (c.masks) and per colour node (node.win), each with
   mode (add / subtract / intersect / difference), invert, feather, opacity,
   expansion, keyframable path (shape params or pen points) and tracking.
   Mask coordinates live in frame space:  x,y centre offset (-1..1 of the
   frame), w,h size as a fraction of frame width, r rotation (°);
   pen points pts = [[x, y, inX, inY, outX, outY]] in 0..1 of the frame,
   handles are offsets in the same units.
   ========================================================================== */
const MASK_TYPES = { ellipse: "Elip", rect: "Chữ nhật", pen: "Vẽ bằng bút", linear: "Đường thẳng (gradient)", heart: "Trái tim", star: "Ngôi sao", mirror: "Dải ngang" };
const MASK_MODES = { add: "Cộng", sub: "Trừ", int: "Giao", diff: "Khác biệt" };
const MASK_SHAPE_KEYS = ["x", "y", "w", "h", "r", "round", "feather", "opacity", "expand"];
let maskEdit = null; const maskIdxMem = {}; // {owner, list(): masks[], idx, lt(): number, after(): void, kind:'clip'|'node'}

function newMask(type, n) {
  const base = { id: nid("mk"), type, on: true, mode: "add", inv: false, feather: 0.12, opacity: 1, expand: 0, name: (MASK_TYPES[type] || "Mask") + " " + (n || 1) };
  if (type === "pen") return Object.assign(base, { pts: [], closed: false });
  if (type === "linear") return Object.assign(base, { x: 0, y: 0, w: 1, h: 1, r: 0, feather: 0.35 });
  return Object.assign(base, { x: 0, y: 0, w: type === "rect" ? 0.6 : 0.55, h: type === "rect" ? 0.45 : 0.55, r: 0, round: 0 });
}
function migrateMask(c) { // old single c.mask → c.masks
  if (c && c.mask && !c.masks) { const o = c.mask; if (o.type && o.type !== "none") c.masks = [Object.assign(newMask(o.type === "circle" ? "ellipse" : o.type, 1), { x: o.x || 0, y: o.y || 0, w: o.w || 0.6, h: o.h || 0.6, r: o.r || 0, round: o.round || 0, feather: o.feather == null ? 0.1 : o.feather, inv: !!o.invert })]; delete c.mask; }
  return c && c.masks;
}
const hasMasks = c => { migrateMask(c); return !!(c && c.masks && c.masks.some(m => m.on !== false && (m.type !== "pen" || (m.pts && m.pts.length > 2)))); };

/* ---------- keyframes on masks (shape params + pen point arrays) ---------- */
function ptsAt(m, lt) {
  const L = m.kf && m.kf.pts; if (!L || !L.length) return m.pts || [];
  if (lt <= L[0].t) return L[0].v; if (lt >= L[L.length - 1].t) return L[L.length - 1].v;
  for (let i = 0; i < L.length - 1; i++) { const a = L[i], b = L[i + 1]; if (lt < b.t) { const p = (EASE[a.e || "inout"] || EASE.linear)((lt - a.t) / Math.max(1e-6, b.t - a.t)); return a.v.map((q, j) => { const r = b.v[j] || q; return q.map((v, k) => v + ((r[k] == null ? v : r[k]) - v) * p); }); } }
  return m.pts || [];
}
function maskAt(m, lt) { const o = Object.assign({}, m); for (const k of MASK_SHAPE_KEYS) if (m.kf && m.kf[k]) o[k] = kfVal(m, k, lt, m[k]); if (m.type === "pen") o.pts = ptsAt(m, lt); return o; }
function maskAnimated(m) { return !!(m.kf && Object.keys(m.kf).length); }
function setMaskVal(m, k, lt, v) { if (m.kf && m.kf[k]) setKf(m, k, lt, v); else m[k] = v; }
function setMaskPts(m, lt, pts) {
  if (m.kf && m.kf.pts) { const L = m.kf.pts, tol = 0.5 / FPS; const hit = L.find(q => Math.abs(q.t - lt) < tol); if (hit) hit.v = pts; else { L.push({ t: Math.round(lt * 1000) / 1000, v: pts, e: "inout" }); L.sort((a, b) => a.t - b.t); } }
  else m.pts = pts;
}
function maskKeyHere(m, lt) { // stopwatch: key the whole path at lt
  m.kf = m.kf || {}; const r = maskAt(m, lt);
  if (m.type === "pen") { m.kf.pts = m.kf.pts || []; setMaskPts(m, lt, deep(r.pts)); }
  else for (const k of ["x", "y", "w", "h", "r"]) { m.kf[k] = m.kf[k] || []; setKf(m, k, lt, r[k] || 0); }
}
function maskKeyTimes(m) { const s = new Set(); for (const k in m.kf || {}) for (const q of m.kf[k]) s.add(q.t); return [...s].sort((a, b) => a - b); }

/* ---------- geometry ---------- */
function penPath(ctx, pts, closed, W, H) {
  if (!pts || pts.length < 2) return;
  const P = i => pts[(i + pts.length) % pts.length];
  ctx.moveTo(P(0)[0] * W, P(0)[1] * H);
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) { const a = P(i), b = P(i + 1); ctx.bezierCurveTo((a[0] + (a[4] || 0)) * W, (a[1] + (a[5] || 0)) * H, (b[0] + (b[2] || 0)) * W, (b[1] + (b[3] || 0)) * H, b[0] * W, b[1] * H); }
  if (closed) ctx.closePath();
}
function maskShapePath(ctx, r, W, H) {
  if (r.type === "pen") { ctx.beginPath(); penPath(ctx, r.pts, true, W, H); return; }
  maskPath(ctx, Object.assign({}, r, { type: r.type === "ellipse" ? "circle" : r.type }), W, H);
}
/* composite every active mask into one alpha matte (white = visible) */
function drawMaskSet(masks, W, H, lt, name = "mset") {
  const act = (masks || []).filter(m => m.on !== false && (m.type !== "pen" || (m.pts && m.pts.length > 2) || (m.kf && m.kf.pts)));
  if (!act.length) return null;
  const out = scratch(name, W, H), o = out.ctx; o.save(); o.setTransform(1, 0, 0, 1, 0, 0); o.globalCompositeOperation = "source-over"; o.globalAlpha = 1; o.filter = "none"; o.clearRect(0, 0, W, H);
  if (act[0].mode === "sub" || act[0].mode === "int") { o.fillStyle = "#fff"; o.fillRect(0, 0, W, H); }
  const tmp = scratch(name + "1", W, H), x = tmp.ctx;
  for (const m of act) {
    const r = maskAt(m, lt); x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = "source-over"; x.globalAlpha = 1; x.filter = "none"; x.clearRect(0, 0, W, H);
    const fe = (r.feather || 0) * W * 0.08; if (fe > 0.5) x.filter = `blur(${fe}px)`;
    x.fillStyle = "#fff"; x.strokeStyle = "#fff"; maskShapePath(x, r, W, H); x.fill();
    const ex = (r.expand || 0) * W; if (Math.abs(ex) > 0.5) { x.lineWidth = Math.abs(ex) * 2; x.lineJoin = "round"; if (ex < 0) x.globalCompositeOperation = "destination-out"; maskShapePath(x, r, W, H); x.stroke(); x.globalCompositeOperation = "source-over"; }
    x.restore();
    if (r.inv) { x.save(); x.globalCompositeOperation = "xor"; x.fillStyle = "#fff"; x.fillRect(0, 0, W, H); x.restore(); }
    o.globalAlpha = clamp(r.opacity == null ? 1 : r.opacity, 0, 1);
    o.globalCompositeOperation = m.mode === "sub" ? "destination-out" : m.mode === "int" ? "destination-in" : m.mode === "diff" ? "xor" : "source-over";
    if (m.mode === "int" && o.globalAlpha < 1) { o.globalAlpha = 1; x.save(); x.globalCompositeOperation = "source-over"; x.globalAlpha = 1 - clamp(r.opacity, 0, 1); x.fillStyle = "#fff"; x.fillRect(0, 0, W, H); x.restore(); }
    o.drawImage(tmp.canvas, 0, 0);
  }
  o.restore(); return out.canvas;
}

/* ---------- on-preview editing overlay ---------- */
function maskBBox(r, W, H) {
  if (r.type === "pen") { const xs = r.pts.map(p => p[0] * W), ys = r.pts.map(p => p[1] * H); return xs.length ? { cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), a: 0 } : null; }
  return { cx: W / 2 + (r.x || 0) * W, cy: H / 2 + (r.y || 0) * H, w: (r.w || 0.6) * W, h: (r.h || 0.6) * W, a: (r.r || 0) * Math.PI / 180 };
}
function maskHandles(r, W, H) { // [{kind, x, y, i?}]
  const out = []; if (r.type === "pen") { r.pts.forEach((p, i) => { out.push({ kind: "pt", i, x: p[0] * W, y: p[1] * H }); if (p[2] || p[3]) out.push({ kind: "hin", i, x: (p[0] + p[2]) * W, y: (p[1] + p[3]) * H }); if (p[4] || p[5]) out.push({ kind: "hout", i, x: (p[0] + p[4]) * W, y: (p[1] + p[5]) * H }); }); return out; }
  const b = maskBBox(r, W, H), ca = Math.cos(b.a), sa = Math.sin(b.a), rot = (x, y) => [b.cx + x * ca - y * sa, b.cy + x * sa + y * ca];
  if (r.type === "linear" || r.type === "mirror") { const [x1, y1] = rot(0, 0); out.push({ kind: "move", x: x1, y: y1 }); const [x2, y2] = rot(0, -Math.max(40, W * 0.12)); out.push({ kind: "rot", x: x2, y: y2 }); if (r.type === "mirror") { const [x3, y3] = rot(0, b.h / 2); out.push({ kind: "edgeH", x: x3, y: y3 }); } return out; }
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const [x, y] = rot(sx * b.w / 2, sy * b.h / 2); out.push({ kind: "corner", sx, sy, x, y }); }
  for (const [sx, sy, k] of [[1, 0, "edgeW"], [0, 1, "edgeH"]]) { const [x, y] = rot(sx * b.w / 2, sy * b.h / 2); out.push({ kind: k, x, y }); }
  const [rx, ry] = rot(0, -b.h / 2 - Math.max(28, W * 0.05)); out.push({ kind: "rot", x: rx, y: ry });
  const [mx, my] = rot(0, 0); out.push({ kind: "move", x: mx, y: my });
  return out;
}
function drawMaskOverlay(g2, k, W, H, list, idx, lt) { // g2 is in frame px scaled by k
  const dpr = window.devicePixelRatio || 1, lw = 1.6 / k * dpr, hs = 7 / k * dpr;
  (list || []).forEach((m, i) => {
    if (m.on === false && i !== idx) return; const r = maskAt(m, lt), on = i === idx;
    g2.save(); g2.lineWidth = lw * (on ? 1.4 : 1); g2.strokeStyle = on ? "#f2c14e" : "rgba(255,255,255,.55)"; g2.setLineDash(on ? [] : [5 / k, 4 / k]);
    g2.beginPath(); if (r.type === "pen") penPath(g2, r.pts, r.closed !== false && r.pts.length > 2, W, H); else maskShapePath(g2, r, W, H); g2.stroke();
    if (on && r.type !== "pen") { const fe = (r.feather || 0) * W * 0.08; if (fe > 2 && r.type !== "linear") { g2.setLineDash([2 / k, 4 / k]); g2.globalAlpha = 0.6; const rr = Object.assign({}, r, { w: (r.w || 0.6) + fe * 2 / W, h: (r.h || 0.6) + fe * 2 / W }); maskShapePath(g2, rr, W, H); g2.stroke(); g2.globalAlpha = 1; g2.setLineDash([]); } }
    if (on) for (const hd of maskHandles(r, W, H)) {
      g2.setLineDash([]); g2.fillStyle = hd.kind === "rot" ? "#f2c14e" : hd.kind === "move" ? "rgba(242,193,78,.25)" : "#fff"; g2.strokeStyle = "#f2c14e";
      if (hd.kind === "hin" || hd.kind === "hout") { const p = r.pts[hd.i]; g2.beginPath(); g2.moveTo(p[0] * W, p[1] * H); g2.lineTo(hd.x, hd.y); g2.stroke(); g2.beginPath(); g2.arc(hd.x, hd.y, hs * 0.7, 0, 7); g2.fill(); g2.stroke(); }
      else if (hd.kind === "move") { g2.beginPath(); g2.arc(hd.x, hd.y, hs * 1.6, 0, 7); g2.fill(); g2.stroke(); g2.beginPath(); g2.moveTo(hd.x - hs, hd.y); g2.lineTo(hd.x + hs, hd.y); g2.moveTo(hd.x, hd.y - hs); g2.lineTo(hd.x, hd.y + hs); g2.stroke(); }
      else { g2.beginPath(); if (hd.kind === "pt" || hd.kind === "rot") g2.arc(hd.x, hd.y, hs, 0, 7); else g2.rect(hd.x - hs, hd.y - hs, hs * 2, hs * 2); g2.fill(); g2.stroke(); if (hd.kind === "pt" && hd.i === 0 && r.closed === false) { g2.beginPath(); g2.arc(hd.x, hd.y, hs * 1.8, 0, 7); g2.stroke(); } }
    }
    g2.restore();
  });
}
/* pointer gesture on a mask; p in frame px. Returns true if handled. */
function maskPointerDown(p, W, H, k, onMove, onEnd, evt) {
  const ME = maskEdit; if (!ME) return false; const list = ME.list(), m = list[ME.idx]; if (!m) return false;
  const lt = ME.lt(), r = maskAt(m, lt), tol = 14 / k * (window.devicePixelRatio || 1);
  // pen: drawing mode
  if (m.type === "pen" && m.closed === false) {
    const pts = deep(r.pts || []); if (pts.length > 2 && Math.hypot(p[0] - pts[0][0] * W, p[1] - pts[0][1] * H) < tol) { pushUndo(); m.closed = true; setMaskPts(m, lt, pts); ME.after(); toast("Đã đóng đường mask."); return true; }
    pushUndo(); const np = [p[0] / W, p[1] / H, 0, 0, 0, 0]; pts.push(np); setMaskPts(m, lt, pts); ME.after(); const idx = pts.length - 1;
    onMove(q => { const dx = (q[0] - p[0]) / W, dy = (q[1] - p[1]) / H; if (Math.hypot(dx * W, dy * H) < 3) return; const cur = deep(maskAt(m, lt).pts); cur[idx] = [np[0], np[1], -dx, -dy, dx, dy]; setMaskPts(m, lt, cur); ME.after(true); });
    onEnd(() => ME.after()); return true;
  }
  const hs = maskHandles(r, W, H); let hit = null; for (const h of hs) if (h.kind !== "move" && Math.hypot(p[0] - h.x, p[1] - h.y) < tol) { hit = h; break; }
  if (!hit && r.type === "pen") { // click on the path inserts a point (Alt), inside drags whole path
    const c2 = scratch("mhit", 4, 4).ctx; c2.setTransform(1, 0, 0, 1, 0, 0); c2.beginPath(); penPath(c2, r.pts, true, W, H);
    if (evt && evt.altKey) { // insert point on nearest segment midpoint
      let best = -1, bd = 1e9; r.pts.forEach((a, i) => { const b = r.pts[(i + 1) % r.pts.length], mx = (a[0] + b[0]) / 2 * W, my = (a[1] + b[1]) / 2 * H, d = Math.hypot(p[0] - mx, p[1] - my); if (d < bd) { bd = d; best = i; } });
      if (best >= 0) { pushUndo(); const pts = deep(r.pts); pts.splice(best + 1, 0, [p[0] / W, p[1] / H, 0, 0, 0, 0]); setMaskPts(m, lt, pts); ME.after(); return true; } }
    if (c2.isPointInPath(p[0], p[1])) hit = { kind: "movepen" };
  }
  if (!hit && r.type !== "pen") { const b = maskBBox(r, W, H), a = -b.a, dx = p[0] - b.cx, dy = p[1] - b.cy, lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a); if (r.type === "linear" || r.type === "mirror" ? Math.hypot(dx, dy) < tol * 2.5 : Math.abs(lx) < b.w / 2 && Math.abs(ly) < b.h / 2) hit = { kind: "move" }; }
  if (!hit) return false;
  if (hit.kind === "pt" && evt && (evt.altKey || evt.detail === 2)) { pushUndo(); const pts = deep(r.pts), q = pts[hit.i]; if (q[2] || q[3] || q[4] || q[5]) { q[2] = q[3] = q[4] = q[5] = 0; } else { const a = pts[(hit.i - 1 + pts.length) % pts.length], b = pts[(hit.i + 1) % pts.length], tx = (b[0] - a[0]) / 6, ty = (b[1] - a[1]) / 6; q[2] = -tx; q[3] = -ty; q[4] = tx; q[5] = ty; } setMaskPts(m, lt, pts); ME.after(); return true; }
  let undone = false; const r0 = deep(r), b0 = maskBBox(r0, W, H);
  onMove(q => {
    if (!undone) { pushUndo(); undone = true; } const dx = (q[0] - p[0]), dy = (q[1] - p[1]);
    if (hit.kind === "movepen") { setMaskPts(m, lt, r0.pts.map(a => [a[0] + dx / W, a[1] + dy / H, a[2], a[3], a[4], a[5]])); }
    else if (hit.kind === "pt") { const pts = deep(r0.pts); pts[hit.i][0] = r0.pts[hit.i][0] + dx / W; pts[hit.i][1] = r0.pts[hit.i][1] + dy / H; setMaskPts(m, lt, pts); }
    else if (hit.kind === "hin" || hit.kind === "hout") { const pts = deep(r0.pts), P = pts[hit.i], o = hit.kind === "hin" ? 2 : 4, nx = r0.pts[hit.i][o] + dx / W, ny = r0.pts[hit.i][o + 1] + dy / H; P[o] = nx; P[o + 1] = ny; if (!(evt && evt.altKey)) { const L2 = Math.hypot(P[6 - o] * W, P[7 - o] * H) || Math.hypot(nx * W, ny * H), L1 = Math.hypot(nx * W, ny * H) || 1; P[6 - o] = -nx * L2 / L1; P[7 - o] = -ny * L2 / L1; } setMaskPts(m, lt, pts); }
    else if (hit.kind === "move") { setMaskVal(m, "x", lt, Math.round((r0.x + dx / W) * 1000) / 1000); setMaskVal(m, "y", lt, Math.round((r0.y + dy / H) * 1000) / 1000); }
    else if (hit.kind === "rot") { const a0 = Math.atan2(p[1] - b0.cy, p[0] - b0.cx), a1 = Math.atan2(q[1] - b0.cy, q[0] - b0.cx); let a = (r0.r || 0) + (a1 - a0) * 180 / Math.PI; a = ((a + 180) % 360 + 360) % 360 - 180; setMaskVal(m, "r", lt, Math.round(a)); }
    else { const a = -b0.a, lx = (q[0] - b0.cx) * Math.cos(a) - (q[1] - b0.cy) * Math.sin(a), ly = (q[0] - b0.cx) * Math.sin(a) + (q[1] - b0.cy) * Math.cos(a);
      if (hit.kind === "corner") { setMaskVal(m, "w", lt, Math.max(0.01, Math.abs(lx) * 2 / W)); setMaskVal(m, "h", lt, Math.max(0.01, Math.abs(ly) * 2 / W)); }
      else if (hit.kind === "edgeW") setMaskVal(m, "w", lt, Math.max(0.01, Math.abs(lx) * 2 / W)); else if (hit.kind === "edgeH") setMaskVal(m, "h", lt, Math.max(0.005, Math.abs(ly) * 2 / W)); }
    ME.after(true);
  });
  onEnd(() => { if (undone) ME.after(); }); return true;
}
/* hook the preview stage */
const _drawSelectionM = drawSelection;
drawSelection = function () {
  _drawSelectionM(); const ME = maskEdit; if (!ME || ME.kind !== "clip" || exporting || playing) return; const c = findSel(); if (!c || c !== ME.owner) return;
  const k = selCv.width / cv.width; sg.save(); sg.setTransform(k, 0, 0, k, 0, 0); drawMaskOverlay(sg, k, cv.width, cv.height, ME.list(), ME.idx, ME.lt()); sg.restore();
};
selCv.addEventListener("pointerdown", e => {
  const ME = maskEdit; if (!ME || ME.kind !== "clip" || eyedrop) return; const c = findSel(); if (!c || c !== ME.owner) return;
  const p = toCv(e), k = selCv.width / cv.width; let mv = null, en = null;
  const ok = maskPointerDown(p, cv.width, cv.height, k, f => mv = f, f => en = f, e); if (!ok) return;
  e.preventDefault(); e.stopImmediatePropagation(); try { selCv.setPointerCapture(e.pointerId); } catch (_) {}
  const move = ev => { if (mv) mv(toCv(ev)); }, up = () => { selCv.removeEventListener("pointermove", move); selCv.removeEventListener("pointerup", up); selCv.removeEventListener("pointercancel", up); if (en) en(); };
  selCv.addEventListener("pointermove", move); selCv.addEventListener("pointerup", up); selCv.addEventListener("pointercancel", up);
}, true);
document.addEventListener("keydown", e => {
  const ME = maskEdit; if (!ME || e.target.matches("input,select,textarea")) return; const m = ME.list()[ME.idx]; if (!m || m.type !== "pen") return;
  if (e.key === "Enter" && m.closed === false && (m.pts || []).length > 2) { e.preventDefault(); e.stopImmediatePropagation(); pushUndo(); m.closed = true; ME.after(); toast("Đã đóng đường mask."); }
}, true);

/* ---------- tracking ---------- */
let trackCancel = false;
async function trackMask(c, m, dir, frames) {
  const med = media.get(c.mediaId); if (!med || med.kind !== "video" || !med.url) { toast("Chỉ theo dõi chuyển động được trên clip video."); return; }
  const isV = V.includes(c), st = isV ? vStarts()[V.indexOf(c)] : c.start, L = isV ? vlen(c) : clen(c);
  const W0 = 240, H0 = Math.max(16, Math.round(W0 * cv.height / cv.width)), work = scratch("trackw", W0, H0);
  const src = await new ElemSource(med).init(); const clean = Object.assign({}, c, { masks: undefined, mask: undefined, blend: undefined, nodes: undefined, anim: undefined });
  const keepMode = renderMode, keepFP = frameProvider;
  const gray = async lt => { const fr = await src.frameAt(srcTime(c, lt), FPS); renderMode = "export"; frameProvider = () => fr; try { work.ctx.fillStyle = "#000"; work.ctx.fillRect(0, 0, W0, H0); drawMediaLayer(work.ctx, clean, lt, 9, isV, 0); } finally { renderMode = keepMode; frameProvider = keepFP; } const d = work.ctx.getImageData(0, 0, W0, H0).data, gq = new Float32Array(W0 * H0); for (let i = 0, j = 0; i < d.length; i += 4, j++) gq[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; return gq; };
  let lt = clamp(t - st, 0, L - 1e-3); const r0 = maskAt(m, lt), bb = maskBBox(r0, cv.width, cv.height); if (!bb) { src.close(); return; }
  const sc = W0 / cv.width; let cx = bb.cx * sc, cy = bb.cy * sc; const tw = clamp(Math.round(bb.w * sc * 0.8), 10, 60), th = clamp(Math.round(bb.h * sc * 0.8), 10, 60);
  let ref = await gray(lt); const tpl = (img, x, y) => { const o = new Float32Array(tw * th); for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) { const xx = clamp(Math.round(x - tw / 2 + i), 0, W0 - 1), yy = clamp(Math.round(y - th / 2 + j), 0, H0 - 1); o[j * tw + i] = img[yy * W0 + xx]; } return o; };
  let T0 = tpl(ref, cx, cy); const R = 14, step = dir / FPS; trackCancel = false; let n = 0; const total2 = frames || Math.round((dir > 0 ? L - lt : lt) * FPS);
  if (!maskAnimated(m)) maskKeyHere(m, lt);
  const prog = document.createElement("div"); prog.className = "trackprog"; prog.innerHTML = `<span>Đang theo dõi chuyển động…</span><button type="button">Dừng</button>`; prog.querySelector("button").onclick = () => { trackCancel = true; }; document.body.appendChild(prog);
  pushUndo();
  try {
    while (n < total2 && !trackCancel) {
      const nlt = lt + step; if (nlt < 0 || nlt > L - 1e-3) break;
      const img = await gray(nlt); let best = [0, 0], bs = Infinity;
      for (let oy = -R; oy <= R; oy += 2) for (let ox = -R; ox <= R; ox += 2) { let s = 0; for (let j = 0; j < th; j += 2) { const yy = clamp(Math.round(cy + oy - th / 2 + j), 0, H0 - 1); for (let i = 0; i < tw; i += 2) { const xx = clamp(Math.round(cx + ox - tw / 2 + i), 0, W0 - 1); s += Math.abs(img[yy * W0 + xx] - T0[j * tw + i]); } if (s > bs) break; } if (s < bs) { bs = s; best = [ox, oy]; } }
      const b0 = best; bs = Infinity; for (let oy = b0[1] - 1; oy <= b0[1] + 1; oy++) for (let ox = b0[0] - 1; ox <= b0[0] + 1; ox++) { let s = 0; for (let j = 0; j < th; j++) { const yy = clamp(Math.round(cy + oy - th / 2 + j), 0, H0 - 1); for (let i = 0; i < tw; i++) { const xx = clamp(Math.round(cx + ox - tw / 2 + i), 0, W0 - 1); s += Math.abs(img[yy * W0 + xx] - T0[j * tw + i]); } } if (s < bs) { bs = s; best = [ox, oy]; } }
      cx += best[0]; cy += best[1]; const dxn = best[0] / W0, dyn = best[1] / H0;
      const cur = maskAt(m, lt);
      if (m.type === "pen") { const pts = cur.pts.map(a => [a[0] + dxn, a[1] + dyn, a[2], a[3], a[4], a[5]]); m.kf.pts = m.kf.pts || []; setMaskPts(m, nlt, pts); }
      else { for (const k2 of ["x", "y", "w", "h", "r"]) { m.kf[k2] = m.kf[k2] || []; setKf(m, k2, nlt, k2 === "x" ? cur.x + dxn : k2 === "y" ? cur.y + dyn : cur[k2] || 0, "linear"); } }
      const T1 = tpl(img, cx, cy); for (let i = 0; i < T0.length; i++) T0[i] = T0[i] * 0.85 + T1[i] * 0.15;
      lt = nlt; n++; if (n % 3 === 0) { seek(st + lt); prog.querySelector("span").textContent = `Đang theo dõi… ${n}/${total2} khung`; await new Promise(r2 => setTimeout(r2, 0)); }
    }
  } finally { src.close(); prog.remove(); renderMode = keepMode; frameProvider = keepFP; }
  seek(st + lt); renderAll(); toast(trackCancel ? `Đã dừng sau ${n} khung.` : `Đã theo dõi ${n} khung, tạo keyframe cho mask.`);
}

/* ---------- inspector UI (shared by clip masks and colour-node windows) ---------- */
function maskListUI(box, owner, getList, setList, opts = {}) {
  const lt = () => opts.lt ? opts.lt() : curLt(owner), list = () => getList() || [];
  const b = section(box, opts.title || "Mask", true);
  const add = el("div", "mkadd"); b.appendChild(add);
  for (const [k, n] of Object.entries(MASK_TYPES)) { const bt = el("button", "", "+ " + n); bt.type = "button"; bt.onclick = () => { pushUndo(); const L2 = list().slice(); const m = newMask(k, L2.length + 1); L2.push(m); setList(L2); maskIdxMem[opts.key || owner.id || "x"] = L2.length - 1; maskEdit = null; if (k === "pen") toast("Bấm lên khung xem trước để đặt điểm, kéo để uốn cong. Bấm lại điểm đầu (hoặc Enter) để đóng."); (opts.rerender || renderInspector)(); drawFrame(); }; add.appendChild(bt); }
  const L = list(); if (!L.length) { note(b, "Chưa có mask. Thêm một hình ở trên rồi kéo các điểm trên khung xem trước để chỉnh. Có thể chồng nhiều mask và phối Cộng/Trừ/Giao."); return; }
  const okey = opts.key || owner.id || "x"; if (!maskEdit || maskEdit.owner !== owner || maskEdit.okey !== okey) maskEdit = { owner, okey, list, idx: Math.min(L.length - 1, maskIdxMem[okey] || 0), lt, after: opts.after || (() => drawFrame()), kind: opts.kind || "clip" };
  maskEdit.idx = Math.min(maskEdit.idx, L.length - 1); maskIdxMem[okey] = maskEdit.idx;
  const rows = el("div", "mklist"); b.appendChild(rows);
  L.forEach((m, i) => {
    const r = el("div", "mkrow" + (i === maskEdit.idx ? " on" : ""));
    const eye = el("button", "icon mkeye", m.on === false ? "○" : "●"); eye.type = "button"; eye.title = "Bật/tắt mask"; eye.onclick = ev => { ev.stopPropagation(); pushUndo(); m.on = m.on === false; (opts.rerender || renderInspector)(); drawFrame(); };
    const nm = el("button", "mkname"); nm.type = "button"; nm.textContent = m.name + (maskAnimated(m) ? " ◆" : ""); nm.onclick = () => { maskEdit.idx = i; maskIdxMem[maskEdit.okey] = i; (opts.rerender || renderInspector)(); drawFrame(); };
    const md = el("select", "mkmode"); md.setAttribute("aria-label", "Chế độ phối"); for (const k in MASK_MODES) { const o = document.createElement("option"); o.value = k; o.textContent = MASK_MODES[k]; md.appendChild(o); } md.value = m.mode || "add"; md.onchange = () => { pushUndo(); m.mode = md.value; drawFrame(); };
    const inv = el("button", "mkinv" + (m.inv ? " on" : ""), "Đảo"); inv.type = "button"; inv.title = "Đảo ngược mask"; inv.setAttribute("aria-pressed", !!m.inv); inv.onclick = () => { pushUndo(); m.inv = !m.inv; (opts.rerender || renderInspector)(); drawFrame(); };
    r.append(eye, nm, md, inv); rows.appendChild(r);
  });
  const m = L[maskEdit.idx]; if (!m) return; const d = section(box, "Chỉnh " + m.name, true);
  if (m.type === "pen") note(d, m.closed === false ? "Đang vẽ: bấm để thêm điểm, kéo để uốn. Bấm điểm đầu hoặc Enter để đóng." : "Kéo điểm để sửa, kéo tay cầm để uốn. Bấm đúp (hoặc Alt+bấm) một điểm để đổi góc nhọn/cong; Alt+bấm gần cạnh để thêm điểm. Kéo bên trong để dời cả đường.");
  const sl = (label, key, min, max, step, fmtF) => slider(d, { label, min, max, step, get: () => maskAt(m, lt())[key] == null ? (key === "opacity" ? 1 : 0) : maskAt(m, lt())[key], set: v => setMaskVal(m, key, lt(), v), fmt: fmtF, live: () => {} });
  sl("Viền mềm", "feather", 0, 1, 0.005, v => Math.round(v * 100));
  sl("Độ đục mask", "opacity", 0, 1, 0.01, v => Math.round(v * 100) + "%");
  sl("Nới / thu", "expand", -0.15, 0.15, 0.001, v => (v > 0 ? "+" : "") + Math.round(v * 1000) / 10);
  if (m.type === "rect") sl("Bo góc", "round", 0, 1, 0.01, v => Math.round(v * 100) + "%");
  if (m.type !== "pen") { sl("Xoay", "r", -180, 180, 1, v => Math.round(v) + "°"); }
  const kr = el("div", "row mkkf"); d.appendChild(kr);
  const times = maskKeyTimes(m), here = times.some(x => Math.abs(x - lt()) < 0.5 / FPS);
  const sw = el("button", maskAnimated(m) ? "on" : "", (maskAnimated(m) ? "⏱ Đang key đường mask" : "⏱ Key đường mask")); sw.type = "button"; sw.setAttribute("aria-pressed", maskAnimated(m)); sw.title = "Bật: mỗi lần sửa mask ở thời điểm khác sẽ tạo keyframe mới";
  sw.onclick = () => { pushUndo(); if (maskAnimated(m)) { const r = maskAt(m, lt()); Object.assign(m, { x: r.x, y: r.y, w: r.w, h: r.h, r: r.r, pts: r.pts }); delete m.kf; } else maskKeyHere(m, lt()); (opts.rerender || renderInspector)(); drawFrame(); };
  kr.appendChild(sw);
  if (maskAnimated(m)) { const kb = el("button", here ? "on" : "", here ? "◆ Bỏ key tại kim" : "◇ Key tại kim"); kb.type = "button"; kb.onclick = () => { pushUndo(); if (here) { for (const k2 in m.kf) { m.kf[k2] = m.kf[k2].filter(q => Math.abs(q.t - lt()) >= 0.5 / FPS); if (!m.kf[k2].length) delete m.kf[k2]; } if (!Object.keys(m.kf).length) delete m.kf; } else maskKeyHere(m, lt()); (opts.rerender || renderInspector)(); drawFrame(); }; kr.appendChild(kb);
    const go = dd => { const x = lt(), k = dd < 0 ? [...times].reverse().find(y => y < x - 1e-3) : times.find(y => y > x + 1e-3); if (k != null) { seek((opts.start ? opts.start() : clipStart(owner)) + k); (opts.rerender || renderInspector)(); } };
    const a1 = el("button", "icon", "◀"); a1.type = "button"; a1.onclick = () => go(-1); const a2 = el("button", "icon", "▶"); a2.type = "button"; a2.onclick = () => go(1); kr.append(a1, a2); }
  if (opts.trackClip) {
    d.appendChild(el("p", "lsub", "Theo dõi chuyển động (tracking)"));
    const tc = opts.trackClip(); const tr = el("div", "row mktrack"); d.appendChild(tr);
    for (const [lbl, dir, fr, tip] of [["◀◀", -1, 0, "Theo dõi lùi tới đầu clip"], ["◀", -1, 1, "Lùi 1 khung"], ["▶", 1, 1, "Tới 1 khung"], ["▶▶", 1, 0, "Theo dõi tới cuối clip"]]) { const bt = el("button", "", lbl); bt.type = "button"; bt.title = tip; bt.onclick = () => { if (!tc) { toast("Mask cần nằm trên một clip video để theo dõi."); return; } trackMask(tc, m, dir, fr); }; tr.appendChild(bt); }
  }
  btnRow(d, [["Nhân bản mask", () => { pushUndo(); const L2 = list().slice(); const c2 = deep(m); c2.id = nid("mk"); c2.name = m.name + " (bản sao)"; L2.splice(maskEdit.idx + 1, 0, c2); setList(L2); maskIdxMem[maskEdit.okey] = maskEdit.idx + 1; maskEdit = null; (opts.rerender || renderInspector)(); drawFrame(); }], ["Xoá mask", () => { pushUndo(); const L2 = list().filter(x => x !== m); setList(L2.length ? L2 : null); maskIdxMem[maskEdit.okey] = Math.max(0, maskEdit.idx - 1); maskEdit = null; (opts.rerender || renderInspector)(); drawFrame(); }]]);
}
