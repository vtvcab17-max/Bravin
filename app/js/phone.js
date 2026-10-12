"use strict";
/* ---------- phone layout wiring ---------- */
(function phoneUI() {
  const lib = $("#libPanel"), side = $("#sidePanel"), tabs = $("#mtabs");
  [lib, side].forEach(pn => { const x = document.createElement("button"); x.className = "icon sheetx"; x.setAttribute("aria-label", "Đóng"); x.textContent = "✕"; x.onclick = () => closeSheets(); pn.querySelector(".ph").appendChild(x); });
  let cur = null;
  function mark() { tabs.querySelectorAll("button[data-sheet]").forEach(b => b.setAttribute("aria-pressed", b.dataset.sheet === cur)); }
  window.openSheet = which => { if (!document.body.classList.contains("phone")) { if (which !== "lib") showTab(which); return; } cur = which; lib.classList.toggle("open", which === "lib"); side.classList.toggle("open", which === "ai" || which === "insp"); side.classList.toggle("ins", which === "insp"); if (which === "ai" || which === "insp") showTab(which); mark(); };
  window.closeSheets = () => { cur = null; lib.classList.remove("open"); side.classList.remove("open"); mark(); };
  tabs.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.sheet) { if (cur === b.dataset.sheet) closeSheets(); else openSheet(b.dataset.sheet); return; }
    if (b.dataset.act === "import") $("#file").click();
    if (b.dataset.act === "text") { openSheet("lib"); showAssets("text"); } });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && cur) closeSheets(); });
  // library drag: hide the sheet while the finger carries a clip to the timeline
  new MutationObserver(() => { if (document.querySelector(".dragcard")) document.body.classList.add("dragout"); }).observe(document.body, { childList: true });
  const tidy = () => { if (!document.querySelector(".dragcard") && document.body.classList.contains("dragout")) { document.body.classList.remove("dragout"); closeSheets(); } };
  window.addEventListener("pointerup", () => setTimeout(tidy, 0), true);
  // "⋯" menu: the top-bar actions that do not fit on a phone
  $("#moreBtn").onclick = e => openMenu(e.currentTarget, [
    { h: "Khung hình" },
    ...[["9:16", "9:16 · TikTok/Reels"], ["16:9", "16:9 · YouTube"], ["1:1", "1:1 · Vuông"], ["4:5", "4:5 · Instagram"]].map(([v, l]) => ({ label: ($("#aspect").value === v ? "✓ " : "") + l, run: () => { const a = $("#aspect"); a.value = v; a.dispatchEvent(new Event("change")); } })),
    ...((typeof openLMD === "function" || typeof openJizura === "function") ? [{ h: "Khu làm việc" }] : []),
    ...(typeof openLMD === "function" ? [{ label: "Phim AI (LocalMiniDrama)", run: () => openLMD() }] : []),
    ...(typeof openJizura === "function" ? [{ label: "JIZURA (lời bài hát)", run: () => openJizura() }] : []),
    { h: "Dự án" },
    { label: "Về màn hình dự án", run: () => showHome() }, { label: "Xuất file dự án (.json)", run: () => $("#saveProj").click() }, { label: "Nhập file dự án (.json)", run: () => $("#openProj").click() }, { label: "Dự án mới", run: () => newProject($("#aspect").value) } ]);
  // pinch on the timeline to zoom
  let pinch = null; const dist = ts => Math.hypot(ts[0].clientX - ts[1].clientX, ts[0].clientY - ts[1].clientY);
  scroller.addEventListener("touchstart", e => { if (e.touches.length === 2) pinch = { d: dist(e.touches), z: pps }; }, { passive: true });
  scroller.addEventListener("touchmove", e => { if (pinch && e.touches.length === 2) { e.preventDefault(); const z = clamp(pinch.z * dist(e.touches) / pinch.d, 6, 260); if (Math.abs(z - pps) > 0.5) setZoom(z); } }, { passive: false });
  scroller.addEventListener("touchend", e => { if (e.touches.length < 2) pinch = null; });
  function layout() { const w = innerWidth, h = innerHeight, ph = w < 900 || h < 560; const b = document.body;
    const was = b.classList.contains("phone") + "" + b.classList.contains("land");
    b.classList.toggle("phone", ph); b.classList.toggle("land", ph && w > h && h < 560);
    if (!ph) closeSheets();
    if (was !== b.classList.contains("phone") + "" + b.classList.contains("land")) requestAnimationFrame(() => { renderTimeline(); drawFrame(); }); }
  layout(); window.addEventListener("resize", layout);
})();
