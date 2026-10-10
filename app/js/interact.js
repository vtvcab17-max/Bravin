"use strict";
/* ---------- timeline pointer interactions ---------- */
function snapTime(x, exclude) {
  if (!snapOn) return { v: x, s: null };
  const cands = [0, t, ...markers], st = vStarts();
  V.forEach((c, i) => { if (c.id !== exclude) cands.push(st[i], st[i] + vlen(c)); });
  C.forEach(c => { if (c.id !== exclude) cands.push(c.start, cend(c)); });
  let best = null; for (const k of cands) { const dpx = Math.abs(k - x) * pps; if (dpx < 8 && (!best || dpx < best.d)) best = { v: k, d: dpx }; }
  return best ? { v: best.v, s: best.v } : { v: x, s: null };
}
let snapLineEl = null;
function showSnap(s) { if (s == null) { snapLineEl && snapLineEl.remove(); snapLineEl = null; return; } if (!snapLineEl) { snapLineEl = document.createElement("div"); snapLineEl.className = "snapline"; grid.appendChild(snapLineEl); } snapLineEl.style.left = (headW() + s * pps) + "px"; }
function insertIndex(x, excludeId) { const others = V.filter(c => c.id !== excludeId); let acc = 0; for (let k = 0; k < others.length; k++) { const l = vlen(others[k]); if (x < acc + l / 2) return k; acc += l; } return others.length; }
function trackAtY(y) { for (const tr of tracks) { const r = contentEl[tr.id]?.getBoundingClientRect(); if (r && y >= r.top && y <= r.bottom) return tr; } return null; }
/* CapCut-style layers: where would a new video track go for pointer y? → {pos (index in tracks), edge (client y)} or null */
function newTrackZone(y) {
  const vids = tracks.map((tr, i) => [tr, i, contentEl[tr.id]?.getBoundingClientRect()]).filter(([tr, , r]) => r && isVidTr(tr));
  if (!vids.length) return null;
  const [, i0, r0] = vids[0];
  if (y < r0.top + Math.min(14, r0.height * 0.28)) { const rr = rulerEl && rulerEl.getBoundingClientRect(); if (rr && y < rr.top) return null; return { pos: i0, edge: r0.top }; }
  for (const [tr, i, r] of vids) {
    if (y < r.top || y > r.bottom) continue; const z = Math.min(14, r.height * 0.28);
    if (y < r.top + z) return { pos: i, edge: r.top };
    if (tr.type === "overlay" && y > r.bottom - z) return { pos: i + 1, edge: r.bottom };
    return null;
  }
  return null;
}
function overlapsOn(trackId, s, L, exceptId) { return C.some(o => o.track === trackId && o.id !== exceptId && o.start < s + L - 0.02 && cend(o) > s + 0.02); }
let newTrkEl = null;
function showNewTrk(z, s, L, label) {
  if (!z) { newTrkEl && newTrkEl.remove(); newTrkEl = null; return; }
  if (!newTrkEl || !newTrkEl.isConnected) { newTrkEl = document.createElement("div"); newTrkEl.className = "newtrk"; newTrkEl.innerHTML = '<div class="gh"></div>'; grid.appendChild(newTrkEl); }
  const g = grid.getBoundingClientRect(); newTrkEl.style.top = (z.edge - g.top - 1) + "px"; newTrkEl.style.left = headW() + "px"; newTrkEl.style.right = "0";
  const gh = newTrkEl.firstChild; gh.style.left = s * pps + "px"; gh.style.width = Math.max(24, L * pps) + "px"; gh.textContent = label || "Track video mới";
}
function dropEmptyAutoTracks(keep) { tracks = tracks.filter(tr => !(tr.type === "overlay" && tr.auto && tr.id !== keep && !C.some(c => c.track === tr.id))); }

grid.addEventListener("dblclick", e => { const mk = e.target.closest(".marker"); if (mk) { pushUndo(); markers = markers.filter(m => Math.abs(m - +mk.dataset.t) > 1e-3); renderTimeline(); return; } });
let hoverLineEl = null;
grid.addEventListener("pointermove", e => { if (!hoverOn || playing || e.buttons) return; const x = laneX(e); if (x < 0) return; hoverT = clamp(x, 0, total()); if (!hoverLineEl || !hoverLineEl.isConnected) { hoverLineEl = document.createElement("div"); hoverLineEl.className = "hoverline"; grid.appendChild(hoverLineEl); } hoverLineEl.style.left = (headW() + hoverT * pps) + "px"; drawFrame(); });
grid.addEventListener("pointerleave", () => { if (hoverT == null) return; hoverT = null; hoverLineEl && hoverLineEl.remove(); drawFrame(); });
grid.addEventListener("dblclick", e => { const d = e.target.closest(".clip"); if (d && d.dataset.k === "v") { const c = V.find(x => x.id === d.dataset.id); if (c) openTrim(c); } });
grid.addEventListener("pointerdown", e => {
  const trb = e.target.closest(".trb"); if (trb) { e.preventDefault(); const i = +trb.dataset.i; sel = { k: "tr", id: V[i].id }; renderTimeline(); renderInspector(); syncButtons(); if (typeof openSheet === "function") openSheet("insp"); else showTab("insp"); seek(vStarts()[i + 1] - Math.min(0.6, ((V[i].tr && V[i].tr.dur) || 0.5))); return; }
  const clipD = e.target.closest(".clip");
  if (!clipD) { if (e.target.closest(".thead")) return; const mk = e.target.closest(".marker"); if (mk) { seek(+mk.dataset.t); return; }
    if (e.pointerType === "touch" && !e.target.closest(".ruler")) { const x0 = e.clientX, y0 = e.clientY; const up = ev => { window.removeEventListener("pointerup", up); if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 10) seek(clamp(laneX(ev), 0, total())); }; window.addEventListener("pointerup", up); return; } // touch: swipe scrolls, tap moves the playhead
    if (e.target.closest(".tcontent")) scrub(e); return; }
  if (e.button !== 0) return;
  e.preventDefault();
  const k = clipD.dataset.k, id = clipD.dataset.id, list = k === "v" ? V : C, c = list.find(x => x.id === id); if (!c) return;
  const m = c.mediaId ? media.get(c.mediaId) : null;
  if (tool === "blade") { if (isLocked(clipTrack(k, c))) { toast("Track đang khoá."); return; } const x = snapTime(laneX(e), null).v; const st = vStarts(), s0 = k === "v" ? st[V.indexOf(c)] : c.start, L = k === "v" ? vlen(c) : clen(c); if (x > s0 + 0.03 && x < s0 + L - 0.03) { pushUndo(); const b = k === "v" ? splitV(c, x - s0) : splitC(c, x); sel = { k, id: b.id }; t = x; renderAll(); } return; }
  if (isLocked(clipTrack(k, c))) { sel = { k, id }; renderInspector(); syncButtons(); toast("Track đang khoá. Mở khoá ở đầu track để sửa."); return; }
  const isNewSel = !sel || sel.id !== id; if (isNewSel) focusMotion(c);
  sel = { k, id }; renderInspector(); syncButtons(); if (!document.body.classList.contains("aibusy")) showTab("insp");
  grid.querySelectorAll(".clip.sel").forEach(x => x.classList.remove("sel")); clipD.classList.add("sel");
  const handle = e.target.dataset.h, x0 = e.clientX, orig = { ...c }; let moved = false, insEl = null; const before = snapshot(), beforeMap = vMap();
  const vi = V.indexOf(c), nextV = k === "v" ? V[vi + 1] : null, origNextGap = nextV ? (nextV.gap || 0) : 0, origL = k === "v" ? vlen(c) : 0;
  const maxD = m ? (m.kind === "image" ? 600 : m.duration) : 1e9;
  const grabOff = laneX(e) - (k === "v" ? vStarts()[vi] : c.start); let layer = null; // layer: {mode:"new",pos,start} | {mode:"ovl",track,start} | {mode:"main",idx}
  const onMove = ev => {
    const dx = (ev.clientX - x0) / pps; if (Math.abs(ev.clientX - x0) > 3 || Math.abs(ev.clientY - e.clientY) > 6) moved = true; if (!moved) return;
    if (k === "v") {
      if (handle === "l") {
        if (c.freeze) { const d = clamp(dx, -(orig.gap || 0) * (magnetOn ? 0 : 1) - (magnetOn ? 0 : 0), orig.dur - MINLEN); c.dur = orig.dur - d; if (!magnetOn) c.gap = (orig.gap || 0) + d; }
        else { const sp = c.speed || 1, lo = magnetOn ? 0 : Math.max(0, orig.in - (orig.gap || 0) * sp); c.in = clamp(orig.in + dx * sp, Math.min(lo, orig.in), orig.out - MINLEN * sp); if (!magnetOn) c.gap = Math.max(0, (orig.gap || 0) + (c.in - orig.in) / sp); }
        layoutClips();
      }
      else if (handle === "r") {
        if (c.freeze) c.dur = Math.max(MINLEN, orig.dur + dx); else { const sp = c.speed || 1; c.out = clamp(orig.out + dx * sp, orig.in + MINLEN * sp, magnetOn || !nextV ? maxD : Math.min(maxD, orig.out + origNextGap * sp)); }
        if (!magnetOn && nextV) nextV.gap = Math.max(0, origNextGap - (vlen(c) - origL));
        layoutClips();
      }
      else if (!magnetOn) {
        c.gap = Math.max(0, (orig.gap || 0) + dx); layoutClips(); // later clips keep their own gaps and move along
      }
      else {
        clipD.classList.add("dragging"); clipD.style.transform = `translate(${ev.clientX - x0}px,${ev.clientY - e.clientY}px)`;
        layer = null; showNewTrk(null);
        if (!c.freeze) { const s = snapTime(Math.max(0, laneX(ev) - grabOff), c.id).v, L = vlen(c), z = newTrackZone(ev.clientY), tr = trackAtY(ev.clientY);
          if (z) { layer = { mode: "new", pos: z.pos, start: s }; showNewTrk(z, s, L, "Track video mới"); }
          else if (tr && tr.type === "overlay" && !tr.lock) { if (overlapsOn(tr.id, s, L)) { const zz = { pos: tracks.indexOf(tr), edge: contentEl[tr.id].getBoundingClientRect().top }; layer = { mode: "new", pos: zz.pos, start: s }; showNewTrk(zz, s, L, "Track video mới"); } else { layer = { mode: "ovl", track: tr.id, start: s }; showNewTrk({ edge: contentEl[tr.id].getBoundingClientRect().top + contentEl[tr.id].getBoundingClientRect().height / 2 }, s, L, "Đặt vào " + tr.name); } }
          if (layer) { insEl && insEl.remove(); insEl = null; clipD._idx = null; return; } }
        const idx = insertIndex(laneX(ev), c.id), others = V.filter(x => x !== c); let acc = 0; for (let q = 0; q < idx; q++) acc += vlen(others[q]);
        if (!insEl) { insEl = document.createElement("div"); insEl.className = "insert"; contentEl.v.appendChild(insEl); }
        insEl.style.left = (acc * pps - 1) + "px"; clipD._idx = idx;
      }
    } else {
      if (handle === "l") {
        const ns = snapTime(orig.start + dx, c.id); let d = ns.v - orig.start;
        if (isDur(c)) { d = clamp(d, -orig.start, orig.dur - MINLEN); c.start = orig.start + d; c.dur = orig.dur - d; if (c.type === "compound") c.off = (orig.off || 0) + d; }
        else { const sp = c.speed || 1; d = clamp(d, -Math.min(orig.in / sp, orig.start), clen(orig) - MINLEN); c.in = orig.in + d * sp; c.start = orig.start + d; }
        showSnap(ns.s); layoutClips();
      } else if (handle === "r") {
        const ns = snapTime(cend(orig) + dx, c.id);
        if (isDur(c)) c.dur = Math.max(MINLEN, ns.v - orig.start); else { const sp = c.speed || 1; c.out = clamp(orig.in + (ns.v - orig.start) * sp, orig.in + MINLEN * sp, maxD); }
        showSnap(ns.s); layoutClips();
      } else {
        const ns = snapTime(Math.max(0, orig.start + dx), c.id), ne = snapTime(Math.max(0, orig.start + dx) + clen(c), c.id);
        c.start = (ne.s != null && ns.s == null) ? Math.max(0, ne.v - clen(c)) : Math.max(0, ns.v); showSnap(ns.s ?? ne.s);
        layer = null; showNewTrk(null); insEl && insEl.remove(); insEl = null;
        if (c.type === "video") {
          const z = newTrackZone(ev.clientY), tr = trackAtY(ev.clientY);
          if (z) { layer = { mode: "new", pos: z.pos, start: c.start }; showNewTrk(z, c.start, clen(c), "Track video mới"); clipD.style.opacity = ".55"; layoutClips(); return; }
          if (tr && tr.type === "video" && !tr.lock) { const idx = insertIndex(laneX(ev), null); let acc = 0; for (let q = 0; q < idx; q++) acc += vlen(V[q]);
            insEl = document.createElement("div"); insEl.className = "insert"; insEl.style.left = (acc * pps - 1) + "px"; contentEl.v.appendChild(insEl); layer = { mode: "main", idx }; clipD.style.opacity = ".55"; layoutClips(); return; }
          if (tr && tr.type === "overlay" && tr.id !== c.track && !tr.lock && overlapsOn(tr.id, c.start, clen(c), c.id)) { const zz = { pos: tracks.indexOf(tr), edge: contentEl[tr.id].getBoundingClientRect().top }; layer = { mode: "new", pos: zz.pos, start: c.start }; showNewTrk(zz, c.start, clen(c), "Track video mới"); clipD.style.opacity = ".55"; layoutClips(); return; }
          clipD.style.opacity = "";
        }
        const tr = trackAtY(ev.clientY); if (tr && tr.type === ttype(c) && tr.id !== c.track && !tr.lock) { c.track = tr.id; contentEl[tr.id].appendChild(clipD); }
        layoutClips();
      }
    }
  };
  const onUp = () => {
    window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); window.removeEventListener("pointercancel", onUp);
    showSnap(null); insEl && insEl.remove(); showNewTrk(null);
    if (!moved && document.body.classList.contains("phone") && typeof openSheet === "function" && !document.body.classList.contains("aibusy")) openSheet("insp");
    if (moved && handle === "l") { const d = k === "v" ? (c.freeze ? orig.dur - c.dur : (c.in - orig.in) / (c.speed || 1)) : c.start - orig.start; if (Math.abs(d) > 1e-4 && c.kf) { const [, kb] = splitKf(c.kf, d); if (kb) c.kf = kb; else delete c.kf; } if (c.words && d) c.words = c.words.map(w => [w[0] - d, w[1] - d, w[2]]).filter(w => w[1] > 0); }
    if (moved && layer) { // move between layers (CapCut style)
      const P = ["flip", "rot", "scale", "x", "y", "crop", "adj", "reverse", "zoom", "vol", "muted"];
      if (k === "v") { // main → overlay layer
        const i = V.indexOf(c); V.splice(i, 1); linkShift(beforeMap);
        const tr = layer.mode === "new" ? addTrack("overlay", layer.pos) : trackById(layer.track);
        const oc = { id: nid("c"), track: tr.id, type: "video", mediaId: c.mediaId, start: layer.start, in: c.in, out: c.out }; P.forEach(p => { if (c[p] != null) oc[p] = c[p]; }); if (oc.scale == null) oc.scale = 1;
        C.push(oc); sel = { k: "c", id: oc.id }; toast("Đã đưa clip lên " + tr.name);
      } else if (layer.mode === "new") { const tr = addTrack("overlay", layer.pos); c.track = tr.id; dropEmptyAutoTracks(tr.id); toast("Đã tạo " + tr.name); }
      else if (layer.mode === "main") { // overlay → main track
        C = C.filter(x => x !== c); const vc = { id: nid("v"), mediaId: c.mediaId, in: c.in, out: c.out, zoom: c.zoom || "none", vol: c.vol || 0, muted: !!c.muted }; P.forEach(p => { if (c[p] != null && vc[p] == null) vc[p] = c[p]; });
        V.splice(layer.idx, 0, vc); linkShift(beforeMap); dropEmptyAutoTracks(); sel = { k: "v", id: vc.id }; toast("Đã đưa clip xuống track chính");
      }
      undoStack.push(before); if (undoStack.length > 100) undoStack.shift(); redoStack = []; t = Math.min(t, total()); renderAll(); return;
    }
    if (moved && k === "c" && c.type === "video") dropEmptyAutoTracks();
    if (!moved) { const st = vStarts(); const s0 = k === "v" ? st[V.indexOf(c)] : c.start, L = k === "v" ? vlen(c) : clen(c); if (t < s0 || t > s0 + L) seek(s0); renderAll(); return; }
    if (k === "v" && !handle && clipD._idx != null) { const i = V.indexOf(c); V.splice(i, 1); V.splice(clipD._idx, 0, c); }
    if (k === "v") linkShift(beforeMap);
    undoStack.push(before); if (undoStack.length > 100) undoStack.shift(); redoStack = []; t = Math.min(t, total()); renderAll();
  };
  window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp); window.addEventListener("pointercancel", onUp);
});
function scrub(e) {
  const wasPlaying = playing; if (playing) pause();
  const move = ev => { t = clamp(laneX(ev), 0, total()); placePlayhead(); drawFrame(); };
  move(e); const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); if (wasPlaying) play(); };
  window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
}

/* ---------- drag from library: insert or replace ---------- */
function clipUnder(x) { // x in timeline seconds → V clip + local fraction
  const st = vStarts(); for (let i = 0; i < V.length; i++) { const s = st[i], L = vlen(V[i]); if (x >= s && x < s + L) return { c: V[i], i, frac: (x - s) / L, px: L * pps }; } return null;
}
function binDragStart(e, m, item) {
  if (e.button !== undefined && e.button !== 0) return;
  if (e.target.closest(".add")) return;
  const x0 = e.clientX, y0 = e.clientY, isTouch = e.pointerType === "touch";
  let card = null, target = null, insEl = null, repEl = null, holdOk = !isTouch;
  const holdTimer = isTouch ? setTimeout(() => { holdOk = true; item.classList.add("armed"); try { navigator.vibrate && navigator.vibrate(12); } catch (_) {} }, 220) : null;
  const noScroll = ev => { if (holdOk) ev.preventDefault(); }; if (isTouch) item.addEventListener("touchmove", noScroll, { passive: false });
  const binBox = item.closest(".bin"), st0 = binBox ? binBox.scrollTop : 0; let swiping = false;
  const clear = () => { Object.values(contentEl).forEach(el => el.classList.remove("over")); insEl && insEl.remove(); insEl = null; repEl && repEl.classList.remove("replace"); repEl = null; card && card.classList.remove("rep"); };
  const move = ev => {
    if (!card) {
      if (swiping) { if (binBox) binBox.scrollTop = st0 - (ev.clientY - y0); return; }
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
      if (!holdOk) { clearTimeout(holdTimer); swiping = true; if (binBox) binBox.scrollTop = st0 - (ev.clientY - y0); return; } // quick swipe = scroll the library
      card = document.createElement("div"); card.className = "dragcard"; if (m.thumb) card.style.backgroundImage = `url(${m.thumb})`;
      card.innerHTML = "<span></span>"; card.querySelector("span").textContent = m.name; document.body.appendChild(card);
    }
    ev.preventDefault(); card.style.transform = `translate(${ev.clientX - 38}px,${ev.clientY - 50}px)`;
    clear(); target = null;
    const tr = trackAtY(ev.clientY); const r = scroller.getBoundingClientRect();
    showNewTrk(null);
    if (ev.clientX < r.left + headW()) return;
    const x = laneX(ev), mL = m.kind === "image" ? 3 : m.duration;
    if (m.kind !== "audio" && trackById("v") && V.length) {
      const z = newTrackZone(ev.clientY);
      const zz = z || (tr && tr.type === "overlay" && overlapsOn(tr.id, snapTime(Math.max(0, x), null).v, mL) ? { pos: tracks.indexOf(tr), edge: contentEl[tr.id].getBoundingClientRect().top } : null);
      if (zz) { const s = snapTime(Math.max(0, x), null).v; showNewTrk(zz, s, mL, "Track video mới · " + m.name); target = { mode: "newtrack", pos: zz.pos, start: s }; autoScroll(); return; }
    }
    if (!tr) { autoScroll(); return; }
    if (m.kind !== "audio" && tr.type === "video" && !tr.lock) {
      const u = clipUnder(x); const edge = u ? Math.min(0.22, 14 / Math.max(1, u.px)) : 0;
      if (u && u.frac > edge && u.frac < 1 - edge) {
        repEl = grid.querySelector(`.clip[data-id="${u.c.id}"]`); repEl && repEl.classList.add("replace"); card.classList.add("rep");
        target = { mode: "replace", c: u.c };
      } else {
        contentEl.v.classList.add("over"); const idx = insertIndex(x, null); let acc = 0; for (let q = 0; q < idx; q++) acc += vlen(V[q]);
        insEl = document.createElement("div"); insEl.className = "insert"; insEl.style.left = (acc * pps - 1) + "px"; contentEl.v.appendChild(insEl);
        target = { mode: "insert", index: idx };
      }
    } else if (m.kind !== "audio" && tr.type === "overlay" && !tr.lock) {
      contentEl[tr.id].classList.add("over"); const s = snapTime(Math.max(0, x), null).v;
      insEl = document.createElement("div"); insEl.className = "insert"; insEl.style.left = (s * pps - 1) + "px"; contentEl[tr.id].appendChild(insEl);
      target = { mode: "overlay", track: tr.id, start: s };
    } else if (m.kind === "audio" && tr.type === "audio" && !tr.lock) {
      contentEl[tr.id].classList.add("over"); const s = snapTime(Math.max(0, x), null).v;
      insEl = document.createElement("div"); insEl.className = "insert"; insEl.style.left = (s * pps - 1) + "px"; contentEl[tr.id].appendChild(insEl);
      target = { mode: "audio", track: tr.id, start: s };
    }
    autoScroll();
    function autoScroll() { if (ev.clientX > r.right - 40) scroller.scrollLeft += 18; else if (ev.clientX < r.left + headW() + 30) scroller.scrollLeft -= 18;
      if (ev.clientY > r.bottom - 24) scroller.scrollTop += 10; else if (ev.clientY < r.top + 36) scroller.scrollTop -= 10; }
  };
  const up = () => {
    const tg = card ? target : null; cleanup();
    if (!tg) return;
    if (tg.mode === "replace") { pushUndo(); replaceClip(tg.c, m); sel = { k: "v", id: tg.c.id }; renderAll(); if (m.kind === "video") openTrim(tg.c, { replaced: true }); else toast("Đã thay bằng " + m.name); }
    else if (tg.mode === "insert") { appendMedia(m, tg.index); toast("Đã chèn " + m.name); }
    else if (tg.mode === "newtrack") { appendMedia(m, null, { overlay: true, newPos: tg.pos, start: tg.start }); toast("Đã thêm " + m.name + " vào track video mới"); }
    else if (tg.mode === "overlay") { appendMedia(m, null, { overlay: tg.track, start: tg.start }); toast("Đã thêm " + m.name + " vào track phủ"); }
    else { appendMedia(m, null, { track: tg.track, start: tg.start }); toast("Đã thêm " + m.name); }
  };
  function cleanup() { clearTimeout(holdTimer); item.classList.remove("armed"); item.removeEventListener("touchmove", noScroll); clear(); showNewTrk(null); card && card.remove(); card = null; window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cleanup); }
  window.addEventListener("pointermove", move, { passive: false }); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", cleanup);
}

/* ---------- trim (choose segment) dialog ---------- */
let trimOpen = null;
function openTrim(c, opts = {}) {
  const m = media.get(c.mediaId); if (!m || m.kind !== "video") { toast("Bảng chọn đoạn chỉ dùng cho clip video."); return; }
  if (trimOpen) trimOpen.close(false);
  pause(); if (!opts.replaced) pushUndo();
  const startSnap = undoStack[undoStack.length - 1];
  const ov = document.createElement("div"); ov.className = "overlay";
  ov.innerHTML = `<div class="dialog trimdlg" role="dialog" aria-modal="true" aria-labelledby="trT">
    <h2 id="trT">Chọn đoạn · <span id="trName"></span></h2>
    <div class="trimtop">
      <video id="trV" muted playsinline preload="auto"></video>
      <div style="display:flex;flex-direction:column;gap:10px;min-width:0">
        <div class="tc" style="font-size:12px;line-height:1.6;font-family:var(--ui)">Kéo <b style="color:var(--gold)">khung vàng</b> để chọn đoạn trong source. Độ dài đoạn giữ nguyên ${fmt(vlen(c))} để khớp voice và phụ đề. Kéo hai mép khung nếu muốn đổi độ dài (các cảnh sau sẽ dịch theo).</div>
        <div class="row" style="align-items:center"><span class="tc">Vào <b id="trIn"></b></span><span class="tc">Ra <b id="trOut"></b></span><span class="tc">Dài <b id="trLen"></b></span></div>
        <div class="row"><button id="trPlay"><svg class="i" viewBox="0 0 24 24"><path d="M7 5l12 7-12 7z"/></svg>Xem thử đoạn</button><button id="trStart">Lấy từ đầu source</button></div>
      </div>
    </div>
    <div class="tstrip" id="trStrip"><div class="shade" id="shL"></div><div class="shade" id="shR"></div><div class="twin" id="trWin"><div class="h l" data-h="l"></div><div class="h r" data-h="r"></div></div><div class="tphead" id="trPh"></div></div>
    <div class="row" style="justify-content:space-between"><span class="tc">00:00</span><span class="tc">${fmt(m.duration)}</span></div>
    <div class="row" style="justify-content:flex-end"><button id="trCancel">Huỷ</button><button class="primary" id="trOk">Xong</button></div>
  </div>`;
  document.body.appendChild(ov);
  $("#trName").textContent = m.name;
  const vid = $("#trV"); vid.src = m.url; const strip = $("#trStrip"), win = $("#trWin");
  if (m.strip) strip.style.backgroundImage = `url(${m.strip})`;
  const D = m.duration;
  const paint = () => {
    const W = strip.clientWidth; win.style.left = (c.in / D * W) + "px"; win.style.width = Math.max(6, vlen(c) / D * W) + "px";
    $("#shL").style.cssText = `left:0;width:${c.in / D * W}px`; $("#shR").style.cssText = `left:${c.out / D * W}px;right:0`;
    $("#trIn").textContent = fmt(c.in); $("#trOut").textContent = fmt(c.out); $("#trLen").textContent = fmt(vlen(c));
  };
  const showAt = time => { if (!$("#trPh")) return; vid.currentTime = clamp(time, 0, D - 0.02); $("#trPh").style.left = (time / D * strip.clientWidth) + "px"; };
  paint(); vid.addEventListener("loadedmetadata", () => showAt(c.in), { once: true });
  let looping = false;
  vid.addEventListener("timeupdate", () => { if (!$("#trPh")) return; $("#trPh").style.left = (vid.currentTime / D * strip.clientWidth) + "px"; if (looping && vid.currentTime >= c.out - 0.03) vid.currentTime = c.in; });
  $("#trPlay").onclick = () => { if (looping) { looping = false; vid.pause(); $("#trPlay").lastChild.textContent = "Xem thử đoạn"; } else { looping = true; vid.currentTime = c.in; vid.play().catch(() => {}); $("#trPlay").lastChild.textContent = "Dừng xem"; } };
  $("#trStart").onclick = () => { const L = vlen(c); c.in = 0; c.out = Math.min(D, L); paint(); showAt(c.in); layoutClips(); drawFrame(); };
  strip.addEventListener("pointerdown", e => {
    e.preventDefault(); const W = strip.clientWidth, x0 = e.clientX, o = { ...c }, h = e.target.dataset.h, onWin = e.target.closest("#trWin");
    if (!onWin) { // click outside window: centre the window there
      const r = strip.getBoundingClientRect(), L = vlen(c), mid = (e.clientX - r.left) / W * D; c.in = clamp(mid - L / 2, 0, D - L); c.out = c.in + L; paint(); showAt(c.in); layoutClips(); drawFrame(); return;
    }
    looping = false; vid.pause();
    const mv = ev => { const d = (ev.clientX - x0) / W * D;
      if (h === "l") { c.in = clamp(o.in + d, 0, o.out - MINLEN); showAt(c.in); }
      else if (h === "r") { c.out = clamp(o.out + d, o.in + MINLEN, D); showAt(c.out - 0.03); }
      else { const L = vlen(o); c.in = clamp(o.in + d, 0, D - L); c.out = c.in + L; showAt(c.in); }
      paint(); layoutClips(); drawFrame(); };
    const upf = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", upf); renderTimeline(); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", upf);
  });
  const close = ok => {
    looping = false; vid.pause(); vid.removeAttribute("src"); vid.load(); ov.remove(); trimOpen = null; window.removeEventListener("keydown", esc, true);
    if (!ok && startSnap) { restore(startSnap); undoStack.pop(); syncButtons(); }
    else { sel = { k: "v", id: c.id }; const st = vStarts(); const i = V.indexOf(c); if (i >= 0) seek(st[i]); renderAll(); toast("Đã cập nhật đoạn " + m.name); }
  };
  const esc = e => { if (e.key === "Escape") { e.stopPropagation(); close(false); } if (e.key === "Enter" && !tmatch(e, "textarea")) { e.preventDefault(); e.stopPropagation(); close(true); } };
  window.addEventListener("keydown", esc, true);
  $("#trCancel").onclick = () => close(false); $("#trOk").onclick = () => close(true);
  trimOpen = { close, c };
  setTimeout(() => $("#trOk").focus(), 50);
}

