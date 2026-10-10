"use strict";
/* ============================================================================
   Properties panel (inspector): tabs per clip type, keyframe-aware controls.
   ========================================================================== */
function showTab(which) { const ai = which === "ai"; $("#tabAi").setAttribute("aria-selected", ai); $("#tabInsp").setAttribute("aria-selected", !ai); $("#aiPane").hidden = !ai; $("#insp").hidden = ai; }
$("#tabAi").onclick = () => showTab("ai"); $("#tabInsp").onclick = () => showTab("insp");
const HELP = `<div class="help"><b>Thao tác</b><br>Kéo clip từ Thư viện xuống timeline: đè lên giữa một đoạn để <b>thay thế</b>, thả vào khe để chèn, thả lên mép trên track video để tạo <b>lớp video mới</b>. Bấm vào chữ, sticker hay lớp phủ trên khung xem trước để kéo, đổi cỡ (góc) và xoay (núm tròn). Bấm nút ◆ cạnh thanh trượt để đặt <b>keyframe</b> tại kim. Bấm ô giữa hai cảnh trên track chính để thêm <b>chuyển cảnh</b>.<br><br><b>Phím tắt (giống Premiere Pro)</b><br><kbd>Space</kbd> phát/dừng · <kbd>J</kbd><kbd>K</kbd><kbd>L</kbd> tua lùi/dừng/tới (bấm nhiều lần để nhanh hơn) · <kbd>←</kbd><kbd>→</kbd> từng khung, <kbd>Shift</kbd> 5 khung · <kbd>↑</kbd><kbd>↓</kbd> điểm cắt trước/sau · <kbd>I</kbd>/<kbd>O</kbd> điểm In/Out, <kbd>Alt</kbd>+<kbd>X</kbd> bỏ · <kbd>;</kbd> nhấc bỏ (Lift) · <kbd>'</kbd> cắt bỏ và dồn (Extract) · <kbd>Ctrl</kbd>+<kbd>K</kbd> cắt mọi track · <kbd>S</kbd> tách clip chọn · <kbd>Q</kbd>/<kbd>W</kbd> xoá trái/phải tới kim · <kbd>E</kbd> kéo mép tới kim · <kbd>Shift</kbd>+<kbd>Del</kbd> xoá và dồn · <kbd>Shift</kbd>+<kbd>E</kbd> bật/tắt clip · <kbd>Ctrl</kbd>+<kbd>C</kbd>/<kbd>X</kbd>/<kbd>V</kbd> chép/cắt/dán · <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>V</kbd> dán thuộc tính · <kbd>Ctrl</kbd>+<kbd>R</kbd> tốc độ/thời lượng · <kbd>Ctrl</kbd>+<kbd>D</kbd> chuyển cảnh mặc định · <kbd>Shift</kbd>+<kbd>D</kbd> fade âm thanh · <kbd>Alt</kbd>+<kbd>←</kbd><kbd>→</kbd> dịch clip 1 khung · <kbd>M</kbd> marker, <kbd>Shift</kbd>+<kbd>M</kbd> marker sau · <kbd>Shift</kbd>+<kbd>K</kbd> keyframe · <kbd>+</kbd>/<kbd>-</kbd> phóng/thu, <kbd>\\</kbd> vừa khung · <kbd>D</kbd> nhân bản · <kbd>Ctrl</kbd>+<kbd>Z</kbd> hoàn tác<br><br><b>Công cụ</b><br><kbd>V</kbd> chọn · <kbd>C</kbd> dao cắt · <kbd>B</kbd> Ripple · <kbd>N</kbd> Rolling · <kbd>Y</kbd> Slip · <kbd>U</kbd> Slide · <kbd>R</kbd> Rate Stretch. Chuột phải lên clip để mở menu (nhãn màu, tốc độ, dán thuộc tính…).</div>`;
const inspTabs = {};               // remembered tab per clip kind
let gestureOpen = false;
function beginEdit() { if (!gestureOpen) { pushUndo(); gestureOpen = true; } }
window.addEventListener("pointerup", () => { gestureOpen = false; }, true);
window.addEventListener("keyup", () => { gestureOpen = false; }, true);

/* ---------- small DOM builders ---------- */
function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
function section(box, title, open = true) { const d = el("details", "sect"); d.open = open; const s = el("summary"); s.textContent = title; d.appendChild(s); const b = el("div", "sb"); d.appendChild(b); box.appendChild(d); return b; }
function clipStart(c) { return sel && sel.k === "v" ? vStarts()[V.indexOf(c)] : c.start; }
function clipLen(c) { return sel && sel.k === "v" ? vlen(c) : clen(c); }
function curLt(c) { return clamp(t - clipStart(c), 0, Math.max(0, clipLen(c) - 1e-3)); }
function refresh(full) { if (full) renderAll(); else { drawFrame(); } }
/* slider: {label, min, max, step, get, set, fmt, kf:{c, prop}, after} */
function slider(box, o) {
  const row = el("div", "rng" + (o.kf ? " haskf" : "")); const id = "r" + Math.random().toString(36).slice(2, 8);
  row.innerHTML = `<label for="${id}"></label><input type="range" id="${id}" min="${o.min}" max="${o.max}" step="${o.step || 0.01}"><span class="rv"></span>`;
  row.querySelector("label").textContent = o.label; const inp = row.querySelector("input"), lab = row.querySelector(".rv");
  const val = () => o.kf && kfList(o.kf.c, o.kf.prop) ? kfVal(o.kf.c, o.kf.prop, curLt(o.kf.c), o.get()) : o.get();
  const show = () => { const v = val(); inp.value = v; lab.textContent = o.fmt ? o.fmt(v) : (+v).toFixed(2); };
  show();
  inp.addEventListener("pointerdown", beginEdit); inp.addEventListener("keydown", beginEdit);
  inp.addEventListener("input", () => { beginEdit(); const v = +inp.value; if (o.kf && kfList(o.kf.c, o.kf.prop)) setKf(o.kf.c, o.kf.prop, curLt(o.kf.c), v); else o.set(v); lab.textContent = o.fmt ? o.fmt(v) : v.toFixed(2); if (o.live) o.live(v); refresh(false); if (o.kf) syncKfBtn(); });
  inp.addEventListener("change", () => { if (o.after) o.after(); });
  let kb = null; const syncKfBtn = () => { if (!kb) return; const on = !!kfAt(o.kf.c, o.kf.prop, curLt(o.kf.c)); kb.setAttribute("aria-pressed", on); kb.classList.toggle("has", !!kfList(o.kf.c, o.kf.prop)); };
  if (o.kf) {
    kb = el("button", "kfb"); kb.type = "button"; kb.title = "Đặt / bỏ keyframe tại kim"; kb.setAttribute("aria-label", "Keyframe " + o.label); kb.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 3l9 9-9 9-9-9z"/></svg>';
    kb.onclick = () => { pushUndo(); const c = o.kf.c, lt = curLt(c); if (kfAt(c, o.kf.prop, lt)) delKf(c, o.kf.prop, lt); else setKf(c, o.kf.prop, lt, val()); syncKfBtn(); renderTimeline(); drawFrame(); };
    row.appendChild(kb); syncKfBtn(); row._sync = () => { show(); syncKfBtn(); };
  } else row._sync = show;
  box.appendChild(row); return row;
}
function select(box, label, opts, get, set, full) {
  const f = el("div", "field"); const id = "s" + Math.random().toString(36).slice(2, 8);
  f.innerHTML = `<label for="${id}"></label><select id="${id}"></select>`; f.querySelector("label").textContent = label;
  const s = f.querySelector("select"); for (const k in opts) { const o = document.createElement("option"); o.value = k; o.textContent = opts[k]; s.appendChild(o); }
  s.value = get(); s.onchange = () => { pushUndo(); set(s.value); refresh(full); if (!full) renderInspector(); };
  box.appendChild(f); return s;
}
function colorIn(box, label, get, set) {
  const f = el("div", "crow"); const id = "c" + Math.random().toString(36).slice(2, 8);
  f.innerHTML = `<label for="${id}"></label><input type="color" id="${id}">`; f.querySelector("label").textContent = label;
  const i = f.querySelector("input"); i.value = toHex(get()); i.addEventListener("input", () => { beginEdit(); set(i.value); drawFrame(); }); i.addEventListener("change", () => { gestureOpen = false; });
  box.appendChild(f); return i;
}
function toHex(c) { if (!c) return "#ffffff"; if (/^#[0-9a-f]{6}$/i.test(c)) return c; if (/^#[0-9a-f]{3}$/i.test(c)) return "#" + c.slice(1).split("").map(x => x + x).join(""); const m = String(c).match(/(\d+)\D+(\d+)\D+(\d+)/); return m ? "#" + [m[1], m[2], m[3]].map(x => (+x).toString(16).padStart(2, "0")).join("") : "#ffffff"; }
function toggle(box, label, get, set, full) { const b = el("button", "tog"); b.type = "button"; b.setAttribute("aria-pressed", !!get()); b.textContent = label; b.onclick = () => { pushUndo(); set(!get()); b.setAttribute("aria-pressed", !!get()); refresh(full); if (full !== "keep") renderInspector(); }; box.appendChild(b); return b; }
function btnRow(box, items) { const r = el("div", "row"); for (const [label, fn, primary] of items) { if (!label) continue; const b = el("button", primary ? "primary" : ""); b.type = "button"; b.textContent = label; b.onclick = fn; r.appendChild(b); } box.appendChild(r); return r; }
function tiles(box, items, current, pick, cls) { const gdiv = el("div", "tiles " + (cls || "")); for (const [k, label, prev] of items) { const b = el("button", "tile" + (k === current ? " on" : "")); b.type = "button"; b.setAttribute("aria-pressed", k === current); if (prev) { const im = el("span", "tp"); if (typeof prev === "string") im.style.background = prev; else im.appendChild(prev); b.appendChild(im); } const sp = el("span", "tl2"); sp.textContent = label; b.appendChild(sp); b.onclick = () => pick(k); gdiv.appendChild(b); } box.appendChild(gdiv); return gdiv; }
function numIn(box, label, get, set, step = 0.05, min = 0) { const f = el("div", "field"); const id = "n" + Math.random().toString(36).slice(2, 8); f.innerHTML = `<label for="${id}"></label><input type="number" id="${id}" step="${step}" min="${min}">`; f.querySelector("label").textContent = label; const i = f.querySelector("input"); i.value = (+get()).toFixed(2); i.onchange = () => { pushUndo(); set(Math.max(min, +i.value || 0)); renderAll(); }; box.appendChild(f); return f; }
function note(box, text) { const p = el("p", "note"); p.textContent = text; box.appendChild(p); return p; }

/* ---------- reusable groups ---------- */
function kfNav(box, c) {
  const times = kfTimes(c); if (!times.length) return;
  const r = el("div", "row kfnav"); const st = clipStart(c);
  const go = d => { const lt = curLt(c); const k = d < 0 ? [...times].reverse().find(x => x < lt - 1e-3) : times.find(x => x > lt + 1e-3); if (k != null) { seek(st + k); renderInspector(); } };
  const a = el("button", "", "◀ Keyframe trước"); a.type = "button"; a.onclick = () => go(-1); const b = el("button", "", "Keyframe sau ▶"); b.type = "button"; b.onclick = () => go(1);
  r.append(a, b); box.appendChild(r);
  const lt = curLt(c), here = Object.keys(c.kf || {}).map(p => [p, kfAt(c, p, lt)]).filter(x => x[1]);
  if (here.length) select(box, "Kiểu chuyển động từ keyframe này", EASE_NAMES, () => here[0][1].e || "inout", v => here.forEach(([, k]) => k.e = v));
  btnRow(box, [["Xoá mọi keyframe", () => { pushUndo(); delete c.kf; renderAll(); }]]);
}
function transformGroup(box, c, isText) {
  const b = section(box, "Biến đổi");
  slider(b, { label: "Vị trí X", min: -1, max: 1, step: 0.005, get: () => c.x || 0, set: v => c.x = v, kf: { c, prop: "x" } });
  slider(b, { label: "Vị trí Y", min: -1, max: 1, step: 0.005, get: () => c.y || 0, set: v => c.y = v, kf: { c, prop: "y" } });
  slider(b, { label: "Kích thước", min: 0.05, max: 4, step: 0.01, get: () => c.scale == null ? 1 : c.scale, set: v => c.scale = v, fmt: v => Math.round(v * 100) + "%", kf: { c, prop: "scale" } });
  slider(b, { label: "Góc xoay", min: -180, max: 180, step: 1, get: () => c.angle || 0, set: v => c.angle = v, fmt: v => Math.round(v) + "°", kf: { c, prop: "angle" } });
  slider(b, { label: "Độ mờ", min: 0, max: 1, step: 0.01, get: () => c.opacity == null ? 1 : c.opacity, set: v => c.opacity = v, fmt: v => Math.round(v * 100) + "%", kf: { c, prop: "opacity" } });
  if (!isText) btnRow(b, [[c.flip ? "Bỏ lật" : "Lật ngang", () => { pushUndo(); c.flip = !c.flip; renderAll(); }], ["Xoay 90°", () => { pushUndo(); c.rot = ((c.rot || 0) + 90) % 360; renderAll(); }]]);
  btnRow(b, [["Đặt lại", () => { pushUndo(); for (const k of ["x", "y", "scale", "angle", "opacity", "flip", "rot", "kf"]) delete c[k]; renderAll(); }]]);
  kfNav(b, c);
}
function animGroup(box, c, isText) {
  const A = c.anim || {}; const set = (k, v) => { pushUndo(); c.anim = c.anim || {}; if (v) c.anim[k] = Object.assign({ dur: k === "loop" ? undefined : 0.5 }, c.anim[k] || {}, { type: v }); else delete c.anim[k]; if (!Object.keys(c.anim).length) delete c.anim; renderAll(); seek(k === "out" ? clipStart(c) + Math.max(0, clipLen(c) - 0.8) : clipStart(c)); if (k !== "loop") setTimeout(() => { if (!playing) play(); }, 60); };
  const inList = Object.entries(ANIM_IN).filter(([k]) => isText || (k !== "typewriter" && k !== "words"));
  let b = section(box, "Vào");
  tiles(b, [["", "Không"], ...inList.map(([k, n]) => [k, n])], A.in ? A.in.type : "", v => set("in", v));
  if (A.in) slider(b, { label: "Thời lượng", min: 0.1, max: Math.max(0.2, Math.min(5, clipLen(c))), step: 0.05, get: () => A.in.dur || 0.5, set: v => A.in.dur = v, fmt: v => v.toFixed(2) + "s" });
  b = section(box, "Ra");
  tiles(b, [["", "Không"], ...Object.entries(ANIM_OUT)], A.out ? A.out.type : "", v => set("out", v));
  if (A.out) slider(b, { label: "Thời lượng", min: 0.1, max: Math.max(0.2, Math.min(5, clipLen(c))), step: 0.05, get: () => A.out.dur || 0.5, set: v => A.out.dur = v, fmt: v => v.toFixed(2) + "s" });
  b = section(box, "Lặp (kết hợp)", !!A.loop);
  tiles(b, [["", "Không"], ...Object.entries(ANIM_LOOP)], A.loop ? A.loop.type : "", v => set("loop", v));
  if (A.loop) slider(b, { label: "Tốc độ", min: 0.2, max: 4, step: 0.05, get: () => A.loop.speed || 1, set: v => A.loop.speed = v, fmt: v => v.toFixed(2) + "x" });
}
function colorGroup(box, c) {
  let b = section(box, "Bộ lọc");
  const prevs = filterPreviews(c);
  tiles(b, Object.entries(FILTERS).map(([k, f]) => [k, f.n, prevs[k] || null]), c.filter || "none", k => { applyFilterTo(c, k === "none" ? undefined : k); if (k === "none") delete c.filter; renderInspector(); }, "filters");
  if (c.filter && c.filter !== "none") slider(b, { label: "Cường độ", min: 0, max: 1, step: 0.01, get: () => c.filterAmt == null ? 1 : c.filterAmt, set: v => c.filterAmt = v, fmt: v => Math.round(v * 100) + "%" });
  b = section(box, "Chỉnh màu");
  for (const k in ADJ_KEYS) { const [n, mn, mx] = ADJ_KEYS[k]; slider(b, { label: n, min: mn, max: mx, step: k === "hue" ? 1 : 0.01, get: () => (c.adj || {})[k] || 0, set: v => { c.adj = Object.assign({}, c.adj, { [k]: v }); }, fmt: v => k === "hue" ? Math.round(v) + "°" : (v > 0 ? "+" : "") + Math.round(v * 100) }); }
  btnRow(b, [["Đặt lại màu", () => { pushUndo(); delete c.adj; delete c.filter; delete c.filterAmt; renderAll(); }], sel.k === "v" ? ["Áp dụng cho mọi cảnh", () => { pushUndo(); for (const x of V) { x.filter = c.filter; x.filterAmt = c.filterAmt; x.adj = c.adj ? { ...c.adj } : undefined; } renderAll(); toast("Đã áp dụng màu cho " + V.length + " cảnh."); }] : null].filter(Boolean));
  if (!GLFX.available()) note(b, "Thiết bị này không hỗ trợ WebGL nên bộ lọc và chỉnh màu nâng cao sẽ không hiện.");
}
let _fpCache = { key: "", map: {} };
function filterPreviews(c) { // small thumbnails of the current frame through each filter
  try {
    const m = media.get(c.mediaId); const key = c.id + ":" + (c.mediaId || "") + ":" + Math.round(t * 2); if (_fpCache.key === key) return _fpCache.map;
    const S = m ? frameFor(c, curLt(c), sel.k === "v" ? V.indexOf(c) % 2 : 2) : null; const map = {};
    if (S && GLFX.available()) {
      for (const k in FILTERS) { const out = GLFX.run(S.img, 0, 0, S.w, S.h, colorParams({ filter: k, filterAmt: 1 }), { maxSide: 120, fullW: S.w, fullH: S.h }); if (!out) break; const cnv = document.createElement("canvas"); cnv.width = out.width; cnv.height = out.height; cnv.getContext("2d").drawImage(out, 0, 0); map[k] = cnv; }
    }
    _fpCache = { key, map }; return map;
  } catch (e) { return {}; }
}
function maskGroup(box, c) {
  if (typeof maskListUI === "function") { migrateMask(c); maskListUI(box, c, () => c.masks, v => { if (v && v.length) c.masks = v; else delete c.masks; }, { kind: "clip", key: "clip:" + c.id, trackClip: () => (media.get(c.mediaId) || {}).kind === "video" ? c : null }); }
  const b2 = section(box, "Chế độ hoà trộn", !!(c.blend && c.blend !== "normal"));
  select(b2, "Hoà trộn", { normal: "Bình thường", multiply: "Nhân (tối)", screen: "Màn hình (sáng)", overlay: "Chồng phủ", "soft-light": "Ánh sáng dịu", "hard-light": "Ánh sáng gắt", darken: "Làm tối", lighten: "Làm sáng", "color-dodge": "Làm sáng màu", difference: "Khác biệt", luminosity: "Độ sáng" }, () => c.blend || "normal", v => { if (v === "normal") delete c.blend; else c.blend = v; });
}
function keyGroup(box, c) {
  let b = section(box, "Phông xanh (tách màu nền)");
  toggle(b, c.chroma ? "Đang bật phông xanh" : "Bật phông xanh", () => !!c.chroma, v => { if (v) c.chroma = { color: "#00ff00", sim: 0.4, smooth: 0.1, spill: 0.5 }; else delete c.chroma; });
  if (c.chroma) {
    const K = c.chroma;
    const ci = colorIn(b, "Màu nền cần xoá", () => K.color, v => K.color = v);
    btnRow(b, [["Hút màu trên khung xem trước", () => startEyedropper(col => { pushUndo(); K.color = col; ci.value = col; drawFrame(); })]]);
    slider(b, { label: "Độ rộng màu", min: 0, max: 1, step: 0.01, get: () => K.sim, set: v => K.sim = v });
    slider(b, { label: "Làm mịn viền", min: 0, max: 1, step: 0.01, get: () => K.smooth, set: v => K.smooth = v });
    slider(b, { label: "Khử ám màu", min: 0, max: 1, step: 0.01, get: () => K.spill, set: v => K.spill = v });
  }
  b = section(box, "Tách nền người (AI trên máy)");
  note(b, IN_CLAUDE_PAGE ? "Trên claude.ai không tải được model tách nền. Dùng tính năng này ở app Android Bravin." : "Dùng model MediaPipe chạy ngay trên thiết bị. Lần đầu cần mạng để tải model (khoảng 10 MB). Hợp với cảnh có người ở gần máy quay.");
  toggle(b, c.bgRemove ? "Đang tách nền" : "Bật tách nền", () => !!c.bgRemove, v => { if (v) { c.bgRemove = true; if (window.SEG) SEG.ensure(); } else delete c.bgRemove; });
  if (c.bgRemove) { toggle(b, "Giữ nền, xoá người", () => c.bgRemove === "invert", v => c.bgRemove = v ? "invert" : true); const st = el("p", "note segstat"); st.textContent = window.SEG ? SEG.status() : "Đang chuẩn bị…"; b.appendChild(st); }
}
function audioGroup(box, c, isVideo) {
  const b = section(box, "Âm thanh");
  if (isVideo && c.audioOut) note(b, "Âm thanh của clip này đã được tách ra track âm thanh riêng.");
  slider(b, { label: "Âm lượng", min: -40, max: 12, step: 1, get: () => c.vol || 0, set: v => c.vol = v, fmt: v => v <= -40 ? "tắt" : (v > 0 ? "+" : "") + Math.round(v) + " dB", kf: { c, prop: "vol" }, live: () => liveRefresh() });
  slider(b, { label: "Hiện dần (fade in)", min: 0, max: Math.min(10, clipLen(c)), step: 0.05, get: () => c.fadeIn || 0, set: v => { if (v > 0) c.fadeIn = v; else delete c.fadeIn; }, fmt: v => v.toFixed(2) + "s" });
  slider(b, { label: "Nhỏ dần (fade out)", min: 0, max: Math.min(10, clipLen(c)), step: 0.05, get: () => c.fadeOut || 0, set: v => { if (v > 0) c.fadeOut = v; else delete c.fadeOut; }, fmt: v => v.toFixed(2) + "s" });
  if (!isVideo) select(b, "Hiệu ứng giọng", VOICES, () => c.voice || "none", v => { if (v === "none") delete c.voice; else c.voice = v; liveRefresh(); });
  btnRow(b, [[c.muted ? "Bật tiếng" : "Tắt tiếng", () => { pushUndo(); c.muted = !c.muted; renderAll(); }], isVideo && !c.audioOut ? ["Tách âm thanh", () => extractAudioFromClip(c, sel.k)] : null, !isVideo ? ["Đánh dấu nhịp nhạc", () => markBeats(c)] : null].filter(Boolean));
  if (typeof audioFxUI === "function") audioFxUI(box, c, isVideo);
}
function speedGroup(box, c) {
  const b = section(box, "Tốc độ");
  const set = v => { pushUndo(); const before = vMap(); c.speed = Math.round(v * 100) / 100; if (c.speed === 1) delete c.speed; if (sel.k === "v") linkShift(before); renderAll(); };
  tiles(b, [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 5].map(v => [String(v), v + "x"]), String(c.speed || 1), k => set(+k));
  const row = slider(b, { label: "Tuỳ chỉnh", min: -2.3, max: 2.3, step: 0.01, get: () => Math.log(c.speed || 1), set: () => {}, fmt: v => Math.exp(v).toFixed(2) + "x" });
  row.querySelector("input").addEventListener("change", e => set(Math.exp(+e.target.value)));
  note(b, `Dài ${fmt(clipLen(c))}. Đổi tốc độ sẽ đổi độ dài clip.` + (c.type === "audio" ? " Âm thanh đổi cao độ theo tốc độ." : ""));
  if (media.get(c.mediaId)?.kind === "video" && !c.freeze) btnRow(b, [[c.reverse ? "Bỏ đảo ngược" : "Đảo ngược", () => { pushUndo(); c.reverse = !c.reverse; renderAll(); }], sel.k === "v" ? ["Đứng hình 3 giây tại kim", () => freezeFrame(3)] : null].filter(Boolean));
}
function frameGroup(box, c) {
  const b = section(box, "Khung hình và nền", c.fit === "contain");
  select(b, "Cách đặt vào khung", { cover: "Lấp đầy khung (cắt bớt)", contain: "Vừa khung (giữ nguyên)" }, () => c.fit || "cover", v => { if (v === "cover") delete c.fit; else c.fit = v; });
  if (c.fit === "contain") {
    select(b, "Nền phía sau", { black: "Đen", blur: "Làm mờ chính video", color: "Màu" }, () => c.bg || "black", v => c.bg = v);
    if (c.bg === "color") colorIn(b, "Màu nền", () => c.bgColor || BLUE, v => c.bgColor = v);
    btnRow(b, [["Áp dụng cho mọi cảnh", () => { pushUndo(); for (const x of V) { x.fit = c.fit; x.bg = c.bg; x.bgColor = c.bgColor; } renderAll(); }]]);
  }
  const b2 = section(box, "Cắt khung", !!c.crop); const cr = () => c.crop || {};
  for (const [k, n] of [["l", "Trái"], ["r", "Phải"], ["t", "Trên"], ["b", "Dưới"]]) slider(b2, { label: n, min: 0, max: 0.45, step: 0.01, get: () => cr()[k] || 0, set: v => { c.crop = Object.assign({}, c.crop, { [k]: v }); } });
}
function clipButtons(box, c) { btnRow(box, [["Tách tại kim", splitAtPlayhead], ["Nhân bản", duplicateSel], ["Xoá", deleteSel]]); }
function tabbar(box, kind, list) {
  const cur = list.some(x => x[0] === inspTabs[kind]) ? inspTabs[kind] : list[0][0];
  const bar = el("div", "itabs"); bar.setAttribute("role", "tablist");
  for (const [k, n] of list) { const b = el("button"); b.type = "button"; b.setAttribute("role", "tab"); b.setAttribute("aria-selected", k === cur); b.textContent = n; b.onclick = () => { inspTabs[kind] = k; renderInspector(); }; bar.appendChild(b); }
  box.appendChild(bar); return cur;
}

/* ---------- main ---------- */
function renderInspector() {
  const B = document.body, was = B.classList.contains("ecwide"); B.classList.remove("ecwide");
  try { renderInspector0(); } finally { if (was !== B.classList.contains("ecwide") && !B.classList.contains("phone")) requestAnimationFrame(() => window.dispatchEvent(new Event("resize"))); }
}
function renderInspector0() {
  if (typeof maskEdit !== "undefined" && maskEdit && maskEdit.kind === "clip") maskEdit = null;
  const box = $("#insp"); const keepScroll = box.scrollTop; box.innerHTML = "";
  if (sel && sel.k === "tr") return transitionPanel(box);
  const c = findSel();
  if (!c) { box.innerHTML = `<div class="empty">Bấm vào một clip trên timeline (hoặc trên khung xem trước) để chỉnh. Thêm chữ, sticker, hiệu ứng, chuyển cảnh và bộ lọc ở Thư viện.</div>` + HELP; return; }
  const head = el("div", "ihead"); const nm = el("b"); const m = c.mediaId ? media.get(c.mediaId) : null;
  nm.textContent = c.type === "text" || c.type === "sticker" ? textLabel(c) : c.type === "fx" ? (c.fxType === "filter" ? "Bộ lọc" : "Hiệu ứng · " + EFFECTS[c.effect]) : (c.type === "compound" ? (c.name || "Compound") + " · " + cmpCount(c) + " clip" : m ? m.name : "?");
  const meta = el("span", "tc"); meta.textContent = `${fmt(clipStart(c))} · dài ${fmt(clipLen(c))}`; head.append(nm, meta); box.appendChild(head);
  const isVid = sel.k === "v" || c.type === "video" || c.type === "compound";
  if (isVid) videoPanel(box, c, m);
  else if (c.type === "text") textPanel(box, c);
  else if (c.type === "sticker") stickerPanel(box, c);
  else if (c.type === "fx") fxPanel(box, c);
  else { const tab = tabbar(box, "audio", [["motion", "Chuyển động"], ["a", "Âm thanh"]]); if (tab === "a") { audioGroup(box, c, false); timingFields(box, c); } else motionPanel(box, c); }
  clipButtons(box, c);
  box.scrollTop = keepScroll;
}
function timingFields(box, c) {
  if (sel.k === "v") return;
  const r = el("div", "row"); box.appendChild(r);
  numIn(r, "Bắt đầu (s)", () => c.start, v => c.start = v);
  if (isDur(c)) numIn(r, "Dài (s)", () => c.dur, v => c.dur = Math.max(MINLEN, v));
  const tl = tracksOf(ttype(c)); if (tl.length > 1) select(box, "Track", Object.fromEntries(tl.map(x => [x.id, x.name])), () => c.track, v => c.track = v, true);
}
function videoPanel(box, c, m) {
  const isMain = sel.k === "v";
  const tabs = [["motion", "Chuyển động"], ["base", "Cơ bản"], ["anim", "Hoạt ảnh"], ["color", "Màu"], ["mask", "Mask"], ["key", "Tách nền"], ...(typeof fixPanel === "function" && m ? [["fix", "Sửa lỗi"]] : []), ["audio", "Âm thanh"]];
  const tab = tabbar(box, "video", m && m.kind === "video" ? tabs : tabs.filter(x => x[0] !== "audio"));
  if (tab === "motion") motionPanel(box, c);
  else if (tab === "base") {
    const b = section(box, "Clip");
    const r = el("div", "row"); r.innerHTML = `<div class="field"><label>Vào</label><div class="val">${fmt(c.in)}</div></div><div class="field"><label>Ra</label><div class="val">${fmt(c.out)}</div></div><div class="field"><label>Dài</label><div class="val">${fmt(clipLen(c))}</div></div>`; b.appendChild(r);
    if (m && m.kind === "video" && isMain) btnRow(b, [["Chọn đoạn trong source", () => openTrim(c), true]]);
    select(b, "Chuyển động máy quay", { none: "Đứng yên", in: "Zoom vào chậm", out: "Zoom ra chậm", punch: "Zoom giật (từ khoá)" }, () => c.zoom || "none", v => c.zoom = v);
    if (c.freeze) numIn(b, "Khung đứng (giây)", () => c.dur, v => c.dur = Math.max(0.2, v), 0.1, 0.2);
    if (isMain) frameGroup(box, c); else { const b2 = section(box, "Cắt khung", !!c.crop); for (const [k, n] of [["l", "Trái"], ["r", "Phải"], ["t", "Trên"], ["b", "Dưới"]]) slider(b2, { label: n, min: 0, max: 0.45, step: 0.01, get: () => (c.crop || {})[k] || 0, set: v => { c.crop = Object.assign({}, c.crop, { [k]: v }); } }); }
    timingFields(box, c);
  } else if (tab === "speed") speedGroup(box, c);
  else if (tab === "anim") animGroup(box, c, false);
  else if (tab === "color") { if (typeof openColorPage === "function") btnRow(box, [["Mở trang chỉnh màu kiểu DaVinci (Shift+6)", openColorPage, true]]); if (c.nodes && c.nodes.some(n => n.on !== false)) note(box, "Clip có " + c.nodes.length + " node chỉnh màu (trang DaVinci) chạy sau phần Lumetri bên dưới."); lumetriPanel(box, c); }
  else if (tab === "mask") maskGroup(box, c);
  else if (tab === "key") keyGroup(box, c);
  else if (tab === "fix") fixPanel(box, c);
  else if (tab === "audio") audioGroup(box, c, true);
}
function textPanel(box, c) {
  const custom = c.style === "custom";
  const tab = tabbar(box, "text", [["motion", "Chuyển động"], ["style", "Chữ"], ["preset", "Mẫu"], ["anim", "Hoạt ảnh"], ...(custom ? [["kara", "Karaoke"]] : [])]);
  if (tab === "motion") motionPanel(box, c);
  else if (tab === "style") {
    if (custom) {
      const b = section(box, "Nội dung");
      const ta = el("textarea"); ta.rows = 3; ta.value = c.text || ""; ta.setAttribute("aria-label", "Nội dung chữ"); ta.oninput = () => { beginEdit(); c.text = ta.value; layoutLabels(c); drawFrame(); }; ta.onblur = () => { gestureOpen = false; }; b.appendChild(ta);
      { const fo = Object.fromEntries(Object.keys(FONTS).map(k => [k, k === "sans-serif" ? "Không chân (hệ thống)" : k === "serif" ? "Có chân (hệ thống)" : k === "monospace" ? "Đơn cách" : k === "cursive" ? "Viết tay" : (window.fmInstalled && fmInstalled(k) ? "★ " + k : k)])); if (c.font && !fo[c.font]) fo[c.font] = c.font + " (chưa cài)"; fo.__more = "＋ Cài thêm phông chữ…";
        select(b, "Phông chữ", fo, () => c.font || "Montserrat", v => { if (v === "__more") { if (window.openFonts) openFonts(f => { pushUndo(); c.font = f; fmRedraw(); }); return; } c.font = v; }); }
      const r = el("div", "row"); b.appendChild(r);
      select(r, "Độ đậm", { 400: "Thường", 500: "Vừa", 600: "Hơi đậm", 700: "Đậm", 800: "Rất đậm", 900: "Đen" }, () => String(c.weight || 800), v => c.weight = +v);
      select(r, "Căn lề", { center: "Giữa", left: "Trái", right: "Phải" }, () => c.align || "center", v => c.align = v);
      const r2 = el("div", "row"); b.appendChild(r2); toggle(r2, "Nghiêng", () => c.italic, v => c.italic = v); toggle(r2, "IN HOA", () => c.upper, v => c.upper = v);
      slider(b, { label: "Cỡ chữ", min: 16, max: 260, step: 1, get: () => c.size || 72, set: v => c.size = v, fmt: v => Math.round(v) });
      slider(b, { label: "Giãn chữ", min: -5, max: 30, step: 0.5, get: () => c.ls || 0, set: v => c.ls = v, fmt: v => (+v).toFixed(1) });
      slider(b, { label: "Giãn dòng", min: 0.8, max: 2.2, step: 0.01, get: () => c.lh || 1.18, set: v => c.lh = v });
      slider(b, { label: "Độ rộng tối đa", min: 0.2, max: 1, step: 0.01, get: () => c.maxw || 0.86, set: v => c.maxw = v, fmt: v => Math.round(v * 100) + "%" });
      const b2 = section(box, "Màu chữ");
      colorIn(b2, "Màu", () => c.color, v => c.color = v);
      toggle(b2, "Chuyển màu (gradient)", () => !!c.grad, v => { if (v) c.grad = [c.color || "#ffffff", GOLD]; else delete c.grad; });
      if (c.grad) { colorIn(b2, "Màu trên", () => c.grad[0], v => c.grad[0] = v); colorIn(b2, "Màu dưới", () => c.grad[1], v => c.grad[1] = v); }
      tiles(b2, [["#ffffff", "Trắng", "#fff"], [BLUE, "Xanh chính", BLUE], [BLUE2, "Xanh phụ", BLUE2], [GOLD, "Vàng gold", GOLD], ["#000000", "Đen", "#000"], ["#ff4d6d", "Hồng đỏ", "#ff4d6d"]], c.color, v => { pushUndo(); c.color = v; delete c.grad; renderInspector(); drawFrame(); }, "swatches");
      const b3 = section(box, "Viền chữ", !!c.stroke);
      toggle(b3, c.stroke ? "Có viền" : "Thêm viền", () => !!c.stroke, v => { if (v) c.stroke = { c: BLUE, w: 5 }; else c.stroke = null; });
      if (c.stroke) { colorIn(b3, "Màu viền", () => c.stroke.c, v => c.stroke.c = v); slider(b3, { label: "Độ dày", min: 0.5, max: 20, step: 0.5, get: () => c.stroke.w, set: v => c.stroke.w = v, fmt: v => (+v).toFixed(1) }); }
      const b4 = section(box, "Bóng đổ / phát sáng", !!c.shadow);
      toggle(b4, c.shadow ? "Có bóng" : "Thêm bóng", () => !!c.shadow, v => { if (v) c.shadow = { c: "rgba(0,0,0,.6)", b: 8, x: 0, y: 4 }; else c.shadow = null; });
      if (c.shadow) { colorIn(b4, "Màu bóng", () => c.shadow.c, v => c.shadow.c = v); slider(b4, { label: "Độ nhoè", min: 0, max: 60, step: 1, get: () => c.shadow.b || 0, set: v => c.shadow.b = v, fmt: v => Math.round(v) }); slider(b4, { label: "Lệch X", min: -30, max: 30, step: 1, get: () => c.shadow.x || 0, set: v => c.shadow.x = v, fmt: v => Math.round(v) }); slider(b4, { label: "Lệch Y", min: -30, max: 30, step: 1, get: () => c.shadow.y || 0, set: v => c.shadow.y = v, fmt: v => Math.round(v) }); }
      const b5 = section(box, "Nền chữ", !!c.box);
      toggle(b5, c.box ? "Có nền" : "Thêm nền", () => !!c.box, v => { if (v) c.box = { c: BLUE, o: 1, pad: 0.35, r: 0.25, mode: "line" }; else c.box = null; });
      if (c.box) { colorIn(b5, "Màu nền", () => c.box.c, v => c.box.c = v); select(b5, "Kiểu nền", { line: "Theo từng dòng", block: "Một khối" }, () => c.box.mode || "line", v => c.box.mode = v); slider(b5, { label: "Độ đục", min: 0, max: 1, step: 0.01, get: () => c.box.o == null ? 1 : c.box.o, set: v => c.box.o = v, fmt: v => Math.round(v * 100) + "%" }); slider(b5, { label: "Lề", min: 0, max: 1.2, step: 0.01, get: () => c.box.pad == null ? 0.3 : c.box.pad, set: v => c.box.pad = v }); slider(b5, { label: "Bo góc", min: 0, max: 1, step: 0.01, get: () => c.box.r == null ? 0.2 : c.box.r, set: v => c.box.r = v }); }
    } else {
      const b = section(box, "Chữ kiểu thương hiệu");
      select(b, "Kiểu", { caption: "Phụ đề (trắng + từ khoá vàng)", hook: "Tiêu đề mở đầu", bgword: "Chữ nền chạy ngang", tag: "Nhãn trên cùng", cta: "Kêu gọi cuối video" }, () => c.style, v => c.style = v);
      const f1 = el("div", "field"); f1.innerHTML = '<label>Dòng chính</label>'; const t1 = el("textarea"); t1.rows = 2; t1.value = c.line1 || ""; t1.oninput = () => { beginEdit(); c.line1 = t1.value; layoutLabels(c); drawFrame(); }; f1.appendChild(t1); b.appendChild(f1);
      const f2 = el("div", "field"); f2.innerHTML = '<label>Dòng nhấn (vàng, in hoa)</label>'; const t2 = el("input"); t2.type = "text"; t2.value = c.line2 || ""; t2.oninput = () => { beginEdit(); c.line2 = t2.value; layoutLabels(c); drawFrame(); }; f2.appendChild(t2); b.appendChild(f2);
      btnRow(b, [["Chuyển sang chữ tuỳ chỉnh", () => { pushUndo(); const keep = { id: c.id, track: c.track, type: "text", start: c.start, dur: c.dur, kf: c.kf, anim: c.anim, x: c.x, y: c.y, scale: c.scale, angle: c.angle, opacity: c.opacity }; for (const k in c) delete c[k]; Object.assign(c, JSON.parse(JSON.stringify(TEXT_DEFAULTS)), { text: [keep.line1, keep.line2].filter(Boolean).join("\n") || "Nhập chữ" }, keep); c.text = c.text || "Nhập chữ"; renderAll(); }]]);
    }
    timingFields(box, c);
  } else if (tab === "preset") {
    const b = section(box, "Mẫu chữ");
    tiles(b, TEXT_PRESETS.map((p, i) => [String(i), p.n, textPresetThumb(p)]), "", k => { const p = TEXT_PRESETS[+k]; pushUndo(); const keep = { id: c.id, track: c.track, type: "text", start: c.start, dur: c.dur, kf: c.kf, anim: c.anim, x: c.x, y: c.y, scale: c.scale, angle: c.angle, opacity: c.opacity, words: c.words };
      const txt = c.style === "custom" ? c.text : [c.line1, c.line2].filter(Boolean).join(" "); for (const kk in c) delete c[kk]; Object.assign(c, newTextClip(p, keep.start, keep.dur, keep.track), keep); if (c.style === "custom") c.text = txt || c.text; else { c.line1 = txt || c.line1; } renderAll(); }, "presets");
  } else if (tab === "anim") animGroup(box, c, true);
  else if (tab === "kara") {
    const b = section(box, "Karaoke (chữ sáng theo lời nói)");
    toggle(b, c.kara ? "Đang bật karaoke" : "Bật karaoke", () => !!c.kara, v => { if (v) c.kara = { c: GOLD, mode: "fill" }; else delete c.kara; });
    if (c.kara) { colorIn(b, "Màu chữ đã đọc", () => c.kara.c, v => c.kara.c = v); select(b, "Kiểu", { fill: "Tô dần từng từ", word: "Đổi màu từng từ", bounce: "Từ đang đọc nảy lên" }, () => c.kara.mode || "fill", v => c.kara.mode = v); note(b, c.words ? `Đang dùng mốc thời gian của ${c.words.length} từ từ phụ đề tự động.` : "Chưa có mốc thời gian từng từ nên chữ sáng đều theo độ dài clip. Dùng Phụ đề tự động để khớp đúng giọng nói."); }
  }
}
const _tpThumbs = {};
function textPresetThumb(p) {
  const key = p.n, copy = src => { const cp = document.createElement("canvas"); cp.width = src.width; cp.height = src.height; cp.getContext("2d").drawImage(src, 0, 0); return cp; }; if (_tpThumbs[key]) return copy(_tpThumbs[key]);
  const cnv = document.createElement("canvas"); cnv.width = 216; cnv.height = 120; const ctx = cnv.getContext("2d"); ctx.fillStyle = "#1d2b30"; ctx.fillRect(0, 0, 216, 120);
  try {
    if (p.legacy) { ctx.fillStyle = p.legacy === "cta" ? BLUE : "#fff"; ctx.font = (p.legacy === "hook" || p.legacy === "tag" ? 'italic 700 26px "Playfair Display", serif' : "900 26px Montserrat, sans-serif"); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.strokeStyle = BLUE; ctx.lineWidth = 5; ctx.lineJoin = "round"; const tx = p.legacy === "bgword" ? "THẦN THÁNH?" : p.legacy === "caption" ? "Phụ đề" : (p.p.line1 || "").slice(0, 12); ctx.strokeText(tx, 108, 50); ctx.fillText(tx, 108, 50); if (p.legacy === "caption" || p.legacy === "hook") { ctx.fillStyle = GOLD; ctx.font = "900 24px Montserrat"; ctx.strokeText(p.legacy === "hook" ? "THƯỢNG HẢI" : "TỪ KHOÁ", 108, 84); ctx.fillText(p.legacy === "hook" ? "THƯỢNG HẢI" : "TỪ KHOÁ", 108, 84); } }
    else { const c = Object.assign(JSON.parse(JSON.stringify(TEXT_DEFAULTS)), JSON.parse(JSON.stringify(p.p)), { text: "Aa Chữ" }); c.size = 300; c.maxw = 1; drawRichText(ctx, c, 10, 20); }
  } catch (e) {}
  _tpThumbs[key] = cnv; return copy(cnv);
}
function stickerPanel(box, c) {
  const tab = tabbar(box, "sticker", [["motion", "Chuyển động"], ["st", "Sticker"], ["anim", "Hoạt ảnh"]]);
  if (tab === "motion") motionPanel(box, c);
  else if (tab === "st" && c.gfx && typeof shapeUI === "function") { shapeUI(box, c); timingFields(box, c); }
  else if (tab === "st") {
    const b = section(box, "Sticker");
    slider(b, { label: "Kích thước gốc", min: 40, max: 900, step: 2, get: () => c.size || 220, set: v => c.size = v, fmt: v => Math.round(v) });
    if (!c.emoji) { colorIn(b, "Màu", () => c.color || GOLD, v => c.color = v); toggle(b, "Tô đặc", () => c.fill !== false, v => c.fill = v); const f = el("div", "field"); f.innerHTML = "<label>Chữ trên sticker</label>"; const i = el("input"); i.type = "text"; i.value = c.label || ""; i.oninput = () => { beginEdit(); c.label = i.value; drawFrame(); }; f.appendChild(i); b.appendChild(f); }
    toggle(b, "Bóng đổ", () => c.shadow !== false, v => c.shadow = v);
    timingFields(box, c);
  } else animGroup(box, c, false);
}
function fxPanel(box, c) {
  if (c.fxType === "filter") { note(box, "Lớp điều chỉnh: màu ở đây áp lên mọi lớp nằm dưới trong khoảng thời gian của nó."); if (typeof openColorPage === "function") btnRow(box, [["Mở trang chỉnh màu kiểu DaVinci", openColorPage, true]]); lumetriPanel(box, c); timingFields(box, c); return; }
  const tab = tabbar(box, "fx", [["motion", "Chuyển động"], ["main", "Hiệu ứng"]]);
  if (tab === "motion") return motionPanel(box, c);
  const b = section(box, "Hiệu ứng");
  select(b, "Hiệu ứng", Object.fromEntries(Object.entries(EFFECTS).map(([k, n]) => [k, (typeof fxCat === "function" ? fxCat(k) + " · " : "") + n])), () => c.effect, v => { c.effect = v; delete c.p; }, true);
  slider(b, { label: "Cường độ", min: 0, max: 2, step: 0.01, get: () => c.amt == null ? 1 : c.amt, set: v => c.amt = v, fmt: v => Math.round(v * 100) + "%", kf: { c, prop: "amt" } });
  slider(b, { label: "Tốc độ hiệu ứng", min: 0.2, max: 4, step: 0.05, get: () => c.speed || 1, set: v => c.speed = v, fmt: v => v.toFixed(2) + "x" });
  if (typeof fxParamsUI === "function") fxParamsUI(box, c);
  timingFields(box, c);
}
function transitionPanel(box) {
  const i = V.findIndex(x => x.id === sel.id); if (i < 0 || i >= V.length - 1) { sel = null; return renderInspector(); }
  const c = V[i]; const head = el("div", "ihead"); head.innerHTML = `<b>Chuyển cảnh</b><span class="tc">giữa cảnh ${i + 1} và ${i + 2}</span>`; box.appendChild(head);
  const b = section(box, "Kiểu chuyển cảnh");
  tiles(b, [["", "Không"], ...Object.entries(TRANSITIONS)], c.tr ? c.tr.type : "", k => { pushUndo(); if (k) c.tr = { type: k, dur: (c.tr && c.tr.dur) || 0.5 }; else delete c.tr; renderAll(); if (k) { seek(vStarts()[i + 1] - (c.tr.dur || 0.5) / 2 - 0.3); play(); setTimeout(() => { if (playing) pause(); }, ((c.tr.dur || 0.5) + 0.7) * 1000); } });
  if (c.tr) {
    slider(b, { label: "Thời lượng", min: 0.1, max: Math.max(0.15, Math.min(2.5, vlen(c), vlen(V[i + 1]))), step: 0.05, get: () => c.tr.dur || 0.5, set: v => c.tr.dur = v, fmt: v => v.toFixed(2) + "s" });
    btnRow(b, [["Áp dụng cho mọi điểm cắt", () => applyTransitionAll(c.tr.type, c.tr.dur || 0.5)], ["Xoá chuyển cảnh", () => { pushUndo(); delete c.tr; renderAll(); }]]);
  }
}
function layoutLabels(c) { const d = grid.querySelector(`.clip[data-id="${c.id}"] .cl`); if (d) d.textContent = textLabel(c); }
function syncButtons() { $("#undoBtn").disabled = !undoStack.length; $("#redoBtn").disabled = !redoStack.length; const c = findSel(); $("#delBtn").disabled = !c && !(sel && sel.k === "tr"); $("#dupBtn").disabled = !c; $("#magBtn").setAttribute("aria-pressed", magnetOn); $("#trimBtn").disabled = !(c && sel.k === "v" && media.get(c.mediaId)?.kind === "video"); }
function renderAll() { renderTimeline(); renderInspector(); syncButtons(); markUsed(); drawFrame(); liveRefresh(); }
