"use strict";
/* ============================================================================
   Library tabs: Media | Âm thanh | Chữ | Sticker | Hiệu ứng | Chuyển cảnh | Bộ lọc
   Tap a tile to add it at the playhead, or drag it onto the timeline.
   ========================================================================== */
const ASSET_TABS = [
  ["media", "Media", '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9l5 3-5 3z"/>'],
  ["audio", "Âm thanh", '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'],
  ["text", "Chữ", '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>'],
  ["sticker", "Sticker", '<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>'],
  ["fx", "Hiệu ứng", '<path d="M12 3l2.5 5.5L20 11l-5.5 2.5L12 19l-2.5-5.5L4 11l5.5-2.5z"/>'],
  ["tr", "Chuyển cảnh", '<path d="M4 6l8 6-8 6zM20 6l-8 6 8 6z"/>'],
  ["filter", "Bộ lọc", '<circle cx="9" cy="10" r="5"/><circle cx="15" cy="10" r="5"/><circle cx="12" cy="15" r="5"/>']
];
const FX_ICON = { blur: "◌", vignette: "◉", grain: "░", glitch: "▚", shake: "≋", flash: "✸", letterbox: "▭", zoompulse: "⊕", vhs: "▤", leak: "☀", rgb: "◐", mirror: "◫", snow: "❄", sparkle: "✦", hearts: "♥", fadeblack: "●", bwflash: "◑", softglow: "✺" };
const TR_ICON = { fade: "◐", black: "●", white: "○", slideL: "⇠", slideR: "⇢", slideU: "⇡", slideD: "⇣", wipeL: "◧", wipeR: "◨", circle: "◎", zoom: "⊙", spin: "↻", blur: "◌", glitch: "▚", whip: "⇶", cover: "▱" };
let assetTab = "media";
function setupAssetTabs() {
  const ph = $("#libPanel .ph"); const bar = document.createElement("div"); bar.className = "ltabs"; bar.setAttribute("role", "tablist"); bar.id = "ltabs";
  for (const [k, n, ico] of ASSET_TABS) { const b = document.createElement("button"); b.type = "button"; b.setAttribute("role", "tab"); b.dataset.tab = k; b.innerHTML = `<svg class="i" viewBox="0 0 24 24">${ico}</svg><span>${n}</span>`; b.onclick = () => showAssets(k); bar.appendChild(b); }
  ph.after(bar);
  const box = document.createElement("div"); box.className = "assets"; box.id = "assets"; box.hidden = true; $("#bin").after(box);
  showAssets("media");
}
function showAssets(k) {
  assetTab = k; document.querySelectorAll("#ltabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === k));
  $("#bin").hidden = k !== "media"; $("#assets").hidden = k === "media"; if (k !== "media") renderAssets();
}
function assetTile(box, label, prev, onAdd, drag, cls) {
  const b = document.createElement("button"); b.type = "button"; b.className = "atile " + (cls || ""); b.title = label + " · bấm để thêm tại kim, hoặc kéo xuống timeline";
  const pv = document.createElement("span"); pv.className = "ap"; if (typeof prev === "string") pv.innerHTML = prev; else if (prev) pv.appendChild(prev); b.appendChild(pv);
  const sp = document.createElement("span"); sp.className = "an"; sp.textContent = label; b.appendChild(sp);
  b.addEventListener("click", () => { if (b._dragged) { b._dragged = false; return; } onAdd(); });
  if (drag) b.addEventListener("pointerdown", e => assetDragStart(e, b, label, drag));
  box.appendChild(b); return b;
}
function aHead(box, txt) { const h = document.createElement("div"); h.className = "bingroup"; h.textContent = txt; box.appendChild(h); }
function renderAssets() {
  const box = $("#assets"); box.innerHTML = "";
  if (assetTab === "text") {
    const r = document.createElement("div"); r.className = "row"; r.style.gridColumn = "1/-1";
    const add = document.createElement("button"); add.className = "primary"; add.type = "button"; add.textContent = "+ Thêm chữ"; add.onclick = () => addTextPreset(TEXT_PRESETS[5]); r.appendChild(add);
    const ac = document.createElement("button"); ac.type = "button"; ac.textContent = "Phụ đề tự động (AI)"; ac.onclick = () => openAutoCaptions(); r.appendChild(ac);
    const ly = document.createElement("button"); ly.type = "button"; ly.textContent = "Video lời bài hát"; ly.onclick = () => window.openLyrics && openLyrics(); r.appendChild(ly);
    const fb = document.createElement("button"); fb.type = "button"; fb.textContent = "Phông chữ…"; fb.onclick = () => window.openFonts && openFonts(); r.appendChild(fb); box.appendChild(r);
    aHead(box, "Mẫu chữ");
    TEXT_PRESETS.forEach(p => assetTile(box, p.n, textPresetThumb(p), () => addTextPreset(p), { kind: "text", preset: p }, "wide"));
  } else if (assetTab === "sticker") {
    aHead(box, "Hình vẽ");
    for (const k in STICKER_SHAPES) { const cnv = document.createElement("canvas"); cnv.width = 96; cnv.height = 96; const x = cnv.getContext("2d"); x.translate(48, 48); drawStickerShape(x, k, 64, k === "check" ? "#2ecc71" : k === "cross" ? "#e5604f" : k === "badge" || k === "burst" ? BLUE2 : GOLD, true); if (k === "badge") { x.fillStyle = "#fff"; x.font = "900 16px Montserrat"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("MỚI", 0, 0); }
      const spec = { shape: k, color: k === "check" ? "#2ecc71" : k === "cross" ? "#e5604f" : k === "badge" || k === "burst" ? BLUE2 : GOLD, label: k === "badge" ? "MỚI" : k === "burst" ? "HOT" : "" };
      assetTile(box, STICKER_SHAPES[k], cnv, () => addSticker(spec), { kind: "sticker", spec }); }
    aHead(box, "Biểu tượng cảm xúc");
    for (const e of STICKER_EMOJI) assetTile(box, e, `<span class="emo">${e}</span>`, () => addSticker({ emoji: e }), { kind: "sticker", spec: { emoji: e } }, "emo");
  } else if (assetTab === "fx") {
    aNote(box, "Hiệu ứng nằm trên track Hiệu ứng và áp lên mọi lớp hình bên dưới (không áp lên chữ).");
    const cats = typeof FX_CATS !== "undefined" ? FX_CATS : [""]; for (const cat of cats) { const keys = Object.keys(EFFECTS).filter(k => (typeof fxCat === "function" ? fxCat(k) : "") === cat); if (!keys.length) continue; if (cat) aHead(box, cat); for (const k of keys) assetTile(box, EFFECTS[k], `<span class="sym">${FX_ICON[k] || "✦"}</span>`, () => addEffect(k), { kind: "fx", key: k }); }
  } else if (assetTab === "tr") {
    aNote(box, "Bấm để đặt vào điểm cắt gần kim nhất (hoặc sau cảnh đang chọn), hoặc kéo thả vào ô giữa hai cảnh trên track chính.");
    const trBase = Object.keys(TRANSITIONS).filter(k => !(typeof TR2 !== "undefined" && TR2[k])), trPr = Object.keys(TRANSITIONS).filter(k => typeof TR2 !== "undefined" && TR2[k]);
    aHead(box, "Cơ bản"); for (const k of trBase) assetTile(box, TRANSITIONS[k], `<span class="sym">${TR_ICON[k] || "◐"}</span>`, () => applyTransition(k), { kind: "tr", key: k });
    if (trPr.length) aHead(box, "Kiểu Premiere");
    for (const k of trPr) assetTile(box, TRANSITIONS[k], `<span class="sym">${TR_ICON[k] || "◐"}</span>`, () => applyTransition(k), { kind: "tr", key: k });
  } else if (assetTab === "filter") {
    const c = findSel(), target = c && (sel.k === "v" || c.type === "video") ? c : (activeVideo(t) || {}).c;
    aNote(box, target ? "Bấm để áp bộ lọc lên clip " + (c === target ? "đang chọn" : "tại kim") + ". Dấu + thêm thành lớp bộ lọc áp cho cả khung trong một đoạn thời gian." : "Thêm video vào timeline để dùng bộ lọc.");
    const prevs = target ? filterPreviewsFor(target) : {};
    for (const k in FILTERS) { if (k === "none") continue; const b = assetTile(box, FILTERS[k].n, prevs[k] || "", () => { if (target) { const f = clipById(target.id); sel = { k: f.k, id: target.id }; applyFilterTo(target, k); renderAll(); toast("Đã áp bộ lọc " + FILTERS[k].n + "."); } }, null, "flt");
      const plus = document.createElement("span"); plus.className = "plus"; plus.textContent = "+"; plus.title = "Thêm lớp bộ lọc"; plus.onclick = e => { e.stopPropagation(); addFilterLayer(k); }; b.appendChild(plus); }
  } else if (assetTab === "audio") {
    const r = document.createElement("div"); r.className = "row"; r.style.gridColumn = "1/-1";
    const imp = document.createElement("button"); imp.type = "button"; imp.textContent = "Nhập nhạc từ máy"; imp.onclick = () => $("#file").click(); r.appendChild(imp);
    const rec = document.createElement("button"); rec.type = "button"; rec.textContent = "Thu âm lồng tiếng"; rec.onclick = () => $("#recBtn").click(); r.appendChild(rec);
    const tts = document.createElement("button"); tts.type = "button"; tts.textContent = "Chữ thành giọng nói"; tts.onclick = openTTS; r.appendChild(tts);
    const ex = document.createElement("button"); ex.type = "button"; ex.textContent = "Tách âm thanh từ clip"; ex.onclick = () => { const c = findSel(); const tv = c && (sel.k === "v" || c.type === "video") ? c : (activeVideo(t) || {}).c; if (!tv) { toast("Chọn một clip video."); return; } extractAudioFromClip(tv, V.includes(tv) ? "v" : "c"); }; r.appendChild(ex);
    box.appendChild(r);
    aHead(box, "Hiệu ứng âm thanh");
    for (const k in SFX_GEN) assetTile(box, SFX_GEN[k], `<span class="sym">♪</span>`, async () => { const m = await addGeneratedSfx(k); appendMedia(m, null, { track: freeTrack("audio", t, m.duration).id, start: t }); toast("Đã thêm " + m.name); }, { kind: "sfx", key: k });
    const own = [...media.values()].filter(m => m.kind === "audio");
    if (own.length) { aHead(box, "Âm thanh trong dự án"); for (const m of own) assetTile(box, m.name, `<span class="sym">♫</span>`, () => appendMedia(m, null, { track: freeTrack("audio", t, m.duration).id, start: t }), { kind: "media", m }); }
  }
}
function aNote(box, txt) { const p = document.createElement("p"); p.className = "note"; p.style.gridColumn = "1/-1"; p.textContent = txt; box.appendChild(p); return p; }
function filterPreviewsFor(c) { const keep = sel; try { const f = clipById(c.id); if (f) sel = { k: f.k, id: c.id }; return filterPreviews(c); } finally { sel = keep; } }

/* ---------- drag an asset onto the timeline ---------- */
function assetDragStart(e, tile, label, spec) {
  if (e.button !== undefined && e.button !== 0) return;
  const x0 = e.clientX, y0 = e.clientY, isTouch = e.pointerType === "touch"; let card = null, target = null, holdOk = !isTouch, swiping = false, hl = null;
  const box = tile.closest(".assets"), st0 = box ? box.scrollTop : 0;
  const hold = isTouch ? setTimeout(() => { holdOk = true; tile.classList.add("armed"); try { navigator.vibrate && navigator.vibrate(12); } catch (_) {} }, 220) : null;
  const noScroll = ev => { if (holdOk) ev.preventDefault(); }; tile.addEventListener("touchmove", noScroll, { passive: false });
  const clear = () => { Object.values(contentEl).forEach(x => x.classList.remove("over")); hl && hl.classList.remove("drop"); hl = null; document.querySelectorAll(".insert.asset").forEach(x => x.remove()); };
  const move = ev => {
    if (swiping) { if (box) box.scrollTop = st0 - (ev.clientY - y0); return; }
    if (!card) {
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
      if (!holdOk) { clearTimeout(hold); swiping = true; return; }
      card = document.createElement("div"); card.className = "dragcard asset"; card.innerHTML = "<span></span>"; card.querySelector("span").textContent = label; document.body.appendChild(card); tile._dragged = true;
    }
    ev.preventDefault(); card.style.transform = `translate(${ev.clientX - 38}px,${ev.clientY - 30}px)`; clear(); target = null;
    const r = scroller.getBoundingClientRect(); if (ev.clientX < r.left + headW() || ev.clientY < r.top || ev.clientY > r.bottom) return;
    const x = Math.max(0, laneX(ev)), tr = trackAtY(ev.clientY);
    if (spec.kind === "tr") { const st = vStarts(); let best = -1, bd = 1e9; for (let i = 0; i < V.length - 1; i++) { const d = Math.abs(st[i + 1] - x) * pps; if (d < bd) { bd = d; best = i; } } if (best >= 0 && bd < 60) { hl = grid.querySelector(`.trb[data-i="${best}"]`); hl && hl.classList.add("drop"); target = { cut: best }; } return; }
    const want = spec.kind === "text" || spec.kind === "sticker" ? "text" : spec.kind === "fx" ? "fx" : "audio";
    const s = snapTime(x, null).v;
    if (tr && tr.type === want && !tr.lock) { contentEl[tr.id].classList.add("over"); const ins = document.createElement("div"); ins.className = "insert asset"; ins.style.left = (s * pps - 1) + "px"; contentEl[tr.id].appendChild(ins); target = { track: tr.id, start: s }; }
    else target = { track: null, start: s };
    if (ev.clientX > r.right - 40) scroller.scrollLeft += 18; else if (ev.clientX < r.left + headW() + 30) scroller.scrollLeft -= 18;
  };
  const up = async () => {
    const tg = card ? target : null; cleanup(); if (!tg) return;
    if (spec.kind === "tr") { applyTransition(spec.key, tg.cut); return; }
    const dur = 3, trOk = id => id && !C.some(x => x.track === id && x.start < tg.start + dur && cend(x) > tg.start);
    if (spec.kind === "text") { const c = addTextPreset(spec.preset, tg.start); if (trOk(tg.track)) { c.track = tg.track; renderAll(); } }
    else if (spec.kind === "sticker") { const c = addSticker(spec.spec, tg.start); if (trOk(tg.track)) { c.track = tg.track; renderAll(); } }
    else if (spec.kind === "fx") { const c = addEffect(spec.key, tg.start); if (trOk(tg.track)) { c.track = tg.track; renderAll(); } }
    else if (spec.kind === "sfx") { const m = await addGeneratedSfx(spec.key); appendMedia(m, null, { track: (tg.track && trackById(tg.track)?.type === "audio" ? tg.track : freeTrack("audio", tg.start, m.duration).id), start: tg.start }); }
    else if (spec.kind === "media") appendMedia(spec.m, null, { track: (tg.track && trackById(tg.track)?.type === "audio" ? tg.track : freeTrack("audio", tg.start, spec.m.duration).id), start: tg.start });
  };
  function cleanup() { clearTimeout(hold); tile.classList.remove("armed"); tile.removeEventListener("touchmove", noScroll); clear(); card && card.remove(); card = null; window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cleanup); if (document.body.classList.contains("dragout")) document.body.classList.remove("dragout"); }
  window.addEventListener("pointermove", move, { passive: false }); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", cleanup);
}

/* ---------- text to speech dialog ---------- */
function openTTS() {
  if (!ttsAvailable()) { toast("Chữ thành giọng nói chạy ở app Android và bản Bravin trên máy tính (dùng giọng đọc của máy)."); return; }
  const ov = document.createElement("div"); ov.className = "overlay";
  ov.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="ttsT"><h2 id="ttsT">Chữ thành giọng nói</h2>
    <div class="field"><label for="ttsTxt">Nội dung</label><textarea id="ttsTxt" rows="4" placeholder="Nhập câu cần đọc"></textarea></div>
    <div class="row"><div class="field"><label for="ttsLang">Ngôn ngữ</label><select id="ttsLang"><option value="vi-VN">Tiếng Việt</option><option value="en-US">Tiếng Anh</option></select></div>
    <div class="field"><label for="ttsRate">Tốc độ đọc</label><select id="ttsRate"><option value="0.85">Chậm</option><option value="1" selected>Vừa</option><option value="1.2">Nhanh</option></select></div></div>
    <div class="row" style="justify-content:flex-end"><button id="ttsNo">Huỷ</button><button class="primary" id="ttsGo">Tạo giọng đọc</button></div></div>`;
  document.body.appendChild(ov); const txt = ov.querySelector("#ttsTxt"); const c = findSel(); if (c && c.type === "text") txt.value = c.style === "custom" ? c.text : [c.line1, c.line2].filter(Boolean).join(" "); txt.focus();
  ov.querySelector("#ttsNo").onclick = () => ov.remove();
  ov.querySelector("#ttsGo").onclick = async () => { const v = txt.value.trim(); if (!v) return; const b = ov.querySelector("#ttsGo"); b.disabled = true; b.textContent = "Đang tạo…";
    try { const m = await ttsToMedia(v, ov.querySelector("#ttsLang").value, +ov.querySelector("#ttsRate").value); ov.remove(); appendMedia(m, null, { track: freeTrack("audio", t, m.duration).id, start: t }); toast("Đã thêm giọng đọc vào timeline."); }
    catch (e) { b.disabled = false; b.textContent = "Tạo giọng đọc"; toast("Không tạo được giọng đọc. Kiểm tra máy đã cài giọng đọc tiếng Việt."); } };
}
