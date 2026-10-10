"use strict";
/* ============================================================================
   Workspace: double-click inline rename everywhere, multi-selection
   (Shift/Ctrl+click, marquee drag, Ctrl+A) with group operations,
   context menus (clip, multi, empty timeline, ruler, track, preview,
   library, panels), resizable / collapsible panels with edge menus,
   and screen detection with auto layout, full screen and a second-screen
   program monitor.
   ========================================================================== */

/* ---------- inline rename ---------- */
function inlineRename(target, current, commit, opts = {}) {
  if (!target || target.querySelector(".irn")) return; const inp = document.createElement("input"); inp.type = "text"; inp.className = "irn"; inp.value = current || ""; inp.setAttribute("aria-label", opts.label || "Đổi tên");
  const keep = target.innerHTML; target.textContent = ""; target.appendChild(inp); inp.focus(); inp.select();
  let done = false; const fin = ok => { if (done) return; done = true; const v = inp.value.trim(); target.innerHTML = keep; if (ok && v && v !== current) commit(v); else if (opts.cancel) opts.cancel(); };
  inp.addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); fin(true); } else if (e.key === "Escape") { e.preventDefault(); fin(false); } });
  inp.addEventListener("blur", () => fin(true)); inp.addEventListener("pointerdown", e => e.stopPropagation()); inp.addEventListener("dblclick", e => e.stopPropagation()); inp.addEventListener("click", e => e.stopPropagation());
}
async function renameProject(v) { projName = v; $("#projBadge").textContent = v; await saveCurrent(true); if (typeof renderHome === "function" && document.body.classList.contains("athome")) renderHome(); toast("Đã đổi tên dự án."); }
(function bindBadge() { const b = $("#projBadge"); if (!b) return; b.title = "Bấm đúp để đổi tên dự án"; b.ondblclick = e => { e.preventDefault(); inlineRename(b, projName, renameProject, { label: "Tên dự án" }); }; })();
function renameMedia(m) {
  const d = document.querySelector(`.mitem[data-mid="${m.id}"] .mname`); const apply = v => { pushUndo(); m.name = v; renderBin(); renderTimeline(); toast("Đã đổi tên media."); };
  if (d) inlineRename(d, m.name, apply, { label: "Tên media" }); else prompt2("Tên media", m.name).then(v => v && apply(v));
}
function renameClip(c) {
  const d = grid.querySelector(`.clip[data-id="${c.id}"]`), label = d ? (d.querySelector(".cl") || {}).textContent || "" : ""; const apply = v => { pushUndo(); c.name = v; renderTimeline(); renderInspector(); toast("Đã đổi tên clip."); };
  if (!d) { prompt2("Tên clip", c.name || label).then(v => v && apply(v)); return; }
  const r = d.getBoundingClientRect(), host = document.createElement("div"); host.className = "irnfloat"; Object.assign(host.style, { left: Math.max(4, r.left) + "px", top: (r.top + 2) + "px", width: Math.max(160, Math.min(r.width, 360)) + "px" }); document.body.appendChild(host);
  inlineRename(host, c.name || label, apply, { label: "Tên clip", cancel: () => {} }); const inp = host.querySelector("input"); inp.addEventListener("blur", () => setTimeout(() => host.remove(), 0)); inp.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === "Escape") setTimeout(() => host.remove(), 0); });
}
document.addEventListener("dblclick", e => {
  const mn = e.target.closest(".mitem .mname"); if (mn) { const m = media.get(mn.closest(".mitem").dataset.mid); if (m) { e.preventDefault(); e.stopPropagation(); renameMedia(m); } return; }
  const cd = e.target.closest(".clip"); if (cd && !e.target.closest(".h,.irn")) { const f = clipById(cd.dataset.id), r = cd.getBoundingClientRect(); if (f && (f.k !== "v" || e.clientY - r.top < 22)) { e.preventDefault(); e.stopImmediatePropagation(); renameClip(f.c); } return; }
  const mk = e.target.closest(".mkname"); if (mk && maskEdit) { const L = maskEdit.list(), m = L[[...mk.closest(".mklist").children].indexOf(mk.closest(".mkrow"))]; if (m) { e.preventDefault(); inlineRename(mk, m.name, v => { pushUndo(); m.name = v; drawFrame(); }, { label: "Tên mask" }); } return; }
  const st = e.target.closest(".cp-still span"); if (st) { const id = [...document.querySelectorAll(".cp-still")].indexOf(st.closest(".cp-still")); const L = stillsLoad().slice().reverse(); const s = L[id]; if (s) { e.preventDefault(); e.stopPropagation(); inlineRename(st, s.name, v => { const all = stillsLoad(); const x = all.find(q => q.id === s.id); if (x) { x.name = v; stillsSave(all); renderCP(); } }); } return; }
  const hb = e.target.closest(".hcard.proj b"); if (hb) { e.preventDefault(); e.stopPropagation(); clearTimeout(window.__hcardT); const card = hb.closest(".hcard.proj"); const id = card.dataset.pid; STORE.get(id).then(r => { if (!r) return; inlineRename(hb, r.name, async v => { r.name = v; if (r.data) { const o = JSON.parse(r.data); o.name = v; r.data = JSON.stringify(o); } await STORE.put(r); if (r.id === curProjectId) { projName = v; $("#projBadge").textContent = v; } renderHome(); toast("Đã đổi tên dự án."); }, { label: "Tên dự án" }); }); return; }
}, true);

/* ---------- multi-selection ---------- */
const msel = new Set();
function selectedClips() { const out = []; const ids = new Set(msel); const p = findSel(); if (p) ids.add(p.id); for (const id of ids) { const f = clipById(id); if (f) out.push(f); } return out; }
function paintMsel() { grid.querySelectorAll(".clip").forEach(d => d.classList.toggle("msel", msel.has(d.dataset.id))); const n = selectedClips().length; document.body.classList.toggle("multisel", n > 1); }
function clearMsel() { if (!msel.size) return; msel.clear(); paintMsel(); }
function selectAllClips() { msel.clear(); V.forEach(c => msel.add(c.id)); C.forEach(c => { if (!isLocked(c.track)) msel.add(c.id); }); paintMsel(); toast("Đã chọn " + msel.size + " clip."); }
const _decorateWS = decorateTimeline; decorateTimeline = function () { _decorateWS(); paintMsel(); };
let _lastTap = { id: null, t: 0, x: 0, y: 0 };
grid.addEventListener("pointerdown", e => {
  if (e.button !== 0 || tool !== "select") return; const d = e.target.closest(".clip");
  if (d && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.target.closest(".h")) { const now = performance.now(), same = _lastTap.id === d.dataset.id && now - _lastTap.t < 380 && Math.hypot(e.clientX - _lastTap.x, e.clientY - _lastTap.y) < 6; _lastTap = { id: d.dataset.id, t: now, x: e.clientX, y: e.clientY };
    if (same) { const f = clipById(d.dataset.id), r = d.getBoundingClientRect(); _lastTap.id = null; if (f && (f.k !== "v" || e.clientY - r.top < 22)) { e.preventDefault(); e.stopImmediatePropagation(); setTimeout(() => renameClip(f.c), 0); return; } if (f && f.k === "v") { e.preventDefault(); e.stopImmediatePropagation(); setTimeout(() => openTrim(f.c), 0); return; } } }
  if (d && (e.shiftKey || e.ctrlKey || e.metaKey)) { // toggle membership
    e.preventDefault(); e.stopImmediatePropagation(); const id = d.dataset.id, p = findSel();
    if (p && !msel.has(p.id) && p.id !== id) msel.add(p.id);
    const gm = (clipById(id) || { c: {} }).c.grp ? grpMembers(clipById(id).c.grp).map(x => x.id) : [id];
    if (gm.length > 1) { if (msel.has(id)) gm.forEach(x => msel.delete(x)); else gm.forEach(x => msel.add(x)); const nx = [...msel][0], f2 = nx && clipById(nx); sel = f2 ? { k: f2.k, id: nx } : null; renderInspector(); syncButtons(); renderTimeline(); return; }
    if (msel.has(id)) { msel.delete(id); if (sel && sel.id === id) { const nx = [...msel][0]; const f = nx && clipById(nx); sel = f ? { k: f.k, id: nx } : null; } }
    else { msel.add(id); const f = clipById(id); if (f) sel = { k: f.k, id }; }
    renderInspector(); syncButtons(); renderTimeline(); return;
  }
  if (d && !msel.has(d.dataset.id) && !e.target.dataset.h && typeof expandGroupSel === "function") expandGroupSel(d.dataset.id);
  if (d && msel.size > 1 && msel.has(d.dataset.id) && !e.target.dataset.h) { groupDrag(e, d); return; }
  if (d && !msel.has(d.dataset.id)) { clearMsel(); return; }
  if (!d && e.pointerType === "mouse" && e.target.closest(".tcontent") && !e.target.closest(".ruler") && !e.target.closest(".marker,.trb")) marquee(e);
}, true);
function marquee(e) {
  e.preventDefault(); e.stopImmediatePropagation(); const x0 = e.clientX, y0 = e.clientY; let box = null, base = e.shiftKey || e.ctrlKey ? new Set(msel) : new Set();
  const mv = ev => {
    if (!box) { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return; box = document.createElement("div"); box.className = "tlmarquee"; document.body.appendChild(box); }
    const a = Math.min(x0, ev.clientX), b = Math.max(x0, ev.clientX), t1 = Math.min(y0, ev.clientY), b1 = Math.max(y0, ev.clientY); Object.assign(box.style, { left: a + "px", top: t1 + "px", width: (b - a) + "px", height: (b1 - t1) + "px" });
    msel.clear(); base.forEach(x => msel.add(x)); grid.querySelectorAll(".clip").forEach(dd => { const r = dd.getBoundingClientRect(); if (r.right > a && r.left < b && r.bottom > t1 && r.top < b1) msel.add(dd.dataset.id); }); paintMsel();
    const sr = scroller.getBoundingClientRect(); if (ev.clientX > sr.right - 30) scroller.scrollLeft += 14; else if (ev.clientX < sr.left + headW() + 20) scroller.scrollLeft -= 14;
  };
  const up = ev => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up);
    if (!box) { clearMsel(); sel = null; renderInspector(); syncButtons(); renderTimeline(); seek(clamp(laneX(ev), 0, total())); return; }
    box.remove(); [...msel].forEach(id => { const f3 = clipById(id); if (f3 && f3.c.grp) grpMembers(f3.c.grp).forEach(x => msel.add(x.id)); }); paintMsel(); const first = [...msel][0], f = first && clipById(first); sel = f ? { k: f.k, id: first } : null; renderInspector(); syncButtons(); renderTimeline(); if (msel.size) toast(`Đã chọn ${msel.size} clip · Delete xoá · Ctrl+C chép · kéo để dời cả nhóm`); };
  window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
}
function groupDrag(e, d) {
  e.preventDefault(); e.stopImmediatePropagation(); const x0 = e.clientX, items = selectedClips().filter(f => f.k === "c" && !isLocked(f.c.track)), start = items.map(f => f.c.start); let moved = false;
  const minStart = Math.min(...start);
  const mv = ev => { const dt = (ev.clientX - x0) / pps; if (!moved && Math.abs(ev.clientX - x0) < 3) return; if (!moved) { pushUndo(); moved = true; } const dd = Math.max(-minStart, dt); items.forEach((f, i) => f.c.start = Math.round((start[i] + dd) * 1000) / 1000); layoutClips(); drawFrame(); };
  const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); showSnap(null); if (moved) renderAll(); else { const f = clipById(d.dataset.id); if (f) { sel = { k: f.k, id: f.c.id }; renderInspector(); syncButtons(); renderTimeline(); } } };
  window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  if (items.length < selectedClips().length) toast("Clip trên track chính dời bằng cách kéo riêng; nhóm chỉ dời các lớp phủ, chữ, âm thanh, hiệu ứng.");
}
function deleteMany(ripple) {
  const L = selectedClips().filter(f => !isLocked(clipTrack(f.k, f.c))); if (!L.length) return; pushUndo(); const before = vMap();
  const vk = new Set(L.filter(f => f.k === "v").map(f => f.c)), ck = new Set(L.filter(f => f.k === "c").map(f => f.c));
  if (!magnetOn && !ripple) V.forEach((c, i) => { if (vk.has(c) && V[i + 1] && !vk.has(V[i + 1])) V[i + 1].gap = (V[i + 1].gap || 0) + (c.gap || 0) + vlen(c); });
  V = V.filter(c => !vk.has(c));
  if (ripple) for (const c of ck) { const L2 = clen(c), e2 = cend(c); for (const x of C) if (!ck.has(x) && x.track === c.track && x.start >= e2 - 1e-3) x.start = Math.max(0, x.start - L2); }
  C = C.filter(c => !ck.has(c)); linkShift(before); msel.clear(); sel = null; t = Math.min(t, total()); renderAll(); toast("Đã xoá " + L.length + " clip.");
}
let groupClip = null;
function copyMany(cut) { const L = selectedClips(); if (L.length < 2) return false; const t0 = Math.min(...L.map(f => f.k === "v" ? vStarts()[V.indexOf(f.c)] : f.c.start)); groupClip = L.map(f => ({ k: f.k, c: deep(f.c), off: (f.k === "v" ? vStarts()[V.indexOf(f.c)] : f.c.start) - t0 })); clipBoard = null; if (cut) deleteMany(false); toast((cut ? "Đã cắt " : "Đã chép ") + L.length + " clip."); return true; }
function pasteMany() {
  if (!groupClip) return false; pushUndo(); msel.clear(); const gmap = new Map(); const rg = b => { if (b.grp) { if (!gmap.has(b.grp)) gmap.set(b.grp, nid("g")); b.grp = gmap.get(b.grp); } return b; }; const vs = groupClip.filter(g2 => g2.k === "v"), cs = groupClip.filter(g2 => g2.k === "c");
  if (vs.length) { const h = vAt(t); let at = V.length; if (h) { const r = splitV(h.c, t - h.start); at = V.indexOf(r); } else { const st = vStarts(); const i = st.findIndex(s => s >= t - 0.02); if (i >= 0) at = i; } const before = vMap(); vs.forEach((g2, i) => { const b = rg({ ...deep(g2.c), id: nid("v"), gap: 0 }); delete b.tr; V.splice(at + i, 0, b); msel.add(b.id); }); linkShift(before); }
  for (const g2 of cs) { const L = clen(g2.c), st = t + g2.off; const tr = trackById(g2.c.track) && !isLocked(g2.c.track) && !overlapsOn(g2.c.track, st, L) ? trackById(g2.c.track) : freeTrack(ttype(g2.c), st, L); const b = rg({ ...deep(g2.c), id: nid("c"), start: st, track: tr.id }); C.push(b); msel.add(b.id); }
  renderAll(); toast("Đã dán " + groupClip.length + " clip tại " + fmt(t) + "."); return true;
}
window.addEventListener("keydown", e => {
  if (tmatch(e, "input,select,textarea,[contenteditable]") || document.querySelector(".overlay") || (typeof cp !== "undefined" && cp.open)) return;
  const ctrl = e.ctrlKey || e.metaKey, take = () => { e.preventDefault(); e.stopImmediatePropagation(); };
  if (document.querySelector(".ecw")?.contains(document.activeElement)) return;
  if (ctrl && !e.shiftKey && e.code === "KeyA") { take(); selectAllClips(); return; }
  if (ctrl && e.shiftKey && e.code === "KeyA") { take(); clearMsel(); sel = null; renderAll(); return; }
  if (e.key === "Escape" && msel.size) { clearMsel(); return; }
  const n = selectedClips().length; if (n < 2) { if (ctrl && e.code === "KeyV" && !e.altKey && groupClip && !clipBoard) { take(); pasteMany(); } return; }
  if (e.key === "Delete" || e.key === "Backspace") { take(); deleteMany(e.shiftKey); }
  else if (ctrl && e.code === "KeyC") { take(); copyMany(false); }
  else if (ctrl && e.code === "KeyX") { take(); copyMany(true); }
  else if (e.shiftKey && !ctrl && e.code === "KeyE") { take(); pushUndo(); const L = selectedClips(), on = L.some(f => !f.c.disabled); L.forEach(f => { if (on) f.c.disabled = true; else delete f.c.disabled; }); renderAll(); toast((on ? "Đã tắt " : "Đã bật ") + L.length + " clip."); }
  else if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) { take(); pushUndo(); const d = (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 5 : 1) / FPS; selectedClips().filter(f => f.k === "c").forEach(f => f.c.start = Math.max(0, f.c.start + d)); renderAll(); }
}, true);
const _copyClip = copyClip; copyClip = function (cut) { groupClip = null; return _copyClip(cut); };

/* ---------- context menus ---------- */
function labelItems(apply) { return LABELS.map(([id, n, col]) => ({ label: n, swatch: col || "transparent", run: () => apply(id) })); }
const _openMenu = openMenu;
openMenu = function (anchor, items, at) {
  _openMenu(anchor, items); if (!menuEl) return;
  items.filter(it => !it.h).forEach((it, i) => { const b = menuEl.querySelectorAll("button[role=menuitem]")[i]; if (b && it.swatch) { const s = document.createElement("i"); s.className = "msw"; s.style.background = it.swatch; b.prepend(s); } });
  if (at) { const mw = menuEl.offsetWidth, mh = menuEl.offsetHeight; menuEl.style.left = clamp(at[0], 8, window.innerWidth - mw - 8) + "px"; menuEl.style.top = clamp(at[1], 8, window.innerHeight - mh - 8) + "px"; }
};
function clipMenuItems(c, k) {
  const m = c.mediaId ? media.get(c.mediaId) : null, isVid = k === "v" || c.type === "video", isAud = c.type === "audio" || (m && m.kind === "video" && m.hasAudio), isMedia = !isDur(c);
  const tabTo = (kind, tab) => () => { inspTabs[kind] = tab; if (typeof openSheet === "function") openSheet("insp"); else showTab("insp"); renderInspector(); };
  return [
    { h: "Chỉnh sửa" },
    { label: "Cắt", kbd: "Ctrl+X", run: () => copyClip(true) }, { label: "Chép", kbd: "Ctrl+C", run: () => copyClip(false) },
    { label: "Dán tại kim", kbd: "Ctrl+V", disabled: !clipBoard && !groupClip, run: () => groupClip ? pasteMany() : pasteClip() }, { label: "Dán thuộc tính", kbd: "Ctrl+Alt+V", disabled: !clipBoard, run: pasteAttributes },
    { label: "Nhân bản", kbd: "D", run: duplicateSel }, { label: "Tách tại kim", kbd: "Ctrl+K", run: splitAtPlayhead },
    { label: "Xoá", kbd: "Del", run: deleteSel }, { label: "Xoá và dồn (Ripple delete)", kbd: "Shift+Del", run: rippleDelete },
    { h: "Clip" },
    { label: c.disabled ? "Bật clip" : "Tắt clip", kbd: "Shift+E", run: toggleEnable },
    { label: "Đổi tên clip", run: () => renameClip(c) },
    ...(isMedia ? [{ label: "Tốc độ / thời lượng…", kbd: "Ctrl+R", run: () => openSpeedDialog(c, k) }] : []),
    ...(isVid && m && m.kind === "video" ? [{ label: c.reverse ? "Bỏ đảo ngược" : "Đảo ngược", run: () => { pushUndo(); c.reverse = !c.reverse; renderAll(); } }, { label: "Đứng hình tại kim (Frame hold)", run: () => freezeFrame(3) }, { label: "Chọn đoạn trong source (Trim)", run: () => openTrim(c) }] : []),
    ...(isVid ? [{ label: "Vừa khung (Set to frame size)", run: () => { pushUndo(); c.fit = "contain"; delete c.scale; renderAll(); } }, { label: "Lấp đầy khung (Scale to fill)", run: () => { pushUndo(); delete c.fit; delete c.scale; renderAll(); } }] : []),
    ...(isVid && m && m.kind === "video" && !c.audioOut ? [{ label: "Tách âm thanh ra track riêng", run: () => extractAudioFromClip(c, k) }] : []),
    { label: "Thêm marker tại kim", kbd: "M", run: toggleMarker },
    ...(m ? [{ label: "Tìm trong thư viện", run: () => { if (typeof openSheet === "function") openSheet("lib"); showAssets && showAssets("media"); const it = document.querySelector(`.mitem[data-mid="${m.id}"]`); if (it) { it.scrollIntoView({ block: "center" }); it.classList.add("flash"); setTimeout(() => it.classList.remove("flash"), 1200); } } }] : []),
    { h: "Mở bảng" },
    { label: "Chuyển động · keyframe", run: tabTo(tabKind(c), "motion") },
    ...(isVid ? [{ label: "Màu (Lumetri)", run: tabTo("video", "color") }, { label: "Trang chỉnh màu DaVinci", kbd: "Shift+6", run: () => openColorPage() }, { label: "Mask", run: tabTo("video", "mask") }, { label: "Tách nền / phông xanh", run: tabTo("video", "key") }] : []),
    ...(isAud ? [{ label: "Âm thanh", run: tabTo(tabKind(c), c.type === "audio" ? "a" : "audio") }] : []),
    { h: "Nhãn màu" }, ...labelItems(id => { pushUndo(); if (id) c.label = id; else delete c.label; renderTimeline(); })
  ];
}
function multiMenuItems() {
  const L = selectedClips(); return [
    { h: L.length + " clip đang chọn" },
    { label: "Chép", kbd: "Ctrl+C", run: () => copyMany(false) }, { label: "Cắt", kbd: "Ctrl+X", run: () => copyMany(true) },
    { label: "Xoá", kbd: "Del", run: () => deleteMany(false) }, { label: "Xoá và dồn", kbd: "Shift+Del", run: () => deleteMany(true) },
    { label: L.some(f => !f.c.disabled) ? "Tắt các clip" : "Bật các clip", kbd: "Shift+E", run: () => { pushUndo(); const on = L.some(f => !f.c.disabled); L.forEach(f => { if (on) f.c.disabled = true; else delete f.c.disabled; }); renderAll(); } },
    { label: "Dán thuộc tính vào cả nhóm", disabled: !clipBoard, run: () => { pushUndo(); for (const f of L) for (const k2 of ATTR_KEYS) { if (clipBoard.c[k2] === undefined) delete f.c[k2]; else f.c[k2] = deep(clipBoard.c[k2]); } renderAll(); } },
    { label: "Áp grade DaVinci của clip đầu cho cả nhóm", disabled: !(L[0] && L[0].c.nodes), run: () => { pushUndo(); for (const f of L.slice(1)) f.c.nodes = freshNodes(L[0].c.nodes); renderAll(); } },
    { label: "Đồng bộ âm thanh theo sóng (kiểu PluralEyes)", disabled: typeof syncAudio !== "function" || L.length < 2, run: () => syncAudio() },
    { label: "Bỏ chọn", kbd: "Esc", run: () => { clearMsel(); sel = null; renderAll(); } },
    { h: "Nhãn màu" }, ...labelItems(id => { pushUndo(); L.forEach(f => { if (id) f.c.label = id; else delete f.c.label; }); renderTimeline(); })
  ];
}
grid.addEventListener("contextmenu", e => {
  e.preventDefault(); e.stopImmediatePropagation(); const at = [e.clientX, e.clientY];
  const d = e.target.closest(".clip");
  if (d) { if (selectedClips().length > 1 && msel.has(d.dataset.id)) { openMenu(d, multiMenuItems(), at); return; } clearMsel(); const f = clipById(d.dataset.id); if (!f) return; sel = { k: f.k, id: f.c.id }; renderTimeline(); renderInspector(); syncButtons(); openMenu(d, clipMenuItems(f.c, f.k), at); return; }
  const head = e.target.closest(".thead"); if (head) { const tr = trackById(head.closest(".trow")?.dataset.track); if (tr) { trackMenu(tr, head); if (menuEl) { const mw = menuEl.offsetWidth; menuEl.style.left = clamp(at[0], 8, innerWidth - mw - 8) + "px"; menuEl.style.top = at[1] + "px"; } } return; }
  const time = clamp(laneX(e), 0, total() + 30);
  if (e.target.closest(".ruler")) { openMenu(e.target, [{ h: "Thước thời gian · " + fmt(time) }, { label: "Đưa kim tới đây", run: () => seek(time) }, { label: "Thêm marker tại đây", run: () => { pushUndo(); markers.push(Math.round(time * 100) / 100); markers.sort((a, b) => a - b); renderTimeline(); } }, { label: "Đặt điểm In tại đây", kbd: "I", run: () => setIn(time) }, { label: "Đặt điểm Out tại đây", kbd: "O", run: () => setOut(time) }, { label: "Bỏ In/Out", kbd: "Alt+X", disabled: inPt == null && outPt == null, run: () => { setIn(null); setOut(null); } }, { label: "Nhấc bỏ đoạn In–Out (Lift)", kbd: ";", disabled: !ioRange(), run: () => liftExtract(false) }, { label: "Cắt bỏ và dồn đoạn In–Out (Extract)", kbd: "'", disabled: !ioRange(), run: () => liftExtract(true) }], at); return; }
  const tr = trackAtY(e.clientY);
  openMenu(e.target, [{ h: (tr ? tr.name + " · " : "") + fmt(time) },
    { label: "Dán tại đây", kbd: "Ctrl+V", disabled: !clipBoard && !groupClip, run: () => { seek(time); groupClip ? pasteMany() : pasteClip(); } },
    { label: "Chọn tất cả", kbd: "Ctrl+A", run: selectAllClips },
    { label: "Chọn mọi clip phía sau trên track này", disabled: !tr, run: () => { msel.clear(); (tr.id === "v" ? V.filter((c, i) => vStarts()[i] >= time - 1e-3) : C.filter(c => c.track === tr.id && c.start >= time - 1e-3)).forEach(c => msel.add(c.id)); paintMsel(); renderTimeline(); } },
    { label: "Thêm chữ tại đây", run: () => { seek(time); addText({ track: tr && tr.type === "text" ? tr.id : tracksOf("text")[0]?.id }); } },
    { label: "Xoá khoảng trống (Ripple delete)", run: () => { seek(time); gapDeleteAtPlayhead(); } },
    { label: "Thêm marker tại đây", run: () => { pushUndo(); markers.push(Math.round(time * 100) / 100); markers.sort((a, b) => a - b); renderTimeline(); } },
    { h: "Track" }, { label: "Thêm track video phủ", run: () => { pushUndo(); addTrack("overlay"); renderAll(); } }, { label: "Thêm track chữ", run: () => { pushUndo(); addTrack("text"); renderAll(); } }, { label: "Thêm track âm thanh", run: () => { pushUndo(); addTrack("audio"); renderAll(); } },
    { h: "Xem" }, { label: "Vừa khung timeline", kbd: "\\", run: () => $("#zoomFit").click() }, { label: snapOn ? "Tắt bám dính (snap)" : "Bật bám dính (snap)", run: () => { snapOn = !snapOn; toast(snapOn ? "Bật bám dính." : "Tắt bám dính."); } }
  ], at);
}, true);
selCv.addEventListener("contextmenu", e => {
  e.preventDefault(); const p = toCv(e), id = hitTest(p), at = [e.clientX, e.clientY];
  const base = [{ h: "Khung xem" }, { label: playing ? "Dừng" : "Phát", kbd: "Space", run: () => playing ? pause() : play() }, { label: (guidesOn ? "✓ " : "") + "Khung an toàn và lưới", run: toggleGuides }, { label: "Lưu khung hình (PNG)", kbd: "Ctrl+Shift+E", run: exportFrame }, { label: "Trang chỉnh màu DaVinci", kbd: "Shift+6", run: () => openColorPage() }, { label: "Toàn màn hình", kbd: "F", run: toggleFullscreen }];
  if (!id) { openMenu(selCv, base, at); return; }
  const f = clipById(id); if (!f) { openMenu(selCv, base, at); return; } sel = { k: f.k, id }; renderTimeline(); renderInspector(); syncButtons(); drawFrame(); const c = f.c, lt = curLt(c);
  const isVid = f.k === "v" || c.type === "video";
  openMenu(selCv, [{ h: "Lớp đang chọn" },
    { label: "Đặt lại vị trí, cỡ, xoay", run: () => { pushUndo(); for (const k2 of ["x", "y", "scale", "angle", "rot"]) delete c[k2]; if (c.kf) for (const k2 of ["x", "y", "scale", "angle"]) delete c.kf[k2]; renderAll(); } },
    { label: "Đưa vào giữa", run: () => { pushUndo(); setProp2(c, "x", 0, lt); setProp2(c, "y", 0, lt); renderAll(); } },
    { label: "Lật ngang", run: () => { pushUndo(); c.flip = !c.flip; renderAll(); } },
    { label: "Đặt keyframe tại kim", kbd: "Shift+K", run: quickKeyframe },
    ...(isVid ? [{ label: "Vừa khung", run: () => { pushUndo(); c.fit = "contain"; delete c.scale; renderAll(); } }, { label: "Lấp đầy khung", run: () => { pushUndo(); delete c.fit; delete c.scale; renderAll(); } }, { label: "Thêm mask elip", run: () => { pushUndo(); migrateMask(c); c.masks = (c.masks || []).concat([newMask("ellipse", (c.masks || []).length + 1)]); inspTabs.video = "mask"; renderAll(); } }, { label: "Vẽ mask bằng bút", run: () => { pushUndo(); migrateMask(c); c.masks = (c.masks || []).concat([newMask("pen", (c.masks || []).length + 1)]); maskIdxMem["clip:" + c.id] = c.masks.length - 1; inspTabs.video = "mask"; renderAll(); toast("Bấm lên khung xem trước để đặt điểm."); } }] : []),
    { label: "Xoá lớp", kbd: "Del", run: deleteSel },
    ...base], at);
});
document.addEventListener("contextmenu", e => {
  const mi = e.target.closest(".mitem"); if (mi) { e.preventDefault(); const m = media.get(mi.dataset.mid); if (!m) return; const uses = [...V, ...C].filter(c => c.mediaId === m.id).length;
    openMenu(mi, [{ h: m.name }, { label: "Thêm vào cuối track chính", run: () => appendMedia(m) }, ...(m.kind !== "audio" ? [{ label: "Thêm làm lớp phủ tại kim", run: () => appendMedia(m, null, { overlay: true, start: t }) }] : [{ label: "Thêm vào track âm thanh tại kim", run: () => appendMedia(m, null, { track: freeTrack("audio", t, m.duration).id, start: t }) }]),
      { label: "Đổi tên", run: () => renameMedia(m) }, { label: `Đang dùng ${uses} lần`, disabled: true, run: () => {} },
      { label: "Xoá khỏi dự án", disabled: uses > 0, run: () => { pushUndo(); media.delete(m.id); renderBin(); toast("Đã xoá " + m.name + " khỏi thư viện."); } }], [e.clientX, e.clientY]); return; }
  const ph = e.target.closest(".panel > .ph, .tl .tlbar"); if (ph) { e.preventDefault(); panelMenu(ph.closest(".panel,.tl"), [e.clientX, e.clientY]); }
});

/* ---------- panels: resizable, collapsible, edge menus ---------- */
const LAYOUT_KEY = "bravin-layout";
let layout = (() => { try { return Object.assign({ lw: 300, rw: 340, lc: false, rc: false, auto: true, tlh: null }, JSON.parse(localStorage.getItem(LAYOUT_KEY) || "{}")); } catch (_) { return { lw: 300, rw: 340, lc: false, rc: false, auto: true }; } })();
const saveLayout = () => { try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch (_) {} };
function applyLayout() {
  const R = document.documentElement.style, main = $(".main");
  R.setProperty("--lw", (layout.lc ? 0 : layout.lw) + "px"); R.setProperty("--rw", (layout.rc ? 0 : layout.rw) + "px"); R.setProperty("--rwe", layout.rc ? "0px" : (layout.rwe ? layout.rwe + "px" : "min(600px, 44vw)"));
  document.body.classList.toggle("lcol", !!layout.lc); document.body.classList.toggle("rcol", !!layout.rc);
  placeSplitters(); requestAnimationFrame(() => { renderTimeline(); drawFrame(); if (typeof drawSelection === "function") drawSelection(); });
}
function autoSizes() { const w = window.innerWidth; if (w >= 2400) return [400, 480]; if (w >= 1900) return [340, 420]; if (w >= 1500) return [300, 360]; if (w >= 1200) return [260, 330]; return [230, 300]; }
function autoLayout() { if (!layout.auto || document.body.classList.contains("phone")) return; const [a, b] = autoSizes(); layout.lw = a; layout.rw = b; applyLayout(); }
let splL = null, splR = null;
function makeSplitter(side) {
  const s = document.createElement("div"); s.className = "vsplit " + side; s.setAttribute("role", "separator"); s.setAttribute("aria-orientation", "vertical"); s.tabIndex = 0; s.title = "Kéo để đổi độ rộng · bấm để mở menu";
  s.innerHTML = "<i></i>"; $(".main").appendChild(s);
  s.addEventListener("pointerdown", e => {
    if (e.button !== 0) return; e.preventDefault(); const x0 = e.clientX, w0 = side === "l" ? layout.lw : layout.rw, col0 = side === "l" ? layout.lc : layout.rc; let moved = false;
    const wide = side === "r" && document.body.classList.contains("ecwide"), w0b = wide ? $("#sidePanel").getBoundingClientRect().width : w0;
    const mv = ev => { const dx = ev.clientX - x0; if (!moved && Math.abs(dx) < 4) return; moved = true; layout.auto = false; const w = clamp(col0 ? Math.abs(dx) : w0b + (side === "l" ? dx : -dx), 0, window.innerWidth * 0.48); if (wide) { layout.rwe = Math.max(320, w); applyLayout(); return; } if (side === "l") { layout.lc = w < 120; if (!layout.lc) layout.lw = Math.max(200, w); } else { layout.rc = w < 120; if (!layout.rc) layout.rw = Math.max(240, w); } applyLayout(); };
    const up = ev => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); if (moved) saveLayout(); else edgeMenu(side, [ev.clientX, ev.clientY]); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  });
  s.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); const r = s.getBoundingClientRect(); edgeMenu(side, [r.left, r.top + 40]); } if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); const d = (e.key === "ArrowLeft" ? -20 : 20) * (side === "l" ? 1 : -1); layout.auto = false; if (side === "l") layout.lw = clamp(layout.lw + d, 200, innerWidth * 0.48); else layout.rw = clamp(layout.rw + d, 240, innerWidth * 0.48); applyLayout(); saveLayout(); } });
  return s;
}
function placeSplitters() {
  if (!splL) { splL = makeSplitter("l"); splR = makeSplitter("r"); }
  const main = $(".main"), lib = $("#libPanel"), side = $("#sidePanel"), mr = main.getBoundingClientRect(), lr = lib.getBoundingClientRect(), sr = side.getBoundingClientRect();
  splL.style.left = (layout.lc ? 0 : lr.right - mr.left) + "px"; splR.style.left = (layout.rc ? mr.width - 12 : sr.left - mr.left - 12) + "px";
}
function edgeMenu(side, at) {
  const isL = side === "l", name = isL ? "Thư viện" : "Thuộc tính / Trợ lý", col = isL ? layout.lc : layout.rc, cur = isL ? layout.lw : layout.rw;
  const set = w => { layout.auto = false; if (isL) { layout.lc = false; layout.lw = w; } else { layout.rc = false; layout.rw = w; } applyLayout(); saveLayout(); };
  openMenu(isL ? splL : splR, [{ h: name },
    { label: col ? "Mở " + name : "Thu gọn " + name, run: () => { if (isL) layout.lc = !layout.lc; else layout.rc = !layout.rc; applyLayout(); saveLayout(); } },
    { label: (cur <= 240 && !col ? "✓ " : "") + "Hẹp", run: () => set(isL ? 220 : 280) }, { label: (cur > 240 && cur <= 360 && !col ? "✓ " : "") + "Vừa", run: () => set(isL ? 300 : 340) }, { label: (cur > 360 && !col ? "✓ " : "") + "Rộng", run: () => set(isL ? 420 : 480) }, { label: "Rất rộng (nửa màn)", run: () => set(Math.round(innerWidth * 0.42)) },
    { h: "Bố cục" }, ...layoutItems()], at);
}
function layoutItems() { return [
  { label: "Phóng to khung xem trước", run: () => { layout.lc = layout.rc = true; layout.auto = false; applyLayout(); saveLayout(); setTlh(260); } },
  { label: "Tập trung timeline", run: () => { setTlh(Math.round(innerHeight * 0.62)); } },
  { label: "Tập trung chỉnh màu / thuộc tính", run: () => { layout.lc = true; layout.rc = false; layout.rw = Math.round(innerWidth * 0.4); layout.auto = false; applyLayout(); saveLayout(); } },
  { label: (layout.auto ? "✓ " : "") + "Tự căn theo màn hình", run: () => { layout.auto = !layout.auto; layout.lc = layout.rc = false; saveLayout(); autoLayout(); toast(layout.auto ? "Bố cục tự căn theo kích thước màn hình." : "Đã tắt tự căn bố cục."); } },
  { label: "Khôi phục bố cục mặc định", run: () => { layout = { lw: 300, rw: 340, lc: false, rc: false, auto: true }; saveLayout(); autoLayout(); setTlh(Math.round(innerHeight * 0.44)); } },
  { label: (document.fullscreenElement ? "✓ " : "") + "Toàn màn hình", kbd: "F", run: toggleFullscreen },
  { label: "Màn hình làm việc…", run: openScreens }]; }
function setTlh(px) { const v = clamp(px, 200, innerHeight * 0.8) + "px"; document.documentElement.style.setProperty("--tlh", v); try { localStorage.setItem("iqcut-tlh2", v); } catch (_) {} renderTimeline(); drawFrame(); }
function panelMenu(pn, at) {
  if (!pn) return; const id = pn.id, isTl = pn.classList.contains("tl");
  if (isTl) { openMenu(pn, [{ h: "Timeline" }, { label: "Thấp", run: () => setTlh(240) }, { label: "Vừa", run: () => setTlh(Math.round(innerHeight * 0.44)) }, { label: "Cao", run: () => setTlh(Math.round(innerHeight * 0.62)) }, { h: "Bố cục" }, ...layoutItems()], at); return; }
  edgeMenu(id === "libPanel" ? "l" : "r", at);
}
/* horizontal splitter (preview/timeline): a plain click opens the same kind of menu */
(function () { const sp = $("#split"); if (!sp) return; let x0 = 0, y0 = 0; sp.addEventListener("pointerdown", e => { x0 = e.clientX; y0 = e.clientY; }, true); sp.addEventListener("pointerup", e => { if (Math.hypot(e.clientX - x0, e.clientY - y0) < 4) panelMenu($(".tl"), [e.clientX, e.clientY]); }); sp.title = "Kéo để đổi chiều cao timeline · bấm để mở menu"; })();
/* reopen tabs for collapsed panels */
(function () { for (const [side, lbl] of [["l", "Thư viện"], ["r", "Thuộc tính"]]) { const b = document.createElement("button"); b.className = "reopen " + side; b.type = "button"; b.textContent = lbl; b.onclick = () => { if (side === "l") layout.lc = false; else layout.rc = false; applyLayout(); saveLayout(); }; $(".main").appendChild(b); } })();

/* ---------- screens, full screen, second-screen monitor ---------- */
function toggleFullscreen() { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else (document.documentElement.requestFullscreen ? document.documentElement.requestFullscreen() : Promise.reject()).then(() => setTimeout(autoLayout, 200)).catch(() => toast("Trình duyệt hoặc trang này không cho vào chế độ toàn màn hình.")); }
let screensInfo = { count: window.screen.isExtended ? 2 : 1, list: null, known: false };
async function detectScreens(ask) {
  try { if (ask && window.getScreenDetails) { const d = await window.getScreenDetails(); screensInfo = { count: d.screens.length, list: d.screens.map(s => ({ label: s.label || "Màn hình", w: s.width, h: s.height, primary: s.isPrimary, internal: s.isInternal, ref: s })), known: true, det: d }; d.addEventListener("screenschange", () => { detectScreens(true); onScreensChanged(); }); return screensInfo; } } catch (_) {}
  screensInfo.count = window.screen.isExtended ? Math.max(2, screensInfo.count) : 1; return screensInfo;
}
function onScreensChanged() { autoLayout(); toast("Phát hiện " + screensInfo.count + " màn hình. Đã căn lại bố cục."); }
try { window.screen.addEventListener && window.screen.addEventListener("change", () => { const was = screensInfo.count; screensInfo.count = window.screen.isExtended ? Math.max(2, was) : 1; if (was !== screensInfo.count) onScreensChanged(); }); } catch (_) {}
let monitorWin = null;
async function openMonitor() {
  try {
    const target = screensInfo.list && screensInfo.list.find(s => !s.primary) || null; const feat = target ? `popup,left=${target.ref.availLeft},top=${target.ref.availTop},width=${target.ref.availWidth},height=${target.ref.availHeight}` : "popup,width=960,height=600";
    monitorWin = window.open("", "bravinMonitor", feat); if (!monitorWin) throw new Error("blocked");
    const d = monitorWin.document; d.title = "Bravin · Màn xem trước"; d.body.style.cssText = "margin:0;background:#000;display:flex;align-items:center;justify-content:center;height:100vh;overflow:hidden";
    d.body.innerHTML = '<video autoplay muted playsinline style="max-width:100%;max-height:100%;width:100%;height:100%;object-fit:contain"></video><button style="position:fixed;top:10px;right:10px;padding:8px 14px;border-radius:999px;border:0;background:#7b6cf6;color:#fff;font:600 13px sans-serif;cursor:pointer">Toàn màn hình</button>';
    const v = d.querySelector("video"); v.srcObject = cv.captureStream(30); const fb = d.querySelector("button"); fb.onclick = () => { const opt = target ? { screen: target.ref } : undefined; d.documentElement.requestFullscreen(opt).catch(() => {}); fb.remove(); };
    toast(target ? "Đã mở màn xem trước trên " + target.label + ". Bấm Toàn màn hình trong cửa sổ đó." : "Đã mở cửa sổ màn xem trước. Kéo sang màn hình phụ rồi bấm Toàn màn hình.");
  } catch (e) { toast("Trang này không cho mở cửa sổ phụ. Hãy dùng Bravin bản trên máy tính hoặc web riêng để dùng màn hình thứ hai."); }
}
async function openScreens() {
  await detectScreens(true);
  const ov = document.createElement("div"); ov.className = "overlay";
  const list = screensInfo.list ? screensInfo.list.map(s => `<li><b>${s.label.replace(/[<>&]/g, "")}</b> · ${s.w}×${s.h}${s.primary ? " · màn chính" : ""}${s.internal ? " · màn laptop" : ""}</li>`).join("") : "";
  ov.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="scT" style="max-width:480px"><h2 id="scT">Màn hình làm việc</h2>
    <p>Phát hiện <b>${screensInfo.count}</b> màn hình${screensInfo.known ? "" : (screensInfo.count > 1 ? " (trình duyệt chưa cho xem chi tiết)" : "")}. Cửa sổ hiện tại ${innerWidth}×${innerHeight}.</p>${list ? `<ul class="sclist">${list}</ul>` : ""}
    <label class="chk"><input type="checkbox" id="scAuto"> Tự căn bố cục theo kích thước màn hình</label>
    <div class="row"><button id="scFull">${document.fullscreenElement ? "Thoát toàn màn hình" : "Toàn màn hình"}</button><button id="scMon"${screensInfo.count > 1 ? ' class="primary"' : ""}>Mở màn xem trước ở cửa sổ riêng${screensInfo.count > 1 ? " (màn phụ)" : ""}</button></div>
    <p class="note">Có 2 màn hình: bấm nút trên để đặt khung xem trước sang màn phụ (giống Program Monitor của Premiere), màn chính để timeline và bảng chỉnh.</p>
    <div class="row dlg-actions"><button class="primary" id="scOk">Xong</button></div></div>`;
  document.body.appendChild(ov); const a = ov.querySelector("#scAuto"); a.checked = layout.auto; a.onchange = () => { layout.auto = a.checked; saveLayout(); autoLayout(); };
  ov.querySelector("#scFull").onclick = () => { ov.remove(); toggleFullscreen(); }; ov.querySelector("#scMon").onclick = () => { ov.remove(); openMonitor(); }; ov.querySelector("#scOk").onclick = () => ov.remove();
}
document.addEventListener("keydown", e => { if (tmatch(e, "input,select,textarea") || document.querySelector(".overlay") || e.ctrlKey || e.metaKey || e.altKey) return; if (e.code === "KeyF" && !e.shiftKey) { e.preventDefault(); e.stopImmediatePropagation(); toggleFullscreen(); } }, true);
document.addEventListener("fullscreenchange", () => setTimeout(() => { autoLayout(); placeSplitters(); }, 150));
window.addEventListener("resize", () => { clearTimeout(window.__wsT); window.__wsT = setTimeout(() => { if (layout.auto) autoLayout(); else placeSplitters(); }, 120); });
(function addScreenButton() { const top = $(".top"), more = $("#moreBtn"); if (!top || $("#wsBtn")) return; const b = document.createElement("button"); b.className = "icon"; b.id = "wsBtn"; b.title = "Bố cục và màn hình (toàn màn hình, màn phụ)"; b.setAttribute("aria-label", b.title); b.innerHTML = '<svg class="i" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4M9 4v13"/></svg>'; b.onclick = e => openMenu(e.currentTarget, [{ h: "Bố cục" }, ...layoutItems()]); top.insertBefore(b, more); })();
detectScreens(false); if (layout.auto) autoLayout(); else applyLayout();
