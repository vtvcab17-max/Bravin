"use strict";
/* ============================================================================
   Bravin engine: easing + keyframes, motion presets, filters/colour (WebGL),
   effects, transitions, stickers. Pure drawing helpers — no timeline/UI here.
   ========================================================================== */

/* ---------- easing ---------- */
const EASE = {
  linear: p => p,
  in: p => p * p * p,
  out: p => 1 - Math.pow(1 - p, 3),
  inout: p => p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2,
  back: p => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); },
  bounce: p => { const n = 7.5625, d = 2.75; if (p < 1 / d) return n * p * p; if (p < 2 / d) return n * (p -= 1.5 / d) * p + 0.75; if (p < 2.5 / d) return n * (p -= 2.25 / d) * p + 0.9375; return n * (p -= 2.625 / d) * p + 0.984375; },
  elastic: p => p === 0 || p === 1 ? p : Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * (2 * Math.PI) / 3) + 1,
  hold: p => 0
};
const EASE_NAMES = { linear: "Tuyến tính", inout: "Mượt hai đầu", in: "Chậm lúc đầu", out: "Chậm lúc cuối", back: "Bật lố", bounce: "Nảy", elastic: "Đàn hồi", hold: "Giữ rồi nhảy" };

/* ---------- keyframes: c.kf = { prop: [{t, v, e}] }, t = seconds from clip start ---------- */
const KF_PROPS = { x: "Vị trí X", y: "Vị trí Y", scale: "Kích thước", angle: "Góc xoay", flipH: "Lật ngang", flipV: "Lật dọc", opacity: "Độ mờ", blur: "Độ nhoè", blend: "Hoà trộn", speed: "Tốc độ", vol: "Âm lượng", amt: "Cường độ hiệu ứng", mosaic: "Mosaic" };
const KF_DISCRETE = { blend: 1 }; // stepped (no interpolation), values are strings
function kfList(c, prop) { return (c.kf && c.kf[prop]) || null; }
function kfVal(c, prop, lt, def) {
  const L = kfList(c, prop); if (!L || !L.length) return def;
  if (lt <= L[0].t) return L[0].v;
  if (typeof L[0].v !== "number") { let v = L[0].v; for (const k of L) if (lt >= k.t - 1e-6) v = k.v; return v; }
  for (let i = 0; i < L.length - 1; i++) { const a = L[i], b = L[i + 1]; if (lt < b.t) { const p = (lt - a.t) / Math.max(1e-6, b.t - a.t); return a.v + (b.v - a.v) * (EASE[a.e || "linear"] || EASE.linear)(p); } }
  return L[L.length - 1].v;
}
const KF_TOL = () => 0.5 / FPS + 1e-4;
function kfAt(c, prop, lt) { const L = kfList(c, prop); return L ? L.find(k => Math.abs(k.t - lt) < KF_TOL()) || null : null; }
function setKf(c, prop, lt, v, e) {
  c.kf = c.kf || {}; const L = c.kf[prop] = c.kf[prop] || [];
  const k = L.find(k => Math.abs(k.t - lt) < KF_TOL());
  if (k) { k.v = v; if (e) k.e = e; } else { L.push({ t: Math.round(lt * 1000) / 1000, v, e: e || "inout" }); L.sort((a, b) => a.t - b.t); }
}
function delKf(c, prop, lt) { const L = kfList(c, prop); if (!L) return; const i = L.findIndex(k => Math.abs(k.t - lt) < KF_TOL()); if (i >= 0) L.splice(i, 1); if (!L.length) delete c.kf[prop]; if (c.kf && !Object.keys(c.kf).length) delete c.kf; }
function kfTimes(c) { const s = new Set(); if (c.kf) for (const p in c.kf) for (const k of c.kf[p]) s.add(k.t); return [...s].sort((a, b) => a - b); }
function splitKf(kf, off) { // → [left, right]; right times shifted by -off
  if (!kf) return [undefined, undefined]; const A = {}, B = {};
  for (const p in kf) { const L = kf[p]; const a = L.filter(k => k.t <= off + 1e-4), b = L.filter(k => k.t >= off - 1e-4).map(k => ({ ...k, t: Math.max(0, Math.round((k.t - off) * 1000) / 1000) })); if (a.length) A[p] = a; if (b.length) B[p] = b; }
  return [Object.keys(A).length ? A : undefined, Object.keys(B).length ? B : undefined];
}

/* ---------- motion presets: c.anim = { in:{type,dur}, out:{type,dur}, loop:{type,speed} } ---------- */
const ANIM_IN = { fade: "Hiện dần", zoomIn: "Phóng to vào", zoomOut: "Thu nhỏ vào", slideL: "Trượt từ trái", slideR: "Trượt từ phải", slideU: "Trượt từ dưới", slideD: "Trượt từ trên", pop: "Bật nảy", rotate: "Xoay vào", swing: "Đung đưa vào", flip: "Lật vào", blur: "Nhoè vào", drop: "Rơi xuống", typewriter: "Gõ chữ (chữ)", words: "Từng từ (chữ)" };
const ANIM_OUT = { fade: "Mờ dần ra", zoomIn: "Phóng to ra", zoomOut: "Thu nhỏ ra", slideL: "Trượt sang trái", slideR: "Trượt sang phải", slideU: "Trượt lên", slideD: "Trượt xuống", pop: "Bật biến mất", rotate: "Xoay ra", flip: "Lật ra", blur: "Nhoè ra" };
const ANIM_LOOP = { pulse: "Nhịp đập", shake: "Rung", swing: "Đung đưa", float: "Lơ lửng", spin: "Xoay tròn", heartbeat: "Tim đập", wiggle: "Lắc lư", zoomloop: "Phóng to dần", breathe: "Thở" };
function animMods(c, lt, len) {
  const M = { dx: 0, dy: 0, s: 1, sx: 1, r: 0, a: 1, blur: 0, reveal: 1 }; const A = c.anim; if (!A) return M;
  const apply = (type, q, dir) => { // q: 1 = fully "away", 0 = settled
    switch (type) {
      case "fade": M.a *= 1 - q; break;
      case "zoomIn": M.s *= 1 - 0.45 * q * dir; M.a *= 1 - q * 0.6; break;
      case "zoomOut": M.s *= 1 + 0.5 * q * dir; M.a *= 1 - q * 0.6; break;
      case "slideL": M.dx -= q; break; case "slideR": M.dx += q; break;
      case "slideU": M.dy += q; break; case "slideD": M.dy -= q; break;
      case "pop": M.s *= 1 - q; break;
      case "rotate": M.r += -180 * q; M.s *= 1 - 0.6 * q; M.a *= 1 - q; break;
      case "swing": M.r += 25 * q * Math.cos(q * 9); M.a *= 1 - q * 0.5; break;
      case "flip": M.sx *= Math.max(0.001, 1 - q); break;
      case "blur": M.blur += 22 * q; M.a *= 1 - q * 0.7; break;
      case "drop": M.dy -= 0.6 * q; break;
      case "typewriter": case "words": M.reveal = 1 - q; break;
    }
  };
  if (A.in && A.in.type) { const d = Math.max(0.05, A.in.dur || 0.5), p = clamp(lt / d, 0, 1); if (p < 1) { const e = A.in.type === "pop" || A.in.type === "drop" ? EASE.back(p) : (A.in.type === "typewriter" || A.in.type === "words") ? p : EASE.out(p); apply(A.in.type, 1 - e, 1); } }
  if (A.out && A.out.type) { const d = Math.max(0.05, A.out.dur || 0.5), p = clamp((len - lt) / d, 0, 1); if (p < 1) apply(A.out.type, 1 - EASE.out(p), -1); }
  if (A.loop && A.loop.type) {
    const sp = A.loop.speed || 1, w = lt * sp * Math.PI * 2;
    switch (A.loop.type) {
      case "pulse": M.s *= 1 + 0.06 * Math.sin(w * 1.2); break;
      case "shake": M.dx += 0.012 * Math.sin(w * 7.3); M.dy += 0.01 * Math.sin(w * 9.1 + 1); break;
      case "swing": M.r += 8 * Math.sin(w * 0.9); break;
      case "float": M.dy += 0.02 * Math.sin(w * 0.7); break;
      case "spin": M.r += (lt * sp * 120) % 360; break;
      case "heartbeat": { const ph = (lt * sp) % 1; M.s *= 1 + 0.12 * Math.exp(-ph * 12) + 0.07 * Math.exp(-Math.max(0, ph - 0.22) * 12) * (ph > 0.22 ? 1 : 0); break; }
      case "wiggle": M.r += 4 * Math.sin(w * 2.1); M.dx += 0.006 * Math.sin(w * 1.7); break;
      case "zoomloop": M.s *= 1 + 0.12 * clamp(lt / Math.max(0.1, len), 0, 1); break;
      case "breathe": M.s *= 1 + 0.035 * Math.sin(w * 0.5); M.a *= 0.88 + 0.12 * (0.5 + 0.5 * Math.sin(w * 0.5)); break;
    }
  }
  return M;
}

/* ---------- transforms: base props + keyframes + motion presets ---------- */
function xform(c, lt, len) {
  const M = animMods(c, lt, len);
  const fh = kfVal(c, "flipH", lt, c.flip ? 1 : 0), fv = kfVal(c, "flipV", lt, c.flipV ? 1 : 0);
  const fx = 1 - 2 * clamp(fh, 0, 1), fy = 1 - 2 * clamp(fv, 0, 1);
  return {
    x: kfVal(c, "x", lt, c.x || 0) + M.dx, y: kfVal(c, "y", lt, c.y || 0) + M.dy,
    scale: kfVal(c, "scale", lt, c.scale == null ? 1 : c.scale) * M.s, sx: M.sx,
    fx: Math.abs(fx) < 0.002 ? 0.002 : fx, fy: Math.abs(fy) < 0.002 ? 0.002 : fy,
    angle: kfVal(c, "angle", lt, c.angle || 0) + M.r + (c.rot || 0),
    opacity: clamp(kfVal(c, "opacity", lt, c.opacity == null ? 1 : c.opacity) * M.a, 0, 1),
    blur: M.blur + Math.max(0, kfVal(c, "blur", lt, c.blur || 0)), reveal: M.reveal
  };
}
function blendAt(c, lt) { const b = kfVal(c, "blend", lt, c.blend || "normal"); return b || "normal"; }

/* ---------- speed ramps: c.kf.speed = [{t (output secs), v (rate)}] ---------- */
const hasRamp = c => !!(c.kf && c.kf.speed && c.kf.speed.length) && !isDur(c) && !c.freeze;
const speedAt = (c, lt) => clamp(kfVal(c, "speed", lt, c.speed || 1), 0.05, 20);
const RAMP_DT = 1 / 120, rampCache = new WeakMap();
function rampTable(c) { // cumulative source seconds per output step until the source range is used up
  const sig = JSON.stringify(c.kf.speed) + "|" + c.in + "|" + c.out + "|" + (c.speed || 1);
  const hit = rampCache.get(c); if (hit && hit.sig === sig) return hit;
  const need = Math.max(0, c.out - c.in), acc = [0]; let s = 0, i = 0, len = 0;
  while (s < need && i < 200000) { const r = speedAt(c, (i + 0.5) * RAMP_DT), ns = s + r * RAMP_DT; if (ns >= need) { len = i * RAMP_DT + (need - s) / r; s = need; acc.push(need); break; } s = ns; i++; acc.push(s); }
  if (!len) len = i * RAMP_DT;
  const o = { sig, acc, len: Math.max(0.01, len) }; rampCache.set(c, o); return o;
}
function rampLen(c) { return rampTable(c).len; }
function srcOffset(c, lt) { // output-local time → seconds into the source after c.in
  if (!hasRamp(c)) return lt * (c.speed || 1);
  const T = rampTable(c), x = lt / RAMP_DT, n = T.acc.length - 1; if (x <= 0) return lt * speedAt(c, 0);
  if (lt >= T.len) return T.acc[n] + (lt - T.len) * speedAt(c, lt);
  const i = Math.min(Math.floor(x), n - 1), t1 = i + 1 === n ? T.len : (i + 1) * RAMP_DT;
  return T.acc[i] + (T.acc[i + 1] - T.acc[i]) * (lt - i * RAMP_DT) / Math.max(1e-9, t1 - i * RAMP_DT);
}
function outAtSrc(c, so) { // inverse of srcOffset
  if (!hasRamp(c)) return so / (c.speed || 1);
  const A = rampTable(c).acc; let lo = 0, hi = A.length - 1; if (so >= A[hi]) return hi * RAMP_DT;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (A[m] <= so) lo = m; else hi = m; }
  const t0 = lo * RAMP_DT, t1 = hi === A.length - 1 ? rampTable(c).len : hi * RAMP_DT;
  return t0 + (so - A[lo]) / Math.max(1e-9, A[hi] - A[lo]) * (t1 - t0);
}
/* playback-rate curve for audio sources (WebAudio setValueCurveAtTime) */
function rateCurve(c, from, dur) { const n = clamp(Math.ceil(dur * 30), 2, 4000), a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = speedAt(c, from + dur * i / (n - 1)); return a; }
const SPEED_CURVES = {
  montage: { n: "Montage", p: [[0, 1], [0.35, 1], [0.45, 3], [0.6, 3], [0.7, 1]] },
  hero: { n: "Anh hùng", p: [[0, 1], [0.3, 1], [0.45, 0.25], [0.7, 0.25], [0.85, 1.5], [1, 1.5]] },
  bullet: { n: "Đạn bay", p: [[0, 2], [0.4, 2], [0.5, 0.2], [0.7, 0.2], [0.8, 2], [1, 2]] },
  jumpcut: { n: "Nhảy cóc", p: [[0, 1], [0.2, 1], [0.25, 4], [0.45, 4], [0.5, 1], [0.7, 1], [0.75, 4], [1, 4]] },
  flashin: { n: "Vào nhanh", p: [[0, 4], [0.3, 1], [1, 1]] },
  flashout: { n: "Ra nhanh", p: [[0, 1], [0.7, 1], [1, 4]] }
};
function applySpeedCurve(c, key) { // positions are fractions of the *source* range, mapped to output time
  if (!c.kf) c.kf = {}; delete c.kf.speed;
  if (key === "none" || !SPEED_CURVES[key]) { if (!Object.keys(c.kf).length) delete c.kf; return; }
  const P = SPEED_CURVES[key].p, base = c.speed || 1, need = c.out - c.in;
  // approximate output time of each source fraction with piecewise integration
  let tOut = 0; const L = [];
  for (let i = 0; i < P.length; i++) {
    if (i) { const ds = (P[i][0] - P[i - 1][0]) * need, avg = (P[i][1] + P[i - 1][1]) / 2 * base; tOut += ds / Math.max(0.05, avg); }
    L.push({ t: Math.round(tOut * 1000) / 1000, v: P[i][1] * base, e: "inout" });
  }
  c.kf.speed = L;
}

/* ---------- colour: filter presets + adjustments (WebGL) ---------- */
const ADJ_KEYS = { b: ["Độ sáng", -0.5, 0.5], c: ["Tương phản", -0.5, 0.5], s: ["Bão hoà", -1, 1], ex: ["Phơi sáng", -1, 1], wh: ["Điểm trắng", -1, 1], bl: ["Điểm đen", -1, 1], vib: ["Độ rực", -1, 1], temp: ["Nhiệt độ màu", -1, 1], tint: ["Sắc thái", -1, 1], hue: ["Đổi màu (hue)", -180, 180], hi: ["Vùng sáng", -1, 1], sh: ["Vùng tối", -1, 1], fade: ["Bạc màu", 0, 1], vig: ["Tối viền", 0, 1], sharp: ["Làm nét", 0, 1], grain: ["Hạt phim", 0, 1] };
const FILTERS = {
  none: { n: "Gốc", p: {} },
  luminous: { n: "Sáng trong", p: { b: 0.035, c: 0.06, s: 0.16, temp: -0.08, hi: 0.08 } },
  clear: { n: "Trong trẻo", p: { b: 0.05, c: -0.04, s: 0.1, ex: 0.08, temp: -0.12 } },
  warm: { n: "Ấm áp", p: { temp: 0.35, tint: 0.05, s: 0.08, c: 0.04 } },
  cool: { n: "Lạnh", p: { temp: -0.4, s: -0.05, c: 0.05 } },
  cinema: { n: "Điện ảnh", p: { c: 0.18, s: -0.1, split: 1, fade: 0.06, vig: 0.35 } },
  bw: { n: "Đen trắng", p: { s: -1, c: 0.22 } },
  vintage: { n: "Hoài cổ", p: { fade: 0.25, temp: 0.2, s: -0.3, grain: 0.25, vig: 0.3 } },
  pink: { n: "Hồng mộng", p: { tint: 0.22, b: 0.06, fade: 0.08, s: 0.05 } },
  vivid: { n: "Rực rỡ", p: { s: 0.45, c: 0.12, hi: -0.05 } },
  kodak: { n: "Phim Kodak", p: { temp: 0.18, c: 0.14, fade: 0.1, s: 0.1, grain: 0.15 } },
  mint: { n: "Xanh bạc hà", p: { temp: -0.18, tint: -0.15, b: 0.04, s: -0.05 } },
  moody: { n: "Trầm", p: { ex: -0.15, c: 0.2, s: -0.25, sh: -0.2, vig: 0.4 } },
  soft: { n: "Da mịn", p: { b: 0.06, c: -0.1, hi: 0.1, sh: 0.15, s: 0.04, tint: 0.05 } },
  gold: { n: "Nắng vàng", p: { temp: 0.45, ex: 0.08, s: 0.12, hi: 0.1 } }
};
function colorParams(c) { // merges filter preset (with intensity) + manual adjustments
  const out = {}; const f = FILTERS[c.filter] && c.filter !== "none" ? FILTERS[c.filter].p : null, k = c.filterAmt == null ? 1 : c.filterAmt;
  if (f) for (const key in f) out[key] = (out[key] || 0) + f[key] * k;
  const a = c.adj || {}; for (const key in a) out[key] = (out[key] || 0) + (+a[key] || 0);
  if (typeof lumetriParams === "function") lumetriParams(c, out);
  return out;
}
const hasColor = p => Object.keys(p).some(k => typeof p[k] === "object" ? !!p[k] : Math.abs(p[k]) > 1e-4);

const GLFX = (() => {
  let canvas = null, gl = null, prog = null, tex = null, mtex = null, ctex = null, ltex = null, ctKey = "", ltKey = "", U = {}, ok = null;
  const VS = `attribute vec2 p; varying vec2 uv; void main(){ uv = vec2((p.x+1.)*.5, 1.-(p.y+1.)*.5); gl_Position = vec4(p,0.,1.); }`;
  const FS = `precision mediump float; varying vec2 uv; uniform sampler2D T; uniform sampler2D MK; uniform vec2 px;
  uniform float b,c,s,ex,temp,tint,hue,hi,sh,fade,vig,sharp,grain,split,time,rgb,maskOn,maskInv;
  uniform float ckOn; uniform vec3 ck; uniform float ckSim, ckSmooth, ckSpill;
  uniform float wh, bl, vib; uniform vec3 shT, midT, hiT; uniform float cvOn; uniform sampler2D CT;
  uniform float hslOn, hslH, hslR, hslS, hslDH, hslDS, hslDL, hslShow; uniform float lvAmt, lvMid, lvRound, lvFeather;
  uniform float lutOn, lutN, lutAmt; uniform sampler2D LT;
  vec3 rgb2hsv(vec3 c){ vec4 K = vec4(0., -1./3., 2./3., -1.); vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g)); vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r)); float d = q.x - min(q.w, q.y); return vec3(abs(q.z + (q.w - q.y) / (6.*d + 1e-10)), d / (q.x + 1e-10), q.x); }
  vec3 hsv2rgb(vec3 c){ vec3 p = abs(fract(c.xxx + vec3(1., 2./3., 1./3.)) * 6. - 3.); return c.z * mix(vec3(1.), clamp(p - 1., 0., 1.), c.y); }
  vec3 lut3(vec3 c){ float n = lutN; c = clamp(c, 0., 1.); float bz = c.b * (n - 1.); float b0 = floor(bz); float b1 = min(b0 + 1., n - 1.); float f = bz - b0;
    vec2 o = vec2((c.r * (n - 1.) + .5) / (n * n), (c.g * (n - 1.) + .5) / n);
    return mix(texture2D(LT, o + vec2(b0 / n, 0.)).rgb, texture2D(LT, o + vec2(b1 / n, 0.)).rgb, f); }
  vec3 hueRot(vec3 col, float a){ const vec3 k = vec3(0.57735); float ca = cos(a); return col*ca + cross(k,col)*sin(a) + k*dot(k,col)*(1.-ca); }
  float rnd(vec2 co){ return fract(sin(dot(co, vec2(12.9898,78.233)) + time*7.13) * 43758.5453); }
  vec2 rgb2uv(vec3 c){ return vec2(-0.169*c.r - 0.331*c.g + 0.5*c.b, 0.5*c.r - 0.419*c.g - 0.081*c.b); }
  void main(){
    vec4 t0 = texture2D(T, uv); vec3 col = t0.rgb; float a = t0.a;
    if (rgb > 0.) { col.r = texture2D(T, uv + vec2(rgb*px.x*8.,0.)).r; col.b = texture2D(T, uv - vec2(rgb*px.x*8.,0.)).b; }
    if (sharp > 0.) { vec3 bl = (texture2D(T, uv+vec2(px.x,0.)).rgb + texture2D(T, uv-vec2(px.x,0.)).rgb + texture2D(T, uv+vec2(0.,px.y)).rgb + texture2D(T, uv-vec2(0.,px.y)).rgb)*.25; col += (col-bl)*sharp*1.6; }
    if (ckOn > 0.) { float d = distance(rgb2uv(col), rgb2uv(ck)); float m = smoothstep(ckSim, ckSim + ckSmooth + 0.001, d); a *= m;
      float sp = clamp(1. - d/(ckSim+0.25), 0., 1.)*ckSpill; float l = dot(col, vec3(.299,.587,.114)); col = mix(col, vec3(l), sp); }
    if (maskOn > 0.) { float m = texture2D(MK, uv).r; if (maskInv > 0.) m = 1.-m; a *= smoothstep(0.35, 0.65, m); }
    col *= pow(2., ex);
    col += b;
    col = (col - 0.5) * (1. + c) + 0.5;
    float l = dot(col, vec3(.299,.587,.114));
    col += (hi * smoothstep(.45, 1., l) + sh * (1. - smoothstep(0., .55, l))) * .35;
    col = mix(vec3(l), col, 1. + s);
    col += bl * .14 * (1. - smoothstep(0., .45, col)); col += wh * .14 * smoothstep(.55, 1., col);
    if (vib != 0.) { float mx = max(col.r, max(col.g, col.b)), mn = min(col.r, min(col.g, col.b)); float L3 = dot(col, vec3(.299,.587,.114)); col = mix(vec3(L3), col, 1. + vib * (1. - clamp((mx - mn) * 1.6, 0., 1.))); }
    col.r += temp * .09; col.b -= temp * .09; col.g += tint * -.06; col.r += tint * .03; col.b += tint * .03;
    if (split > 0.) { float L2 = dot(col, vec3(.299,.587,.114)); col += split * (mix(vec3(-.03,.03,.07), vec3(.08,.03,-.04), smoothstep(.2,.8,L2))); }
    if (abs(hue) > 0.) col = hueRot(col, hue * 3.14159 / 180.);
    col = mix(col, vec3(.5) + (col - .5) * .82 + .06, fade);
    { float L4 = clamp(dot(col, vec3(.299,.587,.114)), 0., 1.); float ws = 1. - smoothstep(0., .5, L4), hw = smoothstep(.5, 1., L4); col += shT * ws + midT * (1. - ws - hw) + hiT * hw; }
    if (cvOn > 0.) { col = clamp(col, 0., 1.) * (255./256.) + .5/256.; col = vec3(texture2D(CT, vec2(col.r, .5)).r, texture2D(CT, vec2(col.g, .5)).g, texture2D(CT, vec2(col.b, .5)).b); }
    if (hslOn > 0.) { vec3 hv = rgb2hsv(clamp(col, 0., 1.)); float dh = abs(fract(hv.x - hslH + .5) - .5); float m = (1. - smoothstep(hslR, hslR + hslS + .001, dh)) * smoothstep(.04, .18, hv.y);
      if (hslShow > 0.) { col = mix(vec3(dot(col, vec3(.299,.587,.114)) * .35), col, m); } else { hv.x = fract(hv.x + hslDH * m); hv.y = clamp(hv.y * (1. + hslDS * m), 0., 1.); hv.z = clamp(hv.z * (1. + hslDL * m), 0., 1.); col = hsv2rgb(hv); } }
    if (lutOn > 0.) col = mix(col, lut3(col), lutAmt);
    if (vig > 0.) { vec2 q = uv - .5; col *= 1. - vig * smoothstep(.25, .85, length(q) * 1.25); }
    if (lvAmt != 0.) { float ar = px.y / px.x; vec2 q = (uv - .5) * 2.; float rr = clamp(lvRound * .5 + .5, 0., 1.); q *= mix(vec2(1.), vec2(ar, 1.) / min(ar, 1.), rr); float m = smoothstep(lvMid, lvMid + lvFeather + .02, length(q) * .7071);
      col = lvAmt < 0. ? col * (1. + lvAmt * m) : mix(col, vec3(1.), lvAmt * m); }
    if (grain > 0.) col += (rnd(uv * 913.) - .5) * grain * .18;
    gl_FragColor = vec4(clamp(col, 0., 1.) * a, a);
  }`;
  function init() {
    if (ok !== null) return ok;
    try {
      canvas = document.createElement("canvas"); gl = canvas.getContext("webgl", { premultipliedAlpha: true, preserveDrawingBuffer: true, alpha: true });
      if (!gl) return ok = false;
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      const mk = () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); return t; };
      tex = mk(); mtex = mk(); ctex = mk(); ltex = mk();
      for (const n of ["T", "MK", "px", "b", "c", "s", "ex", "temp", "tint", "hue", "hi", "sh", "fade", "vig", "sharp", "grain", "split", "time", "rgb", "maskOn", "maskInv", "ckOn", "ck", "ckSim", "ckSmooth", "ckSpill", "wh", "bl", "vib", "shT", "midT", "hiT", "cvOn", "CT", "hslOn", "hslH", "hslR", "hslS", "hslDH", "hslDS", "hslDL", "hslShow", "lvAmt", "lvMid", "lvRound", "lvFeather", "lutOn", "lutN", "lutAmt", "LT"]) U[n] = gl.getUniformLocation(prog, n);
      gl.uniform1i(U.T, 0); gl.uniform1i(U.MK, 1); gl.uniform1i(U.CT, 2); gl.uniform1i(U.LT, 3);
      return ok = true;
    } catch (e) { console.warn("WebGL fx off:", e); return ok = false; }
  }
  /* src: drawable (video/img/canvas/VideoFrame), crop rect in source px. Returns canvas or null. */
  function run(src, sx, sy, sw, sh, P, opts) {
    if (!init()) return null;
    const maxSide = opts.maxSide || 1280, k = Math.min(1, maxSide / Math.max(sw, sh)), W = Math.max(2, Math.round(sw * k)), H = Math.max(2, Math.round(sh * k));
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    gl.viewport(0, 0, W, H);
    let input = src;
    if (sx || sy || sw !== (opts.fullW || sw) || sh !== (opts.fullH || sh)) { // crop first through a 2D scratch canvas
      const cc = scratch("glcrop", W, H); cc.ctx.clearRect(0, 0, W, H); cc.ctx.drawImage(src, sx, sy, sw, sh, 0, 0, W, H); input = cc.canvas;
    }
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, input); } catch (e) { return null; }
    const v = k2 => +(P[k2] || 0);
    gl.uniform2f(U.px, 1 / W, 1 / H);
    for (const n of ["b", "c", "s", "ex", "temp", "tint", "hue", "hi", "sh", "fade", "vig", "sharp", "grain", "split", "rgb", "wh", "bl", "vib", "hslOn", "hslH", "hslR", "hslS", "hslDH", "hslDS", "hslDL", "hslShow", "lvAmt", "lvMid", "lvRound", "lvFeather"]) gl.uniform1f(U[n], v(n));
    const v3 = k2 => P[k2] || [0, 0, 0]; gl.uniform3fv(U.shT, v3("shT")); gl.uniform3fv(U.midT, v3("midT")); gl.uniform3fv(U.hiT, v3("hiT"));
    gl.uniform1f(U.cvOn, P.curve ? 1 : 0);
    if (P.curve) { gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, ctex); if (ctKey !== P.curve.key) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, P.curve.data); ctKey = P.curve.key; } }
    gl.uniform1f(U.lutOn, P.lut ? 1 : 0);
    if (P.lut) { gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, ltex); if (ltKey !== P.lut.key) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, P.lut.n * P.lut.n, P.lut.n, 0, gl.RGBA, gl.UNSIGNED_BYTE, P.lut.data); ltKey = P.lut.key; } gl.uniform1f(U.lutN, P.lut.n); gl.uniform1f(U.lutAmt, P.lutAmt == null ? 1 : P.lutAmt); }
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1f(U.time, (opts.time || 0) % 100);
    const ck = opts.chroma; gl.uniform1f(U.ckOn, ck ? 1 : 0);
    if (ck) { const h = hexRgb(ck.color || "#00ff00"); gl.uniform3f(U.ck, h[0], h[1], h[2]); gl.uniform1f(U.ckSim, (ck.sim == null ? 0.4 : ck.sim) * 0.5); gl.uniform1f(U.ckSmooth, (ck.smooth == null ? 0.1 : ck.smooth) * 0.5); gl.uniform1f(U.ckSpill, ck.spill == null ? 0.5 : ck.spill); }
    gl.uniform1f(U.maskOn, opts.mask ? 1 : 0); gl.uniform1f(U.maskInv, opts.maskInv ? 1 : 0);
    if (opts.mask) { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, mtex); try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, opts.mask); } catch (e) {} gl.activeTexture(gl.TEXTURE0); }
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return canvas;
  }
  return { run, available: () => init() };
})();
function hexRgb(h) { h = String(h || "#000").replace("#", ""); if (h.length === 3) h = h.split("").map(x => x + x).join(""); const n = parseInt(h, 16) || 0; return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
const _scratch = {};
function scratch(name, w, h) { let s = _scratch[name]; if (!s) { const canvas = document.createElement("canvas"); s = _scratch[name] = { canvas, ctx: canvas.getContext("2d") }; } if (s.canvas.width !== w || s.canvas.height !== h) { s.canvas.width = w; s.canvas.height = h; } return s; }

/* ---------- masks ---------- */
const MASKS = { none: "Không", circle: "Tròn", rect: "Chữ nhật", heart: "Trái tim", star: "Ngôi sao", linear: "Đường thẳng", mirror: "Gương (dải)" };
function maskPath(ctx, mk, W, H) { // mask coords in frame px; mk.x,y = centre offset (-1..1 of frame), w,h = size fraction, r = rotate deg
  const cx = W / 2 + (mk.x || 0) * W, cy = H / 2 + (mk.y || 0) * H, w = (mk.w || 0.6) * W, h = (mk.h || 0.6) * W;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate((mk.r || 0) * Math.PI / 180); ctx.beginPath();
  switch (mk.type) {
    case "circle": ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2); break;
    case "rect": { const r = Math.min(w, h) / 2 * (mk.round || 0); if (ctx.roundRect) ctx.roundRect(-w / 2, -h / 2, w, h, r); else ctx.rect(-w / 2, -h / 2, w, h); break; }
    case "heart": { const s = w / 2; ctx.moveTo(0, s * 0.75); ctx.bezierCurveTo(-s * 1.4, -s * 0.2, -s * 0.6, -s * 1.15, 0, -s * 0.45); ctx.bezierCurveTo(s * 0.6, -s * 1.15, s * 1.4, -s * 0.2, 0, s * 0.75); break; }
    case "star": { const R = w / 2, r = R * 0.45; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); break; }
    case "linear": ctx.rect(-W * 3, 0, W * 6, H * 3); break;
    case "mirror": ctx.rect(-W * 3, -h / 2, W * 6, h); break;
  }
  ctx.restore();
}

/* ---------- effects (fx track clips) ---------- */
const EFFECTS = {
  blur: "Làm mờ", vignette: "Tối viền", grain: "Hạt phim", glitch: "Nhiễu số", shake: "Rung máy", flash: "Loé sáng", letterbox: "Khung điện ảnh",
  zoompulse: "Nhịp phóng", vhs: "Băng VHS", leak: "Ánh sáng rò", rgb: "Tách màu RGB", mirror: "Soi gương", snow: "Tuyết rơi", sparkle: "Lấp lánh", hearts: "Tim bay", fadeblack: "Tối dần", bwflash: "Đen trắng chớp", softglow: "Hào quang mềm"
};
function seeded(i) { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
function applyEffect(ctx, W, H, fx, lt, len, T) {
  const k = kfVal(fx, "amt", lt, fx.amt == null ? 1 : fx.amt), sp = fx.speed || 1;
  const snap = () => { const s = scratch("fxsnap", W, H); s.ctx.clearRect(0, 0, W, H); s.ctx.drawImage(ctx.canvas, 0, 0); return s.canvas; };
  switch (fx.effect) {
    case "blur": { const c2 = snap(); ctx.save(); ctx.filter = `blur(${(14 * k) * W / 1080}px)`; ctx.drawImage(c2, 0, 0); ctx.restore(); break; }
    case "vignette": { const gr = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75); gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, `rgba(0,0,0,${0.85 * k})`); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H); break; }
    case "grain": case "vhs": case "rgb": case "glitch": case "softglow": case "bwflash": {
      const P = {};
      if (fx.effect === "grain") P.grain = 0.9 * k;
      if (fx.effect === "vhs") { P.grain = 0.5 * k; P.rgb = 0.35 * k; P.s = -0.2 * k; P.fade = 0.12 * k; }
      if (fx.effect === "rgb") P.rgb = (0.6 + 0.4 * Math.sin(lt * sp * 6)) * k;
      if (fx.effect === "glitch") { const burst = seeded(Math.floor(T * 12 * sp)) > 0.55; P.rgb = burst ? 1.4 * k : 0.15 * k; }
      if (fx.effect === "softglow") { P.b = 0.06 * k; P.c = -0.12 * k; P.hi = 0.25 * k; }
      if (fx.effect === "bwflash") { const on = Math.floor(lt * 4 * sp) % 2 === 0; if (on) { P.s = -1; P.c = 0.25 * k; } }
      const out = GLFX.run(ctx.canvas, 0, 0, W, H, P, { time: T, maxSide: Math.max(W, H), fullW: W, fullH: H });
      if (out) { ctx.save(); ctx.globalCompositeOperation = "copy"; ctx.drawImage(out, 0, 0, W, H); ctx.restore(); }
      if (fx.effect === "glitch" && seeded(Math.floor(T * 12 * sp) + 5) > 0.55) { const c2 = snap(); for (let i = 0; i < 6; i++) { const y = seeded(i + Math.floor(T * 24)) * H, h = (0.01 + 0.05 * seeded(i * 3 + Math.floor(T * 24))) * H, dx = (seeded(i * 7 + Math.floor(T * 30)) - 0.5) * 0.12 * W * k; ctx.drawImage(c2, 0, y, W, h, dx, y, W, h); } }
      if (fx.effect === "vhs") { ctx.save(); ctx.globalAlpha = 0.12 * k; ctx.fillStyle = "#000"; for (let y = (T * 40) % 6; y < H; y += 6 * H / 1920) ctx.fillRect(0, y, W, 2 * H / 1920); ctx.restore(); }
      if (fx.effect === "softglow") { const c2 = snap(); ctx.save(); ctx.globalCompositeOperation = "screen"; ctx.globalAlpha = 0.45 * k; ctx.filter = `blur(${18 * W / 1080}px)`; ctx.drawImage(c2, 0, 0); ctx.restore(); }
      break;
    }
    case "shake": { const c2 = snap(), a = 0.018 * k, dx = (Math.sin(T * 47 * sp) + Math.sin(T * 31 * sp)) * a * W, dy = (Math.cos(T * 53 * sp) + Math.sin(T * 37 * sp)) * a * H * 0.6; ctx.save(); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); ctx.translate(W / 2 + dx, H / 2 + dy); ctx.scale(1.06, 1.06); ctx.drawImage(c2, -W / 2, -H / 2); ctx.restore(); break; }
    case "zoompulse": { const c2 = snap(), ph = (lt * sp * 2) % 1, z = 1 + 0.1 * k * Math.exp(-ph * 6); ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.drawImage(c2, -W / 2, -H / 2); ctx.restore(); break; }
    case "flash": { const ph = (lt * sp * 1.5) % 1; ctx.save(); ctx.globalAlpha = Math.exp(-ph * 7) * 0.9 * k; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H); ctx.restore(); break; }
    case "fadeblack": { ctx.save(); ctx.globalAlpha = clamp(lt / Math.max(0.1, len), 0, 1) * k; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); ctx.restore(); break; }
    case "letterbox": { const h = H * 0.11 * k * clamp(lt / 0.4, 0, 1); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, h); ctx.fillRect(0, H - h, W, h); break; }
    case "leak": { const x = W * (0.2 + 0.6 * (0.5 + 0.5 * Math.sin(T * 0.8 * sp))), gr = ctx.createRadialGradient(x, H * 0.25, 0, x, H * 0.25, W * 0.9); gr.addColorStop(0, `rgba(255,170,90,${0.55 * k})`); gr.addColorStop(0.5, `rgba(255,90,60,${0.18 * k})`); gr.addColorStop(1, "rgba(255,90,60,0)"); ctx.save(); ctx.globalCompositeOperation = "screen"; ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H); ctx.restore(); break; }
    case "mirror": { const c2 = snap(); ctx.save(); ctx.translate(W, 0); ctx.scale(-1, 1); ctx.drawImage(c2, 0, 0, W / 2, H, 0, 0, W / 2, H); ctx.restore(); break; }
    case "snow": case "sparkle": case "hearts": {
      const n = Math.round((fx.effect === "snow" ? 90 : 40) * k);
      ctx.save();
      for (let i = 0; i < n; i++) {
        const r0 = seeded(i), r1 = seeded(i + 100), r2 = seeded(i + 200), spd = 0.05 + 0.12 * r2;
        if (fx.effect === "snow") { const y = ((r1 + T * spd * sp) % 1) * H, x = (r0 * W + Math.sin(T * 1.3 + i) * 18 * W / 1080); ctx.globalAlpha = 0.5 + 0.5 * r2; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, y, (2 + 5 * r2) * W / 1080, 0, Math.PI * 2); ctx.fill(); }
        else if (fx.effect === "sparkle") { const tw = 0.5 + 0.5 * Math.sin(T * (3 + 4 * r2) * sp + i), x = r0 * W, y = r1 * H, s = (6 + 16 * r2) * W / 1080 * tw; ctx.globalAlpha = tw; ctx.fillStyle = i % 3 ? "#fff" : GOLD; ctx.beginPath(); ctx.moveTo(x, y - s); ctx.quadraticCurveTo(x, y, x + s, y); ctx.quadraticCurveTo(x, y, x, y + s); ctx.quadraticCurveTo(x, y, x - s, y); ctx.quadraticCurveTo(x, y, x, y - s); ctx.fill(); }
        else { const y = H - ((r1 + T * spd * sp) % 1) * H * 1.1, x = r0 * W + Math.sin(T * 2 + i) * 30 * W / 1080, s = (14 + 22 * r2) * W / 1080; ctx.globalAlpha = 0.85; ctx.font = `${s * 2}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(i % 2 ? "💙" : "🤍", x, y); }
      }
      ctx.restore(); break;
    }
  }
}

/* ---------- transitions (between main-track clips) ---------- */
const TRANSITIONS = { fade: "Hoà tan", black: "Qua đen", white: "Loé trắng", slideL: "Đẩy sang trái", slideR: "Đẩy sang phải", slideU: "Đẩy lên", slideD: "Đẩy xuống", wipeL: "Gạt trái", wipeR: "Gạt phải", circle: "Mở tròn", zoom: "Phóng xuyên", spin: "Xoay", blur: "Nhoè", glitch: "Nhiễu số", whip: "Lia nhanh", cover: "Trượt phủ" };
function mixTransition(ctx, W, H, type, p, A, B, T) { // A, B: full-frame canvases
  const e = EASE.inout(p);
  ctx.save();
  switch (type) {
    case "black": case "white": { ctx.drawImage(p < 0.5 ? A : B, 0, 0); ctx.globalAlpha = 1 - Math.abs(p - 0.5) * 2; ctx.fillStyle = type === "black" ? "#000" : "#fff"; ctx.fillRect(0, 0, W, H); break; }
    case "slideL": case "slideR": { const d = type === "slideL" ? -1 : 1; ctx.drawImage(A, d * e * W, 0); ctx.drawImage(B, d * (e - 1) * W, 0); break; }
    case "slideU": case "slideD": { const d = type === "slideU" ? -1 : 1; ctx.drawImage(A, 0, d * e * H); ctx.drawImage(B, 0, d * (e - 1) * H); break; }
    case "cover": { ctx.drawImage(A, 0, 0); ctx.drawImage(B, (1 - e) * W, 0); break; }
    case "wipeL": case "wipeR": { ctx.drawImage(A, 0, 0); ctx.beginPath(); if (type === "wipeR") ctx.rect(0, 0, W * e, H); else ctx.rect(W * (1 - e), 0, W * e, H); ctx.clip(); ctx.drawImage(B, 0, 0); break; }
    case "circle": { ctx.drawImage(A, 0, 0); ctx.beginPath(); ctx.arc(W / 2, H / 2, Math.hypot(W, H) / 2 * e, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(B, 0, 0); break; }
    case "zoom": { const z = 1 + 1.5 * e; ctx.globalAlpha = 1; if (p < 0.5) { ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.drawImage(A, -W / 2, -H / 2); } else { const z2 = 2.5 - 1.5 * e; ctx.translate(W / 2, H / 2); ctx.scale(z2 * 0.4 + 0.6, z2 * 0.4 + 0.6); ctx.drawImage(B, -W / 2, -H / 2); } break; }
    case "spin": { const img = p < 0.5 ? A : B, a = (p < 0.5 ? e : e - 1) * Math.PI, z = 1 - 0.35 * Math.sin(p * Math.PI); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); ctx.translate(W / 2, H / 2); ctx.rotate(a); ctx.scale(z, z); ctx.drawImage(img, -W / 2, -H / 2); break; }
    case "blur": { const b = Math.sin(p * Math.PI) * 30 * W / 1080; ctx.filter = `blur(${b}px)`; ctx.drawImage(A, 0, 0); ctx.globalAlpha = e; ctx.drawImage(B, 0, 0); break; }
    case "whip": { const d = -1, b = Math.sin(p * Math.PI) * 40 * W / 1080; ctx.filter = `blur(${b}px)`; ctx.drawImage(A, d * e * W, 0); ctx.drawImage(B, d * (e - 1) * W, 0); break; }
    case "glitch": { ctx.drawImage(p < 0.5 ? A : B, 0, 0); const src = p < 0.5 ? B : A, n = 8; for (let i = 0; i < n; i++) { if (seeded(i + Math.floor(T * 30)) > Math.sin(p * Math.PI)) continue; const y = seeded(i * 5 + Math.floor(T * 30)) * H, h = (0.02 + 0.08 * seeded(i * 9)) * H, dx = (seeded(i * 11 + Math.floor(T * 40)) - 0.5) * 0.2 * W; ctx.drawImage(src, 0, y, W, h, dx, y, W, h); } break; }
    default: { ctx.drawImage(A, 0, 0); ctx.globalAlpha = e; ctx.drawImage(B, 0, 0); }
  }
  ctx.restore();
}

/* ---------- stickers ---------- */
const STICKER_SHAPES = { arrow: "Mũi tên", ring: "Vòng tròn", underline: "Gạch chân", star: "Ngôi sao", heart: "Trái tim", check: "Dấu tích", cross: "Dấu chéo", bubble: "Bóng thoại", badge: "Huy hiệu", spark: "Tia sáng", burst: "Nổ", pin: "Ghim vị trí" };
const STICKER_EMOJI = ["❤️", "💙", "🔥", "⭐", "✨", "👍", "👏", "😍", "😮", "😂", "🥰", "🎉", "💯", "✅", "❌", "⚡", "💎", "🌸", "💋", "👉", "👈", "👇", "☝️", "📍", "💡", "🎯", "🏆", "📣", "🔔", "💰", "🛍️", "📞", "💬", "🙌", "🤩", "😎", "🌟", "🎁", "📌", "⏰"];
function drawStickerShape(ctx, shape, size, color, fill) {
  const s = size / 2; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = Math.max(3, size * 0.07);
  ctx.beginPath();
  switch (shape) {
    case "arrow": ctx.moveTo(-s, 0); ctx.lineTo(s * 0.7, 0); ctx.stroke(); ctx.beginPath(); ctx.moveTo(s * 0.25, -s * 0.45); ctx.lineTo(s, 0); ctx.lineTo(s * 0.25, s * 0.45); ctx.stroke(); return;
    case "ring": ctx.ellipse(0, 0, s, s * 0.8, -0.12, 0, Math.PI * 2); ctx.stroke(); return;
    case "underline": ctx.moveTo(-s, s * 0.1); ctx.bezierCurveTo(-s * 0.4, -s * 0.12, s * 0.3, s * 0.18, s, -s * 0.04); ctx.lineWidth *= 1.4; ctx.stroke(); return;
    case "star": for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? s * 0.45 : s; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); fill ? ctx.fill() : ctx.stroke(); return;
    case "heart": ctx.moveTo(0, s * 0.75); ctx.bezierCurveTo(-s * 1.4, -s * 0.2, -s * 0.6, -s * 1.15, 0, -s * 0.45); ctx.bezierCurveTo(s * 0.6, -s * 1.15, s * 1.4, -s * 0.2, 0, s * 0.75); fill ? ctx.fill() : ctx.stroke(); return;
    case "check": ctx.moveTo(-s * 0.7, 0); ctx.lineTo(-s * 0.15, s * 0.55); ctx.lineTo(s * 0.8, -s * 0.6); ctx.lineWidth *= 1.6; ctx.stroke(); return;
    case "cross": ctx.moveTo(-s * 0.6, -s * 0.6); ctx.lineTo(s * 0.6, s * 0.6); ctx.moveTo(s * 0.6, -s * 0.6); ctx.lineTo(-s * 0.6, s * 0.6); ctx.lineWidth *= 1.6; ctx.stroke(); return;
    case "bubble": if (ctx.roundRect) ctx.roundRect(-s, -s * 0.6, s * 2, s * 1.1, s * 0.3); else ctx.rect(-s, -s * 0.6, s * 2, s * 1.1); ctx.moveTo(-s * 0.4, s * 0.5); ctx.lineTo(-s * 0.6, s * 0.95); ctx.lineTo(-s * 0.05, s * 0.5); fill ? ctx.fill() : ctx.stroke(); return;
    case "badge": for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12, r = i % 2 ? s * 0.86 : s; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill(); return;
    case "spark": for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.moveTo(Math.cos(a) * s * 0.35, Math.sin(a) * s * 0.35); ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s); } ctx.stroke(); return;
    case "burst": for (let i = 0; i < 28; i++) { const a = i * Math.PI / 14, r = i % 2 ? s * 0.62 : s; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill(); return;
    case "pin": ctx.moveTo(0, s); ctx.bezierCurveTo(-s * 0.9, 0, -s * 0.75, -s, 0, -s); ctx.bezierCurveTo(s * 0.75, -s, s * 0.9, 0, 0, s); ctx.fill(); ctx.beginPath(); ctx.fillStyle = "#fff"; ctx.arc(0, -s * 0.35, s * 0.28, 0, Math.PI * 2); ctx.fill(); return;
  }
}
