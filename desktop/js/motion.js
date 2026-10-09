"use strict";
/* ============================================================================
   Motion tab ("Chuyển động"): every animatable property of the selected clip
   with ◆ keyframes, per-property keyframe lanes, duration/speed ramps,
   keyframe motion presets and a summary of everything applied to the clip.
   ========================================================================== */
const BLEND_NAMES = { normal: "Bình thường", multiply: "Nhân (tối)", screen: "Màn hình (sáng)", overlay: "Chồng phủ", "soft-light": "Ánh sáng dịu", "hard-light": "Ánh sáng gắt", darken: "Làm tối", lighten: "Làm sáng", "color-dodge": "Làm sáng màu", difference: "Khác biệt", luminosity: "Độ sáng" };
const tabKind = c => (sel && sel.k === "v") || c.type === "video" ? "video" : c.type === "text" ? "text" : c.type === "sticker" ? "sticker" : c.type === "fx" ? "fx" : "audio";
const isMediaClip = c => !isDur(c);
const hasVideoSrc = c => { const m = c.mediaId && media.get(c.mediaId); return !!(m && m.kind === "video"); };
const isVisual = c => c.type !== "audio" && !(c.type === "fx");

/* motion presets → keyframes. b = current base values, L = clip length, p = playhead (clip-local) */
const MOTION_PRESETS = {
  zoomIn: { n: "Zoom chậm vào", f: (b, L) => ({ scale: [[0, b.scale], [L, b.scale * 1.2]] }) },
  zoomOut: { n: "Zoom chậm ra", f: (b, L) => ({ scale: [[0, b.scale * 1.2], [L, b.scale]] }) },
  kenburns: { n: "Ken Burns", f: (b, L) => ({ scale: [[0, b.scale * 1.08], [L, b.scale * 1.22]], x: [[0, b.x + 0.04], [L, b.x - 0.04]], y: [[0, b.y + 0.02], [L, b.y - 0.02]] }) },
  panL: { n: "Lia sang trái", f: (b, L) => ({ scale: [[0, Math.max(b.scale, 1.15)], [L, Math.max(b.scale, 1.15)]], x: [[0, b.x + 0.06], [L, b.x - 0.06]] }) },
  spinIn: { n: "Xoay vào", f: (b, L) => { const d = Math.min(0.7, L / 2); return { angle: [[0, b.angle - 120], [d, b.angle]], scale: [[0, b.scale * 0.3], [d, b.scale]], opacity: [[0, 0], [d, b.opacity]] }; } },
  flipIn: { n: "Lật vào", f: (b, L) => { const d = Math.min(0.6, L / 2); return { flipH: [[0, 1], [d, b.flipH]] }; } },
  flipMid: { n: "Lật giữa clip", f: (b, L, p) => { const a = clamp(p, 0, Math.max(0, L - 0.6)); return { flipH: [[a, b.flipH], [a + 0.6, 1 - b.flipH]] }; } },
  blurIn: { n: "Nhoè vào", f: (b, L) => { const d = Math.min(0.6, L / 2); return { blur: [[0, 24], [d, b.blur]], opacity: [[0, 0], [d, b.opacity]] }; } },
  blurOut: { n: "Nhoè ra", f: (b, L) => { const d = Math.min(0.6, L / 2); return { blur: [[L - d, b.blur], [L, 24]], opacity: [[L - d, b.opacity], [L, 0]] }; } },
  pop: { n: "Bật nảy", f: (b, L, p) => { const a = clamp(p, 0, Math.max(0, L - 0.5)); return { scale: [[a, b.scale], [a + 0.12, b.scale * 1.25], [a + 0.3, b.scale * 0.95], [a + 0.45, b.scale]] }; } },
  shake: { n: "Lắc", f: (b, L, p) => { const a = clamp(p, 0, Math.max(0, L - 0.6)), K = []; for (let i = 0; i <= 8; i++) K.push([a + i * 0.075, b.x + (i === 0 || i === 8 ? 0 : (i % 2 ? 0.025 : -0.025) * (1 - i / 9))]); return { x: K }; } },
  fadeInOut: { n: "Hiện rồi mờ", f: (b, L) => { const d = Math.min(0.5, L / 3); return { opacity: [[0, 0], [d, b.opacity], [L - d, b.opacity], [L, 0]] }; } }
};
function baseVals(c, lt) { return { x: kfVal(c, "x", lt, c.x || 0), y: kfVal(c, "y", lt, c.y || 0), scale: kfVal(c, "scale", lt, c.scale == null ? 1 : c.scale), angle: kfVal(c, "angle", lt, c.angle || 0), opacity: kfVal(c, "opacity", lt, c.opacity == null ? 1 : c.opacity), blur: kfVal(c, "blur", lt, c.blur || 0), flipH: kfVal(c, "flipH", lt, c.flip ? 1 : 0), flipV: kfVal(c, "flipV", lt, c.flipV ? 1 : 0) }; }
function applyMotionPreset(c, key) {
  const P = MOTION_PRESETS[key]; if (!P) return; pushUndo();
  const L = clipLen(c), out = P.f(baseVals(c, 0), L, curLt(c)); c.kf = c.kf || {};
  for (const prop in out) c.kf[prop] = out[prop].map(([tt, v]) => ({ t: Math.round(clamp(tt, 0, L) * 1000) / 1000, v, e: key === "shake" ? "linear" : key === "pop" ? "out" : "inout" }));
  renderAll(); seek(clipStart(c) + (key === "flipMid" || key === "pop" || key === "shake" ? curLt(c) : 0)); toast("Đã thêm chuyển động: " + P.n);
}

/* ---------- keyframe lane: diamonds over the clip length ---------- */
function kfLane(box, c, props, opt = {}) {
  const lane = el("div", "kfl" + (opt.big ? " big" : "")); lane.setAttribute("role", "group"); lane.setAttribute("aria-label", "Dải keyframe");
  const ph = el("i", "kfph"); lane.appendChild(ph);
  const L = () => Math.max(0.01, clipLen(c));
  const draw = () => {
    lane.querySelectorAll(".kd").forEach(x => x.remove());
    const seen = new Set();
    for (const p of props) for (const k of kfList(c, p) || []) {
      const key = opt.big ? Math.round(k.t * 1000) : p + k.t; if (seen.has(key)) continue; seen.add(key);
      const d = el("b", "kd"); d.style.left = (100 * clamp(k.t / L(), 0, 1)) + "%"; d.title = (opt.big ? "" : KF_PROPS[p] + " · ") + fmt(k.t); d._k = k; d._p = p;
      if (Math.abs(k.t - curLt(c)) < KF_TOL()) d.classList.add("on");
      lane.appendChild(d);
    }
    ph.style.left = (100 * clamp(curLt(c) / L(), 0, 1)) + "%";
  };
  lane._sync = draw; draw();
  const ltOf = e => { const r = lane.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width, 0, 1) * L(); };
  lane.addEventListener("pointerdown", e => {
    e.preventDefault(); const d = e.target.closest(".kd");
    if (!d) { seek(clipStart(c) + ltOf(e)); syncInspLive(); return; }
    const x0 = e.clientX, t0 = d._k.t; let moved = false;
    // dragging an overview diamond moves every keyframe at that time
    const group = opt.big ? Object.keys(c.kf || {}).map(p => [p, kfAt(c, p, t0)]).filter(x => x[1]) : [[d._p, d._k]];
    const mv = ev => { const r = lane.getBoundingClientRect(), dt = (ev.clientX - x0) / r.width * L(); if (!moved && Math.abs(ev.clientX - x0) < 4) return; if (!moved) { pushUndo(); moved = true; } const nt = Math.round(clamp(t0 + dt, 0, L()) * 1000) / 1000; for (const [, k] of group) k.t = nt; d.style.left = (100 * nt / L()) + "%"; drawFrame(); };
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up);
      if (moved) { for (const [p] of group) c.kf[p].sort((a, b) => a.t - b.t); renderAll(); seek(clipStart(c) + group[0][1].t); }
      else { seek(clipStart(c) + t0); syncInspLive(); } };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  });
  lane.addEventListener("dblclick", e => { const d = e.target.closest(".kd"); if (!d) return; pushUndo(); if (opt.big) { for (const p of Object.keys(c.kf || {})) delKf(c, p, d._k.t); } else delKf(c, d._p, d._k.t); renderAll(); });
  box.appendChild(lane); return lane;
}

/* discrete keyframed select (blend mode) */
function kfSelect(box, label, opts, c, prop, def, setBase) {
  const row = el("div", "rng haskf ksel"); const id = "k" + Math.random().toString(36).slice(2, 8);
  row.innerHTML = `<label for="${id}"></label><select id="${id}"></select>`; row.querySelector("label").textContent = label;
  const s = row.querySelector("select"); for (const k in opts) { const o = document.createElement("option"); o.value = k; o.textContent = opts[k]; s.appendChild(o); }
  const kb = el("button", "kfb"); kb.type = "button"; kb.title = "Đặt / bỏ keyframe tại kim"; kb.setAttribute("aria-label", "Keyframe " + label); kb.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 3l9 9-9 9-9-9z"/></svg>'; row.appendChild(kb);
  const show = () => { s.value = kfVal(c, prop, curLt(c), def()); kb.setAttribute("aria-pressed", !!kfAt(c, prop, curLt(c))); kb.classList.toggle("has", !!kfList(c, prop)); };
  s.onchange = () => { pushUndo(); if (kfList(c, prop)) setKf(c, prop, curLt(c), s.value, "hold"); else setBase(s.value); renderTimeline(); drawFrame(); show(); };
  kb.onclick = () => { pushUndo(); const lt = curLt(c); if (kfAt(c, prop, lt)) delKf(c, prop, lt); else setKf(c, prop, lt, s.value, "hold"); renderAll(); };
  row._sync = show; show(); box.appendChild(row); return row;
}

/* wraps slider() and adds that property's lane when it has keyframes */
function mslider(box, o) { const r = slider(box, o); if (o.kf && kfList(o.kf.c, o.kf.prop)) kfLane(box, o.kf.c, [o.kf.prop]); return r; }

function setDuration(c, d) {
  d = Math.max(MINLEN, d); const before = sel.k === "v" ? vMap() : null;
  if (isDur(c) || c.freeze) c.dur = d;
  else if (hasRamp(c)) { const k = clen(c) / d; for (const kk of c.kf.speed) { kk.v = clamp(kk.v * k, 0.05, 20); kk.t = Math.round(kk.t / k * 1000) / 1000; } }
  else { c.speed = clamp(Math.round((c.out - c.in) / d * 1000) / 1000, 0.05, 20); if (Math.abs(c.speed - 1) < 1e-3) delete c.speed; }
  if (before) linkShift(before);
}

function motionPanel(box, c) {
  const kind = tabKind(c), media2 = isMediaClip(c), vis = isVisual(c), lt = curLt(c);
  setEcWide(true);
  const times = kfTimes(c);
  const ec = effectControls(box, c);
  if (ec) {
    const bar = el("div", "ec-bar");
    const bAll = el("button", "primary", "◆ Key tại kim"); bAll.type = "button"; bAll.title = "Đặt keyframe cho mọi thuộc tính đang hiện tại vị trí kim";
    bAll.onclick = () => { pushUndo(); const x = curLt(c); for (const [, , props] of ecGroups(c)) for (const p of props) if (p !== "speed" && p !== "blend" && p !== "flipH" && p !== "flipV" && p !== "blur") setKf(c, p, x, ecVal(c, p, x)); renderAll(); toast("Đã đặt keyframe tại " + fmt(x)); };
    const bEase = el("button", "", "Nội suy…"); bEase.type = "button"; bEase.title = "Kiểu chuyển tiếp cho keyframe đã chọn (hoặc tại kim)";
    bEase.onclick = () => { const x = curLt(c); if (!ecState.sel.size) for (const p in c.kf || {}) { const k = kfAt(c, p, x); if (k) ecState.sel.add(k); } if (!ecState.sel.size) { toast("Chọn keyframe trước (chạm hình thoi, hoặc kéo khung để chọn nhiều)."); return; } const ks = [...ecState.sel]; openMenu(bEase, [{ h: "Nội suy tới keyframe sau" }, ...Object.entries(EASE_NAMES).map(([k, n]) => ({ label: (ks.every(q => (q.e || "inout") === k) ? "✓ " : "") + n, run: () => { pushUndo(); ks.forEach(q => q.e = k); renderAll(); } }))]); };
    const bDel = el("button", "", "Xoá đã chọn"); bDel.type = "button"; bDel.onclick = () => { if (!ecDelete(c)) toast("Chưa chọn keyframe nào."); };
    bar.append(bAll, bEase, bDel); box.appendChild(bar);
    note(box, times.length ? "Kéo số để chỉnh, chạm số để gõ. Trên dải: chạm hình thoi để chọn, kéo để dời (bám khung hình), kéo vùng trống để chọn nhiều, chạm đúp để xoá, chuột phải hoặc giữ lâu để chọn nội suy. Ctrl + lăn chuột để phóng to dải." : "Bấm đồng hồ ⏱ cạnh một thuộc tính để bật keyframe tại kim, dời kim rồi đổi giá trị là tự tạo keyframe mới. Hai keyframe trở lên tạo chuyển động.");
  }
  if (kind === "fx" && c.fxType !== "filter") { const b = section(box, "Hiệu ứng", false); slider(b, { label: "Tốc độ hiệu ứng", min: 0.2, max: 4, step: 0.05, get: () => c.speed || 1, set: v => c.speed = v, fmt: v => v.toFixed(2) + "x" }); }

  /* time: duration + speed (+ ramps) */
  {
    const b = section(box, "Thời lượng và đường cong tốc độ");
    const r = el("div", "row"); b.appendChild(r);
    numIn(r, "Thời lượng (s)", () => clipLen(c), v => setDuration(c, v), 0.1, MINLEN);
    if (media2 && !c.freeze && (hasVideoSrc(c) || c.type === "audio")) {
      const f = el("div", "field"); f.innerHTML = `<label>Nguồn</label><div class="val">${fmt(c.out - c.in)}</div>`; r.appendChild(f);
      tiles(b, [["none", "Bình thường"], ...Object.entries(SPEED_CURVES).map(([k, v]) => [k, v.n])], hasRamp(c) ? (c._curve || "custom") : "none", k => { pushUndo(); const before = sel.k === "v" ? vMap() : null; applySpeedCurve(c, k); if (k === "none") delete c._curve; else c._curve = k; if (before) linkShift(before); renderAll(); seek(clipStart(c)); }, "curves");
      note(b, hasRamp(c) ? "Đang dùng đường cong tốc độ: chỉnh từng điểm trên dải Tốc độ ở bảng keyframe. Âm thanh đổi cao độ theo tốc độ." : "Đổi tốc độ (dòng Tốc độ ở bảng keyframe) sẽ đổi thời lượng. Chọn một đường cong hoặc đặt nhiều keyframe Tốc độ để tạo hiệu ứng nhanh/chậm (speed ramp).");
      if (hasVideoSrc(c)) btnRow(b, [[c.reverse ? "Bỏ đảo ngược" : "Đảo ngược", () => { pushUndo(); c.reverse = !c.reverse; renderAll(); }], sel.k === "v" ? ["Đứng hình 3 giây tại kim", () => freezeFrame(3)] : null].filter(Boolean));
    }
  }
  if (vis) {
    const b = section(box, "Chuyển động có sẵn (tạo keyframe)", !times.length);
    tiles(b, Object.entries(MOTION_PRESETS).map(([k, p]) => [k, p.n]), "", k => applyMotionPreset(c, k), "mpresets");
  }
  appliedList(box, c, kind);
  const b2 = el("div", "row"); box.appendChild(b2);
  btnRow(b2, [["Đặt lại chuyển động", () => { pushUndo(); for (const k of ["x", "y", "scale", "angle", "opacity", "flip", "flipV", "rot", "blur", "kf", "_curve"]) delete c[k]; renderAll(); }]]);
}

/* summary of everything applied to this clip, with jump + remove */
function appliedList(box, c, kind) {
  const items = []; const go = tab => () => { inspTabs[kind] = tab; renderInspector(); };
  const add = (label, tab, rm) => items.push({ label, tab, rm });
  const isV = kind === "video";
  if (c.kf) for (const p in c.kf) add("Keyframe · " + (KF_PROPS[p] || p) + " (" + c.kf[p].length + ")", "motion", () => { delete c.kf[p]; if (!Object.keys(c.kf).length) delete c.kf; if (p === "speed") delete c._curve; });
  if (c.anim) for (const k of ["in", "out", "loop"]) if (c.anim[k]) add((k === "in" ? "Hoạt ảnh vào · " + ANIM_IN[c.anim[k].type] : k === "out" ? "Hoạt ảnh ra · " + ANIM_OUT[c.anim[k].type] : "Hoạt ảnh lặp · " + ANIM_LOOP[c.anim[k].type]), "anim", () => { delete c.anim[k]; if (!Object.keys(c.anim).length) delete c.anim; });
  if (c.speed && c.speed !== 1 && !isDur(c)) add("Tốc độ " + c.speed + "x", "motion", () => { const b = sel.k === "v" ? vMap() : null; delete c.speed; if (b) linkShift(b); });
  if (c.reverse) add("Đảo ngược", "motion", () => delete c.reverse);
  if (c.freeze) add("Khung đứng", null, null);
  if (c.zoom && c.zoom !== "none") add("Chuyển động máy quay", "base", () => delete c.zoom);
  if (c.filter && c.filter !== "none" && FILTERS[c.filter]) add("Bộ lọc · " + FILTERS[c.filter].n, kind === "fx" ? "main" : "color", () => { delete c.filter; delete c.filterAmt; });
  if (c.adj && hasColor(c.adj)) add("Chỉnh màu", kind === "fx" ? "main" : "color", () => delete c.adj);
  if (c.masks && c.masks.length) add("Mask · " + c.masks.length + " hình", "mask", () => delete c.masks); else if (c.mask && c.mask.type && c.mask.type !== "none") add("Mask · " + (MASKS[c.mask.type] || c.mask.type), "mask", () => delete c.mask);
  if (c.blend && c.blend !== "normal") add("Hoà trộn · " + (BLEND_NAMES[c.blend] || c.blend), "motion", () => delete c.blend);
  if (c.chroma) add("Phông xanh", "key", () => delete c.chroma);
  if (c.bgRemove) add("Tách nền người", "key", () => delete c.bgRemove);
  if (c.fadeIn || c.fadeOut) add("Fade âm thanh", kind === "audio" ? "a" : "audio", () => { delete c.fadeIn; delete c.fadeOut; });
  if (c.voice && c.voice !== "none") add("Giọng · " + (VOICES[c.voice] || c.voice), kind === "audio" ? "a" : "audio", () => delete c.voice);
  if (c.muted) add("Đã tắt tiếng", null, () => delete c.muted);
  if (sel.k === "v" && c.tr && c.tr.type) add("Chuyển cảnh sau · " + (TRANSITIONS[c.tr.type] || c.tr.type), null, () => delete c.tr);
  if (c.crop && Object.values(c.crop).some(v => v > 0)) add("Cắt khung", "base", () => delete c.crop);
  // effect / filter layers that cover this clip
  const s0 = clipStart(c), s1 = s0 + clipLen(c), layers = c.type === "fx" ? [] : C.filter(x => x.type === "fx" && x.start < s1 - 0.01 && cend(x) > s0 + 0.01);
  if (!items.length && !layers.length) return;
  const b = section(box, "Hiệu ứng trên clip này");
  const ul = el("div", "applied");
  for (const it of items) {
    const r = el("div", "ap"); const n = el("button", "apn"); n.type = "button"; n.textContent = it.label; if (it.tab) n.onclick = go(it.tab); else n.disabled = true; r.appendChild(n);
    if (it.rm) { const x = el("button", "icon apx", "✕"); x.type = "button"; x.setAttribute("aria-label", "Gỡ " + it.label); x.onclick = () => { pushUndo(); it.rm(); renderAll(); }; r.appendChild(x); }
    ul.appendChild(r);
  }
  for (const L of layers) {
    const r = el("div", "ap layer"); const n = el("button", "apn"); n.type = "button"; n.textContent = (L.fxType === "filter" ? "Lớp bộ lọc" : "Lớp hiệu ứng · " + (EFFECTS[L.effect] || "")) + " (" + fmt(L.start) + ")";
    n.onclick = () => { sel = { k: "c", id: L.id }; inspTabs.fx = "motion"; renderAll(); }; r.appendChild(n); ul.appendChild(r);
  }
  b.appendChild(ul);
}

/* keep slider values, lanes and position readout in step with the playhead */
let _ilT = -1, _ilAt = 0;
function syncInspLive(force) {
  const box = $("#insp"); if (!box || box.hidden || !box.querySelector(".kfl, .rng.haskf")) return;
  const now = performance.now(); if (!force && playing && now - _ilAt < 120) return; if (!force && t === _ilT) return; _ilT = t; _ilAt = now;
  const c = findSel(); if (!c) return;
  box.querySelectorAll(".rng.haskf, .kfl").forEach(r => { if (!r._sync) return; if (!r.classList.contains("kfl") && r.contains(document.activeElement) && gestureOpen) return; r._sync(); });
  const pos = box.querySelector(".mpos"); if (pos) pos.textContent = fmt(curLt(c)) + " / " + fmt(clipLen(c));
}

/* select a clip and jump to its Motion tab (tap on timeline / preview) */
function focusMotion(c) { if (!c) return; inspTabs[tabKind(c)] = "motion"; }

/* ============================================================================
   Effect Controls (Premiere-style): one shared keyframe timeline for every
   property of the selected clip. Left: stopwatch · name · value (drag to
   scrub, click to type) · ◀ ◆ ▶. Right: ruler + one lane per property, all on
   the same time axis, one playhead across every lane, group summary lanes,
   marquee / shift multi-select, drag to retime, right-click / long-press for
   interpolation, Delete to remove, Ctrl+wheel or −/+ to zoom.
   ========================================================================== */
const ffFlip = v => v < 0.005 ? "Không" : v > 0.995 ? "Lật" : Math.round(v * 100) + "%";
const EC_PROPS = {
  x: { n: "Vị trí X", min: -3, max: 3, step: 0.005, def: c => c.x || 0, set: (c, v) => c.x = v, f: v => (v * 100).toFixed(1) + "%", unit: 100 },
  y: { n: "Vị trí Y", min: -3, max: 3, step: 0.005, def: c => c.y || 0, set: (c, v) => c.y = v, f: v => (v * 100).toFixed(1) + "%", unit: 100 },
  scale: { n: "Kích thước", min: 0.01, max: 10, step: 0.01, def: c => c.scale == null ? 1 : c.scale, set: (c, v) => c.scale = v, f: v => Math.round(v * 100) + "%", unit: 100 },
  angle: { n: "Góc xoay", min: -3600, max: 3600, step: 1, def: c => c.angle || 0, set: (c, v) => c.angle = v, f: v => Math.round(v) + "°", unit: 1 },
  flipH: { n: "Lật ngang", min: 0, max: 1, step: 0.01, def: c => c.flip ? 1 : 0, set: (c, v) => { if (v >= 0.5) c.flip = true; else delete c.flip; }, f: ffFlip, toggle: true, unit: 100 },
  flipV: { n: "Lật dọc", min: 0, max: 1, step: 0.01, def: c => c.flipV ? 1 : 0, set: (c, v) => { if (v >= 0.5) c.flipV = true; else delete c.flipV; }, f: ffFlip, toggle: true, unit: 100 },
  opacity: { n: "Độ mờ", min: 0, max: 1, step: 0.01, def: c => c.opacity == null ? 1 : c.opacity, set: (c, v) => c.opacity = v, f: v => Math.round(v * 100) + "%", unit: 100 },
  blur: { n: "Độ nhoè", min: 0, max: 100, step: 0.5, def: c => c.blur || 0, set: (c, v) => { if (v > 0) c.blur = v; else delete c.blur; }, f: v => (+v).toFixed(1), unit: 1 },
  blend: { n: "Hoà trộn", discrete: true, def: c => c.blend || "normal", set: (c, v) => { if (v === "normal") delete c.blend; else c.blend = v; } },
  speed: { n: "Tốc độ", min: 0.05, max: 20, step: 0.01, def: c => c.speed || 1, set: (c, v) => { c.speed = Math.round(v * 100) / 100; if (c.speed === 1) delete c.speed; }, f: v => (+v).toFixed(2) + "x", unit: 1, time: true },
  vol: { n: "Âm lượng", min: -40, max: 12, step: 0.5, def: c => c.vol || 0, set: (c, v) => c.vol = v, f: v => v <= -40 ? "tắt" : (v > 0 ? "+" : "") + (+v).toFixed(1) + " dB", unit: 1, audio: true },
  amt: { n: "Cường độ", min: 0, max: 2, step: 0.01, def: c => c.amt == null ? 1 : c.amt, set: (c, v) => c.amt = v, f: v => Math.round(v * 100) + "%", unit: 100 }
};
const ecState = { zoom: 1, closed: {}, sel: new Set() };
const EC_PAD = 9; const ecX = f => `calc(${EC_PAD}px + (100% - ${2 * EC_PAD}px) * ${clamp(f, 0, 1)})`;
function ecGroups(c) {
  const kind = tabKind(c), vis = isVisual(c), G = [];
  if (vis) G.push(["motion", "Chuyển động", ["x", "y", "scale", "angle", "flipH", "flipV"]]);
  if (vis) G.push(["opac", "Độ mờ và hoà trộn", isMediaClip(c) ? ["opacity", "blur", "blend"] : ["opacity", "blur"]]);
  if (kind === "fx" && c.fxType !== "filter") G.push(["fx", "Hiệu ứng", ["amt"]]);
  if (isMediaClip(c) && !c.freeze && (hasVideoSrc(c) || c.type === "audio")) G.push(["time", "Thời gian", ["speed"]]);
  if (c.type === "audio" || (hasVideoSrc(c) && !c.audioOut)) G.push(["audio", "Âm thanh", ["vol", "pan"]]);
  return G;
}
const ecVal = (c, p, lt) => kfVal(c, p, lt, EC_PROPS[p].def(c));
function ecWrite(c, p, v) { // auto-key when the property is animated (Premiere behaviour)
  const P = EC_PROPS[p]; if (!P.discrete) v = clamp(v, P.min, P.max);
  if (kfList(c, p)) setKf(c, p, curLt(c), v, P.discrete ? "hold" : undefined); else P.set(c, v);
}

function effectControls(box, c) {
  const L = () => Math.max(0.01, clipLen(c));
  const groups = ecGroups(c); if (!groups.length) return null;
  const root = el("div", "ecw"); root.tabIndex = -1; root.setAttribute("role", "group"); root.setAttribute("aria-label", "Bảng keyframe");
  const left = el("div", "ec-left"), right = el("div", "ec-right"), inner = el("div", "ec-inner");
  right.appendChild(inner); root.append(left, right);
  /* header: tools on the left, ruler on the right */
  const lh = el("div", "ec-row ec-hd");
  const zOut = el("button", "icon", "−"), zFit = el("button", "icon ec-fit", "Vừa"), zIn = el("button", "icon", "+");
  [zOut, zFit, zIn].forEach(b => b.type = "button"); zOut.setAttribute("aria-label", "Thu nhỏ dải thời gian"); zIn.setAttribute("aria-label", "Phóng to dải thời gian"); zFit.title = "Vừa khung";
  const pos = el("span", "ec-pos"); lh.append(pos, zOut, zFit, zIn); left.appendChild(lh);
  const ruler = el("div", "ec-ruler"); inner.appendChild(ruler);
  const ph = el("i", "ec-ph"); inner.appendChild(ph);
  const rowsR = []; // {lane, props, group}
  const rowsL = [];
  for (const [gid, gname, props] of groups) {
    const closed = !!ecState.closed[gid];
    const gl = el("div", "ec-row ec-g"); const tw = el("button", "ec-tw"); tw.type = "button"; tw.setAttribute("aria-expanded", !closed); tw.innerHTML = `<span class="car">▾</span>`; tw.append(gname);
    tw.onclick = () => { ecState.closed[gid] = !closed; renderInspector(); };
    const rs = el("button", "icon ec-reset", "↺"); rs.type = "button"; rs.title = "Đặt lại " + gname.toLowerCase(); rs.setAttribute("aria-label", rs.title);
    rs.onclick = () => { pushUndo(); for (const p of props) { if (c.kf) delete c.kf[p]; const d = { x: 0, y: 0, scale: 1, angle: 0, flipH: 0, flipV: 0, opacity: 1, blur: 0, blend: "normal", speed: 1, vol: 0, amt: 1 }[p]; EC_PROPS[p].set(c, d); if (p === "speed") delete c._curve; } if (c.kf && !Object.keys(c.kf).length) delete c.kf; renderAll(); };
    gl.append(tw, rs); left.appendChild(gl);
    const glane = el("div", "ec-lane ec-glane"); inner.appendChild(glane); rowsR.push({ lane: glane, props, group: true });
    if (closed) continue;
    for (const p of props) {
      const P = EC_PROPS[p], row = el("div", "ec-row ec-p");
      const sw = el("button", "ec-sw"); sw.type = "button"; sw.setAttribute("aria-label", "Bật/tắt keyframe " + P.n); sw.title = "Bật/tắt chuyển động theo keyframe";
      sw.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M10 2h4"/></svg>';
      sw.onclick = () => { pushUndo(); const lt = curLt(c), v = ecVal(c, p, lt); if (kfList(c, p)) { delete c.kf[p]; if (!Object.keys(c.kf).length) delete c.kf; P.set(c, v); if (p === "speed") delete c._curve; toast("Đã tắt keyframe " + P.n + ". Ctrl+Z để lấy lại."); } else setKf(c, p, lt, v, P.discrete ? "hold" : undefined); renderAll(); };
      const nm = el("span", "ec-n"); nm.textContent = P.n;
      let val;
      if (P.discrete) { val = el("select", "ec-v"); val.setAttribute("aria-label", P.n); for (const k in BLEND_NAMES) { const o = document.createElement("option"); o.value = k; o.textContent = BLEND_NAMES[k]; val.appendChild(o); } val.onchange = () => { pushUndo(); ecWrite(c, p, val.value); renderTimeline(); drawFrame(); sync(); }; }
      else { val = el("span", "ec-v"); val.tabIndex = 0; val.setAttribute("role", "spinbutton"); val.setAttribute("aria-label", P.n); scrubber(val, c, p, sync); }
      const nav = el("span", "ec-nav");
      const pv = el("button", "", "◀"), kb = el("button", "ec-kb"), nx = el("button", "", "▶"); [pv, kb, nx].forEach(b => b.type = "button");
      pv.setAttribute("aria-label", "Keyframe trước của " + P.n); nx.setAttribute("aria-label", "Keyframe sau của " + P.n); kb.setAttribute("aria-label", "Thêm/bỏ keyframe " + P.n);
      kb.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 3l9 9-9 9-9-9z"/></svg>';
      const jump = d => { const lt = curLt(c), T = (kfList(c, p) || []).map(k => k.t), k = d < 0 ? [...T].reverse().find(x => x < lt - 1e-3) : T.find(x => x > lt + 1e-3); if (k != null) { seek(clipStart(c) + k); sync(); } };
      pv.onclick = () => jump(-1); nx.onclick = () => jump(1);
      kb.onclick = () => { pushUndo(); const lt = curLt(c); if (kfAt(c, p, lt)) delKf(c, p, lt); else setKf(c, p, lt, ecVal(c, p, lt), P.discrete ? "hold" : undefined); renderAll(); };
      nav.append(pv, kb, nx); row.append(sw, nm, val, nav); left.appendChild(row);
      rowsL.push({ p, row, sw, val, kb, pv, nx });
      const lane = el("div", "ec-lane"); inner.appendChild(lane); rowsR.push({ lane, props: [p] });
    }
  }
  box.appendChild(root);

  /* ---------- drawing ---------- */
  const setWidth = () => { inner.style.width = (100 * ecState.zoom) + "%"; };
  function drawRuler() {
    ruler.innerHTML = ""; const w = Math.max(60, right.clientWidth * ecState.zoom - 2 * EC_PAD), Ls = L(), pxs = w / Ls;
    const steps = [1 / FPS, 2 / FPS, 5 / FPS, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60]; const st = steps.find(s => s * pxs >= 46) || 60;
    for (let x = 0, i = 0; x <= Ls + 1e-6 && i < 400; x = ++i * st) { const tk = el("span", "ec-tk"); tk.style.left = ecX(x / Ls); tk.textContent = Ls >= 60 ? fmt(x).slice(0, st < 1 ? 8 : 5) : st < 1 ? x.toFixed(2) + "s" : x + "s"; ruler.appendChild(tk); }
  }
  function drawLanes() {
    for (const R of rowsR) {
      R.lane.querySelectorAll(".ec-k").forEach(x => x.remove());
      const seen = new Map();
      for (const p of R.props) for (const k of kfList(c, p) || []) {
        const key = R.group ? Math.round(k.t * 1000) : p + "|" + k.t;
        if (seen.has(key)) { seen.get(key)._ks.push([p, k]); continue; }
        const d = el("b", "ec-k e-" + (k.e === "hold" || EC_PROPS[p].discrete ? "hold" : k.e === "linear" ? "lin" : "ease")); d.style.left = ecX(k.t / L());
        d._ks = [[p, k]]; d.title = (R.group ? "" : EC_PROPS[p].n + " · ") + fmt(k.t) + (EC_PROPS[p].discrete ? " · " + (BLEND_NAMES[k.v] || k.v) : EC_PROPS[p].f ? " · " + EC_PROPS[p].f(k.v) : "");
        seen.set(key, d); R.lane.appendChild(d);
      }
      for (const d of R.lane.querySelectorAll(".ec-k")) d.classList.toggle("sel", d._ks.every(([, k]) => ecState.sel.has(k)));
      // value-change bars between keyframes (like Premiere's interpolation span)
      R.lane.querySelectorAll(".ec-span").forEach(x => x.remove());
      if (!R.group) { const Lk = kfList(c, R.props[0]) || []; for (let i = 0; i < Lk.length - 1; i++) { if (Lk[i].v === Lk[i + 1].v) continue; const s = el("i", "ec-span"); s.style.left = ecX(Lk[i].t / L()); s.style.width = `calc((100% - ${2 * EC_PAD}px) * ${(Lk[i + 1].t - Lk[i].t) / L()})`; R.lane.prepend(s); } }
    }
  }
  function sync() {
    const lt = curLt(c); pos.textContent = fmt(lt);
    ph.style.left = ecX(lt / L());
    for (const r of rowsL) {
      const P = EC_PROPS[r.p], on = !!kfList(c, r.p), v = ecVal(c, r.p, lt);
      r.sw.setAttribute("aria-pressed", on); r.row.classList.toggle("anim", on);
      if (P.discrete) { if (document.activeElement !== r.val) r.val.value = v; }
      else if (!r.val._editing) { r.val.textContent = P.f(v); r.val.setAttribute("aria-valuenow", v); }
      r.kb.setAttribute("aria-pressed", !!kfAt(c, r.p, lt));
    }
  }
  root._sync = () => { sync(); };
  const full = () => { setWidth(); drawRuler(); drawLanes(); sync(); };
  requestAnimationFrame(full); full();

  /* ---------- zoom ---------- */
  const zoomTo = z => { const anchor = (right.scrollLeft + right.clientWidth / 2) / Math.max(1, right.scrollWidth); ecState.zoom = clamp(z, 1, 40); setWidth(); drawRuler(); right.scrollLeft = anchor * right.scrollWidth - right.clientWidth / 2; };
  zIn.onclick = () => zoomTo(ecState.zoom * 1.6); zOut.onclick = () => zoomTo(ecState.zoom / 1.6); zFit.onclick = () => zoomTo(1);
  right.addEventListener("wheel", e => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); zoomTo(ecState.zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2)); }, { passive: false });

  /* ---------- pointer: ruler scrub · marquee · diamonds ---------- */
  const tOf = x => { const r = inner.getBoundingClientRect(); return clamp((x - r.left - EC_PAD) / Math.max(1, r.width - 2 * EC_PAD), 0, 1) * L(); };
  const seekLt = lt => { seek(clipStart(c) + clamp(lt, 0, L() - 1e-3)); sync(); };
  ruler.addEventListener("pointerdown", e => { e.preventDefault(); root.focus({ preventScroll: true }); seekLt(tOf(e.clientX)); const mv = ev => seekLt(tOf(ev.clientX)); const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); }; window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up); });
  inner.addEventListener("contextmenu", e => { const d = e.target.closest(".ec-k"); if (!d) return; e.preventDefault(); kfMenu(d); });
  inner.addEventListener("dblclick", e => { const d = e.target.closest(".ec-k"); if (!d) return; pushUndo(); for (const [p, k] of d._ks) delKf(c, p, k.t); ecState.sel.clear(); renderAll(); });
  inner.addEventListener("pointerdown", e => {
    if (e.target.closest(".ec-ruler") || e.button > 0) return; e.preventDefault(); root.focus({ preventScroll: true });
    const d = e.target.closest(".ec-k"), x0 = e.clientX, y0 = e.clientY;
    if (d) {
      const ks = d._ks.map(([, k]) => k);
      if (e.shiftKey || e.ctrlKey || e.metaKey) { const allIn = ks.every(k => ecState.sel.has(k)); ks.forEach(k => allIn ? ecState.sel.delete(k) : ecState.sel.add(k)); drawLanes(); return; }
      if (!ks.every(k => ecState.sel.has(k))) { ecState.sel.clear(); ks.forEach(k => ecState.sel.add(k)); drawLanes(); }
      const moving = []; for (const p in c.kf || {}) for (const k of c.kf[p]) if (ecState.sel.has(k)) moving.push([p, k, k.t]);
      let moved = false, lp = setTimeout(() => { if (!moved) { lp = null; kfMenu(d); } }, e.pointerType === "touch" ? 520 : 1e9);
      const mv = ev => {
        const r = inner.getBoundingClientRect(), dt = (ev.clientX - x0) / Math.max(1, r.width - 2 * EC_PAD) * L();
        if (!moved && Math.abs(ev.clientX - x0) < 4) return; if (!moved) { pushUndo(); moved = true; clearTimeout(lp); }
        const lo = -Math.min(...moving.map(m => m[2])), hi = L() - Math.max(...moving.map(m => m[2]));
        let dd = clamp(dt, lo, hi); dd = Math.round(dd * FPS) / FPS; // snap to frames
        for (const [, k, t0] of moving) k.t = Math.round((t0 + dd) * 1000) / 1000;
        drawLanes(); drawFrame(); pos.textContent = "Δ " + (dd >= 0 ? "+" : "") + dd.toFixed(2) + "s";
      };
      const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); clearTimeout(lp);
        if (moved) { for (const p in c.kf || {}) c.kf[p].sort((a, b) => a.t - b.t); renderTimeline(); drawFrame(); full(); }
        else if (lp !== null) seekLt(ks[0].t); };
      window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up); return;
    }
    // empty area: click = move playhead, drag = marquee select
    const mq = el("div", "ec-mq"); let on = false; const ir = () => inner.getBoundingClientRect();
    const mv = ev => {
      if (!on && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return; if (!on) { on = true; inner.appendChild(mq); if (!e.shiftKey) ecState.sel.clear(); }
      const r = ir(), a = Math.min(x0, ev.clientX), b = Math.max(x0, ev.clientX), t1 = Math.min(y0, ev.clientY), b1 = Math.max(y0, ev.clientY);
      Object.assign(mq.style, { left: (a - r.left) + "px", width: (b - a) + "px", top: (t1 - r.top) + "px", height: (b1 - t1) + "px" });
      for (const dd of inner.querySelectorAll(".ec-k")) { const q = dd.getBoundingClientRect(), cx = q.left + q.width / 2, cy = q.top + q.height / 2, hit = cx >= a && cx <= b && cy >= t1 && cy <= b1; if (hit) dd._ks.forEach(([, k]) => ecState.sel.add(k)); }
      drawLanes();
    };
    const up = ev => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); mq.remove(); if (!on) { ecState.sel.clear(); drawLanes(); seekLt(tOf(ev.clientX)); } };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  });
  function kfMenu(d) {
    const ks = ecState.sel.size ? [...ecState.sel] : d._ks.map(([, k]) => k);
    openMenu(d, [{ h: "Nội suy tới keyframe sau" }, ...Object.entries(EASE_NAMES).map(([k, n]) => ({ label: (ks.every(x => (x.e || "inout") === k) ? "✓ " : "") + n, run: () => { pushUndo(); ks.forEach(x => x.e = k); full(); drawFrame(); } })),
      { h: "Keyframe" }, { label: "Chép giá trị sang kim", run: () => { pushUndo(); const lt = curLt(c); for (const [p, k] of d._ks) setKf(c, p, lt, k.v, k.e); renderAll(); } },
      { label: "Xoá " + (ks.length > 1 ? ks.length + " keyframe" : "keyframe"), kbd: "Del", run: () => ecDelete(c) }]);
  }
  return root;
}
function ecDelete(c) {
  if (!ecState.sel.size || !c || !c.kf) return false; pushUndo();
  for (const p in c.kf) { c.kf[p] = c.kf[p].filter(k => !ecState.sel.has(k)); if (!c.kf[p].length) delete c.kf[p]; }
  if (!Object.keys(c.kf).length) delete c.kf; ecState.sel.clear(); renderAll(); return true;
}
document.addEventListener("keydown", e => {
  const w = document.querySelector(".ecw"); if (!w || !w.contains(document.activeElement) || e.target.matches("input,select,textarea,.ec-v")) return;
  if ((e.key === "Delete" || e.key === "Backspace") && ecState.sel.size) { e.preventDefault(); e.stopImmediatePropagation(); ecDelete(findSel()); }
  else if (e.key === "Escape" && ecState.sel.size) { ecState.sel.clear(); renderInspector(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") { const c = findSel(); if (!c || !c.kf) return; e.preventDefault(); e.stopImmediatePropagation(); for (const p in c.kf) c.kf[p].forEach(k => ecState.sel.add(k)); renderInspector(); }
}, true);

/* drag-to-scrub number (Premiere "hot text"): drag ←→ to change, click to type, ↑↓ keys step */
function scrubber(elv, c, p, sync) {
  const P = EC_PROPS[p];
  const commitTime = () => { if (P.time) { renderAll(); liveRefresh(); } };
  elv.addEventListener("pointerdown", e => {
    if (elv._editing) return; e.preventDefault(); const x0 = e.clientX, v0 = ecVal(c, p, curLt(c)); let moved = false, before = P.time && sel.k === "v" ? vMap() : null;
    try { elv.setPointerCapture(e.pointerId); } catch (_) {}
    const mv = ev => { const dx = ev.clientX - x0; if (!moved && Math.abs(dx) < 3) return; if (!moved) { pushUndo(); moved = true; document.body.classList.add("scrubbing"); }
      const k = ev.shiftKey ? 10 : ev.altKey ? 0.1 : 1; ecWrite(c, p, v0 + Math.round(dx) * P.step * k); sync(); drawFrame(); if (P.time) renderTimeline(); if (P.audio) liveRefresh(); };
    const up = () => { elv.removeEventListener("pointermove", mv); elv.removeEventListener("pointerup", up); elv.removeEventListener("pointercancel", up); document.body.classList.remove("scrubbing");
      if (!moved) { if (P.toggle) { pushUndo(); ecWrite(c, p, ecVal(c, p, curLt(c)) > 0.5 ? 0 : 1); sync(); drawFrame(); renderTimeline(); } else edit(); }
      else { if (before) linkShift(before); commitTime(); renderTimeline(); } };
    elv.addEventListener("pointermove", mv); elv.addEventListener("pointerup", up); elv.addEventListener("pointercancel", up);
  });
  elv.addEventListener("keydown", e => {
    if (elv._editing) return;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); beginEdit(); ecWrite(c, p, ecVal(c, p, curLt(c)) + (e.key === "ArrowUp" ? 1 : -1) * P.step * (e.shiftKey ? 10 : 1)); sync(); drawFrame(); if (P.time) renderTimeline(); }
    else if (e.key === "Enter") { e.preventDefault(); edit(); }
  });
  function edit() {
    const inp = document.createElement("input"); inp.type = "text"; inp.inputMode = "decimal"; inp.className = "ec-in";
    const v = ecVal(c, p, curLt(c)); inp.value = String(Math.round(v * P.unit * 1000) / 1000);
    elv._editing = true; elv.textContent = ""; elv.appendChild(inp); inp.focus(); inp.select();
    const done = ok => { if (!elv._editing) return; elv._editing = false; const n = parseFloat(inp.value.replace(",", ".")); if (ok && isFinite(n)) { const before = P.time && sel.k === "v" ? vMap() : null; pushUndo(); ecWrite(c, p, n / P.unit); if (before) linkShift(before); } inp.remove(); sync(); drawFrame(); if (ok) { renderTimeline(); commitTime(); if (P.audio) liveRefresh(); } };
    inp.onkeydown = e => { e.stopPropagation(); if (e.key === "Enter") done(true); if (e.key === "Escape") done(false); };
    inp.onblur = () => done(true);
  }
}

function setEcWide(on) { document.body.classList.toggle("ecwide", on); }
