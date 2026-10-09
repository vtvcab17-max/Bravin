"use strict";
/* ============================================================================
   Preview stage: selection box over the preview, drag / resize / rotate,
   two-finger pinch, eyedropper. Works with mouse and touch.
   ========================================================================== */
const selCv = document.createElement("canvas"); selCv.id = "pvSel"; selCv.setAttribute("aria-hidden", "true");
cv.parentElement.appendChild(selCv); const sg = selCv.getContext("2d");
let eyedrop = null;
const UI_ACCENT = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#7b6cf6";
function placeSelCanvas() {
  const r = cv.getBoundingClientRect(), pr = cv.parentElement.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  selCv.style.left = (r.left - pr.left) + "px"; selCv.style.top = (r.top - pr.top) + "px"; selCv.style.width = r.width + "px"; selCv.style.height = r.height + "px";
  const W = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr)); if (selCv.width !== W || selCv.height !== H) { selCv.width = W; selCv.height = H; }
  return r;
}
function selClip() { if (!sel || sel.k === "tr") return null; return findSel(); }
function boxCorners(b) { const a = b.angle * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), hw = b.w / 2, hh = b.h / 2; return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => [b.cx + x * ca - y * sa, b.cy + x * sa + y * ca]); }
function drawSelection() {
  placeSelCanvas(); sg.setTransform(1, 0, 0, 1, 0, 0); sg.clearRect(0, 0, selCv.width, selCv.height);
  if (exporting || playing) return;
  const c = selClip(); if (!c) return; const b = lastBoxes.get(c.id); if (!b) return;
  const k = selCv.width / cv.width; sg.setTransform(k, 0, 0, k, 0, 0);
  const pts = boxCorners(b), lw = 1.5 / k * (window.devicePixelRatio || 1);
  sg.strokeStyle = "#fff"; sg.lineWidth = lw * 1.4; sg.setLineDash([]); sg.beginPath(); pts.forEach((p, i) => i ? sg.lineTo(p[0], p[1]) : sg.moveTo(p[0], p[1])); sg.closePath(); sg.stroke();
  sg.strokeStyle = UI_ACCENT; sg.lineWidth = lw; sg.setLineDash([6 / k, 4 / k]); sg.stroke(); sg.setLineDash([]);
  const hs = 9 / k * (window.devicePixelRatio || 1);
  sg.fillStyle = "#fff"; sg.strokeStyle = UI_ACCENT; pts.forEach(p => { sg.beginPath(); sg.rect(p[0] - hs / 2, p[1] - hs / 2, hs, hs); sg.fill(); sg.stroke(); });
  const rh = rotHandle(b, k); sg.beginPath(); sg.moveTo((pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2); sg.lineTo(rh[0], rh[1]); sg.stroke(); sg.beginPath(); sg.arc(rh[0], rh[1], hs * 0.75, 0, Math.PI * 2); sg.fillStyle = GOLD; sg.fill(); sg.stroke();
}
function rotHandle(b, k) { const a = b.angle * Math.PI / 180, d = b.h / 2 + 34 / k * (window.devicePixelRatio || 1); return [b.cx + Math.sin(a) * d, b.cy - Math.cos(a) * d]; }
function toCv(e) { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * cv.width, (e.clientY - r.top) / r.height * cv.height]; }
function inBox(b, p) { const a = -b.angle * Math.PI / 180, dx = p[0] - b.cx, dy = p[1] - b.cy, x = dx * Math.cos(a) - dy * Math.sin(a), y = dx * Math.sin(a) + dy * Math.cos(a); return Math.abs(x) <= b.w / 2 && Math.abs(y) <= b.h / 2; }
function hitTest(p) { const ids = [...lastBoxes.keys()].reverse(); for (const id of ids) { const b = lastBoxes.get(id); if (b && inBox(b, p)) return id; } return null; }
function setProp2(c, prop, v, lt) { if (kfList(c, prop)) setKf(c, prop, lt, v); else c[prop] = v; }
const pointers = new Map(); let gest = null;
selCv.addEventListener("pointerdown", e => {
  e.preventDefault(); selCv.setPointerCapture(e.pointerId); pointers.set(e.pointerId, toCv(e));
  if (eyedrop) { const p = toCv(e), cb = eyedrop; eyedrop = null; selCv.classList.remove("pick"); window.__noChroma = true; drawFrame(); window.__noChroma = false; const d = g.getImageData(Math.round(p[0]), Math.round(p[1]), 1, 1).data; drawFrame(); cb("#" + [d[0], d[1], d[2]].map(x => x.toString(16).padStart(2, "0")).join("")); return; }
  if (playing) pause();
  const p = toCv(e), k = selCv.width / cv.width;
  let c = selClip(), b = c && lastBoxes.get(c.id), mode = null;
  if (b) { const rh = rotHandle(b, k), hs = 16 / k * (window.devicePixelRatio || 1); if (Math.hypot(p[0] - rh[0], p[1] - rh[1]) < hs) mode = "rot"; else if (boxCorners(b).some(q => Math.hypot(p[0] - q[0], p[1] - q[1]) < hs)) mode = "scale"; }
  if (!mode) { const id = hitTest(p); if (!id) { if (pointers.size === 1) { sel = null; renderTimeline(); renderInspector(); syncButtons(); drawFrame(); } return; } const f = clipById(id); if (!f) return; if (!c || c.id !== id) { focusMotion(f.c); sel = { k: f.k, id }; renderTimeline(); renderInspector(); syncButtons(); } c = f.c; b = lastBoxes.get(id); mode = "move"; }
  if (isLocked(clipTrack(sel.k, c))) { toast("Track đang khoá."); return; }
  const lt = curLt(c);
  gest = { c, b, mode, p0: p, lt, x: kfVal(c, "x", lt, c.x || 0), y: kfVal(c, "y", lt, c.y || 0), s: kfVal(c, "scale", lt, c.scale == null ? 1 : c.scale), a: kfVal(c, "angle", lt, c.angle || 0), undo: false };
  if (pointers.size === 2 && gest) { const [q1, q2] = [...pointers.values()]; gest.mode = "pinch"; gest.d0 = Math.hypot(q1[0] - q2[0], q1[1] - q2[1]); gest.r0 = Math.atan2(q2[1] - q1[1], q2[0] - q1[0]); }
});
selCv.addEventListener("pointermove", e => {
  if (!pointers.has(e.pointerId)) return; pointers.set(e.pointerId, toCv(e)); if (!gest) return;
  const G = gest, c = G.c, p = toCv(e);
  if (!G.undo) { if (Math.hypot(p[0] - G.p0[0], p[1] - G.p0[1]) < 2 && G.mode !== "pinch") return; pushUndo(); G.undo = true; }
  if (G.mode === "move" && pointers.size === 1) { setProp2(c, "x", Math.round((G.x + (p[0] - G.p0[0]) / cv.width) * 1000) / 1000, G.lt); setProp2(c, "y", Math.round((G.y + (p[1] - G.p0[1]) / cv.height) * 1000) / 1000, G.lt); }
  else if (G.mode === "scale") { const d0 = Math.hypot(G.p0[0] - G.b.cx, G.p0[1] - G.b.cy), d1 = Math.hypot(p[0] - G.b.cx, p[1] - G.b.cy); setProp2(c, "scale", clamp(G.s * d1 / Math.max(1, d0), 0.05, 8), G.lt); }
  else if (G.mode === "rot") { const a0 = Math.atan2(G.p0[1] - G.b.cy, G.p0[0] - G.b.cx), a1 = Math.atan2(p[1] - G.b.cy, p[0] - G.b.cx); let a = G.a + (a1 - a0) * 180 / Math.PI; a = ((a + 180) % 360 + 360) % 360 - 180; for (const snapA of [-180, -90, 0, 90, 180]) if (Math.abs(a - snapA) < 3) a = snapA; setProp2(c, "angle", Math.round(a), G.lt); }
  else if (pointers.size >= 2) { if (G.mode !== "pinch") { const [q1, q2] = [...pointers.values()]; G.mode = "pinch"; G.d0 = Math.hypot(q1[0] - q2[0], q1[1] - q2[1]); G.r0 = Math.atan2(q2[1] - q1[1], q2[0] - q1[0]); return; } const [q1, q2] = [...pointers.values()], d = Math.hypot(q1[0] - q2[0], q1[1] - q2[1]), r = Math.atan2(q2[1] - q1[1], q2[0] - q1[0]); setProp2(c, "scale", clamp(G.s * d / Math.max(1, G.d0), 0.05, 8), G.lt); setProp2(c, "angle", Math.round(G.a + (r - G.r0) * 180 / Math.PI), G.lt); }
  drawFrame();
});
const endGest = e => { pointers.delete(e.pointerId); if (gest && pointers.size === 0) { const moved = gest.undo; gest = null; if (moved) { renderInspector(); renderTimeline(); } } };
selCv.addEventListener("pointerup", endGest); selCv.addEventListener("pointercancel", endGest);
selCv.addEventListener("wheel", e => { const c = selClip(); if (!c || !lastBoxes.get(c.id)) return; e.preventDefault(); pushUndo(); const lt = curLt(c); setProp2(c, "scale", clamp(kfVal(c, "scale", lt, c.scale == null ? 1 : c.scale) * (e.deltaY < 0 ? 1.05 : 1 / 1.05), 0.05, 8), lt); drawFrame(); clearTimeout(selCv._wt); selCv._wt = setTimeout(renderInspector, 250); }, { passive: false });
function startEyedropper(cb, msg) { eyedrop = cb; selCv.classList.add("pick"); toast(msg || "Bấm vào màu nền trên khung xem trước."); }
window.addEventListener("resize", () => { if (!playing) drawSelection(); });
