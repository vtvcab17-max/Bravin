"use strict";
/* ============================================================================
   Pen tool (P), Premiere-style.
   On the preview:
     - click = corner point, click-drag = smooth point (symmetric handles),
       Shift = snap to 45°, click the first point (or Enter) = close,
       Esc = finish an open path, Backspace = remove the last point
     - on an existing path: drag points / handles (Alt breaks the handle pair),
       click a segment = add a point, Alt+click a point = corner <-> smooth,
       Ctrl/Cmd+click a point = delete it
     - target: new shape layer (vector graphic) or a mask on the selected clip
   On the timeline: an opacity / volume rubber band on every clip;
     click = add a keyframe, drag a keyframe = change value and time,
     Ctrl/Cmd+click a keyframe = delete, drag the line of a clip without
     keyframes = change the whole level.
   ========================================================================== */
TOOL_INFO.pen = ["Bút (Pen)", "P", '<path d="M12 19l7-7 3 3-7 7z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18z"/><circle cx="11" cy="11" r="2"/>', "Bút: bấm để đặt điểm, kéo để uốn cong; trên timeline bấm vào clip để đặt key độ mờ / âm lượng."];
let penTarget = "auto", penBand = "auto", penEd = null; // penEd = { c, mode: "draw"|"edit", vi }
GFX_KINDS.path = "Đường bút (Pen)";

/* ---------- geometry ---------- */
function pathXf(c) {
  const W = cv.width, H = cv.height, lt = curLt(c), X = xform(c, lt, clen(c)), a = X.angle * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), sx = X.scale * X.sx * X.fx || 1e-6, sy = X.scale * X.fy || 1e-6, ox = W / 2 + X.x * W, oy = H / 2 + X.y * H;
  return { W, H, X, fwd: (u, v) => { const x = u * W * sx, y = v * H * sy; return [ox + x * ca - y * sa, oy + x * sa + y * ca]; }, inv: (px, py) => { const dx = px - ox, dy = py - oy, x = dx * ca + dy * sa, y = -dx * sa + dy * ca; return [x / (W * sx), y / (H * sy)]; }, vec: (u, v) => { const x = u * W * sx, y = v * H * sy; return [x * ca - y * sa, x * sa + y * ca]; } };
}
const isPathLayer = c => !!(c && c.gfx && c.gfx.kind === "path");
function cubicAt(a, b, c2, d, t) { const m = 1 - t; return [m * m * m * a[0] + 3 * m * m * t * b[0] + 3 * m * t * t * c2[0] + t * t * t * d[0], m * m * m * a[1] + 3 * m * m * t * b[1] + 3 * m * t * t * c2[1] + t * t * t * d[1]]; }
function segCtrl(pts, i) { const n = pts.length, A = pts[i], B = pts[(i + 1) % n]; return [[A[0], A[1]], [A[0] + (A[4] || 0), A[1] + (A[5] || 0)], [B[0] + (B[2] || 0), B[1] + (B[3] || 0)], [B[0], B[1]]]; }
function splitSeg(pts, i, t) { // De Casteljau: insert a point on segment i at parameter t, keeping the curve
  const [p0, p1, p2, p3] = segCtrl(pts, i), L = (a, b) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const q0 = L(p0, p1), q1 = L(p1, p2), q2 = L(p2, p3), r0 = L(q0, q1), r1 = L(q1, q2), s = L(r0, r1), n = pts.length, A = pts[i], B = pts[(i + 1) % n];
  A[4] = q0[0] - A[0]; A[5] = q0[1] - A[1]; B[2] = q2[0] - B[0]; B[3] = q2[1] - B[1];
  pts.splice(i + 1, 0, [s[0], s[1], r0[0] - s[0], r0[1] - s[1], r1[0] - s[0], r1[1] - s[1]]); return i + 1;
}
function toggleSmooth(pts, i, closed) {
  const p = pts[i]; if (p[2] || p[3] || p[4] || p[5]) { p[2] = p[3] = p[4] = p[5] = 0; return; }
  const n = pts.length, pr = pts[(i - 1 + n) % n], nx = pts[(i + 1) % n]; const usePr = closed || i > 0, useNx = closed || i < n - 1;
  const a = usePr ? pr : p, b = useNx ? nx : p; let dx = b[0] - a[0], dy = b[1] - a[1]; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
  const l1 = usePr ? Math.hypot(p[0] - pr[0], p[1] - pr[1]) / 3 : 0, l2 = useNx ? Math.hypot(nx[0] - p[0], nx[1] - p[1]) / 3 : 0;
  p[2] = -dx * (l1 || l2); p[3] = -dy * (l1 || l2); p[4] = dx * (l2 || l1); p[5] = dy * (l2 || l1);
}

/* ---------- drawing the shape layer ---------- */
const _drawStickerPen = drawSticker;
drawSticker = function (ctx, c, lt, len) {
  if (!isPathLayer(c)) return _drawStickerPen(ctx, c, lt, len);
  const G = c.gfx, W = ctx.canvas.width, H = ctx.canvas.height, X = xform(c, lt, len); if (X.opacity <= 0.001) return null; const pts = G.pts || [];
  const cx = W / 2 + X.x * W, cy = H / 2 + X.y * H; let box = { cx, cy, w: 40, h: 40, angle: X.angle };
  if (pts.length) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(X.angle * Math.PI / 180); ctx.scale(X.scale * X.sx * X.fx, X.scale * X.fy); ctx.globalAlpha *= X.opacity; if (X.blur > 0.3) ctx.filter = `blur(${X.blur * W / 1080}px)`;
    ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.beginPath(); if (pts.length === 1) ctx.arc(pts[0][0] * W, pts[0][1] * H, 2, 0, 7); else penPath(ctx, pts, G.closed !== false, W, H);
    if (G.shadow) { ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = 24 * W / 1080; ctx.shadowOffsetY = 8 * W / 1080; }
    if (G.closed !== false && G.fill && G.fill !== "none" && pts.length > 2) { let fs = G.fill; if (G.grad) { const xs = pts.map(p => p[0] * W), ys = pts.map(p => p[1] * H), gr = ctx.createLinearGradient(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)); gr.addColorStop(0, G.fill); gr.addColorStop(1, G.grad); fs = gr; } ctx.fillStyle = fs; const a0 = ctx.globalAlpha; ctx.globalAlpha *= G.fo == null ? 1 : G.fo; ctx.fill(); ctx.globalAlpha = a0; }
    ctx.shadowColor = "transparent"; const sw = G.closed === false ? Math.max(G.sw || 0, 1) : (G.sw || 0); if (sw > 0) { ctx.lineWidth = sw * W / 1080; ctx.strokeStyle = G.stroke || "#fff"; ctx.stroke(); }
    ctx.restore();
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), mx = (Math.min(...xs) + Math.max(...xs)) / 2, my = (Math.min(...ys) + Math.max(...ys)) / 2, a = X.angle * Math.PI / 180, s = X.scale;
    const ox = mx * W * X.scale * X.sx * X.fx, oy = my * H * X.scale * X.fy; box = { cx: cx + ox * Math.cos(a) - oy * Math.sin(a), cy: cy + ox * Math.sin(a) + oy * Math.cos(a), w: Math.max(12, (Math.max(...xs) - Math.min(...xs)) * W * s), h: Math.max(12, (Math.max(...ys) - Math.min(...ys)) * H * s), angle: X.angle };
  }
  return box;
};
function recenterPath(c) { // move the layer origin to the centre of the path so scale / rotation pivot on it
  const P = c.gfx.pts; if (!P || !P.length || kfList(c, "x") || kfList(c, "y")) return; const xs = P.map(p => p[0]), ys = P.map(p => p[1]), mx = (Math.min(...xs) + Math.max(...xs)) / 2, my = (Math.min(...ys) + Math.max(...ys)) / 2; if (Math.abs(mx) + Math.abs(my) < 1e-4) return;
  const xf = pathXf(c), v = xf.vec(mx, my); P.forEach(p => { p[0] -= mx; p[1] -= my; }); c.x = Math.round(((c.x || 0) + v[0] / xf.W) * 10000) / 10000; c.y = Math.round(((c.y || 0) + v[1] / xf.H) * 10000) / 10000;
}
function newPathLayer() {
  const st = t, dur = Math.max(2, Math.min(5, total() - t || 5)), tr = freeTrack("text", st, dur);
  const c = { id: nid("c"), track: tr.id, type: "sticker", start: st, dur, x: 0, y: 0, name: "Hình bút", gfx: { kind: "path", pts: [], closed: false, fill: "#7b6cf6", fo: 1, stroke: "#ffffff", sw: 4, grad: null } };
  C.push(c); sel = { k: "c", id: c.id }; return c;
}
function finishPath(close) {
  const E = penEd; if (!E || E.mode !== "draw") return; const c = E.c, G = c.gfx;
  if ((G.pts || []).length < 2) { C.splice(C.indexOf(c), 1); sel = null; penEd = null; renderAll(); return; }
  G.closed = !!close && G.pts.length > 2; if (!G.closed && !G.sw) G.sw = 4; recenterPath(c); penEd = { c, mode: "edit", vi: null }; renderAll(); toast(G.closed ? "Đã đóng hình. Kéo điểm để sửa, bấm lên đường để thêm điểm." : "Đã kết thúc đường hở.");
}

/* ---------- overlay ---------- */
const _drawSelPen = drawSelection;
drawSelection = function () {
  _drawSelPen(); if (exporting || playing) return; const c = selClip(); if (!isPathLayer(c) || !(tool === "pen" || (penEd && penEd.c === c))) return;
  const xf = pathXf(c), k = selCv.width / cv.width, dpr = window.devicePixelRatio || 1, P = c.gfx.pts || [], r = 4.5 * dpr / k;
  sg.save(); sg.setTransform(k, 0, 0, k, 0, 0); sg.lineWidth = 1.2 * dpr / k;
  if (P.length > 1) { sg.beginPath(); P.forEach((p, i) => { if (i === 0) sg.moveTo(...xf.fwd(p[0], p[1])); }); const n = c.gfx.closed !== false ? P.length : P.length - 1; for (let i = 0; i < n; i++) { const [a, b, c2, d] = segCtrl(P, i).map(q => xf.fwd(q[0], q[1])); if (i === 0) sg.moveTo(...a); sg.bezierCurveTo(...b, ...c2, ...d); } sg.strokeStyle = UI_ACCENT; sg.stroke(); }
  if (penEd && penEd.mode === "draw" && penEd.hover && P.length) { const last = P[P.length - 1], a = xf.fwd(last[0], last[1]), b = xf.fwd(last[0] + (last[4] || 0), last[1] + (last[5] || 0)); sg.setLineDash([4 / k, 4 / k]); sg.beginPath(); sg.moveTo(...a); sg.bezierCurveTo(...b, ...penEd.hover, ...penEd.hover); sg.strokeStyle = "rgba(255,255,255,.6)"; sg.stroke(); sg.setLineDash([]); }
  P.forEach((p, i) => {
    const q = xf.fwd(p[0], p[1]); const hs = [[2, 3], [4, 5]].filter(([a, b]) => p[a] || p[b]);
    for (const [a, b] of hs) { const h = xf.fwd(p[0] + p[a], p[1] + p[b]); sg.beginPath(); sg.moveTo(...q); sg.lineTo(...h); sg.strokeStyle = "rgba(255,255,255,.75)"; sg.stroke(); sg.beginPath(); sg.arc(h[0], h[1], r * 0.75, 0, 7); sg.fillStyle = UI_ACCENT; sg.fill(); }
    sg.beginPath(); sg.rect(q[0] - r, q[1] - r, r * 2, r * 2); sg.fillStyle = penEd && penEd.vi === i ? GOLD : (i === 0 && penEd && penEd.mode === "draw" ? "#6fd38a" : "#fff"); sg.fill(); sg.strokeStyle = UI_ACCENT; sg.stroke();
  });
  sg.restore();
};

/* ---------- preview pointer handling (runs before the stage and mask handlers) ---------- */
function penHit(c, p, k) {
  const xf = pathXf(c), P = c.gfx.pts || [], tol = 9 * (window.devicePixelRatio || 1) / k;
  for (let i = P.length - 1; i >= 0; i--) { const pt = P[i]; for (const [a, b, kind] of [[4, 5, "hout"], [2, 3, "hin"]]) if (pt[a] || pt[b]) { const h = xf.fwd(pt[0] + pt[a], pt[1] + pt[b]); if (Math.hypot(h[0] - p[0], h[1] - p[1]) < tol) return { kind, i }; } }
  for (let i = P.length - 1; i >= 0; i--) { const q = xf.fwd(P[i][0], P[i][1]); if (Math.hypot(q[0] - p[0], q[1] - p[1]) < tol) return { kind: "pt", i }; }
  const n = c.gfx.closed !== false ? P.length : P.length - 1; let best = null;
  for (let i = 0; i < n; i++) { const S = segCtrl(P, i).map(q => xf.fwd(q[0], q[1])); for (let s = 0; s <= 48; s++) { const tt = s / 48, q = cubicAt(...S, tt), d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < tol && (!best || d < best.d)) best = { kind: "seg", i, t: tt, d }; } }
  return best;
}
function penTargetFor(c) { if (penTarget === "shape") return "shape"; if (penTarget === "mask") return c && (c.type === "video" || sel && sel.k === "v") ? "mask" : "shape"; return c && !isPathLayer(c) && (c.type === "video" || (sel && sel.k === "v")) ? "mask" : "shape"; }
cv.parentElement.addEventListener("pointerdown", e => {
  if (tool !== "pen" || e.target !== selCv || eyedrop || e.button !== 0 || exporting) return;
  if (playing) pause();
  const p = toCv(e), k = selCv.width / cv.width; let c = selClip();
  const grab = () => { e.preventDefault(); e.stopImmediatePropagation(); try { selCv.setPointerCapture(e.pointerId); } catch (_) {} };
  const drag = (onMove, onUp) => { const mv = ev => onMove(toCv(ev), ev), up = ev => { selCv.removeEventListener("pointermove", mv); selCv.removeEventListener("pointerup", up); selCv.removeEventListener("pointercancel", up); onUp && onUp(ev); renderInspector(); }; selCv.addEventListener("pointermove", mv); selCv.addEventListener("pointerup", up); selCv.addEventListener("pointercancel", up); };
  // mask mode: hand over to the mask editor with a fresh pen mask
  if (!(penEd && penEd.c === c) && penTargetFor(c) === "mask" && c) {
    const ME = maskEdit; const cur = ME && ME.kind === "clip" && ME.owner === c ? ME.list()[ME.idx] : null;
    if (!(cur && cur.type === "pen")) { pushUndo(); migrateMask(c); const L2 = (c.masks || []).slice(); const m = newMask("pen", L2.length + 1); L2.push(m); c.masks = L2; maskIdxMem["clip:" + c.id] = L2.length - 1; inspTabs.video = "mask"; showTab("insp"); renderInspector(); toast("Đang vẽ mask bằng bút trên " + (clipById(c.id) ? "clip đang chọn" : "clip") + ". Bấm điểm đầu hoặc Enter để đóng."); }
    return; // the mask editor's own capture handler on the canvas takes this click
  }
  if (penEd && penEd.c !== c) penEd = null;
  // drawing a new path
  if (penEd && penEd.mode === "draw") {
    grab(); const G = c.gfx, xf = pathXf(c), P = G.pts; let loc = xf.inv(p[0], p[1]);
    if (P.length >= 2) { const f = xf.fwd(P[0][0], P[0][1]); if (Math.hypot(f[0] - p[0], f[1] - p[1]) < 10 * (window.devicePixelRatio || 1) / k) { pushUndo(); G.closed = true; const f0 = P[0]; drag(q => { const l = xf.inv(q[0], q[1]); f0[4] = l[0] - f0[0]; f0[5] = l[1] - f0[1]; f0[2] = -f0[4]; f0[3] = -f0[5]; drawFrame(); }, () => { penEd.mode = "draw"; finishPath(true); }); drawFrame(); return; } }
    if (e.shiftKey && P.length) { const L = P[P.length - 1], s = xf.fwd(L[0], L[1]), dx = p[0] - s[0], dy = p[1] - s[1], ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4, d = Math.hypot(dx, dy); loc = xf.inv(s[0] + Math.cos(ang) * d, s[1] + Math.sin(ang) * d); }
    pushUndo(); const pt = [loc[0], loc[1], 0, 0, 0, 0]; P.push(pt); penEd.vi = P.length - 1; drawFrame();
    drag((q, ev) => { let l = xf.inv(q[0], q[1]); if (ev.shiftKey) { const s = xf.fwd(pt[0], pt[1]), dx = q[0] - s[0], dy = q[1] - s[1], ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4, d = Math.hypot(dx, dy); l = xf.inv(s[0] + Math.cos(ang) * d, s[1] + Math.sin(ang) * d); } pt[4] = l[0] - pt[0]; pt[5] = l[1] - pt[1]; pt[2] = -pt[4]; pt[3] = -pt[5]; drawFrame(); });
    return;
  }
  // editing an existing path layer
  if (isPathLayer(c)) {
    const hit = penHit(c, p, k);
    if (hit) {
      grab(); pushUndo(); const G = c.gfx, P = G.pts, xf = pathXf(c);
      if (hit.kind === "seg") { const i = splitSeg(P, hit.i, hit.t); penEd = { c, mode: "edit", vi: i }; drawFrame(); drag(q => { const l = xf.inv(q[0], q[1]); P[i][0] = l[0]; P[i][1] = l[1]; drawFrame(); }); return; }
      const pt = P[hit.i];
      if (hit.kind === "pt" && (e.ctrlKey || e.metaKey)) { P.splice(hit.i, 1); if (P.length < 3) G.closed = false; penEd = { c, mode: "edit", vi: null }; drawFrame(); return; }
      if (hit.kind === "pt" && e.altKey) { toggleSmooth(P, hit.i, G.closed !== false); penEd = { c, mode: "edit", vi: hit.i }; drawFrame(); return; }
      if (hit.kind === "pt" && hit.i === P.length - 1 && G.closed === false && P.length > 0 && penEd && penEd.mode === "edit") { /* continue drawing from the last point */ penEd = { c, mode: "draw", vi: hit.i }; drawFrame(); return; }
      penEd = { c, mode: "edit", vi: hit.i }; const o = [pt[0], pt[1]];
      if (hit.kind === "pt") drag(q => { const l = xf.inv(q[0], q[1]); pt[0] = l[0]; pt[1] = l[1]; drawFrame(); }, () => { if (Math.hypot(pt[0] - o[0], pt[1] - o[1]) < 1e-6) {} });
      else drag((q, ev) => { const l = xf.inv(q[0], q[1]); const [a, b, a2, b2] = hit.kind === "hout" ? [4, 5, 2, 3] : [2, 3, 4, 5]; pt[a] = l[0] - pt[0]; pt[b] = l[1] - pt[1]; if (!ev.altKey && !pt.broken) { const L2 = Math.hypot(pt[a2], pt[b2]) || Math.hypot(pt[a], pt[b]), L1 = Math.hypot(pt[a], pt[b]) || 1; pt[a2] = -pt[a] / L1 * L2; pt[b2] = -pt[b] / L1 * L2; } else pt.broken = 1; drawFrame(); });
      return;
    }
    const b = lastBoxes.get(c.id); if (b && inBox(b, p)) return; // inside the shape: let the stage move it
  }
  // start a new shape layer
  grab(); pushUndo(); c = newPathLayer(); penEd = { c, mode: "draw", vi: 0 }; inspTabs.sticker = "st"; const xf = pathXf(c), loc = xf.inv(p[0], p[1]), pt = [loc[0], loc[1], 0, 0, 0, 0]; c.gfx.pts.push(pt); renderTimeline(); renderInspector(); syncButtons(); drawFrame();
  drag(q => { const l = xf.inv(q[0], q[1]); pt[4] = l[0] - pt[0]; pt[5] = l[1] - pt[1]; pt[2] = -pt[4]; pt[3] = -pt[5]; drawFrame(); });
}, true);
selCv.addEventListener("pointermove", e => { if (tool !== "pen" || !penEd || penEd.mode !== "draw" || e.buttons) return; penEd.hover = toCv(e); drawSelection(); });
window.addEventListener("keydown", e => {
  if (e.target.matches("input,select,textarea") || document.querySelector(".overlay") || document.body.classList.contains("cpopen") || document.body.classList.contains("flowopen")) return;
  const ctrl = e.ctrlKey || e.metaKey;
  if (!ctrl && !e.altKey && !e.shiftKey && e.code === "KeyP") { e.preventDefault(); e.stopImmediatePropagation(); setTool("pen"); return; }
  if (!penEd) return; const c = penEd.c; if (!C.includes(c)) { penEd = null; return; }
  if (penEd.mode === "draw") {
    if (e.key === "Enter") { e.preventDefault(); e.stopImmediatePropagation(); finishPath(true); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); finishPath(false); }
    else if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); e.stopImmediatePropagation(); pushUndo(); c.gfx.pts.pop(); if (!c.gfx.pts.length) { C.splice(C.indexOf(c), 1); sel = null; penEd = null; renderAll(); } else drawFrame(); }
  } else if (penEd.vi != null && (e.key === "Backspace" || e.key === "Delete") && tool === "pen") { e.preventDefault(); e.stopImmediatePropagation(); pushUndo(); c.gfx.pts.splice(penEd.vi, 1); if (c.gfx.pts.length < 3) c.gfx.closed = false; penEd.vi = null; drawFrame(); renderInspector(); }
  else if (e.key === "Escape") { penEd = null; drawFrame(); }
}, true);
const _setToolPen = setTool;
setTool = function (tl) { _setToolPen(tl); if (tool !== "pen" && penEd && penEd.mode === "draw") finishPath(false); if (tool !== "pen") penEd = null; selCv.classList.toggle("pencur", tool === "pen"); renderTimeline(); drawFrame(); };
const _toolMenuPen = $("#toolBtn").onclick;
$("#toolBtn").onclick = e => openMenu(e.currentTarget, [...Object.entries(TOOL_INFO).map(([k, v]) => ({ label: (tool === k ? "✓ " : "") + v[0], kbd: v[1], run: () => setTool(k) })),
  { h: "Bút vẽ trên khung xem" }, ...[["auto", "Tự động (clip video → mask, còn lại → hình)"], ["shape", "Luôn tạo hình mới"], ["mask", "Mask cho clip đang chọn"]].map(([k, n]) => ({ label: (penTarget === k ? "✓ " : "") + n, run: () => { penTarget = k; } })),
  { h: "Bút trên timeline: đường key của clip video" }, ...[["auto", "Độ mờ (Opacity)"], ["vol", "Âm lượng"]].map(([k, n]) => ({ label: (penBand === k ? "✓ " : "") + n, run: () => { penBand = k; renderTimeline(); } }))]);

/* ---------- inspector for path layers ---------- */
const _shapeUIPen = shapeUI;
shapeUI = function (box, c) {
  if (!isPathLayer(c)) return _shapeUIPen(box, c); const G = c.gfx, b = section(box, "Hình vẽ bằng bút");
  note(b, (G.pts || []).length + " điểm · " + (G.closed !== false ? "đường kín" : "đường hở") + ". Chọn công cụ Bút (P) để sửa điểm: kéo điểm/tay cầm, bấm lên đường để thêm điểm, Alt+bấm điểm để đổi góc/cong, Ctrl+bấm để xoá.");
  btnRow(b, [[tool === "pen" ? "Đang dùng Bút" : "Sửa điểm bằng Bút (P)", () => { setTool("pen"); penEd = { c, mode: "edit", vi: null }; drawFrame(); }, tool !== "pen"], [G.closed !== false ? "Mở đường" : "Đóng đường", () => { pushUndo(); G.closed = G.closed === false && (G.pts || []).length > 2; renderInspector(); drawFrame(); }]]);
  toggle(b, "Tô màu", () => G.fill && G.fill !== "none", v => G.fill = v ? (G._fill || "#7b6cf6") : (G._fill = G.fill, "none"));
  if (G.fill && G.fill !== "none") { colorIn(b, "Màu tô", () => G.fill, v => G.fill = v); slider(b, { label: "Độ đục màu tô", min: 0, max: 1, step: 0.01, get: () => G.fo == null ? 1 : G.fo, set: v => G.fo = v, fmt: v => Math.round(v * 100) + "%" }); toggle(b, "Chuyển màu", () => !!G.grad, v => G.grad = v ? "#ff6b9a" : null); if (G.grad) colorIn(b, "Màu thứ hai", () => G.grad, v => G.grad = v); }
  slider(b, { label: "Nét viền", min: 0, max: 60, step: 0.5, get: () => G.sw || 0, set: v => G.sw = v, fmt: v => (+v).toFixed(1) }); if (G.sw > 0 || G.closed === false) colorIn(b, "Màu viền", () => G.stroke || "#ffffff", v => G.stroke = v);
  toggle(b, "Bóng đổ", () => !!G.shadow, v => G.shadow = v, "keep");
  btnRow(b, [["Dùng làm mask cho clip bên dưới", () => { const under = activeVideo(clipStart(c) + 0.01); if (!under) { toast("Không có clip video bên dưới tại vị trí này."); return; } pushUndo(); const xf = pathXf(c); migrateMask(under.c); const m = newMask("pen", (under.c.masks || []).length + 1); m.pts = G.pts.map(p => { const a = xf.fwd(p[0], p[1]), hi = xf.vec(p[2], p[3]), ho = xf.vec(p[4], p[5]); return [a[0] / xf.W, a[1] / xf.H, hi[0] / xf.W, hi[1] / xf.H, ho[0] / xf.W, ho[1] / xf.H]; }); m.closed = true; under.c.masks = [...(under.c.masks || []), m]; toast("Đã thêm mask bút vào clip bên dưới."); renderAll(); }]]);
};

/* ---------- timeline rubber band ---------- */
function bandProp(c, k) { const m = c.mediaId ? media.get(c.mediaId) : null; if (c.type === "audio") return "vol"; if (k === "v" || c.type === "video") return penBand === "vol" && m && m.hasAudio ? "vol" : "opacity"; if (c.type === "text" || c.type === "sticker" || c.type === "fx") return c.type === "fx" ? "amt" : "opacity"; return null; }
const BAND = { opacity: { min: 0, max: 1, def: c => c.opacity == null ? 1 : c.opacity, set: (c, v) => c.opacity = v, f: v => Math.round(v * 100) + "%" }, vol: { min: -40, max: 12, def: c => c.vol || 0, set: (c, v) => c.vol = v, f: v => v <= -40 ? "tắt" : (v > 0 ? "+" : "") + (+v).toFixed(1) + " dB" }, amt: { min: 0, max: 2, def: c => c.amt == null ? 1 : c.amt, set: (c, v) => c.amt = v, f: v => Math.round(v * 100) + "%" } };
function drawBand(d, c, k) {
  const prop = bandProp(c, k); if (!prop) return; const B = BAND[prop]; let cvb = d.querySelector(".rband"); if (!cvb) { cvb = document.createElement("canvas"); cvb.className = "rband"; d.appendChild(cvb); }
  const w = d.clientWidth, h = d.clientHeight, dpr = window.devicePixelRatio || 1; cvb.width = Math.max(1, Math.round(w * dpr)); cvb.height = Math.max(1, Math.round(h * dpr)); const x = cvb.getContext("2d"); x.scale(dpr, dpr);
  const pad = 4, yOf = v => pad + (1 - (v - B.min) / (B.max - B.min)) * (h - pad * 2), L = k === "v" ? vlen(c) : clen(c), def = B.def(c);
  x.strokeStyle = "#f2c14e"; x.lineWidth = 1.6; x.beginPath(); for (let px = 0; px <= w; px += 2) { const v = kfVal(c, prop, px / pps, def); px ? x.lineTo(px, yOf(v)) : x.moveTo(px, yOf(v)); } x.stroke();
  (kfList(c, prop) || []).forEach(q => { if (q.t < 0 || q.t > L) return; const px = q.t * pps, py = yOf(q.v); x.beginPath(); x.moveTo(px, py - 4.5); x.lineTo(px + 4.5, py); x.lineTo(px, py + 4.5); x.lineTo(px - 4.5, py); x.closePath(); x.fillStyle = "#f2c14e"; x.fill(); x.strokeStyle = "#131417"; x.lineWidth = 1; x.stroke(); });
  cvb.dataset.prop = prop;
}
const _decoratePen = decorateTimeline;
decorateTimeline = function () { _decoratePen(); document.body.classList.toggle("penband", tool === "pen"); if (tool !== "pen") { grid.querySelectorAll(".rband").forEach(x => x.remove()); return; } grid.querySelectorAll(".clip").forEach(d => { const f = clipById(d.dataset.id); if (f) drawBand(d, f.c, f.k); }); };
window.addEventListener("pointerdown", e => {
  if (tool !== "pen" || e.button !== 0) return; const d = e.target.closest && e.target.closest(".clip"); if (!d || !grid.contains(d) || e.target.closest(".h")) return;
  const f = clipById(d.dataset.id); if (!f) return; const c = f.c, prop = bandProp(c, f.k); if (!prop) return; if (isLocked(clipTrack(f.k, c))) { toast("Track đang khoá."); return; }
  e.preventDefault(); e.stopImmediatePropagation(); const B = BAND[prop], r = d.getBoundingClientRect(), pad = 4, h = r.height, L = f.k === "v" ? vlen(c) : clen(c);
  const vOf = cy => clamp(B.min + (1 - (cy - r.top - pad) / (h - pad * 2)) * (B.max - B.min), B.min, B.max), tOf = cx => clamp((cx - r.left) / pps, 0, L), yOf = v => r.top + pad + (1 - (v - B.min) / (B.max - B.min)) * (h - pad * 2);
  const lt = tOf(e.clientX), list = kfList(c, prop) || [], hitK = list.find(q => Math.abs(r.left + q.t * pps - e.clientX) < 7 && Math.abs(yOf(q.v) - e.clientY) < 9);
  if (sel?.id !== c.id) { sel = { k: f.k, id: c.id }; }
  pushUndo(); let K = hitK, level = null;
  if (K && (e.ctrlKey || e.metaKey)) { delKf(c, prop, K.t); renderTimeline(); renderInspector(); drawFrame(); return; }
  if (!K) { const cur = kfVal(c, prop, lt, B.def(c)); if (!list.length && Math.abs(yOf(cur) - e.clientY) < 7 && e.altKey) level = B.def(c); else { setKf(c, prop, lt, Math.round(cur * 1000) / 1000, "linear"); K = kfAt(c, prop, lt); } }
  const tip = document.createElement("div"); tip.className = "bandtip"; document.body.appendChild(tip);
  const show = (v, cx, cy) => { tip.textContent = KF_PROPS[prop] + ": " + B.f(v) + (K ? " · " + fmt(K.t) : ""); tip.style.left = cx + 12 + "px"; tip.style.top = cy - 28 + "px"; };
  show(K ? K.v : level, e.clientX, e.clientY);
  const mv = ev => { const v = Math.round(vOf(ev.clientY) * (prop === "vol" ? 2 : 100)) / (prop === "vol" ? 2 : 100); if (level != null) { B.set(c, v); show(v, ev.clientX, ev.clientY); } else if (K) { K.v = v; if (!ev.shiftKey) { const nt = Math.round(tOf(ev.clientX) * FPS) / FPS; const others = (kfList(c, prop) || []).filter(q => q !== K); if (!others.some(q => Math.abs(q.t - nt) < 0.5 / FPS)) { K.t = nt; kfList(c, prop).sort((a, b) => a.t - b.t); } } show(v, ev.clientX, ev.clientY); } drawBand(d, c, f.k); drawFrame(); if (playing) liveRefresh(); };
  const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); tip.remove(); renderInspector(); renderTimeline(); drawFrame(); };
  window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
}, true);
