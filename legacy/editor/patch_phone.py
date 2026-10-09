import sys
p='p/index.html'; s=open(p,encoding='utf-8').read()
def rep(a,b):
    global s
    n=s.count(a)
    if n!=1: sys.exit(f"count {n}: {a[:80]}")
    s=s.replace(a,b)
rep('<section class="panel" aria-label="Thư viện">','<section class="panel" id="libPanel" aria-label="Thư viện">')
rep('<section class="panel" aria-label="Trợ lý và thuộc tính">','<section class="panel" id="sidePanel" aria-label="Trợ lý và thuộc tính">')
rep('    <button class="primary" id="exportBtn">', '    <button class="icon" id="moreBtn" title="Thêm" aria-label="Thêm tuỳ chọn"><svg class="i" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></button>\n    <button class="primary" id="exportBtn">')
rep('''    <div class="scroller" id="scroller"><div class="grid" id="grid"></div></div>
  </section>
</div>''', '''    <div class="scroller" id="scroller"><div class="grid" id="grid"></div></div>
  </section>
  <nav class="mtabs" id="mtabs" aria-label="Bảng điều khiển">
    <button data-sheet="lib"><svg class="i" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/></svg><span>Thư viện</span></button>
    <button data-act="import"><svg class="i" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg><span>Nhập</span></button>
    <button data-act="text"><svg class="i" viewBox="0 0 24 24"><path d="M5 6V4h14v2M12 4v16M9 20h6"/></svg><span>Chữ</span></button>
    <button data-sheet="insp"><svg class="i" viewBox="0 0 24 24"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg><span>Thuộc tính</span></button>
    <button data-sheet="ai"><span class="dot"></span><span>Trợ lý</span></button>
  </nav>
</div>''')
css = r'''
/* ---------- phone layout (Android app, mobile browsers): preview / timeline / tab bar + slide-up sheets ---------- */
#moreBtn,.mtabs{display:none}
body.phone{--tabh:56px;overflow:hidden}
body.phone .app{height:100dvh;padding:0 6px calc(env(safe-area-inset-bottom) + 0px);gap:6px;grid-template-rows:auto minmax(110px,1fr) 0 minmax(0,var(--mtl,47dvh)) var(--tabh)}
body.phone .top{padding-top:6px;gap:6px;flex-wrap:nowrap}
body.phone .top .badge,body.phone .top label[for=aspect],body.phone #aspect,body.phone #openProj,body.phone #newProj{display:none}
body.phone #saveProj{font-size:0;gap:0;padding:7px 9px}
body.phone #moreBtn{display:inline-flex}
body.phone #exportBtn{padding:7px 10px}
body.phone .main{display:flex;min-height:0}
body.phone .stage{flex:1;min-width:0;padding:0;gap:6px}
body.phone .transport{gap:6px;flex-wrap:nowrap}
body.phone .transport button{padding:6px 9px}
body.phone .tc{font-size:12px}
body.phone .split{display:none}
body.phone .tl{height:auto;min-height:0;max-height:none}
body.phone .tlbar{flex-wrap:nowrap;overflow-x:auto;padding:5px 6px;gap:4px;scrollbar-width:none}
body.phone .tlbar::-webkit-scrollbar{display:none}
body.phone .tlbar button{padding:6px 7px;flex:none}
body.phone .tlbar .zoom{margin-left:0}
body.phone .tlbar .zoom input{width:84px}
body.phone{--headw:112px}
body.phone .thead{gap:1px;padding:0 2px 0 6px}
body.phone .thead .tb{padding:3px}
body.phone #libPanel,body.phone #sidePanel{position:fixed;left:0;right:0;bottom:var(--tabh);height:min(66dvh,560px);z-index:40;border-radius:14px 14px 0 0;transform:translateY(115%);transition:transform .22s ease;box-shadow:0 -12px 32px rgba(0,0,0,.55)}
body.phone #libPanel.open,body.phone #sidePanel.open{transform:none}
body.phone.dragout #libPanel{transform:translateY(115%)}
body.phone .bin{grid-template-columns:repeat(3,minmax(0,1fr));max-height:none}
body.phone .mitem{height:118px}
body.phone .ph .sheetx{display:inline-flex}
.ph .sheetx{display:none;padding:4px 8px}
body.phone .mtabs{display:flex;align-items:stretch;justify-content:space-around;border-top:1px solid var(--line);background:var(--bg);margin:0 -6px}
.mtabs button{flex:1;flex-direction:column;gap:3px;border:0;background:none;border-radius:0;font-size:10.5px;font-weight:600;color:var(--muted);padding:6px 2px;justify-content:center}
.mtabs button svg.i{width:20px;height:20px}
.mtabs button[aria-pressed=true]{color:var(--accent)}
.mtabs .dot{width:20px;height:20px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#7fd8f5,var(--accent) 55%,var(--accent2));display:block}
body.phone.land .app{grid-template-columns:minmax(0,34%) minmax(0,1fr);grid-template-rows:auto minmax(0,1fr) var(--tabh)}
body.phone.land .top{grid-column:1/-1}
body.phone.land .main{grid-column:1;grid-row:2}
body.phone.land .tl{grid-column:2;grid-row:2}
body.phone.land .mtabs{grid-column:1/-1;grid-row:3}
body.phone.land .split{display:none}
body.phone.land #libPanel,body.phone.land #sidePanel{left:auto;top:0;width:min(440px,62vw);height:auto;border-radius:14px 0 0 14px;transform:translateX(110%)}
body.phone.land #libPanel.open,body.phone.land #sidePanel.open{transform:none}
body.phone.land.dragout #libPanel{transform:translateX(110%)}
body.phone .restorebar{bottom:calc(var(--tabh) + 10px)}
'''
rep('@media (prefers-reduced-motion:reduce)', css.strip()+'\n@media (prefers-reduced-motion:reduce)')
js = r'''
/* ---------- phone layout wiring ---------- */
(function phoneUI() {
  const lib = $("#libPanel"), side = $("#sidePanel"), tabs = $("#mtabs");
  [lib, side].forEach(pn => { const x = document.createElement("button"); x.className = "icon sheetx"; x.setAttribute("aria-label", "Đóng"); x.textContent = "✕"; x.onclick = () => closeSheets(); pn.querySelector(".ph").appendChild(x); });
  let cur = null;
  function mark() { tabs.querySelectorAll("button[data-sheet]").forEach(b => b.setAttribute("aria-pressed", b.dataset.sheet === cur)); }
  window.openSheet = which => { if (!document.body.classList.contains("phone")) { if (which !== "lib") showTab(which); return; } cur = which; lib.classList.toggle("open", which === "lib"); side.classList.toggle("open", which === "ai" || which === "insp"); if (which === "ai" || which === "insp") showTab(which); mark(); };
  window.closeSheets = () => { cur = null; lib.classList.remove("open"); side.classList.remove("open"); mark(); };
  tabs.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.sheet) { if (cur === b.dataset.sheet) closeSheets(); else openSheet(b.dataset.sheet); return; }
    if (b.dataset.act === "import") $("#file").click();
    if (b.dataset.act === "text") { $("#textBtn").click(); openSheet("insp"); } });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && cur) closeSheets(); });
  // library drag: hide the sheet while the finger carries a clip to the timeline
  new MutationObserver(() => { document.body.classList.toggle("dragout", !!document.querySelector(".dragcard")); if (!document.querySelector(".dragcard") && document.body.classList.contains("dragout")) {} }).observe(document.body, { childList: true });
  const tidy = () => { if (!document.querySelector(".dragcard") && document.body.classList.contains("dragout")) { document.body.classList.remove("dragout"); closeSheets(); } };
  window.addEventListener("pointerup", () => setTimeout(tidy, 0), true);
  // "⋯" menu: the top-bar actions that do not fit on a phone
  $("#moreBtn").onclick = e => openMenu(e.currentTarget, [
    { h: "Khung hình" },
    ...[["9:16", "9:16 · TikTok/Reels"], ["16:9", "16:9 · YouTube"], ["1:1", "1:1 · Vuông"]].map(([v, l]) => ({ label: ($("#aspect").value === v ? "✓ " : "") + l, run: () => { const a = $("#aspect"); a.value = v; a.dispatchEvent(new Event("change")); } })),
    { h: "Dự án" },
    { label: "Lưu dự án", run: () => $("#saveProj").click() }, { label: "Mở dự án", run: () => $("#openProj").click() }, { label: "Dự án mới", run: () => $("#newProj").click() } ]);
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
'''
rep('(async function boot() {', js.strip()+'\n(async function boot() {')
open(p,'w',encoding='utf-8').write(s); print('ok')
