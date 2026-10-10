"use strict";
/* ============================================================================
   Home screen (like CapCut's): create project, AI prompt, quick tools,
   templates, your projects (open / rename / duplicate / export / delete).
   ========================================================================== */
let pendingTool = null;
const ASPECTS = [["9:16", "9:16", "TikTok · Reels · Shorts"], ["16:9", "16:9", "YouTube · ngang"], ["1:1", "1:1", "Vuông · Facebook"], ["4:5", "4:5", "Instagram dọc"]];
const homeEl = document.createElement("div"); homeEl.id = "home"; homeEl.setAttribute("role", "main"); homeEl.hidden = true;
homeEl.innerHTML = `
<aside class="hside">
  <div class="brand big"><svg class="i bmark" viewBox="0 0 100 100" aria-hidden="true"><g fill="var(--accent)"><rect x="18" y="14" width="13" height="72" rx="5"/><rect x="35" y="14" width="38" height="20" rx="10"/><rect x="35" y="40" width="31" height="20" rx="10"/><rect x="35" y="66" width="46" height="20" rx="10"/></g><rect x="55.5" y="8" width="4" height="84" rx="2" fill="var(--gold)"/><path d="M51 6H64L57.5 13Z" fill="var(--gold)"/></svg><span>Bravin</span></div>
  <nav class="hnav" aria-label="Trang chủ">
    <button data-go="top" aria-current="page"><svg class="i" viewBox="0 0 24 24"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>Trang chủ</button>
    <button data-go="tpl"><svg class="i" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>Mẫu</button>
    <button data-go="proj"><svg class="i" viewBox="0 0 24 24"><path d="M3 7h6l2 2h10v10H3z"/></svg>Dự án của bạn</button>
    <button data-go="ai"><svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/></svg>Cài đặt AI</button>
    <button data-go="fonts"><svg class="i" viewBox="0 0 24 24"><path d="M4 20 10 5l6 15M6.5 14h7M16 12h4M18 10v6"/></svg>Phông chữ</button>
  </nav>
  <p class="hfoot">Dự án lưu ngay trên thiết bị này. Xuất file .json để chuyển sang máy khác hoặc gửi cho Claude.</p>
</aside>
<section class="hmain">
  <header class="hbig"><h1>Dự án</h1><p id="hCount">Dựng video ngay trên trình duyệt</p></header>
  <button class="hero" id="hNew"><span class="plus">+</span><span><b>Tạo dự án mới</b><small>Chọn khung hình, sau đó thêm video, ảnh và nhạc</small></span></button>
  <div class="hrow">
    <form class="hai" id="hAiForm"><label for="hAi"><svg class="i" viewBox="0 0 24 24"><path d="M12 3l2.5 5.5L20 11l-5.5 2.5L12 19l-2.5-5.5L4 11l5.5-2.5z"/></svg>Bạn muốn dựng gì hôm nay?</label>
      <div class="hai-in"><textarea id="hAi" rows="2" placeholder="Ví dụ: dựng video 30 giây giới thiệu quán cà phê, nhịp nhanh, phụ đề vàng"></textarea><button class="primary" type="submit" aria-label="Gửi cho trợ lý">➤</button></div></form>
    <div class="htools" id="hTools"></div>
  </div>
  <h2 class="hh" id="tplH">Mẫu</h2><div class="hgrid tpl" id="hTpl"></div>
  <div class="hhrow"><h2 class="hh" id="projH">Dự án của bạn</h2><button id="hImport">Nhập file dự án (.json)</button></div>
  <div class="hgrid" id="hProj"></div>
</section>`;
document.body.appendChild(homeEl);
const TOOLS = [
  ["caption", "Phụ đề tự động", "Nhận giọng nói thành phụ đề (AI trên máy)", '<path d="M4 5h16v11H8l-4 4z"/><path d="M8 9h8M8 12h5"/>'],
  ["bgrm", "Tách nền người", "Xoá phông nền sau người (AI trên máy)", '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>'],
  ["tts", "Chữ thành giọng nói", "Tạo giọng đọc từ văn bản", '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 8a5 5 0 0 1 0 8"/>'],
  ["extract", "Tách âm thanh", "Lấy tiếng từ một video", '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/>'],
  ["beats", "Dựng theo nhịp nhạc", "Đánh dấu nhịp để cắt cảnh khớp nhạc", '<path d="M3 12h3l3-8 4 16 3-8h5"/>']
];
function showHome() { saveCurrent(true); pause(); homeEl.hidden = false; document.body.classList.add("athome"); renderHome(); }
function hideHome() { homeEl.hidden = true; document.body.classList.remove("athome"); requestAnimationFrame(() => { renderTimeline(); drawFrame(); }); }
const fmtDate = ms => { const d = new Date(ms), now = new Date(); const same = d.toDateString() === now.toDateString(); return same ? "Hôm nay " + d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }); };
async function renderHome() {
  const tb = $("#hTools"); tb.innerHTML = "";
  for (const [k, n, d, ico] of TOOLS) { const b = document.createElement("button"); b.className = "htool"; b.type = "button"; b.innerHTML = `<svg class="i" viewBox="0 0 24 24">${ico}</svg><b></b><small></small>`; b.querySelector("b").textContent = n; b.querySelector("small").textContent = d; b.onclick = () => runTool(k); tb.appendChild(b); }
  const tp = $("#hTpl"); tp.innerHTML = "";
  const tpls = [...ASPECTS.map(([a, n, d]) => ({ blank: a, name: "Trống " + n, desc: d })), ...(window.__hasTemplate ? [{ v3: true, name: "Dự án mẫu", desc: "Mở project.json mẫu đặt cạnh ứng dụng" }] : [])];
  for (const T of tpls) { const b = document.createElement("button"); b.className = "hcard tplc" + (T.v3 ? " v3" : ""); b.type = "button"; b.innerHTML = `<span class="th${T.blank ? " ar" : ""}"></span><b></b><small></small>`; if (T.blank) { const [w, h] = T.blank.split(":").map(Number); const ar = b.querySelector(".th"); ar.innerHTML = `<i style="aspect-ratio:${w}/${h}"></i>`; } else b.querySelector(".th").style.backgroundImage = "url(s01_th.jpg)"; b.querySelector("b").textContent = T.name; b.querySelector("small").textContent = T.desc; b.onclick = () => T.v3 ? newFromTemplate() : newProject(T.blank); tp.appendChild(b); }
  const list = (await STORE.all().catch(() => [])).sort((a, b) => b.updated - a.updated);
  const pg = $("#hProj"); pg.innerHTML = ""; $("#hCount").textContent = list.length ? `${list.length} dự án lưu trên thiết bị này` : "Chưa có dự án nào trên thiết bị này";
  if (!list.length) { const e = document.createElement("p"); e.className = "note"; e.textContent = "Chưa có dự án nào. Bấm Tạo dự án để bắt đầu."; pg.appendChild(e); }
  for (const r of list) {
    const card = document.createElement("div"); card.className = "hcard proj"; card.tabIndex = 0;
    card.innerHTML = `<span class="th"></span><b></b><small></small><button class="more" aria-label="Tuỳ chọn dự án">⋯</button>`;
    if (r.thumb) card.querySelector(".th").style.backgroundImage = `url(${r.thumb})`; else card.querySelector(".th").classList.add("empty");
    card.querySelector("b").textContent = r.name; card.querySelector("small").textContent = `${fmt(r.duration || 0).replace(/\.\d+$/, "")} · ${r.aspect || "9:16"} · ${fmtDate(r.updated)}`;
    card.dataset.pid = r.id; card.querySelector("b").title = "Bấm đúp để đổi tên"; card.onclick = e => { if (e.target.closest(".more") || e.target.closest(".irn")) return; if (e.target.closest("b")) { clearTimeout(window.__hcardT); window.__hcardT = setTimeout(() => openAndGo(r.id), 280); return; } openAndGo(r.id); };
    card.onkeydown = e => { if (e.key === "Enter") openAndGo(r.id); };
    card.querySelector(".more").onclick = e => { e.stopPropagation(); openMenu(e.currentTarget, [
      { label: "Mở", run: () => openAndGo(r.id) },
      { label: "Đổi tên", run: async () => { const tb = card.querySelector("b"); if (typeof inlineRename === "function" && tb) { inlineRename(tb, r.name, async v => { r.name = v; if (r.data) { const o = JSON.parse(r.data); o.name = v; r.data = JSON.stringify(o); } await STORE.put(r); if (r.id === curProjectId) { projName = v; $("#projBadge").textContent = v; } renderHome(); }); return; } const n = prompt2("Tên dự án", r.name); const v = await n; if (v) { r.name = v; if (r.data) { const o = JSON.parse(r.data); o.name = v; r.data = JSON.stringify(o); } await STORE.put(r); if (r.id === curProjectId) { projName = v; $("#projBadge").textContent = v; } renderHome(); } } },
      { label: "Nhân bản", run: async () => { const id = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); await STORE.put(Object.assign({}, r, { id, name: r.name + " (bản sao)", created: Date.now(), updated: Date.now() })); await STORE.copyBlobs(r.id, id); renderHome(); } },
      { label: "Xuất file .json", run: async () => { const s = await getSaver(); if (!s) { toast("Không lưu được file ở đây."); return; } await s.save({ filename: `vincut-${slug(r.name)}.json`, data: r.data || JSON.stringify({ format: "vincut", name: r.name, aspect: r.aspect, tracks: [], media: [], V: [], C: [] }) }); } },
      { label: "Xoá dự án", run: async () => { if (!(await confirm2(`Xoá dự án "${r.name}"? Video bạn đã nhập trong dự án này cũng bị xoá khỏi thiết bị.`, "Xoá dự án", true))) return; await STORE.del(r.id); await STORE.delBlobs(r.id + ":"); if (r.id === curProjectId) curProjectId = null; renderHome(); toast("Đã xoá dự án."); } }
    ]); };
    pg.appendChild(card);
  }
}
async function openAndGo(id) { if (id !== curProjectId) { await saveCurrent(true); toast("Đang mở dự án…"); await openProjectById(id); } hideHome(); }
function aspectMenu(anchor, fn) { openMenu(anchor, [{ h: "Khung hình" }, ...ASPECTS.map(([a, n, d]) => ({ label: `${n} · ${d}`, run: () => fn(a) }))]); }
async function newProject(aspect, name) { await saveCurrent(true); const id = await createProjectRecord(name || "Dự án " + new Date().toLocaleDateString("vi-VN"), aspect); await openProjectById(id); hideHome(); return id; }
async function templateObj() {
  const r = await fetch("project.json"); if (!r.ok) throw new Error("no template"); const p = await r.json();
  return { format: "vincut", name: p.name, aspect: p.aspect || "9:16", tracks: p.tracks, media: p.media.map(e => ({ id: e.id, name: e.name, kind: e.kind, duration: e.duration, file: e.file, strip: e.strip, thumb: e.thumb, stripN: e.stripN, stripAR: e.stripAR, user: false })), V: p.V, C: p.C, markers: [], coverT: null };
}
async function newFromTemplate() { await saveCurrent(true); const o = await templateObj(); const id = await createProjectRecord(o.name, o.aspect); toast("Đang mở mẫu…"); await openProjectById(id, o); hideHome(); }
function runTool(k) {
  const needVideo = fn => { newProject("9:16", TOOLS.find(x => x[0] === k)[1]).then(() => { pendingTool = m => { if (m.kind === "audio" && k !== "beats") { toast("Hãy chọn một video."); return; } appendMedia(m); fn(m); }; $("#file").click(); toast("Chọn " + (k === "beats" ? "bài nhạc" : "video") + " từ thiết bị."); }); };
  if (k === "caption") needVideo(() => setTimeout(openAutoCaptions, 300));
  else if (k === "bgrm") needVideo(() => { const c = V[V.length - 1]; if (c) { pushUndo(); c.bgRemove = true; sel = { k: "v", id: c.id }; inspTabs.video = "key"; renderAll(); if (window.SEG) SEG.ensure(); openSheet("insp"); } });
  else if (k === "tts") newProject("9:16", "Giọng đọc").then(() => setTimeout(openTTS, 200));
  else if (k === "extract") needVideo(() => { const c = V[V.length - 1]; if (c) setTimeout(() => extractAudioFromClip(c, "v"), 400); });
  else if (k === "beats") needVideo(m => { setTimeout(() => { const c = C.find(x => x.mediaId === m.id); if (c) markBeats(c); }, 300); });
}
function prompt2(label, value) { return new Promise(res => { const ov = document.createElement("div"); ov.className = "overlay"; ov.innerHTML = `<form class="dialog" style="max-width:420px"><h2></h2><input type="text" style="width:100%"><div class="row" style="justify-content:flex-end;margin-top:12px"><button type="button" class="no">Huỷ</button><button class="primary" type="submit">Lưu</button></div></form>`; ov.querySelector("h2").textContent = label; const i = ov.querySelector("input"); i.value = value || ""; document.body.appendChild(ov); i.focus(); i.select(); ov.querySelector(".no").onclick = () => { ov.remove(); res(null); }; ov.querySelector("form").onsubmit = e => { e.preventDefault(); ov.remove(); res(i.value.trim() || null); }; }); }
function confirm2(msg, okLabel, danger) { return new Promise(res => { const ov = document.createElement("div"); ov.className = "overlay"; ov.innerHTML = `<div class="dialog" style="max-width:420px"><p></p><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="no">Huỷ</button><button class="primary yes">Đồng ý</button></div></div>`; ov.querySelector("p").textContent = msg; const yb = ov.querySelector(".yes"); if (okLabel) yb.textContent = okLabel; if (danger) yb.classList.add("danger"); document.body.appendChild(ov); yb.focus(); ov.querySelector(".no").onclick = () => { ov.remove(); res(false); }; ov.querySelector(".yes").onclick = () => { ov.remove(); res(true); }; }); }
$("#hNew").onclick = e => aspectMenu(e.currentTarget, a => newProject(a));
$("#hImport").onclick = () => $("#projFile").click();
$("#newProj").onclick = e => aspectMenu(e.currentTarget, a => newProject(a));
$("#newProj").title = "Tạo dự án mới (dự án hiện tại đã tự lưu)";
$("#hAiForm").onsubmit = async e => { e.preventDefault(); const v = $("#hAi").value.trim(); if (!v) return; $("#hAi").value = ""; await newProject("9:16", v.slice(0, 40)); showTab("ai"); if (typeof openSheet === "function") openSheet("ai");
  // dự án vừa tạo còn trống: chưa gửi lệnh ngay, để người dùng nhập tư liệu (và kết nối AI nếu cần) trước
  const aiOk = typeof aiConnected === "function" && !!aiConnected();
  setTimeout(() => { $("#aiIn").value = v; addMsg("c", "Đã tạo dự án mới. Hãy **nhập video, ảnh hoặc nhạc** trước (nút **+** ở Thư viện) để trợ lý có tư liệu, rồi bấm **Gửi**. Lệnh của bạn đã nằm sẵn trong ô." + (aiOk ? "" : "\n\nTrợ lý chưa có AI: dán mã API model của bạn vào ô bên dưới.")); if (!aiOk && typeof aiConnectCard === "function") aiConnectCard(); }, 300); };
homeEl.querySelector(".hnav").onclick = e => { const b = e.target.closest("button"); if (!b) return; homeEl.querySelectorAll(".hnav button").forEach(x => x.removeAttribute("aria-current")); b.setAttribute("aria-current", "page"); const go = b.dataset.go; if (go === "fonts") { homeEl.querySelectorAll(".hnav button").forEach(x => x.removeAttribute("aria-current")); homeEl.querySelector('.hnav [data-go="top"]')?.setAttribute("aria-current", "page"); if (window.openFonts) openFonts(); return; } if (go === "ai") { hideHome(); showTab("ai"); if (typeof openSheet === "function") openSheet("ai"); setTimeout(() => $("#aiCfgBtn")?.click(), 200); return; } const tgt = { top: ".hero", tpl: "#tplH", proj: "#projH" }[go]; homeEl.querySelector(tgt)?.scrollIntoView({ behavior: "smooth", block: "start" }); };
// editor → home button + rename by double-click on the project badge
(function () { const hb = document.createElement("button"); hb.id = "homeBtn"; hb.className = "icon"; hb.title = "Về màn hình dự án"; hb.setAttribute("aria-label", "Về màn hình dự án"); hb.innerHTML = '<svg class="i" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg><span>Dự án</span>'; hb.onclick = showHome; const top = $(".top"); top.insertBefore(hb, top.firstChild);
  $("#projBadge").title = "Bấm đúp để đổi tên dự án"; $("#projBadge").ondblclick = async () => { const v = await prompt2("Tên dự án", projName); if (v) { projName = v; $("#projBadge").textContent = v; saveCurrent(true); } }; })();
async function initHome() {
  try { const r = await fetch("project.json", { method: "HEAD" }); window.__hasTemplate = r.ok; } catch (_) { window.__hasTemplate = false; }
  let list = await STORE.all().catch(() => []);
  if (!list.length && window.__hasTemplate) { try { const o = await templateObj(); const id = await createProjectRecord(o.name, o.aspect); const rec = await STORE.get(id); rec.data = JSON.stringify(o); rec.thumb = "s01_th.jpg"; rec.duration = (o.V || []).reduce((a, c) => a + (c.freeze ? c.dur : (c.out - c.in) / (c.speed || 1)), 0); await STORE.put(rec); } catch (_) {} }
  if (!STORE.available()) toast("Trình duyệt này không cho lưu dự án lâu dài. Hãy xuất file .json khi xong.");
  showHome();
}
