"use strict";
/* ============================================================================
   Khu JIZURA: gắn NGUYÊN BẢN JIZURA (MIT, © 2026 hakoniwa, jizura/index.html)
   vào Bravin và đồng bộ với timeline. Không sửa mã JIZURA: chỉ dùng các cổng
   nhúng công khai của nó — J.ui (trạng thái: project, plan, audio, t, playing),
   J.uiApi (loadAudioFile, seek, pause, replan, syncUI) và J.Renderer.
   - Một iframe JIZURA sống suốt phiên (ẩn khi không mở khu), cùng nguồn gốc.
   - "Lấy nhạc từ timeline": đưa bài nhạc của timeline sang JIZURA, khung hình theo dự án.
   - "Đưa lên timeline": tạo / cập nhật clip c.type = "jz" trên track "JIZURA".
     Clip giữ thời gian bên trong JIZURA bằng in/out (giây của bài nhạc) và bản
     sao dự án JIZURA (c.jz.project) để mở lại dự án sau này.
   - Bravin vẽ lớp này trực tiếp bằng J.Renderer theo kim timeline (xem trước và
     xuất video), nền trong suốt (hoặc giữ nền JIZURA) → luôn khớp, không cần xuất
     MP4 rồi nhập lại. Phông chữ nằm trong tài liệu của iframe nên khung được vẽ
     trên canvas của iframe rồi chép sang Bravin.
   - Kim đồng bộ hai chiều khi khu đang mở.
   ========================================================================== */
const JZ = { frame: null, win: null, ready: null, open: false, canvas: null, R: null, lastT: null, poll: 0, panel: null };
const jzLayer = () => C.find(c => c.type === "jz") || null;
const jzSong = () => C.filter(c => c.type === "audio" && media.get(c.mediaId)).sort((a, b) => clen(b) - clen(a))[0] || null;

/* ---------- iframe JIZURA (tạo một lần) ---------- */
function jzEnsure() {
  if (JZ.ready) return JZ.ready;
  JZ.ready = new Promise((res, rej) => {
    const f = document.createElement("iframe"); f.className = "jzframe"; f.title = "JIZURA"; f.src = "jizura/index.html"; f.setAttribute("allow", "autoplay; fullscreen");
    document.body.appendChild(f); JZ.frame = f;
    const t0 = performance.now();
    const wait = () => { const w = f.contentWindow; if (w && w.J && w.J.ui && w.J.ui.plan && w.J.uiApi) { JZ.win = w; JZ.R = new w.J.Renderer(); try { w.J.uiApi.pause(); } catch (_) {} res(w); } else if (performance.now() - t0 > 20000) { JZ.ready = null; rej(new Error("Không mở được JIZURA (jizura/index.html).")); } else setTimeout(wait, 120); };
    f.addEventListener("load", wait); setTimeout(wait, 400);
  });
  return JZ.ready;
}

/* ---------- vẽ lớp JIZURA trong Bravin ---------- */
function jzDraw(ctx, c, lt) {
  const w = JZ.win; if (!w || !w.J || !w.J.ui || !w.J.ui.plan) { jzEnsure().then(() => { if (!playing) drawFrame(); }).catch(() => {}); return null; }
  const plan = w.J.ui.plan, W = ctx.canvas.width, H = ctx.canvas.height;
  if (!JZ.canvas) JZ.canvas = w.document.createElement("canvas");
  const k = JZ.canvas; if (k.width !== W || k.height !== H) { k.width = W; k.height = H; }
  const tj = (c.in || 0) + Math.max(0, lt);
  try { JZ.R.frame(k.getContext("2d"), plan, Math.min(tj, Math.max(0, plan.duration - 1e-3)), { scale: W / plan.W, transparent: !(c.jz && c.jz.bg) }); } catch (e) { console.warn("JIZURA vẽ lỗi", e); return null; }
  const X = typeof xform === "function" ? xform(c, lt, clen(c)) : { opacity: 1 };
  ctx.save(); ctx.globalAlpha *= X.opacity == null ? 1 : X.opacity; ctx.drawImage(k, 0, 0, W, H); ctx.restore();
  return null; // lớp phủ kín khung: không nhận bấm chọn trên khung xem trước (chọn ở timeline)
}
const _drawTextLikeJz = drawTextLike;
drawTextLike = function (ctx, c, lt) { return c.type === "jz" ? jzDraw(ctx, c, lt) : _drawTextLikeJz(ctx, c, lt); };

/* ---------- đồng bộ dữ liệu ---------- */
const JZ_ASPECTS = ["16:9", "9:16", "1:1", "4:5"];
async function jzPullSong(silent) {
  const w = await jzEnsure(), a = jzSong(), ui = w.J.ui;
  const asp = $("#aspect").value; if (JZ_ASPECTS.includes(asp) && ui.project.aspect !== asp) { ui.project.aspect = asp; w.J.uiApi.replan(); try { w.J.uiApi.syncUI(); } catch (_) {} }
  if (!a) { if (!silent) toast("Timeline chưa có bài nhạc. Thêm nhạc vào track Âm thanh, hoặc nạp nhạc ngay trong JIZURA."); return false; }
  const m = media.get(a.mediaId); let blob = m.blob; if (!blob && m.url) { try { blob = await (await fetch(m.url)).blob(); } catch (_) {} }
  if (!blob) { if (!silent) toast("Không đọc được file nhạc."); return false; }
  if (ui.audio && ui.project.audioName === m.name && JZ.songId === m.id) return true;
  const ok = await w.J.uiApi.loadAudioFile(new File([blob], m.name, { type: blob.type || "audio/mpeg" })); JZ.songId = m.id;
  if (!silent) toast(ok === false ? "JIZURA không đọc được bài nhạc này." : `Đã đưa "${m.name}" sang JIZURA.`);
  return ok !== false;
}
function jzPush() {
  const w = JZ.win; if (!w) return null; const ui = w.J.ui, plan = ui.plan, a = jzSong();
  pushUndo();
  let c = jzLayer(); const start = a ? a.start : 0, inT = a ? (a.in || 0) : 0, out = a ? Math.min(plan.duration, a.out) : plan.duration;
  if (!c) { let tr = tracks.find(t => t.jz); if (!tr) { tr = addTrack("text"); tr.name = "JIZURA"; tr.jz = 1; } c = { id: nid("c"), track: tr.id, type: "jz", start, in: inT, out: Math.max(inT + 0.5, out), jz: {} }; C.push(c); }
  else { c.start = start; c.in = inT; c.out = Math.max(inT + 0.5, out); }
  c.jz = Object.assign({}, c.jz, { project: JSON.parse(JSON.stringify(ui.project)), title: ui.project.title || (ui.project.lyrics || "").split(/\n/).find(s => s.trim() && !s.trim().startsWith("#")) || "Video lời bài hát" });
  sel = { k: "c", id: c.id }; renderAll(); drawFrame(); return c;
}
async function jzRestore() { // mở lại dự án có lớp JIZURA: nạp dự án JIZURA đã lưu + bài nhạc
  const c = jzLayer(); if (!c || !c.jz || !c.jz.project) return;
  const w = await jzEnsure(); const ui = w.J.ui;
  if (JSON.stringify(ui.project) !== JSON.stringify(c.jz.project)) { ui.project = JSON.parse(JSON.stringify(c.jz.project)); w.J.uiApi.replan(); try { w.J.uiApi.syncUI(); } catch (_) {} }
  await jzPullSong(true); if (!playing) drawFrame();
}

/* ---------- khu JIZURA ---------- */
function openJizura() {
  if (JZ.open) return; JZ.open = true; pause();
  const p = document.createElement("div"); p.className = "jzpanel"; p.setAttribute("role", "dialog"); p.setAttribute("aria-label", "Khu JIZURA");
  p.innerHTML = `<header class="jzbar"><b>JIZURA</b><span class="jzsub">Video lời bài hát · bản gốc MIT © 2026 hakoniwa · <a href="jizura/LICENSE.txt" target="_blank" rel="noopener">giấy phép</a></span><span class="jzst" role="status"></span><span class="spacer"></span>
    <label class="chk" title="Bỏ chọn = chữ JIZURA chồng lên video (nền trong suốt)"><input type="checkbox" id="jzBg"> Giữ nền JIZURA</label>
    <button type="button" id="jzSong">Lấy nhạc từ timeline</button><button type="button" class="primary" id="jzPush"></button><button type="button" id="jzDone">Về timeline</button></header>
    <div class="jzhost"></div>`;
  document.body.appendChild(p); document.body.classList.add("jzopen"); JZ.panel = p;
  const st = s => p.querySelector(".jzst").textContent = s;
  const lay = jzLayer(); p.querySelector("#jzPush").textContent = lay ? "Cập nhật lớp trên timeline" : "Đưa lên timeline"; p.querySelector("#jzBg").checked = !!(lay && lay.jz && lay.jz.bg);
  st("Đang mở JIZURA…");
  jzEnsure().then(async w => {
    JZ.frame.classList.add("show"); place(); st("");
    if (lay) await jzRestore(); else await jzPullSong(true);
    const c = jzLayer(); const tj = c ? (c.in || 0) + (t - c.start) : t; try { w.J.uiApi.seek(Math.max(0, tj)); } catch (_) {}
    JZ.lastT = w.J.ui.t;
    JZ.poll = setInterval(() => { // kim JIZURA → kim timeline
      const ui = w.J.ui; if (ui.t === JZ.lastT) return; JZ.lastT = ui.t; const c2 = jzLayer(); t = clamp(c2 ? c2.start + (ui.t - (c2.in || 0)) : ui.t, 0, Math.max(total(), 0)); placePlayhead();
    }, 120);
  }).catch(e => st(e.message));
  const place = () => { const h = p.querySelector(".jzhost").getBoundingClientRect(); Object.assign(JZ.frame.style, { left: h.left + "px", top: h.top + "px", width: h.width + "px", height: h.height + "px" }); };
  JZ.place = place; window.addEventListener("resize", place);
  p.querySelector("#jzSong").onclick = () => jzPullSong(false);
  p.querySelector("#jzPush").onclick = () => { const c = jzPush(); if (!c) return; c.jz.bg = p.querySelector("#jzBg").checked; p.querySelector("#jzPush").textContent = "Cập nhật lớp trên timeline"; st(`Đã ${c ? "đặt" : ""} lớp JIZURA ${fmt(c.start)} → ${fmt(c.start + clen(c))} trên track "JIZURA".`); };
  p.querySelector("#jzBg").onchange = e => { const c = jzLayer(); if (c) { c.jz.bg = e.target.checked; drawFrame(); } };
  p.querySelector("#jzDone").onclick = closeJizura;
}
function closeJizura() {
  if (!JZ.open) return; JZ.open = false; clearInterval(JZ.poll); window.removeEventListener("resize", JZ.place || (() => {}));
  try { JZ.win && JZ.win.J.uiApi.pause(); JZ.win && JZ.win.J.uiApi.flushSave && JZ.win.J.uiApi.flushSave(); } catch (_) {}
  const c = jzLayer(); if (c && JZ.win) c.jz.project = JSON.parse(JSON.stringify(JZ.win.J.ui.project)); // giữ bản sửa mới nhất trong dự án Bravin
  if (JZ.frame) { JZ.frame.classList.remove("show"); JZ.frame.removeAttribute("style"); }
  JZ.panel && JZ.panel.remove(); document.body.classList.remove("jzopen"); renderAll(); drawFrame();
}
window.openJizura = openJizura;

/* ---------- bảng Thuộc tính cho clip JIZURA ---------- */
function jzInspector(box, c) {
  const b = el("div", "isec"); b.innerHTML = `<p class="note">Lớp chữ do JIZURA dựng, Bravin vẽ trực tiếp theo kim timeline (xem trước và xuất video). Sửa lời, kiểu, chuyển động trong khu JIZURA.</p>`;
  const r = el("div", "row"); const o = el("button", "primary", "Mở khu JIZURA"); o.type = "button"; o.onclick = openJizura;
  const bg = el("label", "chk"); const cb = el("input"); cb.type = "checkbox"; cb.checked = !!(c.jz && c.jz.bg); cb.onchange = () => { pushUndo(); c.jz.bg = cb.checked; drawFrame(); }; bg.append(cb, document.createTextNode(" Giữ nền JIZURA"));
  r.append(o, bg); b.appendChild(r); box.appendChild(b);
  if (typeof slider === "function") slider(box, { label: "Độ mờ lớp", min: 0, max: 1, step: 0.01, get: () => c.opacity == null ? 1 : c.opacity, set: v => { c.opacity = v; } });
}
const _renderInspector0Jz = renderInspector0;
renderInspector0 = function () { const c = typeof findSel === "function" ? findSel() : null; if (c && c.type === "jz" && !(sel && sel.k === "tr")) { const box = $("#insp"); box.innerHTML = ""; const head = el("div", "ihead"); const nm = el("b"); nm.textContent = textLabel(c); const meta = el("span", "tc"); meta.textContent = `${fmt(c.start)} · dài ${fmt(clen(c))}`; head.append(nm, meta); box.appendChild(head); jzInspector(box, c); return; } return _renderInspector0Jz(); };

/* ---------- lối vào: thanh trên cùng, tab Chữ, trang chủ ---------- */
(function jzEntry() {
  const hb = document.createElement("button"); hb.id = "jzBtn"; hb.type = "button"; hb.title = "Khu JIZURA: video lời bài hát (đồng bộ với timeline)";
  hb.innerHTML = '<svg class="i" viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>JIZURA';
  hb.onclick = openJizura; const ex = $("#exportBtn"); if (ex && ex.parentNode) ex.parentNode.insertBefore(hb, ex);
  TOOLS.push(["jizura", "JIZURA (lời bài hát)", "Mở nguyên bản JIZURA, đồng bộ với timeline", '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>']);
  const _rt = runTool; runTool = function (k) { if (k !== "jizura") return _rt(k); newProject("9:16", "JIZURA").then(() => setTimeout(openJizura, 200)); };
})();
// tab Chữ: thêm nút sau khi Thư viện vẽ lại
new MutationObserver(() => { const ly = [...document.querySelectorAll("button")].find(b => b.textContent === "Video lời bài hát" && !b.nextElementSibling?.classList?.contains("jzlib")); if (ly) { const j = document.createElement("button"); j.type = "button"; j.className = "jzlib"; j.textContent = "Khu JIZURA"; j.onclick = openJizura; ly.after(j); } }).observe(document.body, { childList: true, subtree: true });

/* ---------- vòng đời dự án và xuất video ---------- */
const _lpoJz = loadProjectObj; loadProjectObj = async function (o, opts) { const r = await _lpoJz(o, opts); if (C.some(c => c.type === "jz")) jzRestore().catch(() => {}); return r; };
$("#exportBtn").onclick = async () => { if (jzLayer()) { try { toast("Đang chuẩn bị lớp JIZURA…"); await jzRestore(); } catch (e) { toast(e.message); return; } } startExport(); };
