import re,sys
p='p/index.html'; s=open(p,encoding='utf-8').read()
def rep(a,b,cnt=1):
    global s
    n=s.count(a)
    if n!=cnt: sys.exit(f"count {n} for: {a[:70]}")
    s=s.replace(a,b)

# CSS: new-track indicator
rep(".snapline{", ".newtrk{position:absolute;height:0;border-top:2px solid var(--accent);pointer-events:none;z-index:12;box-shadow:0 0 8px var(--accent)}\n.newtrk .gh{position:absolute;top:-13px;height:24px;border:1.5px dashed var(--accent);background:rgba(0,151,204,.22);border-radius:4px;color:#fff;font-size:10.5px;line-height:22px;padding:0 6px;white-space:nowrap;overflow:hidden}\n.snapline{")

# unique video element per overlay track
rep("drawClipMedia(c, T - c.start, 2 + (ti % 2))", "drawClipMedia(c, T - c.start, 2 + ti)")
rep("syncOne(c, t - c.start, 2 + (ti % 2), tr.off)", "syncOne(c, t - c.start, 2 + ti, tr.off)")

# auto names Video 2, Video 3... (bottom-up)
rep("function renderTimeline() {", """const isVidTr = tr => tr.type === "video" || tr.type === "overlay";
function renumberTracks() { let k = 1; for (let i = tracks.length - 1; i >= 0; i--) { const tr = tracks[i]; if (!isVidTr(tr)) continue; if (tr.type === "overlay") { k++; if (tr.auto || /^Video phủ( \\d+)?$/.test(tr.name)) { tr.auto = true; tr.name = "Video " + k; } } } }
function renderTimeline() {
  renumberTracks();""")
rep("const done = ok => { if (ok && inp.value.trim()) tr.name = inp.value.trim(); renderTimeline(); };",
    "const done = ok => { if (ok && inp.value.trim() && inp.value.trim() !== tr.name) { tr.name = inp.value.trim(); tr.auto = false; } renderTimeline(); };")
rep("""const n = tracks.filter(x => x.type === type).length + 1, tr = { id: nid(type === "overlay" ? "o" : type[0]), type, name: TRACK_NAMES[type] + (n > 1 ? " " + n : "") };""",
    """const n = tracks.filter(x => x.type === type).length + 1, tr = { id: nid(type === "overlay" ? "o" : type[0]), type, name: TRACK_NAMES[type] + (n > 1 ? " " + n : "") }; if (type === "overlay") tr.auto = true;""")

# appendMedia: create a new overlay track at a position inside the same undo step
rep("const tr = trackById(opts.overlay) || addTrack(\"overlay\");",
    "const tr = opts.newPos != null ? addTrack(\"overlay\", opts.newPos) : (trackById(opts.overlay) || addTrack(\"overlay\"));")

# helpers placed after trackAtY
rep("function trackAtY(y) { for (const tr of tracks) { const r = contentEl[tr.id]?.getBoundingClientRect(); if (r && y >= r.top && y <= r.bottom) return tr; } return null; }",
"""function trackAtY(y) { for (const tr of tracks) { const r = contentEl[tr.id]?.getBoundingClientRect(); if (r && y >= r.top && y <= r.bottom) return tr; } return null; }
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
function dropEmptyAutoTracks(keep) { tracks = tracks.filter(tr => !(tr.type === "overlay" && tr.auto && tr.id !== keep && !C.some(c => c.track === tr.id))); }""")

# ---- library drag: new track zones + overlap → new track above
rep("""    const tr = trackAtY(ev.clientY); const r = scroller.getBoundingClientRect();
    if (!tr || ev.clientX < r.left + headW()) return;
    const x = laneX(ev);
    if (m.kind !== "audio" && tr.type === "video" && !tr.lock) {""",
"""    const tr = trackAtY(ev.clientY); const r = scroller.getBoundingClientRect();
    showNewTrk(null);
    if (ev.clientX < r.left + headW()) return;
    const x = laneX(ev), mL = m.kind === "image" ? 3 : m.duration;
    if (m.kind !== "audio" && trackById("v") && V.length) {
      const z = newTrackZone(ev.clientY);
      const zz = z || (tr && tr.type === "overlay" && overlapsOn(tr.id, snapTime(Math.max(0, x), null).v, mL) ? { pos: tracks.indexOf(tr), edge: contentEl[tr.id].getBoundingClientRect().top } : null);
      if (zz) { const s = snapTime(Math.max(0, x), null).v; showNewTrk(zz, s, mL, "Track video mới · " + m.name); target = { mode: "newtrack", pos: zz.pos, start: s }; autoScroll(); return; }
    }
    if (!tr) { autoScroll(); return; }
    if (m.kind !== "audio" && tr.type === "video" && !tr.lock) {""")
rep("""    if (ev.clientX > r.right - 40) scroller.scrollLeft += 18; else if (ev.clientX < r.left + headW() + 30) scroller.scrollLeft -= 18;
    if (ev.clientY > r.bottom - 24) scroller.scrollTop += 10; else if (ev.clientY < r.top + 36) scroller.scrollTop -= 10;
  };""",
"""    autoScroll();
    function autoScroll() { if (ev.clientX > r.right - 40) scroller.scrollLeft += 18; else if (ev.clientX < r.left + headW() + 30) scroller.scrollLeft -= 18;
      if (ev.clientY > r.bottom - 24) scroller.scrollTop += 10; else if (ev.clientY < r.top + 36) scroller.scrollTop -= 10; }
  };""")
rep("""    else if (tg.mode === "overlay") {""", """    else if (tg.mode === "newtrack") { appendMedia(m, null, { overlay: true, newPos: tg.pos, start: tg.start }); toast("Đã thêm " + m.name + " vào track video mới"); }
    else if (tg.mode === "overlay") {""")
rep("function cleanup() { clearTimeout(holdTimer); clear();", "function cleanup() { clearTimeout(holdTimer); clear(); showNewTrk(null);")

# ---- moving clips between layers
rep("""  const maxD = m ? (m.kind === "image" ? 600 : m.duration) : 1e9;
  const onMove = ev => {""", """  const maxD = m ? (m.kind === "image" ? 600 : m.duration) : 1e9;
  const grabOff = laneX(e) - (k === "v" ? vStarts()[vi] : c.start); let layer = null; // layer: {mode:"new",pos,start} | {mode:"ovl",track,start} | {mode:"main",idx}
  const onMove = ev => {""")
# V clip, magnet branch: detect leaving main row upward
rep("""      else {
        clipD.classList.add("dragging"); clipD.style.transform = `translateX(${ev.clientX - x0}px)`;
        const idx = insertIndex(laneX(ev), c.id), others = V.filter(x => x !== c); let acc = 0; for (let q = 0; q < idx; q++) acc += vlen(others[q]);""",
"""      else {
        clipD.classList.add("dragging"); clipD.style.transform = `translate(${ev.clientX - x0}px,${ev.clientY - e.clientY}px)`;
        layer = null; showNewTrk(null);
        if (!c.freeze) { const s = snapTime(Math.max(0, laneX(ev) - grabOff), c.id).v, L = vlen(c), z = newTrackZone(ev.clientY), tr = trackAtY(ev.clientY);
          if (z) { layer = { mode: "new", pos: z.pos, start: s }; showNewTrk(z, s, L, "Track video mới"); }
          else if (tr && tr.type === "overlay" && !tr.lock) { if (overlapsOn(tr.id, s, L)) { const zz = { pos: tracks.indexOf(tr), edge: contentEl[tr.id].getBoundingClientRect().top }; layer = { mode: "new", pos: zz.pos, start: s }; showNewTrk(zz, s, L, "Track video mới"); } else { layer = { mode: "ovl", track: tr.id, start: s }; showNewTrk({ edge: contentEl[tr.id].getBoundingClientRect().top + contentEl[tr.id].getBoundingClientRect().height / 2 }, s, L, "Đặt vào " + tr.name); } }
          if (layer) { insEl && insEl.remove(); insEl = null; clipD._idx = null; return; } }
        const idx = insertIndex(laneX(ev), c.id), others = V.filter(x => x !== c); let acc = 0; for (let q = 0; q < idx; q++) acc += vlen(others[q]);""")
# overlay clip body move
rep("""        const tr = trackAtY(ev.clientY); if (tr && tr.type === ttype(c) && tr.id !== c.track && !tr.lock) { c.track = tr.id; contentEl[tr.id].appendChild(clipD); }
        layoutClips();""",
"""        layer = null; showNewTrk(null); insEl && insEl.remove(); insEl = null;
        if (c.type === "video") {
          const z = newTrackZone(ev.clientY), tr = trackAtY(ev.clientY);
          if (z) { layer = { mode: "new", pos: z.pos, start: c.start }; showNewTrk(z, c.start, clen(c), "Track video mới"); clipD.style.opacity = ".55"; layoutClips(); return; }
          if (tr && tr.type === "video" && !tr.lock && !c.reverse) { const idx = insertIndex(laneX(ev), null); let acc = 0; for (let q = 0; q < idx; q++) acc += vlen(V[q]);
            insEl = document.createElement("div"); insEl.className = "insert"; insEl.style.left = (acc * pps - 1) + "px"; contentEl.v.appendChild(insEl); layer = { mode: "main", idx }; clipD.style.opacity = ".55"; layoutClips(); return; }
          if (tr && tr.type === "overlay" && tr.id !== c.track && !tr.lock && overlapsOn(tr.id, c.start, clen(c), c.id)) { const zz = { pos: tracks.indexOf(tr), edge: contentEl[tr.id].getBoundingClientRect().top }; layer = { mode: "new", pos: zz.pos, start: c.start }; showNewTrk(zz, c.start, clen(c), "Track video mới"); clipD.style.opacity = ".55"; layoutClips(); return; }
          clipD.style.opacity = "";
        }
        const tr = trackAtY(ev.clientY); if (tr && tr.type === ttype(c) && tr.id !== c.track && !tr.lock) { c.track = tr.id; contentEl[tr.id].appendChild(clipD); }
        layoutClips();""")
rep("""    showSnap(null); insEl && insEl.remove();
    if (!moved) {""", """    showSnap(null); insEl && insEl.remove(); showNewTrk(null);
    if (moved && layer) { // move between layers (CapCut style)
      const P = ["flip", "rot", "scale", "x", "y", "crop", "adj", "reverse", "zoom", "vol", "muted"];
      if (k === "v") { // main → overlay layer
        const i = V.indexOf(c); V.splice(i, 1); linkShift(beforeMap);
        const tr = layer.mode === "new" ? addTrack("overlay", layer.pos) : trackById(layer.track);
        const oc = { id: nid("c"), track: tr.id, type: "video", mediaId: c.mediaId, start: layer.start, in: c.in, out: c.out }; P.forEach(p => { if (c[p] != null) oc[p] = c[p]; }); if (oc.scale == null) oc.scale = 1;
        C.push(oc); sel = { k: "c", id: oc.id }; toast("Đã đưa clip lên " + tr.name);
      } else if (layer.mode === "new") { const tr = addTrack("overlay", layer.pos); c.track = tr.id; dropEmptyAutoTracks(tr.id); toast("Đã tạo " + tr.name); }
      else if (layer.mode === "main") { // overlay → main track
        C = C.filter(x => x !== c); const vc = { id: nid("v"), mediaId: c.mediaId, in: c.in, out: c.out, zoom: c.zoom || "none", vol: c.vol || 0, muted: !!c.muted }; P.forEach(p => { if (c[p] != null && vc[p] == null) vc[p] = c[p]; }); delete vc.reverse;
        V.splice(layer.idx, 0, vc); linkShift(beforeMap); dropEmptyAutoTracks(); sel = { k: "v", id: vc.id }; toast("Đã đưa clip xuống track chính");
      }
      undoStack.push(before); if (undoStack.length > 100) undoStack.shift(); redoStack = []; t = Math.min(t, total()); renderAll(); return;
    }
    if (moved && k === "c" && c.type === "video") dropEmptyAutoTracks();
    if (!moved) {""")
open(p,'w',encoding='utf-8').write(s); print("ok")
