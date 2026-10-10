"use strict";
/* ============================================================================
   Video lời bài hát (Bravin tự viết).
   Dán lời → Bravin chia dòng / cảnh, canh thời gian (mốc LRC, bắt nhịp bằng
   phím Space, hoặc tự chia theo nhạc và nhịp), rồi dựng thành clip chữ, hình
   trang trí và hiệu ứng nhấn BÌNH THƯỜNG của Bravin trên các track "Lời…".
   Mọi thứ tạo ra vẫn chỉnh được bằng keyframe / Effect Controls và xuất như
   clip thường. Mỗi lần "Tạo biến thể" đổi seed; "Đổi một phần" chỉ đổi bố cục,
   chuyển động, màu hoặc trang trí.
   Cú pháp lời: mỗi dòng một câu · "a / b" tự cắt cảnh · *từ* nhấn mạnh ·
   "!" cuối dòng = điểm nhấn (chớp, rung) · "lời|chú thích" chữ nhỏ ·
   [interlude 8] đoạn không lời 8 giây · [01:23.45] mốc thời gian LRC ·
   dòng bắt đầu bằng # là ghi chú, bỏ qua.
   Dữ liệu dự án: o.lyrics = LYR; clip tạo ra có c.lyr = {li, ci}.
   ========================================================================== */
let LYR = null;
const LYR_DEF = () => ({ text: "", theme: "lyric", seed: 1, sub: { layout: 1, motion: 1, color: 1, decor: 1 }, hist: [], hi: -1, times: [], opts: { kara: true, hits: true, decor: true, center: false, unify: true, upper: false, beats: true, bg: "auto", start: 0, end: 0 } });

/* ---------- phông chữ có dấu tiếng Việt cho lời bài hát (Google Fonts, có dự phòng) ---------- */
Object.assign(FONTS, { "Be Vietnam Pro": '"Be Vietnam Pro", system-ui, sans-serif', "Anton": 'Anton, "Arial Narrow", Impact, sans-serif', "Oswald": 'Oswald, "Arial Narrow", sans-serif', "Lobster": "Lobster, cursive", "Pacifico": "Pacifico, cursive", "Dancing Script": '"Dancing Script", cursive' });
(function loadLyricFonts() {
  if (document.querySelector("link[data-lyrfonts]")) return;
  const l = document.createElement("link"); l.rel = "stylesheet"; l.dataset.lyrfonts = "1";
  l.href = "https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@500;700;900&family=Anton&family=Oswald:wght@500;700&family=Lobster&family=Pacifico&family=Dancing+Script:wght@700&display=swap&subset=vietnamese";
  document.head.appendChild(l);
})();

/* ---------- chủ đề: mỗi chủ đề là một bộ lựa chọn để bốc ngẫu nhiên có seed ---------- */
const LYR_THEMES = {
  lyric: { n: "Lyric video", fonts: ["Be Vietnam Pro", "Montserrat", "Playfair Display"], pal: [["#ffffff", "#f2c14e", "#111111"], ["#fdf6e3", "#e86a3a", "#1d1d1d"], ["#eaf2ff", "#8b7cff", "#0b0f2a"], ["#ffffff", "#5ad1c2", "#0f2524"]],
    layouts: ["center", "stack", "left", "words", "echo", "band"], ins: ["fade", "slideU", "blur", "words", "zoomOut"], outs: ["fade", "slideU", "blur"], hold: ["drift", "drift", "none", "breathe"], decor: ["underline", "line", "none", "none", "ring"], hit: ["flash", "zoompulse"], weight: 800 },
  kinetic: { n: "Kinetic (chữ động mạnh)", fonts: ["Anton", "Oswald", "Montserrat"], pal: [["#ffffff", "#ffd400", "#000000"], ["#000000", "#ff3b3b", "#ffffff"], ["#ffffff", "#00e0ff", "#101010"], ["#fff3e0", "#ff6d00", "#111111"]],
    layouts: ["huge", "scatter", "words", "stack", "diag", "center"], ins: ["pop", "zoomIn", "slideL", "slideR", "drop", "flip"], outs: ["zoomIn", "slideL", "slideR", "pop"], hold: ["punch", "punch", "shake", "drift"], decor: ["burst", "line", "ring", "none"], hit: ["flash", "shake", "rgb", "zoompulse"], weight: 900, upper: true },
  pop: { n: "Pop tươi sáng", fonts: ["Lobster", "Pacifico", "Be Vietnam Pro"], pal: [["#ffffff", "#ff5fa2", "#3a0ca3"], ["#fffbe6", "#2ec4b6", "#ff6b6b"], ["#ffffff", "#ffbe0b", "#8338ec"]],
    layouts: ["center", "stack", "words", "scatter"], ins: ["pop", "drop", "swing", "zoomIn"], outs: ["pop", "zoomIn", "fade"], hold: ["breathe", "float", "drift"], decor: ["star", "heart", "sparkle", "underline"], hit: ["sparkle", "flash", "hearts"], weight: 800 },
  ballad: { n: "Ballad nhẹ nhàng", fonts: ["Playfair Display", "Dancing Script", "Be Vietnam Pro"], pal: [["#fff8ef", "#f2c14e", "#2b1a10"], ["#f4f1ff", "#b8a9ff", "#1e1838"], ["#ffffff", "#ffd6a5", "#3d2c2e"]],
    layouts: ["center", "left", "echo", "stack"], ins: ["fade", "blur", "words"], outs: ["fade", "blur"], hold: ["drift", "drift", "none"], decor: ["line", "none", "none"], hit: ["leak", "softglow"], weight: 700 },
  horror: { n: "Kinh dị", fonts: ["Oswald", "serif", "monospace"], pal: [["#f2f2f2", "#ff2b2b", "#000000"], ["#d9ffd9", "#7dff7d", "#000000"], ["#ffffff", "#b30000", "#1a0000"]],
    layouts: ["scatter", "huge", "center", "echo"], ins: ["blur", "typewriter", "flip", "fade"], outs: ["blur", "fade"], hold: ["shake", "wiggle", "drift"], decor: ["line", "none", "cross"], hit: ["glitch", "rgb", "bwflash", "shake"], weight: 700, upper: true },
  minimal: { n: "Tối giản", fonts: ["Be Vietnam Pro", "Montserrat"], pal: [["#ffffff", "#ffffff", "#000000"], ["#111111", "#111111", "#ffffff"]],
    layouts: ["center", "left", "band"], ins: ["fade", "typewriter"], outs: ["fade"], hold: ["none"], decor: ["none"], hit: ["flash"], weight: 600 }
};

/* ---------- ngẫu nhiên có seed ---------- */
function lyrRng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function lyrHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const lyrPick = (r, a) => a[Math.floor(r() * a.length) % a.length];

/* ---------- đọc lời ---------- */
function lyrParseTime(s) { const m = /^(\d+):(\d+(?:\.\d+)?)$/.exec(s); return m ? +m[1] * 60 + +m[2] : null; }
function lyrParse(text) {
  const items = [];
  for (let raw of String(text || "").split(/\r?\n/)) {
    let s = raw.trim(); if (!s || s.startsWith("#")) continue;
    let ts = null; const m = /^\[(\d+:\d+(?:\.\d+)?)\]\s*/.exec(s); if (m) { ts = lyrParseTime(m[1]); s = s.slice(m[0].length).trim(); }
    if (/^\[[a-z]+:.*\]$/i.test(s)) continue; // thẻ LRC [ar:…] [ti:…]
    const gap = /^\[(?:interlude|nhạc|gian tấu)\s*(\d+(?:\.\d+)?)?\]$/i.exec(s);
    if (gap) { items.push({ type: "gap", dur: gap[1] ? +gap[1] : 4, ts }); continue; }
    if (!s) { if (ts != null && items.length) items.push({ type: "end", ts }); continue; }
    let note = ""; const bar = s.indexOf("|"); if (bar >= 0) { note = s.slice(bar + 1).trim(); s = s.slice(0, bar).trim(); }
    const hit = /!\s*$/.test(s);
    const cuts = s.split(/\s+\/\s+|\s*\/\s*/).map(x => x.trim()).filter(Boolean).map(x => {
      const words = x.split(/\s+/), hl = []; const clean = words.map((w, i) => { if (/^\*.+\*[.,!?…]*$/.test(w)) { hl.push(i); return w.replace(/^\*|\*(?=[.,!?…]*$)/g, ""); } return w; });
      return { text: clean.join(" "), hl };
    });
    items.push({ type: "line", raw: s, cuts, hit, note, ts });
  }
  return items;
}
function lyrAutoCuts(cut) { // câu dài → tách 2 cảnh ở khoảng trắng gần giữa
  const w = cut.text.split(/\s+/); if (w.length < 7) return [cut];
  const mid = Math.round(w.length / 2), a = w.slice(0, mid).join(" "), b = w.slice(mid).join(" ");
  return [{ text: a, hl: cut.hl.filter(i => i < mid) }, { text: b, hl: cut.hl.filter(i => i >= mid).map(i => i - mid) }];
}

/* ---------- nhạc: lấy clip âm thanh dài nhất và nhịp ---------- */
function lyrSong() {
  const a = C.filter(c => c.type === "audio" && media.get(c.mediaId) && media.get(c.mediaId).buf).sort((x, y) => clen(y) - clen(x))[0];
  return a ? { c: a, m: media.get(a.mediaId), start: a.start, end: cend(a) } : null;
}
function lyrBeats() {
  const s = lyrSong(); if (!s) return [];
  if (s.m._beats && s.m._beatsFor === s.c.in + ":" + s.c.out) return s.m._beats.map(b => b + s.start);
  let b = []; try { b = detectBeats(s.m.buf, s.c.in || 0, s.c.out || s.m.duration).map(x => x - (s.c.in || 0)); } catch (_) {}
  s.m._beats = b; s.m._beatsFor = s.c.in + ":" + s.c.out; return b.map(x => x + s.start);
}
const lyrSnap = (t, beats, win = 0.28) => { let best = t, bd = win; for (const b of beats) { const d = Math.abs(b - t); if (d < bd) { bd = d; best = b; } } return best; };

/* ---------- canh thời gian ---------- */
function lyrTiming(items) {
  const song = lyrSong(), O = LYR.opts, beats = O.beats ? lyrBeats() : [];
  const t0 = O.start || (song ? song.start : 0), tEnd = O.end || (song ? song.end : Math.max(total(), t0 + items.filter(i => i.type === "line").length * 2.6 + items.filter(i => i.type === "gap").reduce((a, g) => a + g.dur, 0)));
  const lines = items.filter(i => i.type === "line");
  const weight = it => it.type === "gap" ? it.dur / 0.11 : Math.max(8, it.cuts.reduce((a, c) => a + c.text.length, 0)) + 6;
  // 1) mốc LRC hoặc bắt nhịp (Space) là điểm neo cố định
  let li = 0; for (const it of items) if (it.type === "line") { const tap = LYR.times[li++]; if (it.ts == null && tap != null) it.ts = tap; }
  const known = new Set(items.map((it, i) => it.ts != null ? i : -1).filter(i => i >= 0));
  const anchors = [{ i: -1, t: t0 }, ...[...known].map(i => ({ i, t: items[i].ts })), { i: items.length, t: tEnd }];
  // 2) các dòng giữa hai điểm neo chia thời gian theo độ dài chữ, rồi khớp vào nhịp gần nhất
  for (let k = 0; k < anchors.length - 1; k++) {
    const A = anchors[k], B = anchors[k + 1], list = []; for (let j = Math.max(0, A.i); j < B.i; j++) list.push(j);
    const tot = list.reduce((a, j) => a + weight(items[j]), 0) || 1; let acc = A.t;
    for (const j of list) { if (!known.has(j)) items[j].ts = beats.length ? lyrSnap(acc, beats) : acc; acc += (B.t - A.t) * weight(items[j]) / tot; }
  }
  items.forEach((it, i) => { if (it.ts == null) it.ts = t0; });
  // kết thúc = dòng kế tiếp (giữ tối đa ~7 s nếu khoảng nghỉ dài)
  items.forEach((it, i) => { const nx = items.slice(i + 1).find(x => x.ts != null); const nt = nx ? nx.ts : tEnd; const chars = it.type === "line" ? it.cuts.reduce((a, c) => a + c.text.length, 0) : 0; it.te = it.type === "line" ? Math.min(nt - 0.04, it.ts + Math.max(1.6, Math.min(7, 1.2 + chars * 0.16))) : nt; if (it.te - it.ts < 0.4) it.te = it.ts + 0.4; });
  return { t0, tEnd, beats, lines };
}

/* ---------- dựng một cảnh (cut) thành các clip ---------- */
function lyrClipsForCut(o) {
  // o: {text, hl, st, en, th, pal, font, rL, rM, rD, hit, note, li, ci, lyrTr, decTr, fxTr}
  const out = [], O = LYR.opts, th = o.th, dur = Math.max(0.35, o.en - o.st), [cMain, cAcc, cStroke] = o.pal;
  const upper = O.upper || th.upper;
  const layout = O.center ? lyrPick(o.rL, ["bandTop", "bandBottom", "split"]) : lyrPick(o.rL, th.layouts);
  const inA = lyrPick(o.rM, th.ins), outA = lyrPick(o.rM, th.outs), hold = lyrPick(o.rM, th.hold);
  const base = (text, extra) => Object.assign(newTextClip(TEXT_PRESETS[5], o.st, dur, o.lyrTr), {
    text, font: o.font, weight: th.weight || 800, size: 116, color: cMain, stroke: { c: cStroke, w: th === LYR_THEMES.minimal ? 0 : 5 }, shadow: { c: "rgba(0,0,0,.45)", b: 10, x: 0, y: 3 }, upper, maxw: 0.84, lyr: { li: o.li, ci: o.ci },
    anim: { in: { type: inA, dur: Math.min(0.45, dur * 0.3) }, out: { type: outA, dur: Math.min(0.35, dur * 0.25) } }
  }, extra || {});
  const hlOf = (idx) => idx.length ? { hl: idx, hlc: cAcc } : {};
  const kara = O.kara ? { kara: { c: cAcc, mode: th === LYR_THEMES.kinetic || th === LYR_THEMES.pop ? "bounce" : "fill" } } : {};
  const words = o.text.split(/\s+/);
  const staggered = (ys, xs, sizes, angles) => words.forEach((w, i) => {
    const off = Math.min(dur * 0.6, i * Math.min(0.22, dur * 0.6 / words.length)), c = base(w, { start: o.st + off, dur: Math.max(0.3, dur - off), size: sizes[i], x: xs[i], y: ys[i], maxw: 0.95, ...(o.hl.includes(i) ? { color: cAcc } : {}) });
    if (angles) setKf(c, "angle", 0, angles[i]); out.push(c);
  });
  switch (layout) {
    case "stack": { const k = Math.max(1, Math.min(3, Math.floor(words.length / 3))); const a = words.slice(0, k).join(" "), b = words.slice(k).join(" ");
      if (!b) { out.push(base(o.text, { size: 120, ...hlOf(o.hl), ...kara })); break; }
      out.push(base(a, { size: 60, y: -0.085, color: cAcc, stroke: null, ...hlOf([]) }));
      out.push(base(b, { start: o.st + 0.12, dur: Math.max(0.3, dur - 0.12), size: 128, y: 0.03, ...hlOf(o.hl.filter(i => i >= k).map(i => i - k)) })); break; }
    case "left": out.push(base(o.text, { align: "left", x: -0.04, size: 104, maxw: 0.8, ...hlOf(o.hl), ...kara })); break;
    case "words": if (words.length > 6 || words.length < 2) { out.push(base(o.text, { size: 118, ...hlOf(o.hl), ...kara })); break; }
      staggered(words.map((_, i) => -0.07 * (words.length - 1) + i * 0.14), words.map(() => 0), words.map((w, i) => o.hl.includes(i) ? 150 : 116)); break;
    case "scatter": if (words.length > 6 || words.length < 2) { out.push(base(o.text, { size: 120, angle: (o.rL() - 0.5) * 10, ...hlOf(o.hl) })); break; }
      { const n = words.length, rows = words.map((_, i) => -0.27 + (n === 1 ? 0.27 : i * 0.54 / (n - 1))); // mỗi từ một hàng, lệch trái/phải xen kẽ: không chồng nhau
      staggered(rows, words.map((_, i) => (i % 2 ? 1 : -1) * (0.06 + o.rL() * 0.14)), words.map(() => 96 + Math.round(o.rL() * 56)), words.map(() => Math.round((o.rL() - 0.5) * 18))); } break;
    case "huge": { const big = words.slice().sort((a, b) => b.length - a.length)[0];
      out.push(base(big, { size: 300, color: cAcc, opacity: 0.2, stroke: null, shadow: null, maxw: 1.4, anim: { in: { type: "zoomOut", dur: 0.5 }, out: { type: "fade", dur: 0.3 } } }));
      out.push(base(o.text, { start: o.st + 0.08, dur: Math.max(0.3, dur - 0.08), size: 112, ...hlOf(o.hl), ...kara })); break; }
    case "echo": { const m = base(o.text, { size: 116, ...hlOf(o.hl), ...kara }); out.push(m);
      [1, 2].forEach(k => out.push(base(o.text, { start: o.st + 0.06 * k, dur: Math.max(0.3, dur - 0.06 * k + 0.12 * k), size: 116, y: 0.012 * k, opacity: 0.22 / k, blur: 2 * k, color: cAcc, stroke: null, shadow: null }))); break; }
    case "diag": out.push(base(o.text, { size: 124, angle: -8, x: -0.02, ...hlOf(o.hl), ...kara })); break;
    case "band": out.push(base(o.text, { size: 66, y: 0.33, stroke: null, shadow: null, box: { c: cStroke, o: 0.62, pad: 0.4, r: 0.2, mode: "line" }, ...hlOf(o.hl), ...kara })); break;
    case "bandTop": out.push(base(o.text, { size: 82, y: -0.36, ...hlOf(o.hl), ...kara })); break;
    case "bandBottom": out.push(base(o.text, { size: 82, y: 0.36, ...hlOf(o.hl), ...kara })); break;
    case "split": { const h = Math.ceil(words.length / 2); out.push(base(words.slice(0, h).join(" "), { size: 80, y: -0.36, ...hlOf(o.hl.filter(i => i < h)) })); if (words.length > 1) out.push(base(words.slice(h).join(" "), { start: o.st + 0.1, dur: Math.max(0.3, dur - 0.1), size: 80, y: 0.36, ...hlOf(o.hl.filter(i => i >= h).map(i => i - h)) })); break; }
    default: out.push(base(o.text, { size: 120, y: (o.rL() - 0.5) * 0.12, ...hlOf(o.hl), ...kara }));
  }
  // chuyển động khi giữ chữ
  for (const c of out) {
    if (c.opacity != null) { setKf(c, "opacity", 0, c.opacity); delete c.opacity; }
    if (c.blur) { setKf(c, "blur", 0, c.blur); delete c.blur; }
    if (c.angle) { setKf(c, "angle", 0, c.angle); delete c.angle; }
    const L = c.dur;
    if (hold === "drift") { setKf(c, "scale", 0, 1, "linear"); setKf(c, "scale", L, 1.05, "linear"); const dx = (o.rM() - 0.5) * 0.03; setKf(c, "x", 0, (c.x || 0) - dx, "linear"); setKf(c, "x", L, (c.x || 0) + dx, "linear"); }
    else if (hold === "punch") { setKf(c, "scale", 0, 1.28, "out"); setKf(c, "scale", Math.min(0.22, L / 3), 1, "out"); }
    else if (hold === "shake" || hold === "wiggle" || hold === "breathe" || hold === "float") c.anim.loop = { type: hold, speed: 1 };
  }
  if (o.hit && O.hits) { for (const c of out) { setKf(c, "scale", 0, 1.35, "back"); setKf(c, "scale", 0.25, 1); } }
  // trang trí
  const dec = [];
  if (O.decor) {
    const d = lyrPick(o.rD, th.decor), ys = out.map(c => c.y || 0), yMid = (Math.min(...ys) + Math.max(...ys)) / 2, y = Math.max(...ys);
    const st = { id: nid("c"), track: o.decTr, type: "sticker", start: o.st, dur, x: 0, y: y + 0.1, size: 300, lyr: { li: o.li, ci: o.ci, decor: 1 }, anim: { in: { type: "pop", dur: 0.35 }, out: { type: "fade", dur: 0.3 } } };
    if (["underline", "ring", "star", "heart", "burst", "spark", "cross"].includes(d)) { const c = Object.assign(st, { shape: d, color: cAcc }); if (d === "ring" || d === "burst") { c.y = yMid; c.size = d === "burst" ? 460 : 620; setKf(c, "opacity", 0, d === "burst" ? 0.28 : 0.45); if (d === "burst") { setKf(c, "angle", 0, 0, "linear"); setKf(c, "angle", dur, 25, "linear"); } } if (d === "star" || d === "heart") { c.x = (o.rD() > 0.5 ? 0.3 : -0.3); c.y = y - 0.14; c.size = 150; c.anim.loop = { type: "float", speed: 1 }; } dec.push(c); }
    else if (d === "sparkle") dec.push(Object.assign(st, { emoji: "✨", size: 140, x: 0.32, y: y - 0.12, anim: { in: { type: "pop", dur: 0.3 }, loop: { type: "pulse", speed: 1 } } }));
    else if (d === "line") { const c = Object.assign(st, { y: y + 0.075, gfx: { kind: "line", w: 0.5, h: 0.006, fill: cAcc, stroke: "#ffffff", sw: 0, r: 0, grad: null }, anim: { out: { type: "fade", dur: 0.3 } } }); delete c.size; setKf(c, "x", 0, -0.6, "out"); setKf(c, "x", Math.min(0.5, dur * 0.4), 0, "out"); dec.push(c); }
  }
  if (o.note) out.push(base(o.note, { size: 42, weight: 600, y: (out[out.length - 1].y || 0) + 0.12, stroke: null, color: cMain, anim: { in: { type: "fade", dur: 0.3 }, out: { type: "fade", dur: 0.3 } } }));
  // hiệu ứng nhấn (dòng có "!")
  const fx = [];
  if (o.hit && O.hits && o.fxTr) { const k = lyrPick(o.rD, th.hit), d = { flash: 0.25, shake: 0.5, rgb: 0.45, zoompulse: 0.6, glitch: 0.45, bwflash: 0.3, sparkle: 1.4, hearts: 1.6, leak: 1.6, softglow: 1.2 }[k] || 0.5;
    if (EFFECTS[k]) fx.push({ id: nid("c"), track: o.fxTr, type: "fx", effect: k, start: o.st, dur: Math.min(d, dur), amt: 1, speed: 1, lyr: { li: o.li, ci: o.ci, fx: 1 } }); }
  return { text: out, dec, fx, layout, inA, hold };
}

/* ---------- dựng toàn bộ lên timeline ---------- */
function lyrTrack(name, type) { let tr = tracks.find(t => t.lyr === name); if (!tr) { tr = addTrack(type); tr.name = name; tr.lyr = name; } return tr; }
async function lyrBuild(opts = {}) {
  if (!LYR || !LYR.text.trim()) { toast("Chưa có lời bài hát."); return null; }
  const th = LYR_THEMES[LYR.theme] || LYR_THEMES.lyric, items = lyrParse(LYR.text); if (!items.some(i => i.type === "line")) { toast("Không tìm thấy dòng lời nào."); return null; }
  if (!opts.noUndo) pushUndo();
  C = C.filter(c => !c.lyr); tracks = tracks.filter(t => !t.lyr || C.some(c => c.track === t.id));
  const T = lyrTiming(items);
  const fxTr = LYR.opts.hits ? lyrTrack("Lời · nhấn", "fx").id : null, decTr = LYR.opts.decor ? lyrTrack("Lời · trang trí", "text").id : null, lyrTr = lyrTrack("Lời", "text").id;
  { const iL = tracks.findIndex(t => t.lyr === "Lời"), iD = tracks.findIndex(t => t.lyr === "Lời · trang trí"); if (iL > iD && iD >= 0) { const [tl] = tracks.splice(iL, 1); tracks.splice(iD, 0, tl); } } // chữ luôn nằm trên trang trí
  const rFont = lyrRng(LYR.seed ^ LYR.sub.color ^ 0x51), font = lyrPick(rFont, th.fonts), pal = lyrPick(rFont, th.pal);
  try { await Promise.race([document.fonts.load(`700 80px "${font}"`, "Lời bài hát ăn ơ"), sleep(1500)]); } catch (_) {}
  let li = -1, n = 0, stats = {};
  for (const it of items) {
    if (it.type !== "line") continue; li++;
    let cuts = it.cuts.length > 1 ? it.cuts : lyrAutoCuts(it.cuts[0]);
    const span = it.te - it.ts, tot = cuts.reduce((a, c) => a + c.text.length + 4, 0); let acc = it.ts;
    cuts.forEach((cut, ci) => {
      let st = acc, en = ci === cuts.length - 1 ? it.te : acc + span * (cut.text.length + 4) / tot; if (ci < cuts.length - 1 && T.beats.length) en = lyrSnap(en, T.beats, 0.2); acc = en;
      const key = LYR.opts.unify ? lyrHash(cut.text.toLowerCase()) : (li * 131 + ci);
      const r = s => lyrRng((LYR.seed ^ s ^ key) >>> 0);
      const res = lyrClipsForCut({ text: cut.text, hl: cut.hl, st, en: en - 0.02, th, pal, font, rL: r(LYR.sub.layout * 7919), rM: r(LYR.sub.motion * 104729), rD: r(LYR.sub.decor * 1299709), hit: it.hit && ci === 0, note: ci === cuts.length - 1 ? it.note : "", li, ci, lyrTr, decTr, fxTr });
      for (const c of [...res.text, ...res.dec, ...res.fx]) C.push(c); n += res.text.length; stats[res.layout] = (stats[res.layout] || 0) + 1;
    });
  }
  tracks = tracks.filter(t => !t.lyr || C.some(c => c.track === t.id));
  await lyrBackground(pal, T);
  sel = null; renderAll(); drawFrame();
  return { lines: li + 1, clips: n, font, theme: th.n, layouts: stats, from: T.t0, to: T.tEnd, beats: T.beats.length };
}

/* ---------- nền theo chủ đề (ảnh chuyển màu + Ken Burns) khi track chính chưa có video ---------- */
async function lyrBackground(pal, T) {
  const mode = LYR.opts.bg || "auto"; V = V.filter(c => !(c.lyr && c.lyr.bg));
  if (mode === "none" || (mode === "auto" && V.length)) return;
  const asp = ($("#aspect").value || "9:16").split(":").map(Number), w = asp[0] >= asp[1] ? 1280 : 720, h = Math.round(w * asp[1] / asp[0]);
  const k = document.createElement("canvas"); k.width = w; k.height = h; const g = k.getContext("2d"), [cMain, cAcc, cDark] = pal;
  const dark = /^#?(0|1|2)/.test(cDark.replace("#", "")) ? cDark : "#111111";
  const lg = g.createLinearGradient(0, 0, w * 0.3, h); lg.addColorStop(0, dark); lg.addColorStop(1, "#000000"); g.fillStyle = lg; g.fillRect(0, 0, w, h);
  const r1 = g.createRadialGradient(w * 0.25, h * 0.2, 0, w * 0.25, h * 0.2, w * 0.9); r1.addColorStop(0, cAcc + "55"); r1.addColorStop(1, cAcc + "00"); g.fillStyle = r1; g.fillRect(0, 0, w, h);
  const r2 = g.createRadialGradient(w * 0.85, h * 0.85, 0, w * 0.85, h * 0.85, w * 0.8); r2.addColorStop(0, cAcc + "33"); r2.addColorStop(1, cAcc + "00"); g.fillStyle = r2; g.fillRect(0, 0, w, h);
  void cMain; const key = pal.join() + w + "x" + h; let m = [...media.values()].find(x => x._lyrBg === key);
  if (!m) { for (const [id, x] of media) if (x._lyrBg && !V.some(c => c.mediaId === id)) media.delete(id); const blob = await new Promise(r => k.toBlob(r, "image/png")); m = await addMediaFile(blob, "Nền lời bài hát.png"); if (!m) return; m._lyrBg = key; }
  const len = Math.max(2, T.tEnd); const c = { id: nid("v"), mediaId: m.id, in: 0, out: len, zoom: "none", vol: 0, lyr: { bg: 1 } };
  V.unshift(c); try { applyMotionPreset(c, "kenburns"); } catch (_) {}
}

/* ---------- LRC ---------- */
function lyrToLRC() {
  const items = lyrParse(LYR.text); lyrTiming(items); const f = t => { const m = Math.floor(t / 60), s = t - m * 60; return `[${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}]`; };
  return items.filter(i => i.type === "line").map(i => f(Math.max(0, i.ts)) + i.raw + (i.note ? "|" + i.note : "")).join("\n") + "\n";
}

/* ---------- bắt nhịp: phát nhạc, bấm Space khi mỗi dòng bắt đầu ---------- */
function lyrTap(onDone) {
  const lines = lyrParse(LYR.text).filter(i => i.type === "line"); if (!lines.length) { toast("Chưa có lời."); return; }
  const song = lyrSong(), marks = [];
  const bar = document.createElement("div"); bar.className = "lyrtap"; bar.innerHTML = `<div class="lt-now"></div><div class="lt-next"></div><div class="lt-help">Bấm <kbd>Space</kbd> đúng lúc dòng trên bắt đầu · <kbd>Backspace</kbd> bỏ lần bấm trước · <kbd>Esc</kbd> xong</div><div class="row"><button type="button" class="lt-tap primary">Bắt nhịp (Space)</button><button type="button" class="lt-undo">Lùi</button><button type="button" class="lt-done">Xong</button></div>`;
  document.body.appendChild(bar);
  const show = () => { bar.querySelector(".lt-now").textContent = marks.length < lines.length ? `Dòng ${marks.length + 1}/${lines.length}: ${lines[marks.length].raw}` : "Đã bắt nhịp đủ mọi dòng"; bar.querySelector(".lt-next").textContent = lines[marks.length + 1] ? "Tiếp: " + lines[marks.length + 1].raw : ""; };
  const tap = () => { if (marks.length < lines.length) { marks.push(+t.toFixed(3)); show(); if (marks.length === lines.length) setTimeout(done, 600); } };
  const undo = () => { marks.pop(); show(); };
  const done = () => { document.removeEventListener("keydown", key, true); bar.remove(); pause(); LYR.times = marks.slice(); onDone && onDone(marks.length); };
  const key = e => { if (e.code === "Space") { e.preventDefault(); e.stopImmediatePropagation(); tap(); } else if (e.key === "Backspace") { e.preventDefault(); e.stopImmediatePropagation(); undo(); } else if (e.key === "Escape" || e.key === "Enter") { e.preventDefault(); e.stopImmediatePropagation(); done(); } };
  document.addEventListener("keydown", key, true);
  bar.querySelector(".lt-tap").onclick = tap; bar.querySelector(".lt-undo").onclick = undo; bar.querySelector(".lt-done").onclick = done;
  show(); seek(song ? song.start : (LYR.opts.start || 0)); play();
}

/* ---------- hộp thoại ---------- */
const LYR_SAMPLE = `# Lời mẫu – thay bằng lời bài hát của bạn
Sáng nay em thức dậy / nghe *gió* gọi tên
Con phố nhỏ vẫn còn / mùi cà phê quen
[interlude 4]
Mình cứ đi thôi!
Đi qua *bao* mùa mưa nắng|điệp khúc
Mình cứ đi thôi!`;
function openLyrics() {
  if (!LYR) LYR = LYR_DEF();
  const ov = document.createElement("div"); ov.className = "overlay";
  const themes = Object.entries(LYR_THEMES).map(([k, v]) => `<option value="${k}">${v.n}</option>`).join("");
  ov.innerHTML = `<div class="dialog lyrdlg" role="dialog" aria-modal="true" aria-labelledby="lyrT">
    <h2 id="lyrT">Video lời bài hát</h2>
    <p class="note">Mỗi dòng một câu. <code>a / b</code> tự cắt cảnh · <code>*từ*</code> nhấn mạnh · <code>!</code> cuối dòng là điểm nhấn · <code>lời|chú thích</code> · <code>[interlude 8]</code> đoạn không lời · <code>[01:23.45]</code> mốc LRC · <code>#</code> ghi chú.</p>
    <textarea id="lyrText" rows="9" spellcheck="false" placeholder="Dán lời bài hát vào đây"></textarea>
    <div class="row wrap"><button type="button" id="lyrSample">Lời mẫu</button><button type="button" id="lyrLrcIn">Nhập .lrc</button><button type="button" id="lyrLrcOut">Lưu .lrc</button><input type="file" id="lyrLrcFile" accept=".lrc,.txt,text/plain" hidden><span class="spacer"></span><span class="note" id="lyrSong"></span></div>
    <div class="row wrap">
      <div class="field"><label for="lyrTheme">Chủ đề</label><select id="lyrTheme">${themes}</select></div>
      <div class="field"><label for="lyrSeed">Seed</label><input type="number" id="lyrSeed" min="1" step="1" style="width:110px"></div>
      <div class="field"><label for="lyrBg">Nền</label><select id="lyrBg"><option value="auto">Tự động (nền chủ đề nếu chưa có video)</option><option value="theme">Luôn dùng nền chủ đề</option><option value="none">Không thêm nền</option></select></div>
      <div class="field"><label for="lyrTiming">Thời gian</label><select id="lyrTiming"><option value="auto">Tự chia theo nhạc</option><option value="tap">Bắt nhịp bằng phím Space</option></select></div>
    </div>
    <div class="row wrap lyrchk">
      <label class="chk"><input type="checkbox" id="lyrKara"> Karaoke từng từ</label>
      <label class="chk"><input type="checkbox" id="lyrHits"> Nhấn ở dòng "!"</label>
      <label class="chk"><input type="checkbox" id="lyrDecor"> Trang trí</label>
      <label class="chk"><input type="checkbox" id="lyrBeats"> Khớp nhịp nhạc</label>
      <label class="chk"><input type="checkbox" id="lyrUnify"> Câu lặp lại giữ cùng kiểu</label>
      <label class="chk"><input type="checkbox" id="lyrUpper"> Viết hoa</label>
      <label class="chk"><input type="checkbox" id="lyrCenter"> Chừa giữa khung (chữ trên/dưới)</label>
    </div>
    <div class="row wrap"><button type="button" class="primary" id="lyrGo">Dựng lên timeline</button><button type="button" id="lyrVar">Tạo biến thể (R)</button><button type="button" id="lyrPrev">◀ Trước</button><button type="button" id="lyrNext">Sau ▶</button><button type="button" id="lyrOne">Đổi một phần ▾</button><span class="spacer"></span><button type="button" id="lyrClear">Xoá lời khỏi timeline</button><button type="button" id="lyrClose">Đóng</button></div>
    <div class="note" id="lyrStat" role="status"></div></div>`;
  document.body.appendChild(ov);
  const $q = s => ov.querySelector(s), O = LYR.opts;
  $q("#lyrText").value = LYR.text || ""; $q("#lyrTheme").value = LYR.theme; $q("#lyrBg").value = O.bg || "auto"; $q("#lyrBg").onchange = e => { O.bg = e.target.value; }; $q("#lyrSeed").value = LYR.seed;
  const chk = { lyrKara: "kara", lyrHits: "hits", lyrDecor: "decor", lyrBeats: "beats", lyrUnify: "unify", lyrUpper: "upper", lyrCenter: "center" };
  for (const [id, k] of Object.entries(chk)) { $q("#" + id).checked = !!O[k]; $q("#" + id).onchange = e => { O[k] = e.target.checked; }; }
  const song = lyrSong(); $q("#lyrSong").textContent = song ? `Nhạc: ${song.m.name} (${fmt(song.end - song.start)})` : "Chưa có nhạc trên timeline: lời sẽ chia đều (~2,6 s/dòng).";
  const sync = () => { LYR.text = $q("#lyrText").value; LYR.theme = $q("#lyrTheme").value; LYR.seed = Math.max(1, Math.round(+$q("#lyrSeed").value || 1)); };
  const stat = s => $q("#lyrStat").textContent = s;
  const build = async (rec) => { sync(); const r = await lyrBuild(); if (!r) return; if (rec) { LYR.hist = LYR.hist.slice(0, LYR.hi + 1); LYR.hist.push({ seed: LYR.seed, sub: Object.assign({}, LYR.sub), theme: LYR.theme }); LYR.hi = LYR.hist.length - 1; }
    stat(`Đã dựng ${r.lines} dòng · ${r.clips} clip chữ · chủ đề ${r.theme} · phông ${r.font} · ${fmt(r.from)} → ${fmt(r.to)}${r.beats ? " · khớp " + r.beats + " nhịp" : ""}. Kéo, chỉnh keyframe như clip thường; Ctrl+Z để hoàn tác.`); };
  $q("#lyrSample").onclick = () => { $q("#lyrText").value = LYR_SAMPLE; };
  $q("#lyrLrcIn").onclick = () => $q("#lyrLrcFile").click();
  $q("#lyrLrcFile").onchange = async e => { const f = e.target.files[0]; if (!f) return; $q("#lyrText").value = await f.text(); LYR.times = []; stat("Đã nạp " + f.name + ". Bấm Dựng lên timeline."); e.target.value = ""; };
  $q("#lyrLrcOut").onclick = async () => { sync(); const s = await getSaver(); if (!s) return; await s.save({ filename: slug(projName || "loi") + ".lrc", data: new Blob([lyrToLRC()], { type: "text/plain" }) }); };
  $q("#lyrGo").onclick = async () => { sync(); if ($q("#lyrTiming").value === "tap") { ov.hidden = true; lyrTap(async k => { ov.hidden = false; await build(true); stat(`Đã bắt nhịp ${k} dòng. ` + $q("#lyrStat").textContent); $q("#lyrTiming").value = "auto"; }); return; } await build(true); };
  $q("#lyrVar").onclick = async () => { LYR.seed = 1 + Math.floor(Math.random() * 99999); for (const k in LYR.sub) LYR.sub[k] = 1 + Math.floor(Math.random() * 9999); $q("#lyrSeed").value = LYR.seed; LYR.text = $q("#lyrText").value; LYR.theme = $q("#lyrTheme").value; await lyrBuild(); LYR.hist = LYR.hist.slice(0, LYR.hi + 1); LYR.hist.push({ seed: LYR.seed, sub: Object.assign({}, LYR.sub), theme: LYR.theme }); LYR.hi = LYR.hist.length - 1; stat(`Biến thể ${LYR.hi + 1}/${LYR.hist.length} (seed ${LYR.seed}).`); };
  const go = async d => { const h = LYR.hist[LYR.hi + d]; if (!h) { stat("Không còn biến thể " + (d < 0 ? "trước" : "sau") + "."); return; } LYR.hi += d; Object.assign(LYR, { seed: h.seed, theme: h.theme }); LYR.sub = Object.assign({}, h.sub); $q("#lyrSeed").value = LYR.seed; $q("#lyrTheme").value = LYR.theme; LYR.text = $q("#lyrText").value; await lyrBuild(); stat(`Biến thể ${LYR.hi + 1}/${LYR.hist.length} (seed ${LYR.seed}).`); };
  $q("#lyrPrev").onclick = () => go(-1); $q("#lyrNext").onclick = () => go(1);
  $q("#lyrOne").onclick = e => openMenu(e.currentTarget, [["layout", "Bố cục"], ["motion", "Chuyển động"], ["color", "Màu và phông"], ["decor", "Trang trí và nhấn"]].map(([k, n]) => ({ label: n, run: async () => { sync(); LYR.sub[k] = 1 + Math.floor(Math.random() * 9999); await lyrBuild(); stat("Đã đổi " + n.toLowerCase() + "."); } })));
  $q("#lyrClear").onclick = () => { pushUndo(); C = C.filter(c => !c.lyr); V = V.filter(c => !c.lyr); tracks = tracks.filter(t => !t.lyr); renderAll(); stat("Đã xoá lời khỏi timeline (Ctrl+Z để lấy lại)."); };
  const close = () => { sync(); ov.remove(); document.removeEventListener("keydown", keyR, true); };
  const keyR = e => { if (ov.hidden) return; if (e.key === "Escape") { e.preventDefault(); close(); } else if ((e.key === "r" || e.key === "R") && !tmatch(e, "input,textarea,select")) { e.preventDefault(); e.stopImmediatePropagation(); $q("#lyrVar").click(); } };
  document.addEventListener("keydown", keyR, true);
  $q("#lyrClose").onclick = close; ov.addEventListener("click", e => { if (e.target === ov) close(); });
  setTimeout(() => $q("#lyrText").focus(), 50);
}
window.openLyrics = openLyrics;

/* ---------- gắn vào app ---------- */
TOOLS.push(["lyrics", "Video lời bài hát", "Dán lời, bắt nhịp, dựng chữ chuyển động theo nhạc", '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><path d="M13 8h5M13 11h4"/>']);
const _runToolLyr = runTool;
runTool = function (k) { if (k !== "lyrics") return _runToolLyr(k); newProject("9:16", "Video lời bài hát").then(() => { pendingTool = m => { if (m.kind !== "audio") { toast("Đã thêm. Chọn thêm bài nhạc nếu muốn chữ khớp nhạc."); } if (m.kind === "audio") { pushUndo(); C.push({ id: nid("c"), track: firstTrack("audio", "Âm thanh").id, type: "audio", mediaId: m.id, start: 0, in: 0, out: m.duration, vol: 0, es: "mus" }); renderAll(); } setTimeout(openLyrics, 200); }; setTimeout(openLyrics, 250); toast("Thêm bài nhạc vào timeline (nút + ở Thư viện) để chữ khớp nhạc, rồi dán lời."); }); };
// lưu / mở cùng dự án
const _pjLyr = projectJSON; projectJSON = function () { const s = _pjLyr(); if (!LYR) return s; const o = JSON.parse(s); o.lyrics = LYR; return JSON.stringify(o, null, 1); };
const _lpoLyr = loadProjectObj; loadProjectObj = async function (o, opts) { LYR = (o && o.lyrics) ? Object.assign(LYR_DEF(), o.lyrics, { opts: Object.assign(LYR_DEF().opts, o.lyrics.opts || {}) }) : null; return _lpoLyr(o, opts); };
