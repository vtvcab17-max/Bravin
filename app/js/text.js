"use strict";
/* ============================================================================
   Text + stickers. Text clips: style "custom" (full editor) or the legacy
   brand styles (caption / hook / bgword / tag / cta) kept as presets.
   ========================================================================== */
const FONTS = { "Montserrat": "Montserrat, sans-serif", "Plus Jakarta Sans": '"Plus Jakarta Sans", sans-serif', "Playfair Display": '"Playfair Display", serif', "sans-serif": "system-ui, sans-serif", "serif": "Georgia, serif", "monospace": "ui-monospace, monospace", "cursive": "'Comic Sans MS', cursive" };
const fontStack = f => FONTS[f] || FONTS.Montserrat;
const LEGACY_ANCHOR = { caption: [540, 1420], hook: [540, 420], bgword: [540, 960], tag: [540, 230], cta: [540, 1420] };
const TEXT_DEFAULTS = { style: "custom", text: "Nhập chữ", font: "Montserrat", weight: 800, italic: false, size: 72, color: "#ffffff", stroke: { c: BLUE, w: 5 }, shadow: { c: "rgba(0,0,0,.55)", b: 4, x: 0, y: 4 }, box: null, align: "center", lh: 1.18, ls: 0, upper: false, maxw: 0.86, x: 0, y: 0 };

const TEXT_PRESETS = [
  { n: "Phụ đề trắng · vàng", legacy: "caption", p: { line1: "Phụ đề trắng", line2: "từ khoá vàng" } },
  { n: "Tiêu đề mở đầu", legacy: "hook", p: { line1: "Tiêu đề lớn", line2: "Từ khoá" } },
  { n: "Chữ nền chạy", legacy: "bgword", p: { line1: "THẦN THÁNH?" } },
  { n: "Nhãn trên cùng", legacy: "tag", p: { line1: "Tên kênh · Thương hiệu" } },
  { n: "Kêu gọi cuối", legacy: "cta", p: { line1: "Theo dõi để xem thêm", line2: "video mới mỗi ngày" } },
  { n: "Trắng viền xanh", p: { text: "Chữ trắng viền xanh" } },
  { n: "Vàng gold in hoa", p: { text: "Từ khoá nổi bật", color: GOLD, weight: 900, upper: true, size: 84, stroke: { c: BLUE, w: 6 } } },
  { n: "Playfair nghiêng", p: { text: "Phong cách sang trọng", font: "Playfair Display", italic: true, weight: 700, stroke: null, shadow: { c: "rgba(0,0,0,.6)", b: 10, x: 0, y: 3 } } },
  { n: "Hộp xanh", p: { text: "Nhãn nền xanh", size: 56, stroke: null, shadow: null, box: { c: BLUE, o: 1, pad: 0.35, r: 0.25, mode: "line" } } },
  { n: "Hộp trắng", p: { text: "Hộp trắng chữ xanh", color: BLUE, size: 56, stroke: null, shadow: null, box: { c: "#ffffff", o: 1, pad: 0.35, r: 0.25, mode: "line" } } },
  { n: "Viền đen TikTok", p: { text: "Chữ viền đen dày", stroke: { c: "#000000", w: 9 }, shadow: null, weight: 900 } },
  { n: "Neon xanh", p: { text: "Ánh neon", color: "#c9f3ff", stroke: { c: BLUE2, w: 2 }, shadow: { c: "#0097cc", b: 26, x: 0, y: 0 }, weight: 700 } },
  { n: "Gradient xanh vàng", p: { text: "Chữ chuyển màu", grad: [BLUE2, GOLD], stroke: { c: "#ffffff", w: 3 }, weight: 900, size: 88 } },
  { n: "Karaoke vàng", p: { text: "Từng chữ sáng lên theo lời nói", kara: { c: GOLD, mode: "fill" } } },
  { n: "Karaoke nảy", p: { text: "Từng từ nảy lên khi đọc", kara: { c: GOLD, mode: "bounce" }, stroke: { c: "#000", w: 7 } } },
  { n: "Bóng đổ cứng", p: { text: "Bóng đổ cứng", stroke: null, shadow: { c: BLUE, b: 0, x: 6, y: 6 }, weight: 900 } },
  { n: "Ghi chú nhỏ", p: { text: "*Kết quả tuỳ cơ địa mỗi người", size: 34, weight: 600, stroke: null, shadow: { c: "rgba(0,0,0,.7)", b: 6, x: 0, y: 2 } } }
];
function newTextClip(preset, start, dur, track) {
  const base = { id: nid("c"), track, type: "text", start, dur };
  if (preset && preset.legacy) return Object.assign(base, { style: preset.legacy, line1: "", line2: "" }, JSON.parse(JSON.stringify(preset.p || {})));
  return Object.assign(base, JSON.parse(JSON.stringify(TEXT_DEFAULTS)), JSON.parse(JSON.stringify((preset && preset.p) || {})));
}
const textLabel = c => c.type === "sticker" && c.gfx ? "Hình · " + ((typeof GFX_KINDS !== "undefined" && GFX_KINDS[c.gfx.kind]) || "") : c.type === "sticker" ? "Sticker " + (c.emoji || STICKER_SHAPES[c.shape] || "") : c.style === "custom" ? (c.text || "Chữ") : (c.line1 || c.line2 || "Chữ") + (c.line1 && c.line2 ? " · " + c.line2 : "");

/* ---------- layout ---------- */
function layoutText(ctx, c, W) {
  const s = Math.min(W, ctx.canvas.height) / 1080, sz = (c.size || 64) * s;
  ctx.font = `${c.italic ? "italic " : ""}${c.weight || 800} ${sz}px ${fontStack(c.font)}`;
  if ("letterSpacing" in ctx) ctx.letterSpacing = ((c.ls || 0) * s) + "px";
  const raw = String(c.text == null ? "" : c.text); const txt = c.upper ? raw.toUpperCase() : raw;
  const maxW = (c.maxw || 0.86) * W, space = ctx.measureText(" ").width;
  const lines = []; let wi = 0;
  for (const para of txt.split("\n")) {
    let line = { words: [], w: 0 };
    for (const word of para.split(/ +/).filter(x => x.length)) {
      const ww = ctx.measureText(word).width;
      if (line.words.length && line.w + space + ww > maxW) { lines.push(line); line = { words: [], w: 0 }; }
      line.words.push({ text: word, w: ww, x: line.words.length ? line.w + space : 0, i: wi++ }); line.w = line.words.length > 1 ? line.w + space + ww : ww;
    }
    lines.push(line);
  }
  return { lines, sz, lh: sz * (c.lh || 1.18), words: wi };
}
function wordTimes(c, n, len) {
  if (c.words && c.words.length >= n) return c.words.slice(0, n).map(w => [w[0], w[1]]);
  const words = String(c.text || "").split(/\s+/).filter(Boolean); const total = words.reduce((a, w) => a + w.length + 1, 0) || 1, span = Math.max(0.2, len * 0.92);
  let acc = 0; return words.map(w => { const a = acc / total * span; acc += w.length + 1; return [a, acc / total * span]; });
}

/* ---------- rich text ---------- */
function drawRichText(ctx, c, lt, len) {
  const W = ctx.canvas.width, H = ctx.canvas.height, s = Math.min(W, H) / 1080, X = xform(c, lt, len);
  if (X.opacity <= 0.001 || X.scale <= 0.001) return null;
  const L = layoutText(ctx, c, W); if (!L.lines.length) return null;
  const blockW = Math.max(...L.lines.map(l => l.w)), blockH = L.lines.length * L.lh;
  const cx = W / 2 + X.x * W, cy = H / 2 + X.y * H;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(X.angle * Math.PI / 180); ctx.scale(X.scale * X.sx * X.fx, X.scale * X.fy); ctx.globalAlpha *= X.opacity;
  if (X.blur > 0.3) ctx.filter = `blur(${X.blur * s}px)`;
  ctx.textBaseline = "middle"; ctx.textAlign = "left"; ctx.lineJoin = "round"; ctx.miterLimit = 2;
  const lineX = l => c.align === "left" ? -blockW / 2 : c.align === "right" ? blockW / 2 - l.w : -l.w / 2;
  const lineY = i => -blockH / 2 + L.lh * (i + 0.5);
  // background boxes
  if (c.box && c.box.c) {
    const pad = (c.box.pad == null ? 0.3 : c.box.pad) * L.sz, r = (c.box.r == null ? 0.2 : c.box.r) * L.sz;
    ctx.save(); ctx.globalAlpha *= c.box.o == null ? 1 : c.box.o; ctx.fillStyle = c.box.c;
    const rr = (x, y, w, h) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); ctx.fill(); };
    if (c.box.mode === "block") rr(-blockW / 2 - pad, -blockH / 2 - pad * 0.6, blockW + pad * 2, blockH + pad * 1.2);
    else L.lines.forEach((l, i) => { if (l.w) rr(lineX(l) - pad, lineY(i) - L.lh / 2 - pad * 0.15, l.w + pad * 2, L.lh + pad * 0.3); });
    ctx.restore();
  }
  // reveal (typewriter / words) and karaoke
  const A = c.anim && c.anim.in; let visChars = Infinity, visWords = Infinity;
  if (A && A.type === "typewriter") { const total = String(c.text || "").replace(/\s+/g, "").length; visChars = Math.floor(total * X.reveal); }
  if (A && A.type === "words") visWords = Math.ceil(L.words * X.reveal);
  const kt = c.kara ? wordTimes(c, L.words, len) : null;
  let chars = 0;
  const each = fn => L.lines.forEach((l, i) => l.words.forEach(w => { const show = w.i < visWords && chars < visChars; const txt = visChars === Infinity ? w.text : w.text.slice(0, Math.max(0, visChars - chars)); chars += w.text.length; if (show && txt) fn(w, txt, lineX(l) + w.x, lineY(i)); }));
  const fill = () => { if (c.grad && c.grad.length > 1) { const gr = ctx.createLinearGradient(0, -blockH / 2, 0, blockH / 2); gr.addColorStop(0, c.grad[0]); gr.addColorStop(1, c.grad[1]); return gr; } return c.color || "#fff"; };
  const wordScale = w => { if (!kt || c.kara.mode !== "bounce") return 1; const k = kt[w.i]; if (!k) return 1; return lt >= k[0] && lt < k[1] ? 1 + 0.16 * Math.sin(clamp((lt - k[0]) / Math.max(0.05, k[1] - k[0]), 0, 1) * Math.PI) : 1; };
  const at = (x, y, w, sc, f) => { if (sc === 1) return f(x, y); ctx.save(); ctx.translate(x + w.w / 2, y); ctx.scale(sc, sc); f(-w.w / 2, 0); ctx.restore(); };
  // pass 1: shadow + stroke
  chars = 0;
  if ((c.stroke && c.stroke.w > 0) || c.shadow) each((w, txt, x, y) => at(x, y, w, wordScale(w), (x2, y2) => {
    if (c.shadow) { ctx.shadowColor = c.shadow.c; ctx.shadowBlur = (c.shadow.b || 0) * s; ctx.shadowOffsetX = (c.shadow.x || 0) * s; ctx.shadowOffsetY = (c.shadow.y || 0) * s; }
    if (c.stroke && c.stroke.w > 0) { ctx.strokeStyle = c.stroke.c; ctx.lineWidth = c.stroke.w * 2 * s; ctx.strokeText(txt, x2, y2); }
    else { ctx.fillStyle = c.shadow ? c.shadow.c : "transparent"; ctx.fillText(txt, x2, y2); }
    ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  }));
  // pass 2: fill (+ karaoke)
  chars = 0; const base = fill();
  each((w, txt, x, y) => at(x, y, w, wordScale(w), (x2, y2) => {
    ctx.fillStyle = base; ctx.fillText(txt, x2, y2);
    if (kt) { const k = kt[w.i]; if (!k) return; const p = c.kara.mode === "fill" ? clamp((lt - k[0]) / Math.max(0.05, k[1] - k[0]), 0, 1) : (lt >= k[0] ? 1 : 0);
      if (p > 0) { ctx.save(); ctx.beginPath(); ctx.rect(x2 - 4, y2 - L.lh, w.w * p + 4, L.lh * 2); ctx.clip(); ctx.fillStyle = c.kara.c || GOLD; ctx.fillText(txt, x2, y2); ctx.restore(); } }
  }));
  ctx.restore();
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  return { cx, cy, w: (blockW + (c.box ? L.sz * 0.7 : 0)) * X.scale, h: (blockH + (c.box ? L.sz * 0.3 : 0)) * X.scale, angle: X.angle };
}

/* ---------- legacy brand styles (wrapped so they can be moved / scaled / animated) ---------- */
function drawLegacyText(ctx, c, lt, len) {
  const W = ctx.canvas.width, H = ctx.canvas.height, X = xform(c, lt, len); if (X.opacity <= 0.001) return null;
  const an = LEGACY_ANCHOR[c.style] || [540, 960], ax = an[0] / 1080 * W, ay = an[1] / 1920 * H;
  ctx.save(); ctx.globalAlpha *= X.opacity;
  ctx.translate(ax + X.x * W, ay + X.y * H); ctx.rotate(X.angle * Math.PI / 180); ctx.scale(X.scale * X.sx * X.fx, X.scale * X.fy); ctx.translate(-ax, -ay);
  if (X.blur > 0.3) ctx.filter = `blur(${X.blur * W / 1080}px)`;
  const pg = g; g = ctx; try { drawText(c, lt); } finally { g = pg; }
  ctx.restore();
  const s = W / 1080, sz = { caption: [900, 220], hook: [980, 300], bgword: [1080, 260], tag: [700, 70], cta: [960, 180] }[c.style] || [800, 200];
  return { cx: ax + X.x * W, cy: ay + X.y * H - (c.style === "caption" ? 50 * s : 0), w: sz[0] * s * X.scale, h: sz[1] * s * X.scale, angle: X.angle };
}

/* ---------- stickers ---------- */
function drawSticker(ctx, c, lt, len) {
  const W = ctx.canvas.width, H = ctx.canvas.height, s = Math.min(W, H) / 1080, X = xform(c, lt, len); if (X.opacity <= 0.001) return null;
  const size = (c.size || 220) * s, cx = W / 2 + X.x * W, cy = H / 2 + X.y * H;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(X.angle * Math.PI / 180); ctx.scale(X.scale * X.sx * X.fx, X.scale * X.fy); ctx.globalAlpha *= X.opacity;
  if (X.blur > 0.3) ctx.filter = `blur(${X.blur * s}px)`;
  if (c.shadow !== false) { ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = 10 * s; ctx.shadowOffsetY = 4 * s; }
  if (c.emoji) { ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(c.emoji, 0, size * 0.04); }
  else { drawStickerShape(ctx, c.shape, size, c.color || GOLD, c.fill !== false); if (c.label) { ctx.shadowColor = "transparent"; ctx.fillStyle = c.labelColor || "#fff"; ctx.font = `900 ${size * 0.26}px Montserrat, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(c.label, 0, 0); } }
  ctx.restore();
  return { cx, cy, w: size * X.scale * 1.1, h: size * X.scale * 1.1, angle: X.angle };
}
function drawTextLike(ctx, c, lt) {
  const len = clen(c);
  if (c.type === "sticker") return drawSticker(ctx, c, lt, len);
  if (c.style === "custom") return drawRichText(ctx, c, lt, len);
  return drawLegacyText(ctx, c, lt, len);
}
