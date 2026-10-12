"use strict";
/* ============================================================================
   Compositor: main track (+ transitions) → overlay layers → effect layers →
   text / sticker layers. `cv`/`g` are swapped to an offscreen canvas while
   exporting, so the exact same code renders preview and final video.
   ========================================================================== */
let cv = $("#pv"), g = cv.getContext("2d");
let slotBase = 0;                    // lớp compound: dời chỉ số trình phát video để không đụng nhau
let renderMode = "preview";          // "preview" | "export"
let frameProvider = null;            // export: (c, srcT, slot) => {img,w,h} | null
const lastBoxes = new Map();         // clip id → on-canvas box (for direct manipulation in the preview)
function sx() { return cv.width / 1080; }
function sy(y) { return y / 1920 * cv.height; }

/* ---------- legacy brand text styles (used by drawLegacyText) ---------- */
function strokeFill(txt, x, y, fill, stroke, bord, shadow) {
  g.lineJoin = "round"; g.miterLimit = 2;
  if (bord > 0) { if (shadow) { g.shadowColor = "rgba(0,0,0,.55)"; g.shadowOffsetY = 3 * sx(); g.shadowBlur = 2 * sx(); } g.strokeStyle = stroke; g.lineWidth = bord * 2 * sx(); g.strokeText(txt, x, y); g.shadowColor = "transparent"; g.shadowOffsetY = 0; g.shadowBlur = 0; }
  g.fillStyle = fill; g.fillText(txt, x, y);
}
function popScale(ms, delay, start, peak, d1, d2) { const t1 = ms - delay; if (t1 < 0) return 0; if (t1 < d1) return start + (peak - start) * (t1 / d1); if (t1 < d2) return peak + (1 - peak) * ((t1 - d1) / (d2 - d1)); return 1; }
function scaled(x, y, s, fn) { if (s <= 0) return; g.save(); g.translate(x, y); g.scale(s, s); fn(); g.restore(); }
function drawText(c, lt) {
  const s = sx(), ms = lt * 1000, X = cv.width / 2; g.textAlign = "center";
  if ("letterSpacing" in g) g.letterSpacing = "0px";
  if (c.style === "caption") {
    const Y = sy(1440);
    if (c.line1) {
      const L = wrap2(c.line1, 26); const sc = popScale(ms, 0, 0.78, 1.05, 110, 190);
      g.globalAlpha *= clamp(ms / 40, 0, 1); g.font = `800 ${62 * s}px Montserrat, sans-serif`; g.textBaseline = "alphabetic";
      scaled(X, Y, sc, () => { L.forEach((ln, i) => strokeFill(ln, 0, -(L.length - 1 - i) * 72 * s, "#fff", BLUE, 5, true)); });
    }
    if (c.line2) {
      const K = wrap2(c.line2.toUpperCase(), 19); const yk = c.line1 ? Y + 14 * s : Y - 90 * K.length * s;
      const sc = popScale(ms, 120, 0.3, 1.16, 130, 220); g.font = `900 ${70 * s}px Montserrat, sans-serif`; g.textBaseline = "top"; if ("letterSpacing" in g) g.letterSpacing = (1 * s) + "px";
      scaled(X, yk, sc, () => { K.forEach((ln, i) => strokeFill(ln, 0, i * 82 * s, GOLD, BLUE, 6, true)); });
      if ("letterSpacing" in g) g.letterSpacing = "0px";
    }
  } else if (c.style === "hook") {
    const p = clamp(ms / 260, 0, 1), ease = 1 - Math.pow(1 - p, 3), x1 = -200 * s + (X + 200 * s) * ease;
    const fadeOut = clamp((clen(c) * 1000 - ms) / 200, 0, 1), a0 = g.globalAlpha;
    g.globalAlpha = a0 * Math.min(clamp(ms / 150, 0, 1), fadeOut); g.textBaseline = "middle";
    g.font = `italic 700 ${72 * s}px "Playfair Display", serif`; strokeFill(c.line1 || "", x1, sy(330), "#fff", BLUE, 4, true);
    g.globalAlpha = a0 * fadeOut;
    if (c.line2) { const sc = popScale(ms, 200, 0.2, 1.12, 180, 280); g.font = `900 ${120 * s}px Montserrat, sans-serif`; if ("letterSpacing" in g) g.letterSpacing = (1 * s) + "px"; scaled(X, sy(445), sc, () => strokeFill(c.line2.toUpperCase(), 0, 0, GOLD, BLUE, 8, true)); if ("letterSpacing" in g) g.letterSpacing = "0px"; }
    const bw = 400 * s * clamp((ms - 400) / 250, 0, 1); g.fillStyle = BLUE2; g.fillRect(X - bw / 2, sy(525), bw, 10 * s);
  } else if (c.style === "bgword") {
    const p = clamp(lt / Math.max(0.1, clen(c)), 0, 1), x = (1300 - 1560 * p) * s;
    g.globalAlpha *= 0.3; g.font = `900 ${230 * s}px Montserrat, sans-serif`; g.textBaseline = "middle"; g.fillStyle = "#fff"; g.fillText(c.line1 || "", x, sy(960));
  } else if (c.style === "tag") {
    const a = Math.min(clamp(ms / 300, 0, 1), clamp((clen(c) * 1000 - ms) / 300, 0, 1));
    g.globalAlpha *= 0.81 * a; g.textBaseline = "top"; g.font = `italic 700 ${40 * s}px "Playfair Display", serif`; strokeFill(c.line1 || "", X, sy(215), "#fff", BLUE, 2.5, true);
  } else if (c.style === "cta") {
    g.globalAlpha *= clamp(ms / 200, 0, 1); g.textBaseline = "middle";
    g.font = `800 ${56 * s}px Montserrat, sans-serif`; strokeFill(c.line1 || "", X, sy(1380), BLUE, "#fff", 3, false);
    g.font = `italic 700 ${48 * s}px "Playfair Display", serif`; strokeFill(c.line2 || "", X, sy(1460), BLUE2, "#fff", 2, false);
  }
}

/* ---------- time + sources ---------- */
function activeVideo(time) { const st = vStarts(); for (let i = 0; i < V.length; i++) if (time >= st[i] && time < st[i] + vlen(V[i])) return { c: V[i], start: st[i], i }; return null; }
function zoomAt(c, lt) { const d = Math.max(0.05, c.type === "video" ? clen(c) : vlen(c)), p = clamp(lt / d, 0, 1); switch (c.zoom) { case "in": return 1 + 0.07 * p; case "out": return 1.07 - 0.07 * p; case "punch": return 1 + 0.13 * Math.exp(-lt * 9) + 0.04 * p; default: return 1; } }
function srcTime(c, lt) {
  const sp = c.speed || 1, m = media.get(c.mediaId), D = m && m.kind === "video" ? Math.max(0, m.duration - 0.04) : 1e9;
  if (c.freeze) return c.in;
  const so = srcOffset(c, lt);
  if (c.reverse) return clamp(c.out - so - 1 / FPS, 0, D);
  return clamp(c.in + so, 0, D);
}
/* preview: the <video> element (seeking it when paused); export: the frame provider */
function frameFor(c, lt, slot) {
  const m = media.get(c.mediaId); if (!m) return null;
  if (m.kind === "image") return m.img ? { img: m.img, w: m.img.naturalWidth, h: m.img.naturalHeight } : null;
  if (!m.url) return null;
  const want = srcTime(c, lt);
  if (renderMode === "export" && frameProvider) return frameProvider(c, want, slot);
  const el = getEl(m, slot);
  if ((!playing || c.reverse || c.freeze || lt < 0) && Math.abs(el.currentTime - want) > 1 / FPS / 2 && !el.seeking) { el.currentTime = want; el.onseeked = () => { el.onseeked = null; if (!playing) drawFrame(); }; }
  if (el.readyState >= 2 && el.videoWidth && !el.seeking) { holdSnap(m, el, want); return { img: el, w: el.videoWidth, h: el.videoHeight }; }
  return holdFrame(m, el, want);
}
/* Giữ khung: khi trình phát đang tua hoặc vừa tạo (sau khi cắt/ghép, đổi clip), vẽ khung gần nhất thay vì màn hình đen. */
function holdSnap(m, el, want) {
  const now = performance.now(); if (m._hold && m._hold.t === want && now - m._hold.at < 1000) return; if (playing && m._hold && now - m._hold.at < 90) return;
  const s = Math.min(1, 720 / Math.max(el.videoWidth, el.videoHeight)), w = Math.max(2, Math.round(el.videoWidth * s)), h = Math.max(2, Math.round(el.videoHeight * s));
  let hc = m._hold && m._hold.cv; if (!hc) { hc = document.createElement("canvas"); }
  if (hc.width !== w || hc.height !== h) { hc.width = w; hc.height = h; }
  try { hc.getContext("2d").drawImage(el, 0, 0, w, h); m._hold = { cv: hc, t: want, at: now, w: el.videoWidth, h: el.videoHeight }; } catch (_) {}
}
function holdFrame(m, el, want) {
  for (const o of (m.els || [])) if (o && o !== el && o.readyState >= 2 && o.videoWidth && !o.seeking && Math.abs(o.currentTime - want) < 0.25) return { img: o, w: o.videoWidth, h: o.videoHeight };
  if (el.readyState >= 2 && el.videoWidth && !m._hold) return { img: el, w: el.videoWidth, h: el.videoHeight }; // đang tua, chưa có ảnh giữ: dùng khung cũ của chính trình phát
  if (m._hold) return { img: m._hold.cv, w: m._hold.cv.width, h: m._hold.cv.height, held: true }; // kích thước theo ảnh giữ (crop tính theo tỉ lệ nên vẫn đúng)
  if (m.thumb && m.kind === "video") { if (!m._thumbImg) { m._thumbImg = new Image(); m._thumbImg.src = m.thumb; } if (m._thumbImg.complete && m._thumbImg.naturalWidth) return { img: m._thumbImg, w: m._thumbImg.naturalWidth, h: m._thumbImg.naturalHeight, held: true }; }
  return null;
}

/* ---------- one media layer (main clip or overlay) ---------- */
function drawMediaLayer(ctx, c, lt, slot, isMain, T) {
  const S = frameFor(c, lt, slot); if (!S) return null;
  const W = ctx.canvas.width, H = ctx.canvas.height, len = isMain ? vlen(c) : clen(c), X = xform(c, lt, len);
  if (X.opacity <= 0.001) return null;
  const cr = c.crop || {};
  let img = S.img, cx = (cr.l || 0) * S.w, cy = (cr.t || 0) * S.h, cw = Math.max(2, S.w * (1 - (cr.l || 0) - (cr.r || 0))), ch = Math.max(2, S.h * (1 - (cr.t || 0) - (cr.b || 0)));
  if (typeof fixPre === "function" && hasFix(c)) { const o = fixPre(c, img, cx, cy, cw, ch, lt, T); if (o) { img = o; cx = 0; cy = 0; cw = o.width; ch = o.height; } }
  const P = window.__noGrade ? {} : colorParams(c);
  if (c.dfl && typeof dflGain === "function" && !window.__noGrade) { const gn = dflGain(c, lt); if (Math.abs(gn - 1) > 1e-3) P.ex = (P.ex || 0) + Math.log2(gn); }
  const seg = c.bgRemove && window.SEG ? SEG.mask(c, S, T) : null;
  const ck = c.chroma && !window.__noChroma ? c.chroma : null;
  if (hasColor(P) || ck || seg) {
    const out = GLFX.run(img, cx, cy, cw, ch, P, { chroma: ck, mask: seg, maskInv: c.bgRemove === "invert", time: T, maxSide: renderMode === "export" ? 2160 : 1280, fullW: S.w, fullH: S.h });
    if (out) { img = out; cx = 0; cy = 0; cw = out.width; ch = out.height; }
  }
  const quarter = ((Math.round(X.angle / 90) * 90) % 180 + 180) % 180 === 90 && Math.abs(X.angle % 90) < 0.01;
  const fw = quarter ? ch : cw, fh = quarter ? cw : ch;
  const contain = c.fit === "contain", base = contain ? Math.min(W / fw, H / fh) : Math.max(W / fw, H / fh);
  const s = base * zoomAt(c, lt) * X.scale, px = W / 2 + X.x * W, py = H / 2 + X.y * H;
  const hasMk = typeof hasMasks === "function" ? hasMasks(c) : false, hasNd = typeof hasNodes === "function" && hasNodes(c), bl = blendAt(c, lt), fancy = hasMk || hasNd || bl !== "normal";
  const tgt = fancy ? scratch("layer", W, H).ctx : ctx;
  if (fancy) tgt.clearRect(0, 0, W, H);
  // canvas background behind a "fit" main clip
  if (isMain && contain && c.bg && c.bg !== "black") {
    ctx.save();
    if (c.bg === "blur") { const bs = Math.max(W / fw, H / fh) * 1.08; ctx.filter = `blur(${36 * W / 1080}px) brightness(.8)`; ctx.drawImage(img, cx, cy, cw, ch, W / 2 - cw * bs / 2, H / 2 - ch * bs / 2, cw * bs, ch * bs); }
    else { ctx.fillStyle = c.bgColor || "#027fa5"; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
  }
  const mos = kfVal(c, "mosaic", lt, c.mosaic || 0);
  if (mos >= 1) { // mosaic: thu nhỏ rồi phóng lại đúng kích thước nguồn, không làm mịn
    const bs = Math.max(1, mos * W / 1080 / Math.max(1e-6, s)), nw = Math.max(1, Math.round(cw / bs)), nh = Math.max(1, Math.round(ch / bs)), bw = Math.max(1, Math.round(cw)), bh = Math.max(1, Math.round(ch));
    const ms = scratch("mosaicL", nw, nh), mb = scratch("mosaicB", bw, bh); ms.ctx.imageSmoothingEnabled = true; ms.ctx.clearRect(0, 0, nw, nh); ms.ctx.drawImage(img, cx, cy, cw, ch, 0, 0, nw, nh);
    mb.ctx.imageSmoothingEnabled = false; mb.ctx.clearRect(0, 0, bw, bh); mb.ctx.drawImage(ms.canvas, 0, 0, nw, nh, 0, 0, bw, bh); img = mb.canvas; cx = 0; cy = 0; cw = bw; ch = bh;
  }
  const pinQ = typeof pinAt === "function" ? pinAt(c, lt) : null;
  if (pinQ) {
    tgt.save(); if (!fancy) tgt.globalAlpha *= X.opacity; if (X.blur > 0.3) tgt.filter = `blur(${X.blur * W / 1080}px)`;
    drawPinned(tgt, img, cx, cy, cw, ch, pinQ, W, H, false); tgt.restore();
  } else {
  tgt.save();
  if (!fancy) tgt.globalAlpha *= X.opacity;
  if (X.blur > 0.3) tgt.filter = `blur(${X.blur * W / 1080}px)`;
  tgt.translate(px, py); if (X.angle) tgt.rotate(X.angle * Math.PI / 180); tgt.scale(X.fx * X.sx, X.fy);
  const stb = c.stab && typeof stabAt === "function" ? stabAt(c, lt) : null; if (stb) { tgt.scale(stb.z, stb.z); if (stb.a) tgt.rotate(stb.a * Math.PI / 180); tgt.translate(stb.x * cw * s, stb.y * ch * s); }
  tgt.drawImage(img, cx, cy, cw, ch, -cw * s / 2, -ch * s / 2, cw * s, ch * s);
  tgt.restore();
  }
  if (fancy) {
    if (hasNd) applyNodes(tgt, c, lt, T);
    if (hasMk) { const mc = drawMaskSet(c.masks, W, H, lt); if (mc) { tgt.save(); tgt.globalCompositeOperation = "destination-in"; tgt.drawImage(mc, 0, 0); tgt.restore(); } }
    ctx.save(); ctx.globalAlpha *= X.opacity; ctx.globalCompositeOperation = bl !== "normal" ? bl : "source-over"; ctx.drawImage(tgt.canvas, 0, 0); ctx.restore();
  }
  if (pinQ) { let x0 = 1, y0 = 1, x1 = 0, y1 = 0; for (let i = 0; i < 8; i += 2) { x0 = Math.min(x0, pinQ[i]); x1 = Math.max(x1, pinQ[i]); y0 = Math.min(y0, pinQ[i + 1]); y1 = Math.max(y1, pinQ[i + 1]); } return { cx: (x0 + x1) / 2 * W, cy: (y0 + y1) / 2 * H, w: (x1 - x0) * W, h: (y1 - y0) * H, angle: 0 }; }
  return { cx: px, cy: py, w: cw * s, h: ch * s, angle: X.angle };
}

/* ---------- main track with transitions ---------- */
function transitionAt(T) { // → {i, p, A, B, ltA, ltB} if T is inside a transition window
  const st = vStarts();
  for (let i = 0; i < V.length - 1; i++) {
    const a = V[i], tr = a.tr; if (!tr || !tr.type || (V[i + 1].gap || 0) > 0) continue;
    const d = Math.min(tr.dur || 0.5, vlen(a), vlen(V[i + 1])), cut = st[i + 1];
    if (T >= cut - d / 2 && T < cut + d / 2) return { i, p: (T - (cut - d / 2)) / d, type: tr.type, ltA: T - st[i], ltB: T - st[i + 1] };
  }
  return null;
}
function drawMain(ctx, T) {
  const vtr = trackById("v"); if (vtr && vtr.off) return;
  const W = ctx.canvas.width, H = ctx.canvas.height, tw = transitionAt(T);
  if (tw) {
    const A = scratch("trA", W, H), B = scratch("trB", W, H);
    for (const [s2, c, lt, slot] of [[A, V[tw.i], tw.ltA, tw.i % 2], [B, V[tw.i + 1], tw.ltB, (tw.i + 1) % 2]]) { s2.ctx.fillStyle = "#000"; s2.ctx.fillRect(0, 0, W, H); drawMediaLayer(s2.ctx, c, lt, slot, true, T); }
    mixTransition(ctx, W, H, tw.type, tw.p, A.canvas, B.canvas, T); return;
  }
  const a = activeVideo(T); if (!a || a.c.disabled) return;
  const box = drawMediaLayer(ctx, a.c, T - a.start, a.i % 2, true, T); if (box && renderMode === "preview" && !slotBase) lastBoxes.set(a.c.id, box);
}

/* ---------- một cảnh: track chính → lớp phủ → hiệu ứng → chữ (dùng cho cả compound) ---------- */
function drawScene(T) {
  const W = cv.width, H = cv.height;
  drawMain(g, T);
  // overlay layers: lower rows first so upper rows sit on top
  tracks.map((tr, ti) => [tr, ti]).filter(([tr]) => tr.type === "overlay").reverse().forEach(([tr, ti]) => {
    if (tr.off) return;
    for (const c of C) if (c.track === tr.id && !c.disabled && T >= c.start && T < cend(c)) { const b = drawMediaLayer(g, c, T - c.start, 2 + ti, false, T); if (b && renderMode === "preview" && !slotBase) lastBoxes.set(c.id, b); }
  });
  // effect / filter layers (apply to everything below them, not to text)
  tracksOf("fx").slice().reverse().forEach(tr => {
    if (tr.off) return;
    for (const c of C) if (c.track === tr.id && !c.disabled && T >= c.start && T < cend(c)) {
      if (c.fxType === "filter") { if (window.__noGrade) continue; const P = colorParams(c); if (hasColor(P)) { const out = GLFX.run(cv, 0, 0, W, H, P, { time: T, maxSide: Math.max(W, H), fullW: W, fullH: H }); if (out) { g.save(); g.globalCompositeOperation = "copy"; g.drawImage(out, 0, 0, W, H); g.restore(); } } if (typeof hasNodes === "function" && hasNodes(c)) applyNodes(g, c, T - c.start, T); }
      else applyEffect(g, W, H, c, T - c.start, clen(c), T);
    }
  });
  // text + sticker layers
  tracksOf("text").slice().reverse().forEach(tr => {
    if (tr.off) return;
    for (const c of C) if (c.track === tr.id && !c.disabled && T >= c.start && T < cend(c)) { g.save(); const b = drawTextLike(g, c, T - c.start); g.restore(); if (b && renderMode === "preview" && !slotBase) lastBoxes.set(c.id, b); }
  });
}

/* ---------- full frame ---------- */
function drawFrame(Tin) {
  const T = Tin != null ? Tin : (hoverT != null && !playing) ? hoverT : t;
  const W = cv.width, H = cv.height;
  if (renderMode === "preview" && !slotBase) lastBoxes.clear();
  g.save(); g.globalAlpha = 1; g.globalCompositeOperation = "source-over"; g.filter = "none"; g.fillStyle = "#000"; g.fillRect(0, 0, W, H); g.restore();
  if (!V.length && !C.some(c => c.type === "video" || c.type === "text" || c.type === "sticker")) { g.fillStyle = "#87a0a7"; g.font = `600 ${28 * sx()}px Montserrat, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("Thêm clip để bắt đầu", W / 2, H / 2); }
  drawScene(T);
  if (renderMode === "preview" && typeof drawSelection === "function") drawSelection();
  if (renderMode === "preview" && scopeOn) drawScopes();
}

/* ---------- playback ---------- */
let rafId = 0;
function play() {
  if (!V.length && !C.length) return; if (actx && actx.state !== "running") actx.resume();
  if (t >= total() - 0.02) t = 0;
  playing = true; reclock(); scheduleAudio(); setPlayUI(); rafId = requestAnimationFrame(tick);
}
function pause() { playing = false; cancelAnimationFrame(rafId); stopAudio(); for (const m of media.values()) (m.els || []).forEach(el => el && !el.paused && el.pause()); setPlayUI(); drawFrame(); }
function setPlayUI() { $("#playTxt").textContent = playing ? "Dừng" : "Phát"; $("#playIco").innerHTML = playing ? '<path d="M8 5v14M16 5v14"/>' : '<path d="M7 5l12 7-12 7z"/>'; }
function clipGain(c, lt, len) { return dbToGain(kfVal(c, "vol", lt, c.vol || 0)) * fadeGain(c, lt, len); }
function syncOne(c, lt, k, off, len) {
  const m = media.get(c.mediaId); if (!m || m.kind !== "video" || !m.url) return null;
  const el = getEl(m, k + slotBase), want = srcTime(c, lt), sp = hasRamp(c) ? speedAt(c, Math.max(0, lt)) : (c.speed || 1);
  if (c.reverse || c.freeze || lt < 0) { if (!el.paused) el.pause(); if (Math.abs(el.currentTime - want) > 1 / FPS && !el.seeking) el.currentTime = want; }
  else {
    if (Math.abs(el.playbackRate - clamp(sp, 0.0625, 16)) > (hasRamp(c) ? 0.03 : 1e-3)) { try { el.preservesPitch = c.pitch !== false; el.playbackRate = clamp(sp, 0.0625, 16); } catch (_) {} }
    if (el.paused) { if (Math.abs(el.currentTime - want) > 0.04) el.currentTime = want; el.play().catch(() => {}); }
    else if (Math.abs(el.currentTime - want) > 0.2 * Math.max(1, sp)) el.currentTime = want;
  }
  const trId = len == null ? "v" : c.track;
  if (el._gain) el._gain.gain.value = (off || c.muted || c.disabled || c.reverse || c.freeze || lt < 0 || c.audioOut) ? 0 : clipGain(c, lt, len == null ? vlen(c) : len) * (typeof trackGain === "function" ? trackGain(trId) : 1);
  if (el._pan) el._pan.pan.value = clamp((typeof trackPan === "function" ? trackPan(trId) : 0) + (typeof clipPan === "function" ? clipPan(c, Math.max(0, lt)) : 0), -1, 1);
  if (typeof elFxSync === "function") elFxSync(el, c);
  return el;
}
function syncVideo() {
  const act = new Set(); syncScope(act);
  for (const m of media.values()) (m.els || []).forEach(el => { if (el && !act.has(el) && !el.paused) { el.pause(); if (el._gain) el._gain.gain.value = 0; } });
}
function syncScope(act) {
  const vtr = trackById("v"), off = vtr && vtr.off, tw = transitionAt(t);
  if (tw) { const st = vStarts(); [[tw.i, tw.ltA], [tw.i + 1, tw.ltB]].forEach(([i, lt]) => { const el = syncOne(V[i], lt, i % 2, off); if (el) act.add(el); }); }
  else {
    const a = activeVideo(t);
    if (a) {
      const el = syncOne(a.c, t - a.start, a.i % 2, off); if (el) act.add(el);
      const nx = V[a.i + 1];
      if (nx && a.start + vlen(a.c) + (nx.gap || 0) - t < 1.0) { const nm = media.get(nx.mediaId); if (nm && nm.kind === "video" && nm.url) { const ne = getEl(nm, (a.i + 1) % 2 + slotBase), w = srcTime(nx, a.c.tr ? -Math.min(a.c.tr.dur || 0.5, 1) / 2 : 0); if (ne !== el && ne.paused && !ne.seeking && Math.abs(ne.currentTime - w) > 0.05) ne.currentTime = w; } }
    }
  }
  tracks.forEach((tr, ti) => { if (tr.type !== "overlay") return; for (const c of C) if (c.track === tr.id && t >= c.start && t < cend(c)) { if (c.type === "compound") { if (!tr.off && !c.disabled && typeof inScope === "function") inScope(c, t - c.start, () => syncScope(act)); continue; } const el = syncOne(c, t - c.start, 2 + ti, tr.off, clen(c)); if (el) act.add(el); } });
}
function tick() {
  if (!playing) return;
  t = nowT();
  const T = total();
  if (t >= T) { t = T; if (exporting) { finishExport(); return; } pause(); placePlayhead(); return; }
  syncVideo(); updateAudioGains(); drawFrame(); placePlayhead(); follow();
  if (exporting) updateExportBar();
  rafId = requestAnimationFrame(tick);
}
function liveRefresh() { if (playing) { reclock(); scheduleAudio(); } }
function seek(time) { t = clamp(time, 0, total()); if (playing) { reclock(); scheduleAudio(); } placePlayhead(); drawFrame(); }
