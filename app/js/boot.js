"use strict";
/* Android back button / Esc: close what is open, else go back to the project screen */
window.vincutBack = () => {
  const ov = document.querySelector(".overlay, .menu"); if (ov) { if (ov.classList.contains("menu")) closeMenu(); else { const no = ov.querySelector("#trCancel, .no, #ttsNo, [data-close]"); if (no) no.click(); else ov.remove(); } return 1; }
  if (document.querySelector("#libPanel.open, #sidePanel.open")) { closeSheets(); return 1; }
  if (homeEl.hidden) { showHome(); return 1; }
  return 0;
};
(async function boot() {
  setupAssetTabs(); initAI(); renderAll();
  try { await Promise.all(["800 62px Montserrat", "900 70px Montserrat", 'italic 700 72px "Playfair Display"'].map(f => document.fonts.load(f))); } catch (_) {}
  await initHome();
})();
