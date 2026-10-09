"use strict";
/* ---------- ghost cursor (assistant) ---------- */
const ghost = $("#ghost"); let ghostSpeed = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0.2 : 1;
async function ghostTo(x, y, ms = 420) { ghost.classList.add("on"); ghost.style.transitionDuration = (ms * ghostSpeed) + "ms"; ghost.style.transform = `translate(${x}px,${y}px)`; await sleep(ms * ghostSpeed + 30); }
async function ghostClick() { ghost.classList.remove("click"); void ghost.offsetWidth; ghost.classList.add("click"); await sleep(200 * ghostSpeed); }
function ghostHide() { ghost.classList.remove("on"); }
function centerOf(el) { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }
function ensureVisibleTime(time) { const x = time * pps, L = scroller.scrollLeft, W = scroller.clientWidth - headW(); if (x < L + 30 || x > L + W - 30) scroller.scrollLeft = Math.max(0, x - W / 3); }
function ensureVisibleTrack(id) { const r = rowsEl[id]; if (!r) return; const sr = scroller.getBoundingClientRect(), rr = r.getBoundingClientRect(); if (rr.top < sr.top + 28 || rr.bottom > sr.bottom) scroller.scrollTop += rr.top - sr.top - 40; }
function screenAt(time, trackId) { ensureVisibleTime(time); ensureVisibleTrack(trackId); const rr = rulerEl.getBoundingClientRect(), tr = contentEl[trackId]?.getBoundingClientRect() || rr; return [rr.left + time * pps, tr.top + tr.height / 2]; }
async function pointAtClip(id, where = "m") {
  const f = clipById(id); if (!f) return; const st = vStarts(); const s = f.k === "v" ? st[V.indexOf(f.c)] : f.c.start, L = f.k === "v" ? vlen(f.c) : clen(f.c);
  ensureVisibleTime(where === "r" ? s + L : s + (where === "l" ? 0 : L / 2)); ensureVisibleTrack(f.k === "v" ? "v" : f.c.track); await sleep(30);
  const d = grid.querySelector(`.clip[data-id="${id}"]`); if (!d) return; const r = d.getBoundingClientRect();
  await ghostTo(where === "l" ? r.left + 4 : where === "r" ? r.right - 4 : r.left + Math.min(r.width / 2, 60), r.top + r.height / 2);
}

/* ---------- assistant ---------- */
function describeState() {
  const st = vStarts(), r = x => Math.round(x * 100) / 100;
  return {
    playhead: r(t), total: r(total()), aspect: $("#aspect").value,
    tracks: tracks.map(x => ({ id: x.id, type: x.type, name: x.name, off: !!x.off })),
    media: [...media.values()].map(m => ({ id: m.id, name: m.name, kind: m.kind, dur: m.kind === "image" ? null : r(m.duration) })),
    video: V.map((c, i) => [c.id, i + 1, c.mediaId, r(st[i]), r(st[i] + vlen(c)), r(c.in), r(c.out), c.zoom || "none"]),
    video_columns: ["id", "order", "media", "start", "end", "in", "out", "zoom"],
    text: C.filter(c => c.type === "text").map(c => [c.id, c.track, c.style, r(c.start), r(cend(c)), c.style === "custom" ? c.text : c.line1, c.style === "custom" ? "" : c.line2]),
    text_columns: ["id", "track", "style", "start", "end", "text_or_line1", "line2"],
    stickers: C.filter(c => c.type === "sticker").map(c => [c.id, c.track, c.emoji || c.shape, r(c.start), r(cend(c))]),
    effects: C.filter(c => c.type === "fx").map(c => [c.id, c.track, c.fxType === "filter" ? "filter:" + c.filter : c.effect, r(c.start), r(cend(c))]),
    transitions: V.map((c, i) => c.tr ? [c.id, i + 1, c.tr.type, c.tr.dur] : null).filter(Boolean),
    transitions_columns: ["after_clip", "after_order", "type", "duration"],
    audio: C.filter(c => c.type === "audio").map(c => [c.id, c.track, c.mediaId, r(c.start), r(cend(c)), r(c.in), r(c.out), c.vol]),
    audio_columns: ["id", "track", "media", "start", "end", "in", "out", "volume_db"],
    overlay: C.filter(c => c.type === "video").map(c => [c.id, c.track, c.mediaId, r(c.start), r(cend(c)), r(c.in), r(c.out)]),
    overlay_columns: ["id", "track", "media", "start", "end", "in", "out"],
    clip_props: [...V, ...C.filter(c => c.type === "video" || c.type === "text" || c.type === "sticker")].filter(c => c.speed || c.filter || c.anim || c.kf || c.mask || c.chroma || c.bgRemove || c.blend || c.fit || c.angle).map(c => ({ id: c.id, speed: c.speed, filter: c.filter, anim: c.anim, keyframes: c.kf ? Object.keys(c.kf) : undefined, mask: c.mask && c.mask.type, chroma: !!c.chroma || undefined, bgRemove: c.bgRemove, blend: c.blend, fit: c.fit, angle: c.angle })),
    video_extra: V.filter(c => c.freeze || c.reverse || c.flip || c.rot || c.scale || c.crop || c.adj || c.gap).map(c => ({ id: c.id, freeze: c.freeze || undefined, reverse: c.reverse || undefined, flip: c.flip || undefined, rot: c.rot || undefined, scale: c.scale, gap: c.gap, crop: c.crop, adj: c.adj })),
    markers, magnet: magnetOn, link: linkOn,
    selected: sel ? sel.id : null
  };
}
async function runOp(op) {
  const o = op || {}, kind = String(o.op || "");
  const need = id => { const f = clipById(id); if (!f) throw new Error("Không có clip " + id); return f; };
  switch (kind) {
    case "seek": { const tm = clamp(+o.time || 0, 0, total()); const [x] = screenAt(tm, tracks[0].id); await ghostTo(x, rulerEl.getBoundingClientRect().top + 12); await ghostClick(); seek(tm); return "Đưa kim tới " + fmt(tm); }
    case "split": {
      const tm = clamp(+o.time, 0, total()); const trId = o.track && trackById(o.track) ? o.track : "v";
      const [x, y] = screenAt(tm, trId); await ghostTo(x, y); seek(tm); await ghostClick();
      if (trId !== "v") { const c = C.find(c => c.track === trId && tm > c.start + 0.05 && tm < cend(c) - 0.05); if (!c) throw new Error("Không có clip trên track " + trId + " tại " + fmt(tm)); sel = { k: "c", id: c.id }; } else sel = null;
      const n0 = V.length + C.length; splitAtPlayheadQuiet(trId); if (V.length + C.length === n0) throw new Error("Không có clip nằm qua " + fmt(tm));
      return "Cắt tại " + fmt(tm) + " (track " + (trackById(trId)?.name || trId) + ")";
    }
    case "trim": {
      const f = need(o.clip), c = f.c;
      if (f.k === "c" && c.type === "text") { await pointAtClip(c.id, "r"); await ghostClick(); if (o.start != null) c.start = Math.max(0, +o.start); if (o.duration != null) c.dur = Math.max(MINLEN, +o.duration); if (o.end != null) c.dur = Math.max(MINLEN, +o.end - c.start); layoutClips(); await pointAtClip(c.id, "r"); return `Đặt chữ ${fmt(c.start)} → ${fmt(cend(c))}`; }
      const m = media.get(c.mediaId), maxD = m.kind === "image" ? 600 : m.duration;
      let nin = o.in != null ? +o.in : c.in, nout = o.out != null ? +o.out : c.out;
      if (o.duration != null) nout = nin + (+o.duration); if (o.trim_start != null) nin = c.in + (+o.trim_start); if (o.trim_end != null) nout = c.out - (+o.trim_end);
      nin = clamp(nin, 0, maxD - MINLEN); nout = clamp(nout, nin + MINLEN, maxD); const side = Math.abs(nin - c.in) > 1e-3 ? "l" : "r";
      sel = { k: f.k, id: c.id }; renderTimeline(); await pointAtClip(c.id, side); await ghostClick();
      if (f.k === "c" && side === "l") c.start = Math.max(0, c.start + (nin - c.in)); c.in = nin; c.out = nout; layoutClips(); await pointAtClip(c.id, side);
      return `Trim ${m.name}: ${fmt(c.in)} → ${fmt(c.out)}`;
    }
    case "slip": case "replace": {
      const f = need(o.clip); if (f.k !== "v") throw new Error(kind + " chỉ dùng cho clip video");
      const c = f.c; await pointAtClip(c.id, "m"); await ghostClick();
      if (kind === "replace") { const m = media.get(String(o.media)); if (!m || m.kind === "audio") throw new Error("Không có video " + o.media); const item = document.querySelector(`.mitem[data-mid="${m.id}"]`); if (item) { item.scrollIntoView({ block: "nearest" }); await ghostTo(...centerOf(item)); await ghostClick(); await pointAtClip(c.id, "m"); } replaceClip(c, m); }
      const m = media.get(c.mediaId); const L = vlen(c);
      if (o.in != null) { c.in = clamp(+o.in, 0, Math.max(0, m.duration - L)); c.out = c.in + L; }
      renderTimeline(); await pointAtClip(c.id, "m");
      return (kind === "replace" ? "Thay bằng " : "Chọn đoạn ") + m.name + ` ${fmt(c.in)} → ${fmt(c.out)}`;
    }
    case "move": {
      const f = need(o.clip); if (f.k !== "v") throw new Error("move chỉ dùng cho clip video; chữ và âm dùng move_clip");
      const c = f.c, to = clamp(Math.round(+o.to_index) - 1, 0, V.length - 1); sel = { k: "v", id: c.id }; renderTimeline(); await pointAtClip(c.id, "m"); await ghostClick();
      V.splice(V.indexOf(c), 1); V.splice(to, 0, c); const st = vStarts(); const [x, y] = screenAt(st[to] + vlen(c) / 2, "v"); await ghostTo(x, y, 550); renderTimeline();
      return `Chuyển ${mediaName(c.mediaId)} tới vị trí ${to + 1}`;
    }
    case "move_clip": {
      const f = need(o.clip); if (f.k !== "c") throw new Error("move_clip dùng cho chữ và âm thanh"); const c = f.c;
      sel = { k: "c", id: c.id }; renderTimeline(); await pointAtClip(c.id, "l"); await ghostClick();
      if (o.track && trackById(o.track)?.type === c.type) c.track = o.track; if (o.start != null) c.start = Math.max(0, +o.start);
      renderTimeline(); const [x, y] = screenAt(c.start, c.track); await ghostTo(x + 4, y, 500);
      return `Dời clip tới ${fmt(c.start)} (${trackById(c.track)?.name})`;
    }
    case "delete": { const f = need(o.clip); await pointAtClip(f.c.id, "m"); await ghostClick(); if (f.k === "v") V = V.filter(x => x !== f.c); else C = C.filter(x => x !== f.c); if (sel && sel.id === f.c.id) sel = null; t = Math.min(t, total()); renderTimeline(); return "Xoá " + (f.c.type === "text" ? "chữ \"" + (f.c.line1 || f.c.line2) + "\"" : mediaName(f.c.mediaId)); }
    case "duplicate": { const f = need(o.clip); await pointAtClip(f.c.id, "m"); await ghostClick(); if (f.k === "v") V.splice(V.indexOf(f.c) + 1, 0, { ...f.c, id: nid("v") }); else C.push({ ...f.c, id: nid("c"), start: cend(f.c) }); renderTimeline(); return "Nhân bản " + f.c.id; }
    case "volume": case "mute": case "zoom": {
      const f = need(o.clip), c = f.c; sel = { k: f.k, id: c.id }; renderTimeline(); await pointAtClip(c.id, "m"); await ghostClick(); showTab("insp"); renderInspector(); await sleep(60);
      if (kind === "volume") { c.vol = clamp(Math.round(+o.db), -40, 0); const el = $("#iVol"); if (el) { await ghostTo(...centerOf(el)); await ghostClick(); } }
      else if (kind === "mute") { c.muted = !!o.muted; }
      else { const z = String(o.value); if (!["none", "in", "out", "punch"].includes(z)) throw new Error("zoom phải là none, in, out, punch"); c.zoom = z; const el = $("#iZoom"); if (el) { await ghostTo(...centerOf(el)); await ghostClick(); } }
      renderInspector(); await sleep(200); showTab("ai");
      return kind === "volume" ? `Âm lượng ${mediaName(c.mediaId)}: ${c.vol} dB` : kind === "mute" ? (c.muted ? "Tắt tiếng clip" : "Bật tiếng clip") : "Chuyển động: " + c.zoom;
    }
    case "set_text": {
      const f = need(o.clip); if (f.c.type !== "text") throw new Error("set_text chỉ dùng cho clip chữ"); const c = f.c;
      sel = { k: "c", id: c.id }; renderTimeline(); await pointAtClip(c.id, "m"); await ghostClick(); showTab("insp"); renderInspector(); await sleep(60);
      if (o.line1 != null) { const el = $("#iL1"); if (el) { await ghostTo(...centerOf(el)); await ghostClick(); } c.line1 = String(o.line1); }
      if (o.line2 != null) { const el = $("#iL2"); if (el) { await ghostTo(...centerOf(el)); await ghostClick(); } c.line2 = String(o.line2); }
      if (o.style && ["caption", "hook", "bgword", "tag", "cta"].includes(o.style)) c.style = o.style;
      renderInspector(); renderTimeline(); seek(Math.max(t, c.start) < cend(c) ? Math.max(t, c.start) : c.start + 0.4); await sleep(250); showTab("ai");
      return `Sửa chữ: "${c.line1}"${c.line2 ? " / " + c.line2 : ""}`;
    }
    case "add_text": {
      const trId = o.track && trackById(o.track)?.type === "text" ? o.track : tracksOf("text")[0]?.id;
      const [x, y] = screenAt(+o.start || 0, trId || "v"); await ghostTo(x, y); await ghostClick();
      const st0 = Math.max(0, +o.start || 0), d0 = Math.max(MINLEN, +o.duration || 2);
      let c;
      if (o.preset != null || o.text != null || o.style === "custom") { const pr = TEXT_PRESETS[clamp(+o.preset || 5, 0, TEXT_PRESETS.length - 1)]; c = newTextClip(pr, st0, d0, (o.track && trackById(o.track)?.type === "text") ? o.track : freeTrack("text", st0, d0).id); if (c.style === "custom") c.text = String(o.text != null ? o.text : (o.line1 || "Chữ")); else { c.line1 = String(o.line1 || o.text || ""); c.line2 = String(o.line2 || ""); } }
      else c = { id: nid("c"), track: trId || firstTrack("text", "Chữ").id, type: "text", style: o.style || "caption", start: st0, dur: d0, line1: String(o.line1 || ""), line2: String(o.line2 || "") };
      C.push(c); renderTimeline(); return `Thêm chữ "${textLabel(c)}" tại ${fmt(c.start)}`;
    }
    case "add": {
      const m = media.get(String(o.media)); if (!m) throw new Error("Không có file " + o.media);
      const item = document.querySelector(`.mitem[data-mid="${m.id}"]`); if (item) { item.scrollIntoView({ block: "nearest" }); await ghostTo(...centerOf(item)); await ghostClick(); }
      if (m.kind === "audio") { const trId = o.track && trackById(o.track)?.type === "audio" ? o.track : firstTrack("audio", "Âm thanh").id; const c = { id: nid("c"), track: trId, type: "audio", mediaId: m.id, start: Math.max(0, +o.start || 0), in: 0, out: m.duration, vol: o.db != null ? clamp(+o.db, -40, 0) : 0 }; C.push(c); const [x, y] = screenAt(c.start, trId); await ghostTo(x + 6, y, 600); renderTimeline(); return `Thêm ${m.name} từ ${fmt(c.start)}`; }
      const idx = o.index != null ? clamp(Math.round(+o.index) - 1, 0, V.length) : V.length; const c = { id: nid("v"), mediaId: m.id, in: 0, out: m.kind === "image" ? 3 : m.duration, vol: 0, muted: false, zoom: "none" }; V.splice(idx, 0, c);
      const st = vStarts(); const [x, y] = screenAt(st[idx] + 0.2, "v"); await ghostTo(x, y, 600); renderTimeline(); return `Chèn ${m.name} vào vị trí ${idx + 1}`;
    }
    case "set": {
      const f = need(o.clip), c = f.c, pr = o.props || {};
      sel = { k: f.k, id: c.id }; renderTimeline(); await pointAtClip(c.id, "m"); await ghostClick(); showTab("insp"); renderInspector(); await sleep(60);
      const ok = ["afx", "es", "pan", "gfx", "disabled", "label", "p", "name", "curves", "wheels", "ctint", "hsl", "lumv", "lut", "flip", "flipV", "blur", "rot", "scale", "x", "y", "angle", "opacity", "crop", "adj", "reverse", "zoom", "speed", "filter", "filterAmt", "anim", "mask", "blend", "chroma", "bgRemove", "fit", "bg", "bgColor", "fadeIn", "fadeOut", "voice", "vol", "muted", "text", "font", "size", "color", "grad", "stroke", "shadow", "box", "kara", "upper", "weight", "italic", "align", "maxw", "effect", "amt", "emoji", "shape", "label"];
      const before = vMap(); for (const k2 of ok) if (pr[k2] !== undefined) { if (pr[k2] === null) delete c[k2]; else c[k2] = pr[k2]; } if (pr.speed !== undefined && f.k === "v") linkShift(before); if (c.bgRemove && window.SEG) SEG.ensure();
      const xf = $("#xform"); if (xf) { xf.scrollIntoView({ block: "nearest" }); await ghostTo(...centerOf(xf)); await ghostClick(); }
      renderInspector(); renderTimeline(); drawFrame(); await sleep(200); showTab("ai"); return "Cập nhật biến đổi/màu cho " + mediaName(c.mediaId);
    }
    case "freeze": { seek(clamp(+o.time || t, 0, total())); const b = $("#freezeBtn"); await ghostTo(...centerOf(b)); await ghostClick(); freezeFrame(+o.duration || 3); return "Đứng hình tại " + fmt(t); }
    case "delete_left": case "delete_right": { seek(clamp(+o.time, 0, total())); if (o.clip) { const f = need(o.clip); sel = { k: f.k, id: f.c.id }; } const b = $(kind === "delete_left" ? "#delLBtn" : "#delRBtn"); await ghostTo(...centerOf(b)); await ghostClick(); deleteSide(kind === "delete_left" ? "left" : "right"); return (kind === "delete_left" ? "Xoá bên trái " : "Xoá bên phải ") + fmt(t); }
    case "marker": { seek(clamp(+o.time || 0, 0, total())); const b = $("#markBtn"); await ghostTo(...centerOf(b)); await ghostClick(); toggleMarker(); return "Marker tại " + fmt(t); }
    case "add_overlay": {
      const m = media.get(String(o.media)); if (!m || m.kind === "audio") throw new Error("Không có video/ảnh " + o.media);
      let tr = o.track && trackById(o.track)?.type === "overlay" ? trackById(o.track) : tracksOf("overlay")[0]; if (!tr) tr = addTrack("overlay");
      const item = document.querySelector(`.mitem[data-mid="${m.id}"]`); if (item) { item.scrollIntoView({ block: "nearest" }); await ghostTo(...centerOf(item)); await ghostClick(); }
      renderTimeline(); const st0 = Math.max(0, +o.start || 0); const [x, y] = screenAt(st0, tr.id); await ghostTo(x + 6, y, 600);
      const c = { id: nid("c"), track: tr.id, type: "video", mediaId: m.id, start: st0, in: Math.max(0, +o.in || 0), out: 0, vol: 0, muted: false, zoom: "none", scale: o.scale != null ? +o.scale : 1, x: +o.x || 0, y: +o.y || 0 };
      c.out = Math.min(m.kind === "image" ? 600 : m.duration, c.in + (+o.duration || (m.kind === "image" ? 3 : m.duration))); C.push(c); renderTimeline(); return `Thêm ${m.name} vào ${tr.name} từ ${fmt(c.start)}`;
    }
    case "track": { const tr = trackById(o.track); if (!tr) throw new Error("Không có track " + o.track); ensureVisibleTrack(tr.id); const b = rowsEl[tr.id]?.querySelector(".thead button"); if (b) { await ghostTo(...centerOf(b)); await ghostClick(); } tr.off = !!o.off; renderTimeline(); return (tr.off ? "Tắt " : "Bật ") + tr.name; }
    case "add_sticker": { const c = addSticker(Object.assign({}, o.emoji ? { emoji: o.emoji } : { shape: o.shape || "star", color: o.color || GOLD, label: o.label || "" }, o.x != null ? { x: +o.x } : {}, o.y != null ? { y: +o.y } : {}, o.size ? { size: +o.size } : {}), o.start != null ? +o.start : t); if (o.duration) c.dur = +o.duration; renderAll(); await pointAtClip(c.id, "m"); return "Thêm sticker " + (o.emoji || o.shape); }
    case "add_effect": { if (!EFFECTS[o.effect]) throw new Error("Hiệu ứng phải là: " + Object.keys(EFFECTS).join(", ")); const c = addEffect(o.effect, o.start != null ? +o.start : t); if (o.duration) c.dur = +o.duration; if (o.amt != null) c.amt = +o.amt; renderAll(); await pointAtClip(c.id, "m"); return "Thêm hiệu ứng " + EFFECTS[o.effect]; }
    case "add_filter_layer": { if (!FILTERS[o.filter]) throw new Error("Bộ lọc phải là: " + Object.keys(FILTERS).join(", ")); const c = addFilterLayer(o.filter, o.start != null ? +o.start : t); if (o.duration) c.dur = +o.duration; renderAll(); return "Thêm lớp bộ lọc " + FILTERS[o.filter].n; }
    case "transition": { const i = o.after_clip ? V.findIndex(c => c.id === o.after_clip) : o.index != null ? +o.index - 1 : cutIndexNear(o.time != null ? +o.time : t); if (i < 0 || i >= V.length - 1) throw new Error("Không có điểm cắt phù hợp"); if (!o.type || o.type === "none") { pushUndo(); delete V[i].tr; renderAll(); return "Xoá chuyển cảnh"; } if (!TRANSITIONS[o.type]) throw new Error("Chuyển cảnh phải là: " + Object.keys(TRANSITIONS).join(", ")); applyTransition(o.type, i); if (o.duration) V[i].tr.dur = +o.duration; renderAll(); const tb = grid.querySelector(`.trb[data-i="${i}"]`); if (tb) { await ghostTo(...centerOf(tb)); await ghostClick(); } return "Chuyển cảnh " + TRANSITIONS[o.type]; }
    case "transition_all": { if (!TRANSITIONS[o.type]) throw new Error("Chuyển cảnh phải là: " + Object.keys(TRANSITIONS).join(", ")); applyTransitionAll(o.type, +o.duration || 0.4); return "Chuyển cảnh cho mọi điểm cắt"; }
    case "motion_preset": { const f = need(o.clip); if (!MOTION_PRESETS[o.preset]) throw new Error("preset?"); sel = { k: f.k, id: f.c.id }; renderTimeline(); await pointAtClip(f.c.id, "m"); await ghostClick(); applyMotionPreset(f.c, o.preset); return "Đã thêm chuyển động " + MOTION_PRESETS[o.preset].n + "."; }
    case "speed_curve": { const f = need(o.clip); pushUndo(); const before = f.k === "v" ? vMap() : null; applySpeedCurve(f.c, o.curve); if (o.curve === "none") delete f.c._curve; else f.c._curve = o.curve; if (before) linkShift(before); sel = { k: f.k, id: f.c.id }; renderAll(); return "Đã đặt đường cong tốc độ."; }
    case "keyframe": { const f = need(o.clip), c = f.c, st = f.k === "v" ? vStarts()[V.indexOf(c)] : c.start, len = f.k === "v" ? vlen(c) : clen(c), lt = clamp((o.time != null ? +o.time : t) - st, 0, len); pushUndo(); for (const k2 in (o.props || {})) if (KF_PROPS[k2]) setKf(c, k2, lt, k2 === "blend" ? String(o.props[k2]) : +o.props[k2], k2 === "blend" ? "hold" : (o.ease || "inout")); sel = { k: f.k, id: c.id }; seek(st + lt); renderAll(); await pointAtClip(c.id, "m"); return "Đặt keyframe " + Object.keys(o.props || {}).join(", ") + " tại " + fmt(st + lt); }
    case "extract_audio": { const f = need(o.clip); await extractAudioFromClip(f.c, f.k); return "Tách âm thanh"; }
    case "beats": { const f = need(o.clip); markBeats(f.c); return "Đánh dấu nhịp"; }
    case "captions": { openAutoCaptions(); return "Đã mở bảng Phụ đề tự động (bấm Tạo phụ đề để chạy)"; }
    case "aspect": { const v = String(o.value); if (!["9:16", "16:9", "1:1", "4:5"].includes(v)) throw new Error("Khung hình phải là 9:16, 16:9, 1:1 hoặc 4:5"); await ghostTo(...centerOf($("#aspect"))); await ghostClick(); setAspect(v); return "Đổi khung hình " + v; }
    default: throw new Error("Không hiểu thao tác: " + kind);
  }
}
function splitAtPlayheadQuiet(trId) {
  if (trId && trId !== "v") { const c = findSel(); if (!c) return; const off = t - c.start, b = { ...c, id: nid("c"), start: t }; if (c.type === "text") { b.dur = c.dur - off; c.dur = off; } else { b.in = c.in + off; c.out = c.in + off; } C.push(b); renderTimeline(); return; }
  const st = vStarts(); const i = V.findIndex((c, k) => t > st[k] + 0.05 && t < st[k] + vlen(c) - 0.05); if (i < 0) return; const c = V[i], cut = c.in + (t - st[i]); V.splice(i + 1, 0, { ...c, id: nid("v"), in: cut }); c.out = cut; renderTimeline();
}
const RULES = `Bạn là trợ lý dựng video nằm bên trong phần mềm "Bravin" (timeline nhiều layer kiểu CapCut). Người dùng nói tiếng Việt.
Cấu trúc:
- Track "v" (VIDEO chính): các clip nối liền theo thứ tự (magnetic). start/end tự tính lại sau mỗi thao tác. in/out là giây trong file gốc.
- Track chữ (type text): clip có style (caption = phụ đề trắng + dòng nhấn vàng line2; hook = tiêu đề mở đầu; bgword = chữ nền chạy ngang; tag = nhãn trên cùng; cta = kêu gọi cuối), line1, line2, start, end.
- Track âm (type audio): voice, nhạc, SFX. Đặt tự do theo start. volume_db từ -40 (tắt) đến 0.
- Trạng thái gửi kèm dạng bảng: xem *_columns để biết thứ tự cột. Media id dạng "m_h21", tên media cho biết nội dung cảnh.
Cách làm:
1. Dùng đúng id clip/track/media trong TRẠNG THÁI. "Đoạn ở giây X" = clip có start ≤ X < end trên track tương ứng.
2. Gọi apply_edits MỘT lần với cả danh sách thao tác theo thứ tự. id mới sinh ra có trong kết quả; nếu cần làm tiếp trên clip mới thì gọi thêm.
3. Thay cảnh mà giữ nhịp voice: dùng replace (giữ nguyên độ dài đoạn), có thể kèm "in" để chọn đoạn trong source. Chọn lại đoạn trong cùng source: dùng slip.
4. Cắt nhiều điểm trên track video thì cắt từ điểm muộn nhất về sớm nhất.
5. Xong trả lời 1-3 câu ngắn tiếng Việt: đã làm gì. Lệnh mơ hồ thì chọn cách hợp lý nhất và nói rõ. Không tự xuất file (người dùng bấm Xuất video). Không dùng emoji.`;
const TOOL_DESC = `Áp dụng lần lượt các thao tác lên timeline (người dùng thấy con trỏ làm từng bước; cả lô hoàn tác được một lần). Trả về kết quả từng bước.
Thao tác ("op"):
- split {time, track?} — cắt clip tại giây "time" (track mặc định "v").
- trim {clip, in?, out?, duration?, trim_start?, trim_end?} cho video/âm; với chữ: {clip, start?, end?, duration?}.
- replace {clip, media, in?} — thay clip video bằng media khác, giữ độ dài; in = giây bắt đầu trong source mới.
- slip {clip, in} — chọn đoạn khác trong cùng source, giữ độ dài.
- move {clip, to_index} (video) · move_clip {clip, start?, track?} (chữ/âm)
- delete {clip} · duplicate {clip}
- volume {clip, db} · mute {clip, muted} · zoom {clip, value: none|in|out|punch}
- set_text {clip, line1?, line2?, style?} · add_text {start, duration, line1, line2?, style?, track?}
- add {media, index?, start?, track?, db?} — thêm từ thư viện (video chèn vị trí index; âm đặt ở start).
- track {track, off} — ẩn track chữ/video hoặc tắt tiếng track âm.
- set {clip, props:{flip, rot (0/90/180/270), scale, x, y (-1..1), opacity, crop:{l,r,t,b} (0..0.45), adj:{b,c,s} (-0.5..0.5), reverse, zoom}} — biến đổi, cắt khung, chỉnh màu, đảo ngược clip video hoặc video phủ.
- freeze {time, duration} — chèn khung đứng. · delete_left / delete_right {time, clip?} — xoá phần trái/phải kim. · marker {time}
- add_overlay {media, start, in?, duration?, track?, scale?, x?, y?} — thêm video/ảnh vào track video phủ (picture-in-picture).
- seek {time} · aspect {value: 9:16|16:9|1:1|4:5}
- set dùng cho MỌI clip (video chính, video phủ, chữ, sticker, hiệu ứng). props thêm: angle (độ), speed (0.1–10), filter (${Object.keys(FILTERS).join("|")}), filterAmt (0–1), adj:{b,c,s,ex,temp,tint,hue,hi,sh,fade,vig,sharp,grain}, anim:{in:{type,dur},out:{type,dur},loop:{type,speed}} (in: ${Object.keys(ANIM_IN).join("|")}; out: ${Object.keys(ANIM_OUT).join("|")}; loop: ${Object.keys(ANIM_LOOP).join("|")}), mask:{type:${Object.keys(MASKS).join("|")},x,y,w,h,r,feather,invert}, blend (multiply|screen|overlay|soft-light|darken|lighten|difference), chroma:{color,sim,smooth,spill}, bgRemove (true = tách nền người), fit (cover|contain) + bg (black|blur|color), fadeIn/fadeOut (giây), voice (${Object.keys(VOICES).join("|")}), chữ custom: text, font, size, color, grad:[c1,c2], stroke:{c,w}, shadow:{c,b,x,y}, box:{c,o,pad,r,mode}, kara:{c,mode:fill|word|bounce}, upper, weight, italic, align. Gán null để xoá thuộc tính.
- add_text {start, duration, text?, preset? (số thứ tự mẫu 0–${TEXT_PRESETS.length - 1}), line1?, line2?, style?, track?} — style "custom" dùng text; preset 6 = vàng in hoa, 13 = karaoke.
- add_sticker {start, duration?, emoji? | shape? (${Object.keys(STICKER_SHAPES).join("|")}), color?, label?, x?, y?, size?}
- add_effect {effect: ${Object.keys(EFFECTS).join("|")}, start, duration?, amt?} · add_filter_layer {filter, start, duration}
- transition {after_clip | index | time, type: ${Object.keys(TRANSITIONS).join("|")}|none, duration?} · transition_all {type, duration}
- motion_preset {clip, preset: ${Object.keys(MOTION_PRESETS).join("|")}} — tạo nhanh keyframe chuyển động.
- speed_curve {clip, curve: none|${Object.keys(SPEED_CURVES).join("|")}} — đường cong tốc độ cho clip video/âm thanh.
- keyframe {clip, time (giây trên timeline), props:{x,y,scale,angle,opacity,vol, flipH/flipV (0 thường → 1 lật; giữa là lật 3D), blur (0..60), blend (tên chế độ, nhảy bậc), speed (0.1..10, nhiều điểm = speed ramp), amt (hiệu ứng 0..2)}, ease?: ${Object.keys(EASE_NAMES).join("|")}} — gọi 2 lần ở 2 thời điểm để tạo chuyển động.
- extract_audio {clip} · beats {clip} (đánh dấu nhịp nhạc) · captions {} (mở bảng phụ đề tự động)`;
let aiTurns = [], aiCtl = null, sampleFn = null, aiReady = false;
const msgsEl = $("#msgs");
/* ---------- safe mini-markdown for assistant replies (bold, italic, code, headings, lists, links) ---------- */
function mdHTML(src) {
  const esc = x => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = x => esc(x)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?=[^*\w]|$)/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, t, u) => `<a href="${u.replace(/"/g, "%22")}" target="_blank" rel="noopener noreferrer">${t}</a>`);
  const out = []; let list = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const raw of String(src || "").replace(/\r/g, "").split("\n")) {
    const line = raw.trimEnd(); let m;
    if (!line.trim()) { close(); continue; }
    if ((m = /^#{1,4}\s+(.*)$/.exec(line))) { close(); out.push(`<h4>${inline(m[1])}</h4>`); continue; }
    if ((m = /^\s*[-*•]\s+(.*)$/.exec(line))) { if (list !== "ul") { close(); out.push("<ul>"); list = "ul"; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(line))) { if (list !== "ol") { close(); out.push("<ol>"); list = "ol"; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    close(); out.push(`<p>${inline(line)}</p>`);
  }
  close(); return out.join("");
}
function setMsg(el, text) { if (!el) return; if (el.closest && el.closest(".msg.u")) { el.textContent = text; return; } el.classList.add("md"); el.innerHTML = mdHTML(text); }
function addMsg(cls, text) { const d = document.createElement("div"); d.className = "msg " + cls; if (cls === "u") d.textContent = text; else setMsg(d, text); if (cls === "u") { const ch = $("#chips"); if (ch) ch.hidden = true; } msgsEl.appendChild(d); msgsEl.scrollTop = msgsEl.scrollHeight; return d; }
async function initAI() {
  addMsg("c", "Chào bạn. Mình là Claude Opus 5.5 trong Bravin. Gõ lệnh dựng bằng tiếng Việt, ví dụ \"thêm chữ Xin chào ở giây 2\", mình sẽ làm trực tiếp để bạn xem từng bước. Ctrl+Z để hoàn tác.");
  try { sampleFn = window.claude && window.claude.use ? await window.claude.use("sample") : null; } catch (e) { sampleFn = null; }
  if (!sampleFn) { aiOff("Chế độ Claude Opus 5.5 chỉ chạy khi mở trang trên claude.ai. Ở bản trên máy, chọn Luồng AI rồi bấm nút bánh răng để mở canvas và dán mã API, đường link AI local hoặc chọn model nhúng."); return; }
  let lim = null; try { lim = await sampleFn.limits(); } catch (e) {}
  if (lim && !lim.tools) { aiOff("Ứng dụng Claude bạn đang dùng chưa cho trợ lý thao tác trực tiếp. Hãy mở trang trên claude.ai bằng trình duyệt máy tính."); return; }
  aiReady = true;
}
function aiOff(msg) { aiReady = false; addMsg("c", msg); if (AIS.mode === "builtin") { const alt = AIS.local.some(s => s.on) ? "local" : "api"; if (!ON_CLAUDE) setMode(alt); } }
const errCopy = { not_granted: "Bạn chưa cho phép trang dùng Claude. Mở menu quyền của trang để bật lại.", sampling_disabled: "Tài khoản này chưa dùng được Claude trong trang.", rate_limited: "Đang gửi quá nhiều hoặc đã chạm giới hạn sử dụng. Chờ một lúc rồi thử lại.", session_expired: "Phiên đăng nhập hết hạn. Đăng nhập lại claude.ai rồi thử lại.", prompt_too_large: "Dự án quá lớn để gửi. Thử lệnh ngắn hơn.", refused: "Claude từ chối lệnh này. Thử diễn đạt khác.", empty_completion: "Claude không trả lời. Thử lệnh đơn giản hơn.", tools_unavailable: "Ứng dụng này chưa cho trợ lý thao tác trực tiếp." };
async function askAI(text) {
  if (!text.trim() || aiCtl) return;
  if (AIS.mode !== "builtin") return runChain(text, AIS.mode);
  if (!aiReady) { addMsg("c", "Chế độ Claude Opus 5.5 chưa sẵn sàng ở đây. Chọn một chuỗi AI khác ở ô Dùng."); return; }
  if (playing) pause();
  addMsg("u", text); const bubble = addMsg("c think", "Đang suy nghĩ…"); let stepsBox = null;
  const ensureSteps = () => { if (!stepsBox) { stepsBox = document.createElement("div"); stepsBox.className = "steps"; msgsEl.insertBefore(stepsBox, bubble); } return stepsBox; };
  aiCtl = new AbortController(); $("#aiSend").hidden = true; $("#aiStop").hidden = false; document.body.classList.add("aibusy");
  const turns = [{ role: "user", content: RULES }, ...aiTurns.slice(-6), { role: "user", content: `TRẠNG THÁI HIỆN TẠI:\n${JSON.stringify(describeState())}\n\nLỆNH: ${text}` }];
  let pushed = false;
  const tools = [
    { name: "apply_edits", description: TOOL_DESC,
      inputSchema: { type: "object", properties: { ops: { type: "array", description: "Danh sách thao tác theo thứ tự", items: { type: "object", properties: { op: { type: "string" } }, required: ["op"] } } }, required: ["ops"] },
      async execute(input, ctx) {
        if (!pushed) { pushUndo(); pushed = true; }
        return applyOps(input.ops, ensureSteps(), ctx.signal);
      } },
    { name: "get_timeline", description: "Trả về trạng thái timeline hiện tại dạng bảng. Chỉ dùng khi cần kiểm tra lại sau khi sửa.", execute() { return describeState(); } }
  ];
  try {
    const res = await sampleFn(turns, { signal: aiCtl.signal, tools, model: "claude-opus-5-5", modelTier: "complex", effort: $("#aiEffort").value, onText: ({ text: tx }) => { bubble.classList.remove("think"); setMsg(bubble, tx); msgsEl.scrollTop = msgsEl.scrollHeight; } });
    bubble.classList.remove("think"); setMsg(bubble, res.text);
    const meta = document.createElement("span"); meta.className = "meta"; meta.textContent = res.modelApplied ? "Claude Opus 5.5" : ("Opus 5.5 chưa sẵn cho tài khoản này, đã chạy bằng model mức " + (res.modelTierApplied || "khác")); if (res.truncated) meta.textContent += " · trả lời bị cắt ngắn"; bubble.appendChild(meta);
    aiTurns.push({ role: "user", content: "LỆNH: " + text }, { role: "assistant", content: res.text });
  } catch (e) {
    const code = e && e.code;
    if (code === "cancelled") { bubble.classList.remove("think"); setMsg(bubble, (e.text ? e.text + "\n" : "") + "Đã dừng. Các bước đã làm vẫn giữ, Ctrl+Z để hoàn tác."); }
    else if (code === "not_granted" || code === "sampling_disabled" || code === "tools_unavailable") { bubble.remove(); aiOff(errCopy[code]); }
    else { bubble.classList.remove("think"); setMsg(bubble, (e && e.text ? e.text + "\n\n" : "") + (errCopy[code] || "Kết nối gián đoạn. Bấm Gửi để thử lại.")); }
  } finally { ghostHide(); document.body.classList.remove("aibusy"); $("#aiSend").hidden = false; $("#aiStop").hidden = true; aiCtl = null; syncButtons(); }
}

/* ---------- shared: apply a list of edit ops with the ghost cursor ---------- */
async function applyOps(opsIn, box, signal) {
  const ops = Array.isArray(opsIn) ? opsIn.slice(0, 60) : []; const results = [];
  for (const op of ops) {
    if (signal && signal.aborted) { results.push({ op: op && op.op, ok: false, error: "Đã dừng" }); break; }
    const line = document.createElement("div"); line.textContent = "… " + (op && op.op); box.appendChild(line); msgsEl.scrollTop = msgsEl.scrollHeight;
    const n0 = new Set([...V, ...C].map(c => c.id));
    try { const msg = await runOp(op); line.textContent = "✓ " + msg; line.className = "ok"; const fresh = [...V, ...C].map(c => c.id).filter(id => !n0.has(id)); results.push({ op: op.op, ok: true, done: msg, new_ids: fresh.length ? fresh : undefined }); }
    catch (e) { line.textContent = "✗ " + (e && e.message || e); line.className = "err"; results.push({ op: op && op.op, ok: false, error: String(e && e.message || e) }); }
    await sleep(100 * ghostSpeed);
  }
  ghostHide(); renderAll(); return { results, total: Math.round(total() * 100) / 100 };
}

/* ---------- AI settings: two chains (API + local) ---------- */
const ON_CLAUDE = !!(window.claude && window.claude.use);
const AI_TYPES = {
  claude:   { label: "Claude trong claude.ai (không cần key)", base: "", key: false, models: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"], where: "api" },
  anthropic:{ label: "Anthropic API (Claude)", base: "https://api.anthropic.com", key: true, models: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"], where: "api" },
  openai:   { label: "OpenAI / tương thích OpenAI", base: "https://api.openai.com/v1", key: true, models: [], where: "api",
              presets: [["OpenAI", "https://api.openai.com/v1"], ["DeepSeek", "https://api.deepseek.com/v1"], ["Groq", "https://api.groq.com/openai/v1"], ["OpenRouter", "https://openrouter.ai/api/v1"], ["xAI", "https://api.x.ai/v1"], ["Gemini (kiểu OpenAI)", "https://generativelanguage.googleapis.com/v1beta/openai"]] },
  gemini:   { label: "Google Gemini", base: "https://generativelanguage.googleapis.com", key: true, models: [], where: "api" },
  ollama:   { label: "Ollama", base: "http://localhost:11434", key: false, models: [], where: "local" },
  lmstudio: { label: "Tương thích OpenAI local (LM Studio, llama.cpp, vLLM, Jan)", base: "http://localhost:1234/v1", key: false, models: [], where: "local" }
};
const SKILL_PLAN = "Bạn là biên tập viên trưởng. Đọc lệnh và trạng thái timeline, lập kế hoạch thao tác cụ thể: giây nào, clip id nào, media id nào, chữ gì. Không xuất JSON, chỉ ghi kế hoạch ngắn gọn.";
const SKILL_ACT = "Bạn là người thao tác timeline. Làm đúng kế hoạch của AI trước nếu hợp lý, sửa chỗ sai id hoặc sai giây, rồi xuất danh sách thao tác.";
function newStep(type, over = {}) { const T = AI_TYPES[type]; return Object.assign({ id: nid("ai"), on: true, name: T.label.split(" (")[0], type, base: T.base, model: (T.models[0] || ""), key: "", role: "auto", skill: "" }, over); }
function defaultAIS() {
  return { mode: "builtin",
    api: [newStep("claude", { name: "Claude Sonnet · lập kế hoạch", model: "claude-sonnet-5-5", role: "think", skill: SKILL_PLAN }), newStep("claude", { name: "Claude Opus · thao tác", model: "claude-opus-5-5", role: "act", skill: SKILL_ACT })],
    local: [newStep("ollama", { name: "Ollama", model: "", role: "act", skill: SKILL_ACT })] };
}
let AIS = defaultAIS();
try { const s = JSON.parse(localStorage.getItem("vincut-ai") || "null"); if (s && Array.isArray(s.api) && Array.isArray(s.local)) AIS = s; } catch (_) {}
if (!ON_CLAUDE && AIS.mode === "builtin") AIS.mode = AIS.local.some(s => s.on) ? "local" : "api";
function saveAIS() { try { localStorage.setItem("vincut-ai", JSON.stringify(AIS)); } catch (_) {} renderChainLine(); }
function setMode(m) { AIS.mode = m; $("#aiMode").value = m; $("#aiEffort").hidden = m !== "builtin"; saveAIS(); }
function chainText(list) { return list.filter(s => s.on).map(s => s.name || AI_TYPES[s.type].label).join("  +  "); }
function renderChainLine() {
  const el = $("#chainLine"), m = AIS.mode;
  if (m === "builtin") { el.hidden = true; $("#aiBadge").textContent = "Opus 5.5"; return; }
  const txt = chainText(AIS[m]); el.hidden = false;
  el.innerHTML = (m === "api" ? "Chuỗi API: " : "Chuỗi local: ") + (txt ? "<b></b>" : "chưa có AI nào được bật. Bấm Cài đặt AI.");
  if (txt) el.querySelector("b").textContent = txt;
  $("#aiBadge").textContent = m === "api" ? "Chuỗi API" : "Chuỗi local";
}
$("#aiMode").querySelector('option[value="builtin"]').disabled = !ON_CLAUDE;
if (!ON_CLAUDE) $("#aiMode").querySelector('option[value="builtin"]').textContent = "Claude Opus 5.5 (chỉ trên claude.ai)";
$("#aiMode").value = AIS.mode; $("#aiEffort").hidden = AIS.mode !== "builtin";
$("#aiMode").onchange = e => setMode(e.target.value);
renderChainLine();

let cfgOpen = false;
$("#aiCfgBtn").onclick = () => { cfgOpen = !cfgOpen; $("#aiCfg").hidden = !cfgOpen; $("#msgs").hidden = cfgOpen; $("#chips").hidden = cfgOpen; $("#aiForm").hidden = cfgOpen; $("#aiCfgBtn").classList.toggle("toggle", cfgOpen); $("#aiCfgBtn").setAttribute("aria-pressed", cfgOpen); if (cfgOpen) renderCfg(); else renderChainLine(); };
function renderCfg() {
  const box = $("#aiCfg"); box.innerHTML = "";
  const head = document.createElement("div"); head.style.cssText = "display:flex;align-items:center;gap:8px";
  head.innerHTML = '<h3 style="flex:1">Cài đặt AI</h3><button id="cfgDone" class="primary">Xong</button>'; box.appendChild(head);
  const n = document.createElement("div"); n.className = "note" + (ON_CLAUDE ? " warn" : "");
  n.textContent = ON_CLAUDE ? "Bạn đang mở Bravin trên claude.ai. Ở đây chỉ chạy được loại \"Claude trong claude.ai\". API khác và AI local bị trang chặn kết nối, hãy dùng Bravin bản trên máy cho các AI đó."
    : "Bản trên máy: gọi được mọi API và AI local. API key chỉ lưu trong trình duyệt của máy này.";
  box.appendChild(n);
  const how = document.createElement("div"); how.className = "note";
  how.textContent = "Mỗi bảng là một chuỗi AI1 + AI2 + … chạy lần lượt. AI sau đọc kết quả của AI trước. Mỗi AI có skill riêng. AI có vai trò \"Thao tác timeline\" sẽ ra lệnh sửa trực tiếp; nếu để \"Tự động\", AI cuối chuỗi làm việc này.";
  box.appendChild(how);
  box.appendChild(chainSection("api", "AI qua API", "Claude, OpenAI, Gemini, DeepSeek, Groq, OpenRouter…"));
  box.appendChild(chainSection("local", "AI local", "Ollama, LM Studio, llama.cpp, vLLM, Jan chạy trên máy này"));
  $("#cfgDone").onclick = () => $("#aiCfgBtn").click();
}
function chainSection(which, title, sub) {
  const sec = document.createElement("section"); sec.className = "aisec" + (which === "local" ? " local" : "");
  const h = document.createElement("header"); h.innerHTML = `<span class="pill"></span><h3 style="flex:1"></h3><button class="useBtn"></button>`;
  h.querySelector(".pill").textContent = which === "api" ? "Bảng 1" : "Bảng 2"; h.querySelector("h3").textContent = title;
  const ub = h.querySelector(".useBtn"); const isUsed = AIS.mode === which; ub.textContent = isUsed ? "Đang dùng" : "Dùng chuỗi này"; ub.disabled = isUsed; ub.onclick = () => { setMode(which); renderCfg(); };
  sec.appendChild(h);
  const s2 = document.createElement("div"); s2.className = "note"; s2.textContent = sub; sec.appendChild(s2);
  const list = AIS[which];
  const plus = idx => { const r = document.createElement("div"); r.className = "plusrow"; const b = document.createElement("button"); b.textContent = "+"; b.title = "Thêm AI vào vị trí này"; b.setAttribute("aria-label", "Thêm AI"); b.onclick = () => { list.splice(idx, 0, newStep(which === "api" ? "openai" : "ollama", { role: "auto" })); saveAIS(); renderCfg(); }; r.appendChild(b); return r; };
  list.forEach((s, i) => { if (i > 0) sec.appendChild(plus(i)); sec.appendChild(stepCard(which, s, i)); });
  sec.appendChild(plus(list.length));
  return sec;
}
function stepCard(which, s, i) {
  const list = AIS[which], T = AI_TYPES[s.type] || AI_TYPES.openai;
  const d = document.createElement("div"); d.className = "aicard" + (s.on ? "" : " off");
  const types = Object.entries(AI_TYPES).filter(([k, v]) => v.where === which);
  const dl = "dl_" + s.id;
  d.innerHTML = `<div class="top"><span class="idx">AI${i + 1}</span><input type="text" class="nm" aria-label="Tên AI"><button class="up" title="Lên">↑</button><button class="dn" title="Xuống">↓</button><button class="tg" title="Bật/tắt"></button><button class="rm" title="Xoá">✕</button></div>
    <div class="f2"><label>Loại<select class="ty"></select></label><label>Vai trò<select class="ro"><option value="auto">Tự động</option><option value="think">Suy nghĩ / viết</option><option value="act">Thao tác timeline</option></select></label></div>
    <label class="bw">Địa chỉ (base URL)<input type="text" class="bs" list="${dl}_b" spellcheck="false"><datalist id="${dl}_b"></datalist></label>
    <div class="f2"><label>Model<input type="text" class="md" list="${dl}" spellcheck="false" placeholder="tên model"><datalist id="${dl}"></datalist></label><label class="kw">API key<input type="password" class="ky" autocomplete="off" spellcheck="false"></label></div>
    <label>Skill của AI này<textarea class="sk" placeholder="Vai trò, phong cách, quy tắc riêng cho AI này…"></textarea></label>
    <div class="row"><button class="test">Thử kết nối</button><button class="lm">Lấy danh sách model</button></div><div class="res"></div>`;
  const q = c => d.querySelector(c);
  q(".nm").value = s.name; q(".tg").textContent = s.on ? "Tắt" : "Bật";
  types.forEach(([k, v]) => { const o = document.createElement("option"); o.value = k; o.textContent = v.label; q(".ty").appendChild(o); }); q(".ty").value = s.type;
  q(".ro").value = s.role || "auto"; q(".bs").value = s.base; q(".md").value = s.model; q(".ky").value = s.key || ""; q(".sk").value = s.skill || "";
  (T.models || []).forEach(m => { const o = document.createElement("option"); o.value = m; q("#" + dl).appendChild(o); });
  (T.presets || []).forEach(([n, u]) => { const o = document.createElement("option"); o.value = u; o.label = n; q("#" + dl + "_b").appendChild(o); });
  q(".bw").hidden = s.type === "claude"; q(".kw").hidden = !T.key && s.type !== "lmstudio"; q(".lm").hidden = s.type === "claude" || s.type === "anthropic";
  const upd = () => saveAIS();
  q(".nm").oninput = e => { s.name = e.target.value; upd(); };
  q(".ty").onchange = e => { const nt = e.target.value, NT = AI_TYPES[nt]; s.type = nt; s.base = NT.base; s.model = NT.models[0] || ""; if (!s.name || Object.values(AI_TYPES).some(v => v.label.startsWith(s.name))) s.name = NT.label.split(" (")[0]; upd(); renderCfg(); };
  q(".ro").onchange = e => { s.role = e.target.value; upd(); };
  q(".bs").onchange = e => { s.base = e.target.value.trim().replace(/\/+$/, ""); upd(); };
  q(".md").onchange = e => { s.model = e.target.value.trim(); upd(); };
  q(".ky").onchange = e => { s.key = e.target.value.trim(); upd(); };
  q(".sk").oninput = e => { s.skill = e.target.value; upd(); };
  q(".tg").onclick = () => { s.on = !s.on; upd(); renderCfg(); };
  q(".rm").onclick = () => { list.splice(list.indexOf(s), 1); upd(); renderCfg(); };
  q(".up").onclick = () => { const k = list.indexOf(s); if (k > 0) { list.splice(k, 1); list.splice(k - 1, 0, s); upd(); renderCfg(); } };
  q(".dn").onclick = () => { const k = list.indexOf(s); if (k < list.length - 1) { list.splice(k, 1); list.splice(k + 1, 0, s); upd(); renderCfg(); } };
  const res = q(".res");
  q(".test").onclick = async () => { res.className = "res"; res.textContent = "Đang thử…"; try { const t0 = performance.now(); const out = await callAI(s, "Bạn là trợ lý kiểm tra kết nối.", "Trả lời đúng một từ: OK", null); res.className = "res ok"; res.textContent = `Kết nối được (${Math.round(performance.now() - t0)} ms): ${out.slice(0, 80)}`; } catch (e) { res.className = "res err"; res.textContent = e.message || String(e); } };
  q(".lm").onclick = async () => { res.className = "res"; res.textContent = "Đang lấy danh sách…"; try { const ms = await listModels(s); const dlEl = q("#" + dl); dlEl.innerHTML = ""; ms.forEach(m => { const o = document.createElement("option"); o.value = m; dlEl.appendChild(o); }); res.className = "res ok"; res.textContent = ms.length ? `${ms.length} model: ${ms.slice(0, 12).join(", ")}${ms.length > 12 ? "…" : ""}` : "Không có model nào."; if (!s.model && ms[0]) { s.model = ms[0]; q(".md").value = ms[0]; upd(); } } catch (e) { res.className = "res err"; res.textContent = e.message || String(e); } };
  return d;
}

/* ---------- provider calls ---------- */
function netError(s, e) {
  const host = (() => { try { return new URL(s.base).host; } catch (_) { return s.base; } })();
  if (ON_CLAUDE) return new Error(`Trang trên claude.ai chặn kết nối tới ${host}. Dùng Bravin bản trên máy cho AI này.`);
  if (AI_TYPES[s.type].where === "local") return new Error(`Không kết nối được ${s.base}. Kiểm tra ${AI_TYPES[s.type].label.split(" (")[0]} đang chạy và đã cho phép CORS (Ollama: đặt biến OLLAMA_ORIGINS=* rồi mở lại; LM Studio: bật Enable CORS trong Developer).`);
  return new Error(`Không kết nối được ${host}: ${e && e.message || e}`);
}
async function httpJSON(s, url, opts, signal) {
  let r; try { r = await fetch(url, Object.assign({ signal }, opts)); } catch (e) { if (e && e.name === "AbortError") throw e; throw netError(s, e); }
  const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch (_) {}
  if (!r.ok) { const msg = (j && (j.error && (j.error.message || j.error) || j.message)) || txt.slice(0, 200); throw new Error(`${r.status}: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`); }
  return j;
}
async function callAI(s, sys, user, signal) {
  const base = (s.base || AI_TYPES[s.type].base).replace(/\/+$/, "");
  if (!s.model && s.type !== "claude") throw new Error("Chưa điền tên model cho " + (s.name || s.type) + ".");
  switch (s.type) {
    case "claude": {
      if (!sampleFn) throw new Error("Loại \"Claude trong claude.ai\" chỉ chạy khi mở Bravin trên claude.ai.");
      const opts = { cache: false, modelTier: /haiku/.test(s.model) ? "quick" : /sonnet/.test(s.model) ? "default" : "complex" }; if (s.model) opts.model = s.model; if (signal) opts.signal = signal;
      try { const r = await sampleFn([{ role: "user", content: sys + "\n\n" + user }], opts); return r.text; } catch (e) { if (e && e.code === "cancelled") { const er = new Error("Đã dừng"); er.name = "AbortError"; throw er; } throw new Error(errCopy[e && e.code] || ("Claude báo lỗi: " + (e && e.code))); }
    }
    case "anthropic": {
      const j = await httpJSON(s, base + "/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": s.key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" }, body: JSON.stringify({ model: s.model, max_tokens: 4096, system: sys, messages: [{ role: "user", content: user }] }) }, signal);
      return (j.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    }
    case "openai": case "lmstudio": {
      const h = { "content-type": "application/json" }; if (s.key) h.authorization = "Bearer " + s.key;
      const j = await httpJSON(s, base + "/chat/completions", { method: "POST", headers: h, body: JSON.stringify({ model: s.model, messages: [{ role: "system", content: sys }, { role: "user", content: user }], temperature: 0.3 }) }, signal);
      const m = j.choices && j.choices[0] && j.choices[0].message; return (m && (typeof m.content === "string" ? m.content : (m.content || []).map(x => x.text || "").join(""))) || "";
    }
    case "gemini": {
      const j = await httpJSON(s, `${base}/v1beta/models/${encodeURIComponent(s.model)}:generateContent?key=${encodeURIComponent(s.key)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig: { temperature: 0.3 } }) }, signal);
      const c = j.candidates && j.candidates[0]; return c && c.content ? (c.content.parts || []).map(p => p.text || "").join("") : "";
    }
    case "ollama": {
      const j = await httpJSON(s, base + "/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: s.model, stream: false, messages: [{ role: "system", content: sys }, { role: "user", content: user }], options: { temperature: 0.3 } }) }, signal);
      return (j.message && j.message.content) || "";
    }
  }
  throw new Error("Loại AI không hỗ trợ: " + s.type);
}
async function listModels(s) {
  const base = (s.base || AI_TYPES[s.type].base).replace(/\/+$/, "");
  if (s.type === "ollama") { const j = await httpJSON(s, base + "/api/tags", {}); return (j.models || []).map(m => m.name); }
  if (s.type === "gemini") { const j = await httpJSON(s, `${base}/v1beta/models?key=${encodeURIComponent(s.key)}`, {}); return (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes("generateContent")).map(m => m.name.replace(/^models\//, "")); }
  const h = {}; if (s.key) h.authorization = "Bearer " + s.key; const j = await httpJSON(s, base + "/models", { headers: h }); return (j.data || []).map(m => m.id);
}

/* ---------- run a chain AI1 + AI2 + … ---------- */
const ACT_FMT = `\n\nĐẦU RA BẮT BUỘC: chỉ một đối tượng JSON, không kèm chữ nào khác, không bọc trong code fence:\n{"reply": "1-3 câu tiếng Việt nói đã làm gì", "ops": [ ...thao tác... ]}\nNếu không cần sửa gì, để "ops": [].\nThao tác hợp lệ:\n` + TOOL_DESC.replace(/^Áp dụng[^\n]*\n/, "");
const THINK_FMT = `\n\nĐẦU RA: viết ngắn gọn bằng tiếng Việt cho AI kế tiếp đọc. KHÔNG xuất JSON thao tác.`;
const RULES_CHAIN = RULES.replace(/2\. Gọi apply_edits[^\n]*\n/, "2. Thao tác được thực hiện bởi AI có vai trò \"Thao tác timeline\" qua JSON ops.\n");
function parseOpsJSON(txt) {
  let s = String(txt || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try { return JSON.parse(s); } catch (_) {}
  const a = s.indexOf("{"), b = s.lastIndexOf("}"); if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch (_) {} }
  return null;
}
async function runChain(text, which) {
  const steps = AIS[which].filter(s => s.on);
  if (!steps.length) { addMsg("c", "Chuỗi này chưa có AI nào được bật. Bấm Cài đặt AI để thêm."); return; }
  if (playing) pause();
  addMsg("u", text);
  aiCtl = new AbortController(); const signal = aiCtl.signal; $("#aiSend").hidden = true; $("#aiStop").hidden = false; document.body.classList.add("aibusy");
  const hasAct = steps.some(s => s.role === "act"); const prior = []; let pushed = false, finalReply = "";
  try {
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i], isAct = s.role === "act" || (!hasAct && i === steps.length - 1);
      const bub = document.createElement("div"); bub.className = "msg c step think"; bub.innerHTML = '<span class="who"></span><span class="tx">Đang chạy…</span>';
      bub.querySelector(".who").textContent = `AI${i + 1} · ${s.name || AI_TYPES[s.type].label}` + (isAct ? " · thao tác" : "");
      msgsEl.appendChild(bub); msgsEl.scrollTop = msgsEl.scrollHeight;
      const sys = (s.skill ? "SKILL CỦA BẠN:\n" + s.skill + "\n\n" : "") + RULES_CHAIN + (isAct ? ACT_FMT : THINK_FMT);
      const user = `TRẠNG THÁI HIỆN TẠI:\n${JSON.stringify(describeState())}\n\nLỆNH NGƯỜI DÙNG: ${text}` + (prior.length ? "\n\nKẾT QUẢ CÁC AI TRƯỚC TRONG CHUỖI:\n" + prior.map(p => `[${p.name}]\n${p.text}`).join("\n\n") : "");
      let out = "";
      try { out = await callAI(s, sys, user, signal); }
      catch (e) { bub.classList.remove("think"); bub.querySelector(".tx").textContent = (e && e.name === "AbortError") ? "Đã dừng." : ("Lỗi: " + (e.message || e)); if (e && e.name === "AbortError") throw e; prior.push({ name: s.name, text: "(AI này lỗi, bỏ qua)" }); continue; }
      bub.classList.remove("think");
      if (isAct) {
        const j = parseOpsJSON(out);
        if (!j || !Array.isArray(j.ops)) { bub.querySelector(".tx").textContent = "AI không trả đúng định dạng JSON thao tác. Nội dung nhận được:\n" + out.slice(0, 800); prior.push({ name: s.name, text: out.slice(0, 2000) }); continue; }
        setMsg(bub.querySelector(".tx"), j.reply || "Đang thực hiện…");
        const box = document.createElement("div"); box.className = "steps"; msgsEl.appendChild(box);
        if (!pushed && j.ops.length) { pushUndo(); pushed = true; }
        const r = await applyOps(j.ops, box, signal);
        finalReply = j.reply || ""; prior.push({ name: s.name, text: `Đã thực hiện ${r.results.filter(x => x.ok).length}/${r.results.length} thao tác. ${JSON.stringify(r.results).slice(0, 1500)}\nTrả lời: ${finalReply}` });
      } else { setMsg(bub.querySelector(".tx"), out); prior.push({ name: s.name, text: out.slice(0, 6000) }); }
      msgsEl.scrollTop = msgsEl.scrollHeight;
    }
    aiTurns.push({ role: "user", content: "LỆNH: " + text }, { role: "assistant", content: finalReply || prior.map(p => p.text).join("\n").slice(0, 1500) });
  } catch (e) { addMsg("c", "Đã dừng chuỗi. Các bước đã làm vẫn giữ, Ctrl+Z để hoàn tác."); }
  finally { ghostHide(); document.body.classList.remove("aibusy"); $("#aiSend").hidden = false; $("#aiStop").hidden = true; aiCtl = null; syncButtons(); }
}

$("#aiForm").addEventListener("submit", e => { e.preventDefault(); const v = $("#aiIn").value; $("#aiIn").value = ""; askAI(v); });
$("#aiIn").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#aiForm").requestSubmit(); } });
$("#aiStop").onclick = () => aiCtl && aiCtl.abort();
$("#chips").querySelectorAll("button").forEach(b => b.onclick = () => askAI(b.textContent));

