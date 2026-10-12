"use strict";
/* ============================================================================
   Bravin cho Samsung (4.11): S Pen, Samsung DeX, Air actions.
   Chạy trên mọi bản; bật đầy đủ khi là bản "Bravin Samsung" (meta bravin-edition)
   hoặc máy Samsung (VINCutAndroid.device() / user agent "SM-").
   - Vẽ tay S Pen: lớp vẽ theo lực nhấn, đầu tẩy của bút, chỉ nhận bút (bỏ qua lòng
     bàn tay), xong thì thành ảnh PNG trong suốt đặt lên track phủ tại kim.
   - Air View: rê bút trên nút/biểu tượng hiện chú thích (WebView không tự hiện title).
   - Samsung DeX: nhận DeX (cờ của Samsung qua cầu nối Android), không khoá xoay,
     không ẩn thanh tác vụ, giao diện máy tính.
   - Air actions: khai báo trong res-samsung/xml/remote_actions.xml, đến trang như
     phím tắt (Space, S, ←, →, M, K, Ctrl+Z, Ctrl+Y); bảng tra trong Cài đặt Samsung.
   ========================================================================== */
const SAM = (() => {
  const edition = document.querySelector('meta[name="bravin-edition"]')?.content || "standard";
  let dev = {};
  try { if (window.VINCutAndroid && VINCutAndroid.device) dev = JSON.parse(VINCutAndroid.device()) || {}; } catch (_) {}
  const ua = navigator.userAgent || "";
  const samsung = edition === "samsung" || !!dev.samsung || /\bSM-[A-Z0-9]+|SAMSUNG|SamsungBrowser/i.test(ua);
  const read = (k, d) => { try { const v = localStorage.getItem("bravin-sam-" + k); return v == null ? d : v === "1"; } catch (_) { return d; } };
  return {
    edition, dev, samsung, spen: !!dev.spen, dex: !!dev.dex, sawPen: false,
    airView: read("airview", true), penOnly: read("penonly", true),
    save(k, v) { this[k] = v; try { localStorage.setItem("bravin-sam-" + k.toLowerCase(), v ? "1" : "0"); } catch (_) {} },
  };
})();
window.BravinSamsung = SAM;
const samEsc = x => String(x == null ? "" : x).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

const AIR_ACTIONS = [
  ["Bấm nút bút", "Phát / dừng", "Space"],
  ["Bấm đúp nút bút", "Cắt clip tại kim", "S"],
  ["Vẫy sang trái", "Lùi 1 khung hình", "←"],
  ["Vẫy sang phải", "Tiến 1 khung hình", "→"],
  ["Vẫy lên", "Đặt / bỏ đánh dấu", "M"],
  ["Vẫy xuống", "Thêm keyframe", "K"],
  ["Xoay ngược chiều kim đồng hồ", "Hoàn tác", "Ctrl+Z"],
  ["Xoay theo chiều kim đồng hồ", "Làm lại", "Ctrl+Y"],
];

/* ---------- lớp trạng thái trên <body> ---------- */
function samApplyClasses() {
  const b = document.body;
  b.classList.toggle("samsung", SAM.samsung);
  b.classList.toggle("sam-edition", SAM.edition === "samsung");
  b.classList.toggle("dex", SAM.dex);
  b.classList.toggle("spen", SAM.spen || SAM.sawPen);
}
samApplyClasses();

/* ---------- Samsung DeX ---------- */
function samRefreshDex(announce) {
  let d = SAM.dex;
  try { if (window.VINCutAndroid && VINCutAndroid.device) { SAM.dev = JSON.parse(VINCutAndroid.device()) || SAM.dev; d = !!SAM.dev.dex; } } catch (_) {}
  const changed = d !== SAM.dex; SAM.dex = d; samApplyClasses();
  if (d) { try { VINCutAndroid.setOrientation && VINCutAndroid.setOrientation("auto"); } catch (_) {} }
  if (announce && changed) toast(d ? "Đang chạy trên Samsung DeX: chuột phải mở menu, phím tắt như trên PC, kéo giãn cửa sổ tuỳ ý." : "Đã thoát Samsung DeX.");
  if (changed) setTimeout(() => window.dispatchEvent(new Event("resize")), 80);
}
window.addEventListener("bravin-config", () => samRefreshDex(true));
if (SAM.dex) setTimeout(() => samRefreshDex(false) || toast("Bravin Samsung trên DeX: dùng chuột, bàn phím và phím tắt như bản PC."), 1500);
// DeX luôn là màn hình rộng: không để "chế độ máy tính" ép viewport hay khoá xoay
if (typeof wantDesktop === "function") { const _wd = wantDesktop; wantDesktop = function () { return SAM.dex ? false : _wd(); }; }

/* ---------- Air View: rê bút hiện chú thích ---------- */
(function airView() {
  let tip = null, timer = 0, curEl = null;
  const hide = () => { clearTimeout(timer); timer = 0; curEl = null; if (tip) tip.hidden = true; };
  const label = el => {
    const t = el.getAttribute("title") || el.getAttribute("aria-label") || el.dataset.tip || "";
    return t.trim();
  };
  window.addEventListener("pointermove", e => {
    if (e.pointerType !== "pen") return;
    if (!SAM.sawPen) { SAM.sawPen = true; samApplyClasses(); samToolbarButton(); }
    if (!SAM.airView || e.buttons) { if (e.buttons) hide(); return; }
    const el = e.target.closest && e.target.closest("[title],[aria-label],[data-tip]");
    if (!el || el.closest(".sdraw-stage") || !label(el)) { hide(); return; }
    if (el === curEl) { if (tip && !tip.hidden) place(e); return; }
    hide(); curEl = el;
    timer = setTimeout(() => {
      if (!tip) { tip = document.createElement("div"); tip.className = "airview"; tip.setAttribute("role", "tooltip"); document.body.appendChild(tip); }
      tip.textContent = label(el); tip.hidden = false; place(e);
    }, 320);
  }, true);
  function place(e) { if (!tip) return; const r = tip.getBoundingClientRect(); let x = e.clientX - r.width / 2, y = e.clientY - r.height - 22; if (y < 6) y = e.clientY + 26; tip.style.left = Math.max(6, Math.min(innerWidth - r.width - 6, x)) + "px"; tip.style.top = y + "px"; }
  window.addEventListener("pointerdown", hide, true);
  window.addEventListener("pointerleave", e => { if (e.pointerType === "pen") hide(); }, true);
  window.addEventListener("scroll", hide, true);
})();

/* ---------- Vẽ tay bằng S Pen (lực nhấn) ---------- */
const SDRAW_COLORS = ["#ffffff", "#111111", "#f2c14e", "#ef6a5a", "#3ddc84", "#4aa3ff", "#b07cff"];
function openPenDraw() {
  if (document.querySelector(".sdraw")) return;
  if (document.body.classList.contains("athome") || !curProjectId) { toast("Mở một dự án trước khi vẽ."); return; }
  if (typeof pause === "function") pause();
  try { drawFrame(); } catch (_) {}
  const W = cv.width, H = cv.height;
  let bg = ""; try { bg = cv.toDataURL("image/jpeg", 0.8); } catch (_) {}
  const st = { color: (() => { try { return localStorage.getItem("bravin-sam-color") || "#f2c14e"; } catch (_) { return "#f2c14e"; } })(), size: 12, erase: false, strokes: [], cur: null };
  const ov = document.createElement("div"); ov.className = "sdraw"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-label", "Vẽ tay bằng S Pen");
  ov.innerHTML = `<header class="sdraw-bar">
      <b>Vẽ tay</b>
      <span class="sdraw-colors" role="radiogroup" aria-label="Màu">${SDRAW_COLORS.map(c => `<button type="button" class="sdc" data-c="${c}" style="--c:${c}" aria-label="Màu ${c}" title="Màu ${c}"></button>`).join("")}</span>
      <label class="sdraw-size" title="Cỡ nét (bút: đè mạnh nét to, đè nhẹ nét mảnh)">Cỡ <input type="range" min="2" max="60" value="12"></label>
      <span class="pills"><button type="button" data-t="pen" aria-pressed="true" title="Bút">✎ Bút</button><button type="button" data-t="erase" aria-pressed="false" title="Tẩy (hoặc lật đầu tẩy của S Pen)">⌫ Tẩy</button></span>
      <label class="chk" title="Bỏ qua chạm tay, chỉ nhận S Pen (chống chạm lòng bàn tay)"><input type="checkbox" class="sdraw-pen"> Chỉ nhận bút</label>
      <button type="button" class="sdraw-undo" title="Bỏ nét vừa vẽ (Ctrl+Z)">↶ Hoàn tác</button>
      <button type="button" class="sdraw-clear" title="Xoá hết nét">Xoá hết</button>
      <span class="spacer"></span>
      <button type="button" class="sdraw-cancel">Huỷ</button>
      <button type="button" class="primary sdraw-done">Đưa vào timeline</button>
    </header>
    <div class="sdraw-stage"><div class="sdraw-frame">${bg ? `<img alt="" src="${bg}">` : ""}<canvas width="${W}" height="${H}" aria-label="Vùng vẽ"></canvas></div></div>
    <p class="sdraw-hint">Đè bút mạnh để nét to, nhẹ để nét mảnh. Lật đầu tẩy của S Pen để xoá. Nét vẽ thành một lớp ảnh trong suốt dài 3 giây tại kim (${fmt(t)}), kéo dài hay chỉnh vị trí như clip thường.</p>`;
  document.body.appendChild(ov); document.body.classList.add("sdraw-open");
  const $o = s => ov.querySelector(s), c = $o("canvas"), g = c.getContext("2d");
  const fit = () => { const r = $o(".sdraw-stage").getBoundingClientRect(), k = Math.max(0.05, Math.min((r.width - 24) / W, (r.height - 24) / H)), f = $o(".sdraw-frame"); f.style.width = Math.round(W * k) + "px"; f.style.height = Math.round(H * k) + "px"; };
  fit(); window.addEventListener("resize", fit);
  const penOnlyBox = $o(".sdraw-pen"); penOnlyBox.checked = SAM.penOnly && (SAM.spen || SAM.sawPen || SAM.samsung);
  penOnlyBox.onchange = () => SAM.save("penOnly", penOnlyBox.checked);
  const markColor = () => ov.querySelectorAll(".sdc").forEach(b => b.setAttribute("aria-pressed", b.dataset.c === st.color));
  ov.querySelectorAll(".sdc").forEach(b => b.onclick = () => { st.color = b.dataset.c; st.erase = false; markTool(); markColor(); try { localStorage.setItem("bravin-sam-color", st.color); } catch (_) {} });
  const markTool = () => ov.querySelectorAll("[data-t]").forEach(b => b.setAttribute("aria-pressed", (b.dataset.t === "erase") === st.erase));
  ov.querySelectorAll("[data-t]").forEach(b => b.onclick = () => { st.erase = b.dataset.t === "erase"; markTool(); });
  $o(".sdraw-size input").oninput = e => { st.size = +e.target.value; };
  markColor();

  const widthAt = (s, p) => s.size * (W / 1080) * (0.15 + 1.7 * p);
  function seg(s, a, b) {
    g.globalCompositeOperation = s.erase ? "destination-out" : "source-over";
    g.strokeStyle = s.color; g.lineCap = "round"; g.lineJoin = "round";
    g.lineWidth = Math.max(0.6, widthAt(s, (a[2] + b[2]) / 2) * (s.erase ? 2.2 : 1));
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
  }
  function dot(s, a) { g.globalCompositeOperation = s.erase ? "destination-out" : "source-over"; g.fillStyle = s.color; g.beginPath(); g.arc(a[0], a[1], Math.max(0.6, widthAt(s, a[2]) * (s.erase ? 2.2 : 1)) / 2, 0, Math.PI * 2); g.fill(); }
  function drawStroke(s) { if (s.pts.length === 1) { dot(s, s.pts[0]); return; } for (let i = 1; i < s.pts.length; i++) seg(s, s.pts[i - 1], s.pts[i]); }
  function redraw() { g.clearRect(0, 0, W, H); st.strokes.forEach(drawStroke); g.globalCompositeOperation = "source-over"; }
  const toC = e => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
  const pressureOf = e => e.pointerType === "pen" ? (e.pressure > 0 ? e.pressure : 0.5) : 0.5;

  c.addEventListener("pointerdown", e => {
    if (e.pointerType === "pen" && !SAM.sawPen) { SAM.sawPen = true; samApplyClasses(); }
    if (e.pointerType === "touch" && penOnlyBox.checked && (SAM.sawPen || SAM.spen)) { e.preventDefault(); return; } // lòng bàn tay
    if (st.cur) return;
    e.preventDefault(); try { c.setPointerCapture(e.pointerId); } catch (_) {}
    const eraserEnd = e.pointerType === "pen" && (e.button === 5 || (e.buttons & 32));
    const [x, y] = toC(e);
    st.cur = { id: e.pointerId, color: st.color, size: st.size, erase: st.erase || eraserEnd, pts: [[x, y, pressureOf(e)]] };
    dot(st.cur, st.cur.pts[0]);
  });
  c.addEventListener("pointermove", e => {
    const s = st.cur; if (!s || e.pointerId !== s.id) return; e.preventDefault();
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of (evs.length ? evs : [e])) { const [x, y] = toC(ev), p = [x, y, pressureOf(ev)], last = s.pts[s.pts.length - 1]; if (Math.hypot(x - last[0], y - last[1]) < 0.8) continue; s.pts.push(p); seg(s, last, p); }
  });
  const end = e => { const s = st.cur; if (!s || e.pointerId !== s.id) return; st.strokes.push(s); st.cur = null; g.globalCompositeOperation = "source-over"; };
  c.addEventListener("pointerup", end); c.addEventListener("pointercancel", end);
  c.addEventListener("contextmenu", e => e.preventDefault());

  const undoStroke = () => { if (st.strokes.pop()) redraw(); };
  $o(".sdraw-undo").onclick = undoStroke;
  $o(".sdraw-clear").onclick = () => { st.strokes = []; redraw(); };
  const close = () => { ov.remove(); document.body.classList.remove("sdraw-open"); document.removeEventListener("keydown", keys, true); window.removeEventListener("resize", fit); };
  const keys = e => {
    if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ") { e.preventDefault(); e.stopImmediatePropagation(); undoStroke(); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); close(); }
    else if (!tmatch(e, "input")) e.stopImmediatePropagation(); // không để phím tắt dựng phim chạy khi đang vẽ
  };
  document.addEventListener("keydown", keys, true);
  let cancelArm = 0;
  $o(".sdraw-cancel").onclick = () => { if (!st.strokes.length || performance.now() - cancelArm < 3000) close(); else { cancelArm = performance.now(); toast("Bấm Huỷ lần nữa để bỏ các nét đã vẽ."); } };
  $o(".sdraw-done").onclick = async () => {
    if (!st.strokes.length) { toast("Chưa có nét nào. Vẽ bằng S Pen hoặc ngón tay rồi bấm lại."); return; }
    const btn = $o(".sdraw-done"); btn.disabled = true;
    const blob = await new Promise(r => c.toBlob(r, "image/png"));
    const n = [...media.values()].filter(m => /^Vẽ tay \d+/.test(m.name)).length + 1;
    const at = t, m = await addMediaFile(blob, `Vẽ tay ${n}.png`);
    if (!m) { btn.disabled = false; return; }
    appendMedia(m, null, { overlay: true, start: at });
    close(); drawFrame(); toast(`Đã thêm "Vẽ tay ${n}" lên track phủ tại ${fmt(at)}.`);
  };
  return ov;
}
window.openPenDraw = openPenDraw;

/* ---------- cài đặt Samsung ---------- */
function openSamsungSettings() {
  const ov = document.createElement("div"); ov.className = "overlay";
  const status = [
    SAM.edition === "samsung" ? "Bản Bravin Samsung" : "Bản Bravin thường" + (SAM.samsung ? " trên máy Samsung" : ""),
    SAM.dev.model ? `máy ${SAM.dev.model}` : "",
    SAM.spen ? "có S Pen" : (SAM.sawPen ? "đã nhận bút" : "chưa thấy bút"),
    SAM.dex ? "đang chạy DeX" : "",
  ].filter(Boolean).join(" · ");
  ov.innerHTML = `<div class="dialog samdlg" style="max-width:560px"><h3 style="margin-top:0">S Pen và Samsung DeX</h3>
    <p class="lsub">${samEsc(status)}</p>
    <div class="samopts">
      <label class="chk"><input type="checkbox" data-k="airView"> <span><b>Air View</b>: rê bút trên nút để xem chú thích</span></label>
      <label class="chk"><input type="checkbox" data-k="penOnly"> <span><b>Chỉ nhận bút khi vẽ tay</b>: bỏ qua chạm lòng bàn tay</span></label>
    </div>
    <div class="row" style="margin:10px 0 4px"><button type="button" class="primary" data-a="draw">✎ Vẽ tay bằng S Pen</button><button type="button" data-a="help">Cử chỉ và bút</button></div>
    <p class="lsub">Air actions (vẫy S Pen từ xa)</p>
    <table class="samtbl"><thead><tr><th>Thao tác bút</th><th>Bravin làm</th><th>Phím</th></tr></thead><tbody>${AIR_ACTIONS.map(([a, b, k]) => `<tr><td>${a}</td><td>${b}</td><td><kbd>${k}</kbd></td></tr>`).join("")}</tbody></table>
    <p class="note">${SAM.edition === "samsung" ? "Bật trong Cài đặt → Tính năng nâng cao → S Pen → Air actions → Bravin Samsung. Có thể đổi từng thao tác ở đó." : "Air actions chỉ có trên bản <b>Bravin Samsung</b> (APK riêng). Các phím tắt trên vẫn dùng được với bàn phím."}</p>
    <p class="lsub">Samsung DeX</p>
    <p class="note">${SAM.dex ? "Đang chạy DeX: Bravin mở giao diện máy tính trong cửa sổ, chuột phải mở menu, phím tắt như bản PC." : "Cắm màn hình / bật DeX: Bravin tự dùng giao diện máy tính, không khoá xoay, không ẩn thanh tác vụ. Cài plugin vẫn cần Bravin trên máy tính."}</p>
    <div class="row" style="justify-content:flex-end;align-items:center;gap:12px"><a href="huong-dan/samsung.html" target="_blank" rel="noopener" style="color:var(--acc-hi)">Hướng dẫn đầy đủ</a><button type="button" data-a="close">Đóng</button></div></div>`;
  document.body.appendChild(ov);
  ov.querySelectorAll("[data-k]").forEach(i => { i.checked = !!SAM[i.dataset.k]; i.onchange = () => SAM.save(i.dataset.k, i.checked); });
  const close = () => ov.remove();
  ov.querySelector('[data-a="close"]').onclick = close;
  ov.querySelector('[data-a="draw"]').onclick = () => { close(); openPenDraw(); };
  ov.querySelector('[data-a="help"]').onclick = () => { close(); if (typeof showGestureHelp === "function") showGestureHelp(); };
  ov.addEventListener("pointerdown", e => { if (e.target === ov) close(); });
}
window.openSamsungSettings = openSamsungSettings;

/* ---------- lối vào: nút Vẽ, menu Tiện ích ---------- */
function samToolbarButton() {
  if (document.querySelector("#samDrawBtn")) return;
  if (!(SAM.samsung || SAM.spen || SAM.sawPen)) return;
  const ref = document.querySelector("#utilBtn") || document.querySelector("#addBtn"); if (!ref) return;
  const b = document.createElement("button"); b.className = "icon"; b.id = "samDrawBtn"; b.type = "button";
  b.title = "Vẽ tay bằng S Pen (theo lực nhấn)"; b.setAttribute("aria-label", "Vẽ tay bằng S Pen");
  b.innerHTML = '<svg class="i" viewBox="0 0 24 24"><path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/><path d="M3 21c3-3 5 1 8-2"/></svg>';
  b.onclick = openPenDraw; ref.after(b);
}
samToolbarButton();
if (typeof utilMenu === "function") {
  const _utilSam = utilMenu;
  utilMenu = function (anchor) {
    _utilSam(anchor); if (!menuEl) return;
    const h = document.createElement("div"); h.className = "mh"; h.textContent = "S Pen · Samsung"; menuEl.appendChild(h);
    for (const [label, run] of [["Vẽ tay bằng S Pen", openPenDraw], ["Cài đặt S Pen và DeX…", openSamsungSettings]]) {
      const b = document.createElement("button"); b.setAttribute("role", "menuitem"); b.textContent = label; b.onclick = () => { closeMenu(); run(); }; menuEl.appendChild(b);
    }
  };
}
document.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === "KeyP" && !tmatch(e, "input,textarea,select") && !document.querySelector(".overlay,.sdraw")) { e.preventDefault(); e.stopImmediatePropagation(); openPenDraw(); } }, true);
// bản Samsung: lần đầu mở thì giới thiệu nhanh
if (SAM.edition === "samsung") {
  let seen = false; try { seen = localStorage.getItem("bravin-sam-intro") === "1"; } catch (_) {}
  if (!seen) setTimeout(() => { try { localStorage.setItem("bravin-sam-intro", "1"); } catch (_) {} toast("Bravin Samsung: rê S Pen để xem chú thích, nút ✎ để vẽ tay, vẫy bút (Air actions) để phát/cắt/hoàn tác."); }, 2500);
}
