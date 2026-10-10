"use strict";
/* ============================================================================
   Nhóm clip (group) + Compound clip (gộp nhiều clip thành 1 layer lồng nhau)
   - Nhóm: các clip cùng `grp` được chọn/dời/xoá cùng nhau; chỉnh thuộc tính ở bảng
     Thuộc tính sẽ áp cho cả nhóm (hoặc cả các clip đang chọn nhiều).
   - Compound: clip loại "compound" giữ một timeline con (sub = {tracks, V, C}).
     Khi vẽ, timeline con được kết xuất vào 1 khung rồi xử lý như 1 lớp video:
     áp màu / hiệu ứng / mask / chuyển động một lần cho cả cụm, giảm số lớp phải giải mã.
   ========================================================================== */
const CMP_MAX_DEPTH = 3;
const cmpCount = c => { const s = c.sub || {}; return (s.V || []).length + (s.C || []).length; };

/* mọi clip, kể cả bên trong compound (withTracks: kèm cả track con, để dò id) */
function allClipsDeep(withTracks) {
  const out = [];
  const walk = (Vs, Cs, trs, depth) => {
    for (const c of Vs || []) out.push(c);
    for (const c of Cs || []) { out.push(c); if (c.type === "compound" && c.sub && depth < 8) walk(c.sub.V, c.sub.C, c.sub.tracks, depth + 1); }
    for (const c of Vs || []) if (c.type === "compound" && c.sub && depth < 8) walk(c.sub.V, c.sub.C, c.sub.tracks, depth + 1);
    if (withTracks) for (const tr of trs || []) out.push(tr);
  };
  walk(V, C, tracks, 0);
  return out;
}

/* chạy fn trong "phạm vi" timeline con của compound c (đổi V/C/tracks/t tạm thời) */
function inScope(c, lt, fn) {
  const s = c && c.sub; if (!s || slotBase >= 40 * CMP_MAX_DEPTH) return undefined;
  const sv = { tracks, V, C, t, slotBase };
  tracks = s.tracks || []; V = s.V || []; C = s.C || []; t = lt + (c.off || 0); slotBase += 40;
  try { return fn(); } finally { tracks = sv.tracks; V = sv.V; C = sv.C; t = sv.t; slotBase = sv.slotBase; }
}

/* khung hình của compound: vẽ timeline con vào canvas riêng (nền trong suốt) */
function cmpFrame(c, lt) {
  if (!c.sub || slotBase >= 40 * CMP_MAX_DEPTH) return null;
  const W = cv.width, H = cv.height, sc = scratch("cmp" + (slotBase / 40), W, H), k0 = cv, g0 = g;
  const x = sc.ctx; x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = "source-over"; x.filter = "none"; x.shadowColor = "transparent"; x.clearRect(0, 0, W, H);
  cv = sc.canvas; g = x;
  try { inScope(c, lt, () => drawScene(t)); } finally { cv = k0; g = g0; }
  return { img: sc.canvas, w: W, h: H };
}
const _frameFor0 = frameFor;
frameFor = function (c, lt, slot) { return c.type === "compound" ? cmpFrame(c, lt) : _frameFor0(c, lt, slot + slotBase); };

/* clip âm thanh / video bên trong compound, đổi sang thời gian của timeline chính (chỉ để trộn tiếng) */
function withSubClips(list) {
  if (list !== C) return list;
  let extra = null;
  const flat = (comp, depth) => {
    const s = comp.sub; if (!s || depth > 4) return; const host = comp.track, base = comp.start - (comp.off || 0), lo = comp.start, hi = cend(comp);
    const tOff = id => { const tr = (s.tracks || []).find(x => x.id === id); return !!(tr && tr.off); };
    const push = (x, start, type) => {
      if (x.disabled) return; const b = { ...x, id: comp.id + "/" + x.id, type, track: host, start };
      if (type !== "audio" && type !== "video") return;
      const sp = b.speed || 1, L = clen(b); let a = start, e = start + L;
      if (e <= lo + 1e-3 || a >= hi - 1e-3) return;
      if (a < lo) { b.in = (b.in || 0) + (lo - a) * sp; b.start = lo; a = lo; }
      if (e > hi) b.out = b.in + (hi - a) * sp;
      (extra = extra || []).push(b);
    };
    let acc = 0; for (const v of s.V || []) { acc += (v.gap || 0); const L = vlen(v); if (!v.disabled) push(v, base + acc, "video"); acc += L; }
    for (const x of s.C || []) {
      if (tOff(x.track)) continue;
      if (x.type === "compound") { const cc = { ...x, id: comp.id + "/" + x.id, track: host, start: base + x.start }; flat(cc, depth + 1); }
      else if (x.type === "audio" || x.type === "video") push(x, base + x.start, x.type);
    }
  };
  for (const c of C) if (c.type === "compound" && !c.disabled) { const tr = trackById(c.track); if (tr && !tr.off) flat(c, 0); }
  return extra ? C.concat(extra) : C;
}

/* ---------- tạo / tách compound ---------- */
function startOf(f) { return f.k === "v" ? vStarts()[V.indexOf(f.c)] : f.c.start; }
function lenOf(f) { return f.k === "v" ? vlen(f.c) : clen(f.c); }
function createCompound() {
  const L = selectedClips().filter(f => !isLocked(clipTrack(f.k, f.c)));
  if (L.length < 2) { toast("Chọn ít nhất 2 clip (giữ Shift/Ctrl hoặc kéo khung chọn) rồi tạo compound."); return null; }
  pushUndo();
  const st = vStarts(), t0 = Math.min(...L.map(startOf)), t1 = Math.max(...L.map(f => startOf(f) + lenOf(f))), dur = Math.max(MINLEN, t1 - t0);
  const inV = new Set(L.filter(f => f.k === "v").map(f => f.c)), inC = new Set(L.filter(f => f.k === "c").map(f => f.c));
  const usedTr = new Set(["v"]); inC.forEach(c => usedTr.add(c.track));
  const sub = { tracks: deep(tracks.filter(tr => usedTr.has(tr.id))), V: [], C: [] };
  if (!sub.tracks.some(x => x.id === "v")) sub.tracks.unshift({ id: "v", type: "video", name: "Video" });
  let prevEnd = t0, prevIdx = -2;
  V.forEach((c, i) => { if (!inV.has(c)) return; const b = deep(c); b.gap = Math.max(0, st[i] - prevEnd); sub.V.push(b); prevEnd = st[i] + vlen(c); prevIdx = i; });
  sub.V.forEach((b, j) => { const orig = V.filter(c => inV.has(c))[j], oi = V.indexOf(orig), nx = V[oi + 1]; if (b.tr && !(nx && inV.has(nx) && !(nx.gap > 0))) delete b.tr; });
  C.forEach(c => { if (inC.has(c)) { const b = deep(c); b.start = Math.round((c.start - t0) * 1000) / 1000; delete b.grp; sub.C.push(b); } });
  sub.V.forEach(b => delete b.grp);
  // rút các clip khỏi timeline chính, giữ nguyên vị trí các clip còn lại
  let acc = 0; const keepV = [];
  for (const c of V) { if (inV.has(c)) { acc += (c.gap || 0) + vlen(c); continue; } if (acc > 0) { c.gap = (c.gap || 0) + acc; acc = 0; } keepV.push(c); }
  V = keepV; C = C.filter(c => !inC.has(c));
  const tr = freeTrack("overlay", t0, dur);
  const comp = { id: nid("c"), type: "compound", track: tr.id, start: Math.round(t0 * 1000) / 1000, dur: Math.round(dur * 1000) / 1000, in: 0, out: Math.round(dur * 1000) / 1000, fit: "contain", name: "Compound " + (C.filter(x => x.type === "compound").length + 1), sub };
  C.push(comp); msel.clear(); sel = { k: "c", id: comp.id };
  renderAll(); toast("Đã gộp " + L.length + " clip thành 1 compound. Chỉnh màu, hiệu ứng, chuyển động một lần cho cả cụm; chuột phải → Tách compound để sửa từng clip.");
  return comp;
}
function explodeCompound(c) {
  if (!c || c.type !== "compound" || !c.sub) return; pushUndo();
  const s = c.sub, base = c.start - (c.off || 0), ids = [];
  // clip video của track chính
  const subV = []; let acc = 0; for (const v of s.V || []) { acc += (v.gap || 0); subV.push({ c: v, s: base + acc }); acc += vlen(v); }
  const st = vStarts(), items = V.map((x, i) => ({ c: x, s: st[i] })).concat(subV.map(o => ({ c: o.c, s: Math.max(0, o.s) }))).sort((a, b) => a.s - b.s);
  let ok = true, pe = 0; for (const it of items) { if (it.s < pe - 0.02) { ok = false; break; } pe = it.s + vlen(it.c); }
  if (ok) { let pv = 0; V = items.map(it => { it.c.gap = Math.max(0, Math.round((it.s - pv) * 1000) / 1000); pv = it.s + vlen(it.c); return it.c; }); subV.forEach(o => { o.c.id = o.c.id; ids.push(o.c.id); }); }
  else for (const o of subV) { const L2 = vlen(o.c), tr = freeTrack("overlay", o.s, L2), b = { ...o.c, id: nid("c"), type: "video", track: tr.id, start: Math.max(0, o.s), fit: o.c.fit || "contain" }; delete b.gap; delete b.tr; C.push(b); ids.push(b.id); }
  // clip còn lại
  for (const x of s.C || []) {
    const L2 = clen(x), start = Math.max(0, Math.round((base + x.start) * 1000) / 1000);
    const home = trackById(x.track) && trackById(x.track).type === (((s.tracks || []).find(q => q.id === x.track) || {}).type) && !isLocked(x.track) && !overlapsOn(x.track, start, L2) ? trackById(x.track) : freeTrack(ttype(x), start, L2);
    const b = { ...x, start, track: home.id }; if (C.some(o => o.id === b.id)) b.id = nid("c"); C.push(b); ids.push(b.id);
  }
  C = C.filter(o => o !== c); msel.clear(); ids.forEach(id => msel.add(id)); const f0 = ids[0] && clipById(ids[0]); sel = f0 ? { k: f0.k, id: ids[0] } : null;
  renderAll(); toast("Đã tách compound thành " + ids.length + " clip.");
}

/* ---------- nhóm clip ---------- */
const grpOf = c => c && c.grp ? c.grp : null;
function grpMembers(gid) { const out = []; if (!gid) return out; V.forEach(c => { if (c.grp === gid) out.push(c); }); C.forEach(c => { if (c.grp === gid) out.push(c); }); return out; }
function expandGroupSel(id) { const f = clipById(id); if (!f || !f.c.grp) return false; const m = grpMembers(f.c.grp); if (m.length < 2) return false; msel.clear(); m.forEach(x => msel.add(x.id)); sel = { k: f.k, id: f.c.id }; paintMsel(); return true; }
function groupSelected() {
  const L = selectedClips(); if (L.length < 2) { toast("Chọn ít nhất 2 clip để nhóm."); return; }
  pushUndo(); const gid = nid("g"); L.forEach(f => { f.c.grp = gid; }); renderAll();
  toast("Đã nhóm " + L.length + " clip: bấm vào 1 clip là chọn cả nhóm; chỉnh ở bảng Thuộc tính áp cho cả nhóm.");
}
function ungroupSelected() {
  const gids = new Set(selectedClips().map(f => f.c.grp).filter(Boolean)); if (!gids.size) { toast("Clip đang chọn chưa thuộc nhóm nào."); return; }
  pushUndo(); let n = 0; [...V, ...C].forEach(c => { if (gids.has(c.grp)) { delete c.grp; n++; } }); renderAll(); toast("Đã bỏ nhóm " + n + " clip.");
}
function applyFirstToAll(L) {
  if (L.length < 2) return; pushUndo(); const src = L[0].c;
  for (const f of L.slice(1)) for (const k of ATTR_KEYS) { if (src[k] === undefined) delete f.c[k]; else f.c[k] = deep(src[k]); }
  renderAll(); toast("Đã áp thuộc tính của clip đầu cho " + (L.length - 1) + " clip còn lại.");
}
function paintGroups() {
  const seen = new Map(); let n = 0;
  grid.querySelectorAll(".clip").forEach(d => { const f = clipById(d.dataset.id); const gid = f && f.c.grp; d.classList.toggle("grp", !!gid); if (gid) { if (!seen.has(gid)) seen.set(gid, (n++ * 67 + 150) % 360); d.style.setProperty("--gh", seen.get(gid)); d.title = (d.title || "").replace(/ · Nhóm$/, "") + " · Nhóm"; } else d.style.removeProperty("--gh"); });
}
const _decCmp = decorateTimeline; decorateTimeline = function () { _decCmp(); paintGroups(); };

/* ---------- menu chuột phải ---------- */
const _multiMenu0 = multiMenuItems;
multiMenuItems = function () {
  const items = _multiMenu0(), L = selectedClips(), hasG = L.some(f => f.c.grp), i = items.findIndex(x => x.label === "Bỏ chọn");
  const add = [{ h: "Nhóm & gộp layer" },
    { label: "Nhóm clip", kbd: "Ctrl+G", run: groupSelected }, ...(hasG ? [{ label: "Bỏ nhóm", kbd: "Ctrl+Shift+G", run: ungroupSelected }] : []),
    { label: "Tạo compound clip (gộp thành 1 layer)", kbd: "Ctrl+Alt+G", run: createCompound },
    { label: "Áp thuộc tính của clip đầu cho cả nhóm", disabled: L.length < 2, run: () => applyFirstToAll(L) }];
  items.splice(i < 0 ? items.length : i, 0, ...add); return items;
};
const _clipMenu0 = clipMenuItems;
clipMenuItems = function (c, k) {
  const items = _clipMenu0(c, k), i = items.findIndex(x => x.h === "Nhãn màu"), add = [];
  if (c.type === "compound") add.push({ h: "Compound" }, { label: "Tách compound (sửa từng clip)", run: () => explodeCompound(c) });
  if (c.grp) add.push({ label: "Bỏ nhóm", kbd: "Ctrl+Shift+G", run: ungroupSelected });
  if (add.length) items.splice(i < 0 ? items.length : i, 0, ...add); return items;
};
window.addEventListener("keydown", e => {
  if (tmatch(e, "input,select,textarea,[contenteditable]") || document.querySelector(".overlay") || (typeof cp !== "undefined" && cp.open)) return;
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "g") return; e.preventDefault();
  if (e.altKey) createCompound(); else if (e.shiftKey) ungroupSelected(); else groupSelected();
});

/* ---------- chỉnh 1 clip → áp cho cả nhóm / các clip đang chọn cùng loại ---------- */
const GRP_SKIP = new Set(["id", "start", "dur", "track", "gap", "in", "out", "mediaId", "type", "grp", "label", "name", "text", "line1", "line2", "kf", "words", "sub", "off", "tr", "fxType", "jz", "lyr"]);
let grpSnap = null;
function grpPeers(c) {
  const ids = new Set(); const f = sel && findSel() === c ? sel : null;
  if (c.grp) grpMembers(c.grp).forEach(x => ids.add(x.id));
  const L = selectedClips(); if (L.length > 1 && L.some(x => x.c === c)) L.forEach(x => ids.add(x.c.id));
  ids.delete(c.id); const out = []; ids.forEach(id => { const g2 = clipById(id); if (g2 && (g2.c.type || "video") === (c.type || "video") && !isLocked(clipTrack(g2.k, g2.c))) out.push(g2.c); }); return out;
}
function grpTakeSnap() { const c = findSel(); grpSnap = null; if (!c || !sel || sel.k === "tr") return; if (!grpPeers(c).length) return; const o = {}; for (const k in c) if (!GRP_SKIP.has(k)) o[k] = JSON.stringify(c[k]); grpSnap = { id: c.id, o }; }
function grpMirror() {
  const c = findSel(); if (!c || !grpSnap || grpSnap.id !== c.id) { grpTakeSnap(); return; }
  const peers = grpPeers(c); if (!peers.length) { grpTakeSnap(); return; }
  const keys = new Set([...Object.keys(grpSnap.o), ...Object.keys(c).filter(k => !GRP_SKIP.has(k))]); let changed = false;
  for (const k of keys) { if (GRP_SKIP.has(k)) continue; const now = c[k] === undefined ? undefined : JSON.stringify(c[k]); if (now === grpSnap.o[k]) continue; changed = true; for (const p of peers) { if (c[k] === undefined) delete p[k]; else p[k] = deep(c[k]); } }
  grpTakeSnap(); if (changed) { drawFrame(); if (typeof renderTimeline === "function") renderTimeline(); }
}
(function wireMirror() {
  const box = $("#insp"); if (!box) return;
  ["pointerdown", "keydown", "focusin", "touchstart"].forEach(ev => box.addEventListener(ev, grpTakeSnap, true));
  ["input", "change", "click"].forEach(ev => box.addEventListener(ev, () => setTimeout(grpMirror, 0)));
})();
const _renderInsp0 = renderInspector;
renderInspector = function () {
  _renderInsp0();
  const box = $("#insp"), c = findSel(); if (!box || !c || (sel && sel.k === "tr")) return;
  const peers = grpPeers(c);
  if (peers.length) { const n = document.createElement("div"); n.className = "grpnote"; n.textContent = (c.grp ? "Nhóm" : "Chọn nhiều") + " · đang chỉnh " + (peers.length + 1) + " clip cùng lúc (thuộc tính chung như vị trí, cỡ, màu, phông…)"; box.insertBefore(n, box.firstChild); }
  if (c.type === "compound") {
    const r = document.createElement("div"); r.className = "row"; const b = document.createElement("button"); b.type = "button"; b.textContent = "Tách compound"; b.onclick = () => explodeCompound(c);
    const b2 = document.createElement("button"); b2.type = "button"; b2.textContent = "Đổi tên"; b2.onclick = () => renameClip(c); r.append(b, b2); box.insertBefore(r, box.children[1] || null);
  }
  if (!grpSnap || grpSnap.id !== c.id) grpTakeSnap();
};
