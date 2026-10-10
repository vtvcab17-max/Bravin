"use strict";
/* ============================================================================
   Pen, finger gestures and "desktop mode".
   S Pen / stylus:
     - palm rejection: touches are ignored on the editor surfaces while a pen
       is in contact or hovering (0.7 s)
     - side (barrel) button + tap = right-click menu; long-press = menu
     - eraser end = delete the clip under the pen
     - hovering over the timeline previews that frame (like hover-scrub)
   Fingers:
     - two-finger tap = undo, three-finger tap = redo
     - preview: double-tap empty area = play/pause, swipe sideways = jog time
     - timeline: pinch = zoom (phone.js), long-press = menu
     - swipe a bottom sheet down to close it
   Desktop mode: on a phone mirrored to a TV (Smart View / DeX / HDMI) or with
     a mouse attached, the page widens its viewport so the full desktop layout
     is used. Auto-switches when an external display appears (Android app).
   ========================================================================== */
const haptic = ms => { try { navigator.vibrate && navigator.vibrate(ms || 8); } catch (_) {} };
const EDIT_SURF = "#grid, #pvSel, .ng, .cpage canvas, .ec-board, .ecw, .lanes";

/* ---------- pen ---------- */
let penLast = -1e9, penHoverHover = false, longPressAt = -1e9;
const penRecent = () => performance.now() - penLast < 700;
function fakeContext(target, x, y) { longPressAt = performance.now(); haptic(10); target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 2, buttons: 0, view: window })); }
window.addEventListener("pointerdown", e => {
  if (e.pointerType === "pen") {
    penLast = performance.now();
    if (penHoverHover) { penHoverHover = false; hoverOn = false; }
    if (e.button === 5 || (e.buttons & 32)) { // eraser end
      const d = e.target.closest && e.target.closest("#grid .clip"); if (d) { e.preventDefault(); e.stopImmediatePropagation(); const f = clipById(d.dataset.id); if (f && !isLocked(clipTrack(f.k, f.c))) { sel = { k: f.k, id: f.c.id }; deleteSel(); haptic(15); toast("Đã xoá clip bằng đầu tẩy."); } }
      return;
    }
    if (e.button === 2 || (e.buttons & 2)) { // side button
      e.preventDefault(); e.stopImmediatePropagation(); fakeContext(e.target, e.clientX, e.clientY); return;
    }
    // long-press with the pen = menu
    const x0 = e.clientX, y0 = e.clientY, tgt = e.target; let done = false;
    const tm = setTimeout(() => { if (!done) { done = true; fakeContext(tgt, x0, y0); } }, 550);
    const mv = ev => { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 6) cancel(); }, cancel = () => { done = true; clearTimeout(tm); window.removeEventListener("pointermove", mv, true); window.removeEventListener("pointerup", cancel, true); window.removeEventListener("pointercancel", cancel, true); };
    window.addEventListener("pointermove", mv, true); window.addEventListener("pointerup", cancel, true); window.addEventListener("pointercancel", cancel, true);
    return;
  }
  if (e.pointerType === "touch" && penRecent() && e.target.closest && e.target.closest(EDIT_SURF)) { e.preventDefault(); e.stopImmediatePropagation(); }
}, true);
window.addEventListener("contextmenu", e => { if (e.isTrusted && performance.now() - longPressAt < 800) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
window.addEventListener("touchstart", e => { if (penRecent() && e.target.closest && e.target.closest(EDIT_SURF)) { e.stopImmediatePropagation(); if (e.cancelable) e.preventDefault(); } }, { capture: true, passive: false });
// pen hover over the timeline = preview that frame
window.addEventListener("pointermove", e => {
  if (e.pointerType !== "pen") return; penLast = performance.now();
  if (e.buttons) return; const onGrid = e.target.closest && e.target.closest("#grid");
  if (onGrid && !hoverOn && !playing) { hoverOn = true; penHoverHover = true; }
  else if (!onGrid && penHoverHover) { penHoverHover = false; hoverOn = false; if (hoverT != null) { hoverT = null; if (typeof hoverLineEl !== "undefined" && hoverLineEl) hoverLineEl.remove(); drawFrame(); } }
}, true);
grid.addEventListener("pointerleave", e => { if (penHoverHover) { penHoverHover = false; hoverOn = false; } }, true);

/* ---------- finger gestures ---------- */
(function fingerTaps() { // pointer events: they still arrive when the touched element is re-rendered away
  let st = null; const act = new Map();
  window.addEventListener("pointerdown", e => {
    if (e.pointerType !== "touch") return;
    if (!act.size) st = (e.target.closest && e.target.closest("input,textarea,select,[contenteditable],.aiflow")) ? null : { t: performance.now(), max: 0, moved: false };
    act.set(e.pointerId, [e.clientX, e.clientY]); if (st) st.max = Math.max(st.max, act.size);
  }, true);
  window.addEventListener("pointermove", e => { if (e.pointerType !== "touch" || !st) return; const p = act.get(e.pointerId); if (p && Math.hypot(e.clientX - p[0], e.clientY - p[1]) > 14) st.moved = true; }, true);
  const end = e => {
    if (e.pointerType !== "touch" || !act.has(e.pointerId)) return; act.delete(e.pointerId); if (e.type === "pointercancel" && st) st.moved = true;
    if (act.size || !st) return; const S = st; st = null;
    if (S.moved || performance.now() - S.t > 320 || penRecent() || document.querySelector(".overlay")) return;
    if (S.max === 2) { undo(); haptic(12); toast("Hoàn tác (chạm 2 ngón)"); }
    else if (S.max === 3) { redo(); haptic(12); toast("Làm lại (chạm 3 ngón)"); }
  };
  window.addEventListener("pointerup", end, true); window.addEventListener("pointercancel", end, true);
})();
/* preview: double-tap empty area = play/pause; swipe sideways = jog */
(function previewGestures() {
  let lastTap = { t: 0, x: 0, y: 0 };
  cv.parentElement.addEventListener("pointerdown", e => {
    if (e.pointerType !== "touch" || e.target !== selCv || tool !== "select" || eyedrop || (typeof maskEdit !== "undefined" && maskEdit)) return;
    const p = toCv(e); if (hitTest(p)) return; const c = selClip(), b = c && lastBoxes.get(c.id); if (b && inBox(b, p)) return;
    const x0 = e.clientX, y0 = e.clientY, t0 = t, w = selCv.getBoundingClientRect().width || 300; let jog = false;
    const mv = ev => { if (ev.pointerId !== e.pointerId) return; const dx = ev.clientX - x0, dy = ev.clientY - y0; if (!jog && Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.4) { jog = true; if (playing) pause(); } if (jog) { const nt = clamp(t0 + dx / w * 4, 0, total()); seek(Math.round(nt * FPS) / FPS); } };
    const up = ev => { if (ev.pointerId !== e.pointerId) return; window.removeEventListener("pointermove", mv, true); window.removeEventListener("pointerup", up, true); window.removeEventListener("pointercancel", up, true);
      if (jog) { renderInspector(); return; }
      const now = performance.now(); if (now - lastTap.t < 300 && Math.hypot(ev.clientX - lastTap.x, ev.clientY - lastTap.y) < 30) { lastTap.t = 0; playing ? pause() : play(); haptic(8); } else lastTap = { t: now, x: ev.clientX, y: ev.clientY }; };
    window.addEventListener("pointermove", mv, true); window.addEventListener("pointerup", up, true); window.addEventListener("pointercancel", up, true);
  }, true);
})();
/* bottom sheets: swipe the header down to close */
(function sheetSwipe() {
  document.querySelectorAll("#libPanel .ph, #sidePanel .ph").forEach(h => {
    h.style.touchAction = "none";
    h.addEventListener("pointerdown", e => {
      if (e.pointerType !== "touch" || !document.body.classList.contains("phone") || e.target.closest("button,input,select")) return; const panel = h.closest("#libPanel, #sidePanel"); if (!panel || !panel.classList.contains("open")) return;
      const y0 = e.clientY; let dy = 0;
      const mv = ev => { dy = Math.max(0, ev.clientY - y0); panel.style.transform = `translateY(${dy}px)`; panel.style.transition = "none"; };
      const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); panel.style.transition = ""; panel.style.transform = ""; if (dy > 80) { closeSheets(); haptic(8); } };
      window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
    });
  });
})();

/* ---------- desktop mode (TV / mouse) ---------- */
const UIM = { mode: (() => { try { return localStorage.getItem("bravin-ui") || "auto"; } catch (_) { return "auto"; } })(), on: false, base: null, ext: 0, mouseHinted: false };
function extDisplays() {
  let n = 0; try { if (window.VINCutAndroid && VINCutAndroid.displays) { const j = JSON.parse(VINCutAndroid.displays()); n = j.external || 0; } } catch (_) {}
  try { if (screen.isExtended) n = Math.max(n, 1); } catch (_) {}
  return n;
}
function wantDesktop() { if (UIM.mode === "desktop") return true; if (UIM.mode === "phone") return false; return UIM.ext > 0; }
function applyUIMode(announce) {
  const meta = document.querySelector('meta[name="viewport"]'); if (!meta) return; if (UIM.base == null) UIM.base = meta.content;
  const land = matchMedia("(orientation: landscape)").matches, devW = Math.min(screen.width, screen.height) && (land ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height));
  const target = land ? 1280 : 1024, need = wantDesktop() && devW < target;
  const content = need ? `width=${target},user-scalable=no,viewport-fit=cover` : UIM.base;
  if (meta.content !== content) { meta.content = content; setTimeout(() => window.dispatchEvent(new Event("resize")), 60); }
  const was = UIM.on; UIM.on = wantDesktop(); document.body.classList.toggle("deskmode", UIM.on && need);
  try { if (window.VINCutAndroid && VINCutAndroid.setOrientation) VINCutAndroid.setOrientation(UIM.on && UIM.ext > 0 ? "landscape" : "auto"); } catch (_) {}
  if (announce && was !== UIM.on) toast(UIM.on ? "Đã bật chế độ máy tính: giao diện đầy đủ như trên PC. Dùng chuột/bàn phím Bluetooth cho tiện." : "Đã về giao diện điện thoại.");
}
function setUIMode(m) { UIM.mode = m; try { localStorage.setItem("bravin-ui", m); } catch (_) {} applyUIMode(true); }
function refreshDisplays(announce) { const n = extDisplays(); const changed = n !== UIM.ext; UIM.ext = n; if (changed && announce && UIM.mode === "auto") { if (n > 0) toast("Phát hiện TV / màn hình ngoài: chuyển sang chế độ máy tính."); } applyUIMode(changed && announce); }
window.addEventListener("bravin-display", () => refreshDisplays(true));
try { if (window.getScreenDetails === undefined && "onchange" in screen) screen.addEventListener("change", () => refreshDisplays(true)); } catch (_) {}
matchMedia("(orientation: landscape)").addEventListener("change", () => applyUIMode(false));
// a mouse appeared on a touch device: suggest desktop mode once
window.addEventListener("pointermove", e => { if (e.pointerType === "mouse" && !UIM.mouseHinted && navigator.maxTouchPoints > 0 && document.body.classList.contains("phone") && UIM.mode === "auto") { UIM.mouseHinted = true; toast("Đang dùng chuột: bật \"Chế độ máy tính\" trong menu Tiện ích (🔧) để có giao diện PC."); } }, { passive: true });
refreshDisplays(false);

/* ---------- menus + help ---------- */
function uiModeItems() { return [{ h: "Giao diện" }, ...[["auto", "Tự động (TV / màn hình ngoài → máy tính)"], ["desktop", "Chế độ máy tính (khi chiếu lên TV, dùng chuột)"], ["phone", "Luôn giao diện điện thoại"]].map(([k, n]) => ({ label: (UIM.mode === k ? "✓ " : "") + n, run: () => setUIMode(k) })), { label: "Cử chỉ, bút và phím tắt…", run: showGestureHelp }]; }
function showGestureHelp() {
  const ov = document.createElement("div"); ov.className = "overlay"; ov.innerHTML = `<div class="dialog" style="max-width:520px"><h3 style="margin-top:0">Cử chỉ và bút</h3>
  <p class="lsub">Ngón tay</p><ul class="ghelp"><li><b>Chạm 2 ngón</b>: hoàn tác · <b>chạm 3 ngón</b>: làm lại</li><li><b>Chụm / mở 2 ngón</b> trên timeline: phóng to thu nhỏ thời gian; trên khung xem: đổi cỡ, xoay clip đang chọn</li><li><b>Vuốt ngang</b> chỗ trống trên khung xem: tua từng khung · <b>chạm đúp</b>: phát / dừng</li><li><b>Giữ</b> trên clip hoặc khung xem: mở menu · <b>vuốt xuống</b> đầu bảng dưới: đóng bảng</li></ul>
  <p class="lsub">Bút S Pen</p><ul class="ghelp"><li>Đặt bút gần màn hình là <b>tự bỏ qua lòng bàn tay</b></li><li><b>Rê bút</b> trên timeline: xem trước khung hình tại vị trí bút</li><li><b>Nút bên + chạm</b> hoặc <b>giữ bút</b>: mở menu như chuột phải</li><li><b>Đầu tẩy</b> (bút có tẩy): xoá clip dưới bút</li><li>Công cụ Bút (P): vẽ hình / mask chính xác bằng S Pen</li></ul>
  <p class="lsub">Chiếu lên TV</p><ul class="ghelp"><li>Smart View, DeX hoặc cáp HDMI: Bravin tự chuyển <b>chế độ máy tính</b> và xoay ngang; dùng chuột, bàn phím Bluetooth như trên PC</li><li>Đổi tay trong menu <b>Tiện ích (🔧) → Giao diện</b></li></ul>
  <div class="row" style="justify-content:flex-end"><button class="primary" type="button">Đóng</button></div></div>`;
  ov.querySelector("button").onclick = () => ov.remove(); ov.addEventListener("pointerdown", e => { if (e.target === ov) ov.remove(); }); document.body.appendChild(ov);
}
if (typeof utilMenu === "function") { const _utilMenuIn = utilMenu; utilMenu = function (anchor) { _utilMenuIn(anchor); if (!menuEl) return; const extra = uiModeItems(); for (const it of extra) { if (it.h) { const h = document.createElement("div"); h.className = "mh"; h.textContent = it.h; menuEl.appendChild(h); continue; } const b = document.createElement("button"); b.setAttribute("role", "menuitem"); b.textContent = it.label; b.onclick = () => { closeMenu(); it.run(); }; menuEl.appendChild(b); } const r = menuEl.getBoundingClientRect(); if (r.bottom > innerHeight - 8) menuEl.style.top = Math.max(8, innerHeight - r.height - 8) + "px"; }; const ub = $("#utilBtn"); if (ub) ub.onclick = e => utilMenu(e.currentTarget); }
if ($("#moreBtn")) { const _more = $("#moreBtn").onclick; $("#moreBtn").onclick = e => { _more(e); if (!menuEl) return; for (const it of uiModeItems()) { if (it.h) { const h = document.createElement("div"); h.className = "mh"; h.textContent = it.h; menuEl.appendChild(h); continue; } const b = document.createElement("button"); b.setAttribute("role", "menuitem"); b.textContent = it.label; b.onclick = () => { closeMenu(); it.run(); }; menuEl.appendChild(b); } const r = menuEl.getBoundingClientRect(); if (r.bottom > innerHeight - 8) menuEl.style.top = Math.max(8, innerHeight - r.height - 8) + "px"; }; }
document.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === "KeyD" && !tmatch(e, "input,textarea,select")) { e.preventDefault(); e.stopImmediatePropagation(); setUIMode(UIM.on ? "phone" : "desktop"); } }, true);
