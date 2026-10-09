"use strict";
/* ============================================================================
   Premiere-style editing (own implementation): keyboard map, J/K/L shuttle,
   In/Out range (lift / extract / export range), edit-point navigation,
   tools (ripple, rolling, slip, slide, rate stretch, razor), clip enable,
   label colours, copy / paste / paste attributes, clip context menu,
   track volume / pan / solo.
   ========================================================================== */
let inPt = null, outPt = null, clipBoard = null;
const LABELS = [["", "Không", ""], ["iris", "Tím", "#7b6cf6"], ["rose", "Hồng", "#ff6b9a"], ["mango", "Cam", "#ffa24c"], ["lemon", "Vàng", "#f2d24e"], ["mint", "Xanh bạc hà", "#4cd9a8"], ["sky", "Xanh trời", "#5aa7ff"], ["lav", "Oải hương", "#b59cff"], ["slate", "Xám", "#9aa3ad"]];
const TOOL_INFO = {
  select: ["Chọn", "V", '<path d="M5 3l14 8-6 2-2 6z"/>', "Chế độ chọn."],
  blade: ["Dao cắt", "C", '<path d="M14 3l7 7-11 11H3v-7z"/><path d="M11 6l7 7"/>', "Dao cắt: bấm vào clip để tách tại điểm bấm (Shift: tách mọi track)."],
  ripple: ["Sửa dồn (Ripple)", "B", '<path d="M8 4v16M8 12h12M16 8l4 4-4 4"/>', "Ripple: kéo mép clip, các clip phía sau tự dồn theo."],
  roll: ["Sửa lăn (Rolling)", "N", '<path d="M12 4v16M5 8l-3 4 3 4M19 8l3 4-3 4"/>', "Rolling: kéo điểm cắt giữa hai clip, tổng độ dài giữ nguyên."],
  slip: ["Trượt nội dung (Slip)", "Y", '<path d="M4 8h16v8H4zM9 12h6M7 12l2-2v4zM17 12l-2-2v4z"/>', "Slip: kéo clip để đổi đoạn nội dung bên trong, vị trí giữ nguyên."],
  slide: ["Trượt clip (Slide)", "U", '<path d="M8 8h8v8H8zM3 12h3M18 12h3M4 10l-2 2 2 2M20 10l2 2-2 2"/>', "Slide: kéo clip giữa hai clip bên cạnh, hai clip đó tự co giãn."],
  rate: ["Co giãn tốc độ (Rate Stretch)", "R", '<path d="M4 6v12M20 6v12M8 12h8M10 9l-3 3 3 3M14 9l3 3-3 3"/>', "Rate Stretch: kéo mép clip để đổi tốc độ cho vừa độ dài mới."]
};
setTool = function (tl) {
  tool = TOOL_INFO[tl] ? tl : "select"; for (const k in TOOL_INFO) document.body.classList.toggle(k === "select" ? "tool-select" : k, tool === k);
  $("#toolIco").innerHTML = `<svg class="i" viewBox="0 0 24 24">${TOOL_INFO[tool][2]}</svg>`; $("#toolBtn").title = "Công cụ: " + TOOL_INFO[tool][0]; toast(TOOL_INFO[tool][3]);
};
$("#toolBtn").onclick = e => openMenu(e.currentTarget, Object.entries(TOOL_INFO).map(([k, v]) => ({ label: (tool === k ? "✓ " : "") + v[0], kbd: v[1], run: () => setTool(k) })));

/* ---------- edit points / helpers ---------- */
function editPoints() { const s = new Set([0, total()]), st = vStarts(); V.forEach((c, i) => { s.add(st[i]); s.add(st[i] + vlen(c)); }); C.forEach(c => { s.add(c.start); s.add(cend(c)); }); markers.forEach(m => s.add(m)); return [...s].map(x => Math.round(x * 1000) / 1000).sort((a, b) => a - b); }
function gotoEdit(d) { const P = editPoints(), k = d < 0 ? [...P].reverse().find(x => x < t - 1e-3) : P.find(x => x > t + 1e-3); if (k != null) { seek(k); follow(); } }
function splitAllAt(time, onlyUnlocked = true) { // add edit on every track at `time`
  let n = 0; const h = vAt(time); if (h && !(onlyUnlocked && isLocked("v"))) { splitV(h.c, time - h.start); n++; }
  for (const c of [...C]) if (!(onlyUnlocked && isLocked(c.track)) && time > c.start + 0.02 && time < cend(c) - 0.02) { splitC(c, time); n++; } return n;
}
const selClipObj = () => { const c = findSel(); return c ? { k: sel.k, c } : null; };

/* ---------- In / Out ---------- */
function setIn(v) { inPt = v == null ? null : Math.round(v * 1000) / 1000; if (outPt != null && inPt != null && outPt <= inPt) outPt = null; drawInOut(); }
function setOut(v) { outPt = v == null ? null : Math.round(v * 1000) / 1000; if (inPt != null && outPt != null && outPt <= inPt) inPt = null; drawInOut(); }
function ioRange() { if (inPt == null && outPt == null) return null; const a = inPt == null ? 0 : inPt, b = outPt == null ? total() : outPt; return b - a > 0.02 ? [a, b] : null; }
function drawInOut() {
  grid.querySelectorAll(".ioband,.iomark").forEach(x => x.remove()); if (!rulerEl) return;
  const r = ioRange(); if (r) { const d = document.createElement("div"); d.className = "ioband"; d.style.left = (headW() + r[0] * pps) + "px"; d.style.width = ((r[1] - r[0]) * pps) + "px"; d.title = `In ${fmt(r[0])} → Out ${fmt(r[1])} · dài ${fmt(r[1] - r[0])}`; grid.appendChild(d); }
  for (const [v, cls] of [[inPt, "in"], [outPt, "out"]]) if (v != null) { const m = document.createElement("div"); m.className = "iomark " + cls; m.style.left = (headW() + v * pps) + "px"; grid.appendChild(m); }
}
function liftExtract(extract) {
  const r = ioRange(); if (!r) { toast("Đặt điểm In (I) và Out (O) trước."); return; }
  const [a, b] = r, len = b - a; pushUndo();
  splitAllAt(b); splitAllAt(a);
  // main track: clips fully inside [a, b] go; lift leaves their time as a gap, extract closes it
  if (!isLocked("v")) { const st = vStarts(); const idx = V.map((c, i) => i).filter(i => st[i] >= a - 1e-3 && st[i] + vlen(V[i]) <= b + 1e-3);
    if (idx.length) { const f = idx[0], l = idx[idx.length - 1], nx = V[l + 1], lead = V[f].gap || 0, span = st[l] + vlen(V[l]) - st[f]; if (nx) nx.gap = (nx.gap || 0) + lead + (extract ? 0 : span); const kill = new Set(idx.map(i => V[i])); V = V.filter(c => !kill.has(c)); } }
  C = C.filter(c => isLocked(c.track) || !(c.start >= a - 1e-3 && cend(c) <= b + 1e-3));
  if (extract) { for (const c of C) if (!isLocked(c.track) && c.start >= b - 1e-3) c.start = Math.max(0, c.start - len); }
  sel = null; t = a; setOut(null); setIn(null); renderAll(); toast((extract ? "Đã cắt bỏ và dồn " : "Đã nhấc bỏ ") + fmt(len) + ".");
}

/* ---------- shuttle J / K / L ---------- */
let shuttle = 0, shRaf = 0, shLast = 0;
function shuttleTo(rate) {
  cancelAnimationFrame(shRaf); shuttle = rate;
  if (rate === 0) { if (playing) pause(); return; }
  if (rate === 1) { if (!playing) play(); return; }
  if (playing) pause(); shLast = performance.now();
  const step = now => { const dt = (now - shLast) / 1000; shLast = now; const nt = clamp(t + dt * shuttle, 0, total()); t = nt; placePlayhead(); follow(); drawFrame(); if ((shuttle < 0 && t <= 0) || (shuttle > 0 && t >= total())) { shuttle = 0; return; } shRaf = requestAnimationFrame(step); };
  shRaf = requestAnimationFrame(step); toast("Tua " + (rate > 0 ? "tới " : "lùi ") + Math.abs(rate) + "x");
}
const SH = [-8, -4, -2, -1, 0, 1, 2, 4, 8];

/* ---------- copy / paste ---------- */
const ATTR_KEYS = ["x", "y", "scale", "angle", "opacity", "flip", "flipV", "rot", "blur", "kf", "anim", "filter", "filterAmt", "adj", "curves", "wheels", "ctint", "hsl", "lumv", "lut", "mask", "blend", "chroma", "fit", "bg", "bgColor", "crop", "vol", "fadeIn", "fadeOut", "voice"];
function copyClip(cut) { const s = selClipObj(); if (!s) { toast("Chọn một clip trước."); return; } clipBoard = { k: s.k, c: deep(s.c), len: s.k === "v" ? vlen(s.c) : clen(s.c) }; if (cut) { deleteSel(); toast("Đã cắt clip."); } else toast("Đã chép clip. Ctrl+V để dán tại kim."); }
function pasteClip() {
  if (!clipBoard) { toast("Chưa chép clip nào."); return; } pushUndo(); const src = deep(clipBoard.c);
  if (clipBoard.k === "v") { const b = { ...src, id: nid("v"), gap: 0 }; delete b.tr; const h = vAt(t); let at = V.length; if (h) { const right = splitV(h.c, t - h.start); at = V.indexOf(right); } else { const st = vStarts(); const i = st.findIndex((s, k) => s >= t - 0.02); if (i >= 0) at = i; } const before = vMap(); V.splice(at, 0, b); linkShift(before); sel = { k: "v", id: b.id }; }
  else { const L = clipBoard.len, tr = trackById(src.track) && !isLocked(src.track) && !overlapsOn(src.track, t, L) ? trackById(src.track) : freeTrack(ttype(src) === "overlay" ? "overlay" : ttype(src), t, L); const b = { ...src, id: nid("c"), start: t, track: tr.id }; C.push(b); sel = { k: "c", id: b.id }; }
  renderAll(); toast("Đã dán clip tại " + fmt(t) + ".");
}
function pasteAttributes() {
  const s = selClipObj(); if (!clipBoard || !s) { toast(clipBoard ? "Chọn clip cần dán thuộc tính." : "Chép một clip trước (Ctrl+C)."); return; }
  pushUndo(); for (const k of ATTR_KEYS) { if (clipBoard.c[k] === undefined) delete s.c[k]; else s.c[k] = deep(clipBoard.c[k]); } renderAll(); toast("Đã dán thuộc tính (chuyển động, màu, hiệu ứng, âm lượng).");
}
function rippleDelete() {
  const s = selClipObj(); if (!s) { gapDeleteAtPlayhead(); return; } if (isLocked(clipTrack(s.k, s.c))) { toast("Track đang khoá."); return; }
  if (s.k === "v") { const m = magnetOn; magnetOn = true; deleteSel(); magnetOn = m; return; }
  pushUndo(); const c = s.c, L = clen(c), e = cend(c); C = C.filter(x => x !== c); for (const x of C) if (x.track === c.track && x.start >= e - 1e-3) x.start = Math.max(0, x.start - L); sel = null; renderAll(); toast("Đã xoá và dồn clip phía sau.");
}
function gapDeleteAtPlayhead() { // ripple-delete an empty gap on the main track
  const st = vStarts(); const i = V.findIndex((c, k) => (c.gap || 0) > 0 && t >= st[k] - c.gap - 1e-3 && t <= st[k] + 1e-3);
  if (i < 0) { toast("Chọn clip hoặc đặt kim vào khoảng trống trên track chính."); return; } pushUndo(); const before = vMap(); V[i].gap = 0; linkShift(before); renderAll(); toast("Đã xoá khoảng trống.");
}
function toggleEnable() { const s = selClipObj(); if (!s) { toast("Chọn một clip trước."); return; } pushUndo(); s.c.disabled = !s.c.disabled; if (!s.c.disabled) delete s.c.disabled; renderAll(); liveRefresh(); toast(s.c.disabled ? "Đã tắt clip (vẫn giữ chỗ trên timeline)." : "Đã bật lại clip."); }
function extendEdit() { // E: move the nearest edge of the selected clip to the playhead
  const s = selClipObj(); if (!s) return; const c = s.c, k = s.k, st0 = k === "v" ? vStarts()[V.indexOf(c)] : c.start, L = k === "v" ? vlen(c) : clen(c), m = c.mediaId ? media.get(c.mediaId) : null, maxD = m ? (m.kind === "image" ? 600 : m.duration) : 1e9;
  pushUndo(); const before = vMap();
  if (Math.abs(t - st0) < Math.abs(t - (st0 + L))) { const d = t - st0; if (isDur(c)) { c.start += d; c.dur -= d; } else { const sp = c.speed || 1; c.in = clamp(c.in + d * sp, 0, c.out - MINLEN * sp); if (k === "c") c.start = t; } }
  else { const d = t - (st0 + L); if (isDur(c) || c.freeze) c.dur = Math.max(MINLEN, (c.dur || L) + d); else { const sp = c.speed || 1; c.out = clamp(c.out + d * sp, c.in + MINLEN * sp, maxD); } }
  if (k === "v") linkShift(before); renderAll();
}
function nudge(d) { const s = selClipObj(); if (!s || s.k !== "c" || isLocked(s.c.track)) { toast("Chọn một clip ở track phụ để dịch."); return; } beginEdit(); s.c.start = Math.max(0, Math.round((s.c.start + d) * 1000) / 1000); renderAll(); }

/* ---------- tools on the timeline ---------- */
grid.addEventListener("pointerdown", e => {
  if (!["ripple", "roll", "slip", "slide", "rate"].includes(tool) || e.button > 0) return;
  const trb = e.target.closest(".trb"), d = trb ? grid.querySelector(`.clip[data-k="v"][data-id="${V[+trb.dataset.i]?.id}"]`) : e.target.closest(".clip"); if (!d) return;
  e.preventDefault(); e.stopPropagation();
  const k = d.dataset.k, c = (k === "v" ? V : C).find(x => x.id === d.dataset.id); if (!c) return;
  if (isLocked(clipTrack(k, c))) { toast("Track đang khoá."); return; }
  sel = { k, id: c.id }; renderInspector(); syncButtons(); grid.querySelectorAll(".clip.sel").forEach(x => x.classList.remove("sel")); d.classList.add("sel");
  const r = d.getBoundingClientRect(), edge = trb ? "r" : e.clientX - r.left < Math.min(14, r.width / 3) ? "l" : r.right - e.clientX < Math.min(14, r.width / 3) ? "r" : null;
  const x0 = e.clientX, orig = deep(c), m = c.mediaId ? media.get(c.mediaId) : null, maxD = m ? (m.kind === "image" ? 600 : m.duration) : 1e9, sp = c.speed || 1;
  const vi = V.indexOf(c), prev = k === "v" ? V[vi - 1] : null, next = k === "v" ? V[vi + 1] : null, oPrev = prev && deep(prev), oNext = next && deep(next);
  const before = vMap(), trackAfter = k === "c" ? C.filter(x => x.track === c.track && x !== c && x.start >= cend(c) - 1e-3).map(x => [x, x.start]) : [];
  let moved = false; const info = document.createElement("div"); info.className = "toolhint";
  const hint = s2 => { info.textContent = s2; if (!info.isConnected) document.body.appendChild(info); info.style.left = (e.clientX + 14) + "px"; info.style.top = (e.clientY - 34) + "px"; };
  const mv = ev => {
    const dx = (ev.clientX - x0) / pps; if (!moved && Math.abs(ev.clientX - x0) < 3) return; if (!moved) { pushUndo(); moved = true; }
    Object.assign(c, deep(orig)); if (prev) Object.assign(prev, deep(oPrev)); if (next) Object.assign(next, deep(oNext));
    if (tool === "slip" && !isDur(c) && !c.freeze) { const L = orig.out - orig.in, d2 = clamp(dx * sp, -orig.in, maxD - orig.out); c.in = orig.in + d2; c.out = c.in + L; hint(`Vào ${fmt(c.in)} · Ra ${fmt(c.out)}`); }
    else if (tool === "slide" && k === "v" && prev && next && !prev.freeze && !next.freeze) {
      const pm = media.get(prev.mediaId), pmax = pm ? (pm.kind === "image" ? 600 : pm.duration) : 1e9, ps = prev.speed || 1, ns = next.speed || 1;
      const d2 = clamp(dx, Math.max(-(oPrev.out - oPrev.in) / ps + MINLEN, -oNext.in / ns), Math.min((pmax - oPrev.out) / ps, (oNext.out - oNext.in) / ns - MINLEN));
      prev.out = oPrev.out + d2 * ps; next.in = oNext.in + d2 * ns; hint(`Dời ${d2 >= 0 ? "+" : ""}${d2.toFixed(2)}s`);
    } else if (tool === "slide" && k === "c") { c.start = Math.max(0, orig.start + dx); hint(fmt(c.start)); }
    else if (tool === "rate" && edge && !isDur(c) && !c.freeze) { const L0 = (orig.out - orig.in) / sp, L = Math.max(MINLEN, edge === "r" ? L0 + dx : L0 - dx); c.speed = clamp(Math.round((orig.out - orig.in) / L * 100) / 100, 0.05, 20); if (edge === "l" && k === "c") c.start = orig.start + (L0 - (orig.out - orig.in) / c.speed); hint(`Tốc độ ${c.speed}x · dài ${fmt(clen(c))}`); }
    else if (tool === "roll" && k === "v" && edge) {
      const a = edge === "r" ? c : prev, b = edge === "r" ? next : c; if (!a || !b) return; const oa = edge === "r" ? orig : oPrev, ob = edge === "r" ? oNext : orig;
      const am = media.get(a.mediaId), amax = am ? (am.kind === "image" ? 600 : am.duration) : 1e9, as = a.speed || 1, bs = b.speed || 1;
      const d2 = clamp(dx, Math.max(-(oa.out - oa.in) / as + MINLEN, -ob.in / bs), Math.min((amax - oa.out) / as, (ob.out - ob.in) / bs - MINLEN));
      if (a.freeze) a.dur = oa.dur + d2; else a.out = oa.out + d2 * as; if (b.freeze) b.dur = ob.dur - d2; else b.in = ob.in + d2 * bs; hint(`Điểm cắt ${d2 >= 0 ? "+" : ""}${d2.toFixed(2)}s`);
    } else if ((tool === "ripple" || tool === "roll") && edge) {
      if (isDur(c) || c.freeze) { if (edge === "r") c.dur = Math.max(MINLEN, orig.dur + dx); else { const d2 = clamp(dx, -orig.start, orig.dur - MINLEN); c.dur = orig.dur - d2; if (tool === "roll") c.start = orig.start + d2; } }
      else if (edge === "r") c.out = clamp(orig.out + dx * sp, orig.in + MINLEN * sp, maxD);
      else { c.in = clamp(orig.in + dx * sp, 0, orig.out - MINLEN * sp); if (tool === "roll" && k === "c") c.start = orig.start + (c.in - orig.in) / sp; }
      if (tool === "ripple" && k === "c") { const delta = cend(c) - cend(orig) ; for (const [x, s0] of trackAfter) x.start = Math.max(0, s0 + delta); }
      hint(`Dài ${fmt(k === "v" ? vlen(c) : clen(c))}`);
    } else return;
    if (k === "v") linkShift(before); layoutClips(); drawFrame();
  };
  const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); info.remove(); if (moved) { if (orig.kf && tool === "ripple" && edge === "l") { const dd = (c.in - orig.in) / sp; if (Math.abs(dd) > 1e-4) { const [, kb] = splitKf(c.kf, dd); if (kb) c.kf = kb; else delete c.kf; } } renderAll(); } };
  window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
}, true);

/* ---------- clip context menu ---------- */
grid.addEventListener("contextmenu", e => {
  const d = e.target.closest(".clip"); if (!d) return; e.preventDefault();
  const k = d.dataset.k, c = (k === "v" ? V : C).find(x => x.id === d.dataset.id); if (!c) return;
  sel = { k, id: c.id }; renderTimeline(); renderInspector(); syncButtons();
  const isMediaV = (k === "v" || c.type === "video");
  openMenu(d, [
    { label: "Cắt", kbd: "Ctrl+X", run: () => copyClip(true) }, { label: "Chép", kbd: "Ctrl+C", run: () => copyClip(false) }, { label: "Dán tại kim", kbd: "Ctrl+V", disabled: !clipBoard, run: pasteClip }, { label: "Dán thuộc tính", kbd: "Ctrl+Alt+V", disabled: !clipBoard, run: pasteAttributes },
    { label: "Xoá và dồn (Ripple delete)", kbd: "Shift+Del", run: rippleDelete }, { label: c.disabled ? "Bật clip" : "Tắt clip", kbd: "Shift+E", run: toggleEnable },
    { label: "Tách tại kim", kbd: "Ctrl+K", run: splitAtPlayhead }, { label: "Nhân bản", kbd: "D", run: duplicateSel },
    { label: "Tốc độ / thời lượng…", kbd: "Ctrl+R", run: () => openSpeedDialog(c, k) },
    ...(isMediaV ? [{ label: "Đứng hình tại kim (Frame hold)", run: () => freezeFrame(3) }, { label: "Vừa khung (Set to frame size)", run: () => { pushUndo(); c.fit = "contain"; delete c.scale; renderAll(); } }, { label: "Lấp đầy khung (Scale to fill)", run: () => { pushUndo(); delete c.fit; delete c.scale; renderAll(); } }] : []),
    { h: "Nhãn màu" }, ...LABELS.map(([id, n]) => ({ label: ((c.label || "") === id ? "✓ " : "") + n, run: () => { pushUndo(); if (id) c.label = id; else delete c.label; renderTimeline(); } })),
    { label: "Đổi tên clip…", run: async () => { const v = await prompt2("Tên clip", c.name || d.querySelector(".cl")?.textContent || ""); if (v != null) { pushUndo(); if (v.trim()) c.name = v.trim(); else delete c.name; renderTimeline(); } } }
  ]);
});
function openSpeedDialog(c, k) {
  const L = k === "v" ? vlen(c) : clen(c), ov = document.createElement("div"); ov.className = "overlay";
  ov.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="spT" style="max-width:420px"><h2 id="spT">Tốc độ / thời lượng</h2>
   <div class="row"><div class="field"><label for="spV">Tốc độ (%)</label><input type="number" id="spV" step="1" min="5" max="2000"></div><div class="field"><label for="spD">Thời lượng (giây)</label><input type="number" id="spD" step="0.01" min="0.2"></div></div>
   <label class="chk"><input type="checkbox" id="spR"> Đảo ngược</label><label class="chk"><input type="checkbox" id="spP" checked> Giữ cao độ âm thanh</label><label class="chk"><input type="checkbox" id="spX" checked> Dồn các clip phía sau (Ripple)</label>
   <div class="row dlg-actions"><button id="spNo">Huỷ</button><button class="primary" id="spOk">Xong</button></div></div>`;
  document.body.appendChild(ov); const sv = ov.querySelector("#spV"), dv = ov.querySelector("#spD"), src = isDur(c) ? null : c.out - c.in;
  sv.value = Math.round((c.speed || 1) * 100); dv.value = L.toFixed(2); ov.querySelector("#spR").checked = !!c.reverse; ov.querySelector("#spP").checked = c.pitch !== false;
  if (isDur(c)) { sv.disabled = true; ov.querySelector("#spR").disabled = true; }
  sv.oninput = () => { if (src) dv.value = (src / (+sv.value / 100)).toFixed(2); }; dv.oninput = () => { if (src) sv.value = Math.round(src / Math.max(0.05, +dv.value) * 100); };
  ov.querySelector("#spNo").onclick = () => ov.remove();
  ov.querySelector("#spOk").onclick = () => { pushUndo(); const before = k === "v" ? vMap() : null, end0 = k === "c" ? cend(c) : 0;
    if (isDur(c)) c.dur = Math.max(MINLEN, +dv.value || L); else { if (c.kf) delete c.kf.speed; c.speed = clamp((+sv.value || 100) / 100, 0.05, 20); if (c.speed === 1) delete c.speed; }
    if (!isDur(c)) { if (ov.querySelector("#spR").checked && hasVideoSrc(c)) c.reverse = true; else delete c.reverse; if (ov.querySelector("#spP").checked) delete c.pitch; else c.pitch = false; }
    if (before && ov.querySelector("#spX").checked) linkShift(before);
    if (k === "c" && ov.querySelector("#spX").checked) { const d = cend(c) - end0; for (const x of C) if (x !== c && x.track === c.track && x.start >= end0 - 1e-3) x.start = Math.max(0, x.start + d); }
    ov.remove(); renderAll(); };
}

/* ---------- decorate timeline: labels, disabled, names, In/Out ---------- */
function decorateTimeline() {
  const labelOf = id => (LABELS.find(l => l[0] === id) || [])[2];
  for (const d of grid.querySelectorAll(".clip")) {
    const f = clipById(d.dataset.id); if (!f) continue; const c = f.c;
    d.classList.toggle("dis", !!c.disabled); const lc = labelOf(c.label); if (lc) d.style.setProperty("--lbl", lc); else d.style.removeProperty("--lbl"); d.classList.toggle("lbl", !!lc);
    if (c.name) { const cl = d.querySelector(".cl"); if (cl) cl.textContent = c.name; }
  }
  for (const tr of tracks) { const head = rowsEl[tr.id]?.querySelector(".thead"); if (!head || head.querySelector(".tsolo")) continue;
    if (tr.type === "audio") { const s = document.createElement("button"); s.className = "tb tsolo"; s.textContent = "S"; s.title = "Solo: chỉ nghe track này"; s.setAttribute("aria-pressed", !!tr.solo); s.onclick = ev => { ev.stopPropagation(); tr.solo = !tr.solo; if (!tr.solo) delete tr.solo; renderTimeline(); liveRefresh(); }; head.insertBefore(s, head.querySelector(".tb:last-of-type")); } }
  drawInOut();
}

/* ---------- track volume / pan / solo ---------- */
const anySolo = () => tracks.some(x => x.solo);
function trackGain(id) { const tr = trackById(id); if (!tr) return 1; if (anySolo() && !tr.solo) return 0; return dbToGain(tr.vol || 0); }
function trackPan(id) { const tr = trackById(id); return tr ? clamp(tr.pan || 0, -1, 1) : 0; }
function trackMixer(tr, anchor) {
  const ov = document.createElement("div"); ov.className = "overlay";
  ov.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="tmT" style="max-width:380px"><h2 id="tmT"></h2><div class="tmx"></div><div class="row dlg-actions"><button class="primary" id="tmOk">Xong</button></div></div>`;
  ov.querySelector("#tmT").textContent = "Âm thanh track · " + tr.name; document.body.appendChild(ov); const b = ov.querySelector(".tmx");
  slider(b, { label: "Âm lượng track", min: -40, max: 12, step: 0.5, get: () => tr.vol || 0, set: v => { tr.vol = v; if (!v) delete tr.vol; }, fmt: v => v <= -40 ? "tắt" : (v > 0 ? "+" : "") + (+v).toFixed(1) + " dB", live: () => liveRefresh() });
  slider(b, { label: "Cân trái/phải", min: -1, max: 1, step: 0.01, get: () => tr.pan || 0, set: v => { tr.pan = Math.abs(v) < 0.02 ? 0 : v; if (!tr.pan) delete tr.pan; }, fmt: v => Math.abs(v) < 0.02 ? "Giữa" : (v < 0 ? "T " : "P ") + Math.round(Math.abs(v) * 100), live: () => liveRefresh() });
  toggle(b, "Solo (chỉ nghe track này)", () => !!tr.solo, v => { tr.solo = v; if (!v) delete tr.solo; liveRefresh(); renderTimeline(); }, "keep");
  ov.querySelector("#tmOk").onclick = () => ov.remove();
}
const _trackMenu = trackMenu;
trackMenu = function (tr, anchor) { _trackMenu(tr, anchor); if (menuEl && (tr.type === "audio" || tr.id === "v" || tr.type === "overlay")) { const bt = document.createElement("button"); bt.setAttribute("role", "menuitem"); bt.textContent = "Âm lượng, cân trái/phải, solo…"; bt.onclick = () => { closeMenu(); trackMixer(tr); }; menuEl.insertBefore(bt, menuEl.firstChild); } };

/* ---------- keyboard (Premiere layout) ---------- */
document.addEventListener("keydown", e => {
  if (trimOpen || e.target.matches("input,select,textarea,[contenteditable]") || document.querySelector(".overlay")) return;
  if (document.querySelector(".ecw")?.contains(document.activeElement) && /^(Delete|Backspace)$/.test(e.key)) return;
  const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey, sh = e.shiftKey, alt = e.altKey, code = e.code;
  const take = () => { e.preventDefault(); e.stopImmediatePropagation(); };
  if (!ctrl && !alt && code === "KeyJ") { take(); const i = SH.indexOf(shuttle); shuttleTo(shuttle > 0 ? -1 : SH[Math.max(0, i - 1)]); return; }
  if (!ctrl && !alt && !sh && code === "KeyK") { take(); shuttleTo(0); return; }
  if (sh && !ctrl && code === "KeyK") { take(); quickKeyframe(); return; }
  if (!ctrl && !alt && code === "KeyL") { take(); const i = SH.indexOf(shuttle); shuttleTo(shuttle < 0 ? 1 : SH[Math.min(SH.length - 1, i + 1)]); return; }
  if (!ctrl && code === "KeyI") { take(); if (sh) { if (inPt != null) seek(inPt); } else { setIn(t); toast("In " + fmt(t)); } return; }
  if (!ctrl && code === "KeyO") { take(); if (sh) { if (outPt != null) seek(outPt); } else { setOut(t); toast("Out " + fmt(t)); } return; }
  if (alt && code === "KeyX") { take(); setIn(null); setOut(null); toast("Đã bỏ In/Out."); return; }
  if (!ctrl && k === ";") { take(); liftExtract(false); return; }
  if (!ctrl && k === "'") { take(); liftExtract(true); return; }
  if (!ctrl && !alt && code === "KeyC") { take(); setTool("blade"); return; }
  if (!ctrl && !alt && code === "KeyV") { take(); setTool("select"); return; }
  if (!ctrl && !alt && !sh && code === "KeyB") { take(); setTool("ripple"); return; }
  if (!ctrl && !alt && code === "KeyN") { take(); setTool("roll"); return; }
  if (!ctrl && !alt && code === "KeyY") { take(); setTool("slip"); return; }
  if (!ctrl && !alt && code === "KeyU") { take(); setTool("slide"); return; }
  if (!ctrl && !alt && code === "KeyR") { take(); setTool("rate"); return; }
  if (!ctrl && !alt && !sh && code === "KeyE") { take(); extendEdit(); return; }
  if (sh && !ctrl && code === "KeyE") { take(); toggleEnable(); return; }
  if (ctrl && code === "KeyK") { take(); pushUndo(); const n = splitAllAt(t); if (n) { renderAll(); toast("Đã thêm điểm cắt trên " + n + " clip."); } else { undoStack.pop(); toast("Không có clip nào dưới kim."); } return; }
  if (ctrl && code === "KeyC") { take(); copyClip(false); return; }
  if (ctrl && code === "KeyX") { take(); copyClip(true); return; }
  if (ctrl && alt && code === "KeyV") { take(); pasteAttributes(); return; }
  if (ctrl && code === "KeyV") { take(); pasteClip(); return; }
  if (ctrl && code === "KeyR") { take(); const s = selClipObj(); if (s) openSpeedDialog(s.c, s.k); return; }
  if (ctrl && code === "KeyD") { take(); const i = (() => { const s = selClipObj(); return s && s.k === "v" ? Math.min(V.indexOf(s.c), V.length - 2) : cutIndexNear(t); })(); applyTransition("fade", i); return; }
  if (sh && !ctrl && code === "KeyD") { take(); const s = selClipObj(); if (!s || (s.c.type !== "audio" && !hasVideoSrc(s.c))) { toast("Chọn clip có âm thanh để thêm crossfade."); return; } pushUndo(); s.c.fadeIn = s.c.fadeIn || 0.5; s.c.fadeOut = s.c.fadeOut || 0.5; renderAll(); toast("Đã thêm fade âm thanh 0,5 giây hai đầu."); return; }
  if (sh && (k === "delete" || k === "backspace")) { take(); rippleDelete(); return; }
  if (k === "arrowup" && !ctrl && !alt) { take(); gotoEdit(-1); return; }
  if (k === "arrowdown" && !ctrl && !alt) { take(); gotoEdit(1); return; }
  if (alt && (k === "arrowleft" || k === "arrowright")) { take(); nudge((k === "arrowleft" ? -1 : 1) * (sh ? 5 : 1) / FPS); return; }
  if (sh && (k === "arrowleft" || k === "arrowright")) { take(); seek(clamp(t + (k === "arrowleft" ? -5 : 5) / FPS, 0, total())); return; }
  if (k === "end") { take(); seek(total()); follow(); return; }
  if (!ctrl && (k === "=" || k === "+")) { take(); setZoom(pps * 1.25); return; }
  if (!ctrl && k === "-") { take(); setZoom(pps / 1.25); return; }
  if (k === "\\") { take(); $("#zoomFit").click(); return; }
  if (sh && code === "KeyM") { take(); const n = markers.find(m => m > t + 1e-3); if (n != null) seek(n); return; }
  if (ctrl && sh && code === "KeyM") { take(); const p = [...markers].reverse().find(m => m < t - 1e-3); if (p != null) seek(p); return; }
}, true);
