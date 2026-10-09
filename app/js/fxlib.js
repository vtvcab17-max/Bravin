"use strict";
/* ============================================================================
   Effect & transition library modelled on Premiere's catalogue (own code):
   blur/sharpen, distort (lens, wave, twirl, spherize, turbulent, corner pin,
   mirror, kaleidoscope, magnify, offset, replicate), stylize (mosaic,
   posterize, find edges, emboss, halftone, threshold, invert, tint, colour
   pass / replace, noise), light (lens flare, 4-colour gradient, strobe),
   time (echo), transform, crop, venetian blinds, timecode; plus ~20
   Premiere-style transitions and constant-power audio fades at cuts.
   Effect parameters live in fx.p = {key: value}.
   ========================================================================== */
const FX2 = {}; // key → {n, cat, params:{k:[label,min,max,def,step,type]}, run(ctx,W,H,fx,lt,len,T,k,P)}
const FX_CATS = ["Làm mờ và làm nét", "Biến dạng", "Phong cách", "Ánh sáng và màu", "Thời gian", "Biến đổi", "Có sẵn của Bravin"];
const fxP = (fx, key) => { const d = FX2[fx.effect] && FX2[fx.effect].params[key]; const v = fx.p && fx.p[key]; return v == null ? (d ? d[3] : 0) : v; };

/* ---------- pixel-effect shader (separate WebGL context) ---------- */
const FXGL = (() => {
  let cnv = null, gl = null, prog = null, tex = null, U = {}, ok = null;
  const VS = `attribute vec2 p; varying vec2 uv; void main(){ uv = vec2((p.x+1.)*.5, 1.-(p.y+1.)*.5); gl_Position = vec4(p,0.,1.); }`;
  const FS = `precision highp float; varying vec2 uv; uniform sampler2D T; uniform vec2 res; uniform float mode, time, mixAmt; uniform vec4 p0, p1;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(hash(i), hash(i+vec2(1.,0.)), f.x), mix(hash(i+vec2(0.,1.)), hash(i+1.), f.x), f.y); }
  float cr(vec2 a, vec2 b){ return a.x*b.y - a.y*b.x; }
  vec3 rgb2hsv(vec3 c){ vec4 K = vec4(0., -1./3., 2./3., -1.); vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g)); vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r)); float d = q.x - min(q.w, q.y); return vec3(abs(q.z + (q.w - q.y) / (6.*d + 1e-10)), d / (q.x + 1e-10), q.x); }
  vec3 hsv2rgb(vec3 c){ vec3 p = abs(fract(c.xxx + vec3(1., 2./3., 1./3.)) * 6. - 3.); return c.z * mix(vec3(1.), clamp(p - 1., 0., 1.), c.y); }
  void main(){
    int m = int(mode + .5); vec2 u = uv; float ar = res.x / res.y; vec2 A = vec2(ar, 1.); bool outside = false;
    if (m == 5) { vec2 q = u - .5; float r2 = dot(q*A, q*A); u = .5 + q * (1. + p0.x * r2 * 1.6); }
    else if (m == 6) { if (p0.w < .5) u.x += sin(u.y * p0.y * 6.2832 + time * p0.z) * p0.x; else u.y += sin(u.x * p0.y * 6.2832 + time * p0.z) * p0.x; }
    else if (m == 7) { vec2 q = (u - p1.xy) * A; float d = length(q); if (d < p0.y) { float k = 1. - d / p0.y; float a = p0.x * k * k; float s = sin(a), c = cos(a); q = mat2(c, -s, s, c) * q; } u = p1.xy + q / A; }
    else if (m == 8) { vec2 q = (u - p1.xy) * A; float d = length(q); if (d < p0.y && d > 1e-5) { float nd = d / p0.y; float f = p0.x > 0. ? pow(nd, 1. + p0.x * 1.5) : pow(nd, 1. / (1. - p0.x * .8)); q *= f * p0.y / d; } u = p1.xy + q / A; }
    else if (m == 11) { u = fract(u - p0.xy); }
    else if (m == 12) { vec2 n = vec2(cos(p0.x), sin(p0.x)); vec2 q = (u - p1.xy) * A; float d = dot(q, n); if (d < 0.) q -= 2. * d * n; u = p1.xy + q / A; }
    else if (m == 13) { vec2 q = (u - .5) * A; float a = atan(q.y, q.x) + p0.y; float r = length(q); float seg = 6.2832 / max(2., p0.x); a = mod(a, seg); a = abs(a - seg * .5); q = r * vec2(cos(a), sin(a)); u = .5 + q / A; }
    else if (m == 14) { float n1 = noise(u * p0.y + time * p0.z), n2 = noise(u * p0.y + 17.3 + time * p0.z); u += (vec2(n1, n2) - .5) * p0.x; }
    else if (m == 15) { u = fract(u * max(1., floor(p0.x + .5))); }
    else if (m == 16) { vec2 q = (u - p1.xy) * A; float d = length(q); if (d < p0.y) u = p1.xy + q / max(1., p0.x) / A; }
    else if (m == 17) { vec2 a = p0.xy, b = p0.zw, c = p1.xy, d = p1.zw, e = b - a, f = d - a, g = a - b + c - d, h = u - a;
      float k2 = cr(g, f), k1 = cr(e, f) + cr(h, g), k0 = cr(h, e), v;
      if (abs(k2) < 1e-5) v = -k0 / k1; else { float w = k1*k1 - 4.*k0*k2; if (w < 0.) { outside = true; w = 0.; } w = sqrt(w); v = (-k1 - w) / (2.*k2); if (v < 0. || v > 1.) v = (-k1 + w) / (2.*k2); }
      float den = e.x + g.x * v; float uu = abs(den) > 1e-5 ? (h.x - f.x * v) / den : (h.y - f.y * v) / (e.y + g.y * v); u = vec2(uu, v); }
    else if (m == 21) { vec2 cell = vec2(max(2., p0.x)) / res; vec2 c = (floor(u / cell) + .5) * cell; u = c; }
    vec4 orig = texture2D(T, uv), col = texture2D(T, clamp(u, 0., 1.));
    if (outside || u.x < -.001 || u.y < -.001 || u.x > 1.001 || u.y > 1.001) col = vec4(0., 0., 0., 1.);
    float l = dot(col.rgb, vec3(.299, .587, .114));
    if (m == 1) { float L = max(2., p0.x); col.rgb = floor(col.rgb * (L - .001)) / (L - 1.); }
    else if (m == 2) { col.rgb = 1. - col.rgb; }
    else if (m == 3) { col.rgb = mix(p0.rgb, p1.rgb, l); }
    else if (m == 4) { col.rgb = vec3(step(p0.x, l)); }
    else if (m == 9) { float n = hash(uv * res + fract(time) * 91.) - .5; col.rgb += p0.y > .5 ? vec3(n, hash(uv * res + 3.1 + time) - .5, hash(uv * res + 7.7 + time) - .5) * p0.x : vec3(n) * p0.x; }
    else if (m == 10) { vec2 px = 1. / res; float l0 = dot(texture2D(T, uv).rgb, vec3(.333)); float lx = dot(texture2D(T, uv + vec2(px.x, 0.)).rgb, vec3(.333)); float ly = dot(texture2D(T, uv + vec2(0., px.y)).rgb, vec3(.333)); float e = clamp(length(vec2(lx - l0, ly - l0)) * 8., 0., 1.); col.rgb = p0.x > .5 ? vec3(e) : vec3(1. - e); }
    else if (m == 18) { vec2 px = p0.y / res; vec3 a = texture2D(T, uv - px).rgb, b = texture2D(T, uv + px).rgb; col.rgb = vec3(dot(b - a, vec3(.333)) * p0.x * 3. + .5); }
    else if (m == 19) { vec3 hv = rgb2hsv(col.rgb); float dh = abs(fract(hv.x - p0.x + .5) - .5); float keep = 1. - smoothstep(p0.y, p0.y + .06, dh); if (p0.z > .5) keep = 1. - keep; col.rgb = mix(vec3(l), col.rgb, keep); }
    else if (m == 20) { vec3 hv = rgb2hsv(col.rgb); float dh = abs(fract(hv.x - p0.x + .5) - .5); float keep = (1. - smoothstep(p0.y, p0.y + .06, dh)) * smoothstep(.05, .2, hv.y); hv.x = mix(hv.x, p0.z, keep); col.rgb = hsv2rgb(hv); }
    else if (m == 21) { vec2 cell = vec2(max(2., p0.x)) / res; vec2 c = (floor(uv / cell) + .5) * cell; float d = length((uv - c) / cell); float dt = step(d, sqrt(1. - l) * .72); col.rgb = p0.y > .5 ? vec3(1. - dt) : mix(vec3(.96), col.rgb * .9, dt); }
    gl_FragColor = vec4(mix(orig.rgb, col.rgb, clamp(mixAmt, 0., 1.)), 1.);
  }`;
  function init() {
    if (ok !== null) return ok;
    try {
      cnv = document.createElement("canvas"); gl = cnv.getContext("webgl", { premultipliedAlpha: false, preserveDrawingBuffer: true }); if (!gl) return ok = false;
      const sh = (ty, src) => { const s = gl.createShader(ty); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS.replace("precision highp float", gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT).precision ? "precision highp float" : "precision mediump float"))); gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog)); gl.useProgram(prog);
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); for (const [a, b] of [[gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR]]) gl.texParameteri(gl.TEXTURE_2D, a, b);
      for (const n of ["T", "res", "mode", "time", "mixAmt", "p0", "p1"]) U[n] = gl.getUniformLocation(prog, n); gl.uniform1i(U.T, 0);
      return ok = true;
    } catch (e) { console.warn("FX shader off:", e); return ok = false; }
  }
  function run(ctx, W, H, mode, p0, p1, mixAmt, time) {
    if (!init()) return false; const k = Math.min(1, 1600 / Math.max(W, H)), w = Math.round(W * k), h = Math.round(H * k);
    if (cnv.width !== w || cnv.height !== h) { cnv.width = w; cnv.height = h; } gl.viewport(0, 0, w, h);
    gl.bindTexture(gl.TEXTURE_2D, tex); try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, ctx.canvas); } catch (e) { return false; }
    gl.uniform2f(U.res, w, h); gl.uniform1f(U.mode, mode); gl.uniform1f(U.time, time % 1000); gl.uniform1f(U.mixAmt, mixAmt);
    gl.uniform4fv(U.p0, p0 || [0, 0, 0, 0]); gl.uniform4fv(U.p1, p1 || [0, 0, 0, 0]); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    ctx.save(); ctx.globalCompositeOperation = "copy"; ctx.globalAlpha = 1; ctx.filter = "none"; ctx.drawImage(cnv, 0, 0, W, H); ctx.restore(); return true;
  }
  return { run };
})();

/* ---------- definitions ---------- */
const deg = Math.PI / 180;
function def(key, n, cat, params, run) { FX2[key] = { n, cat, params, run }; EFFECTS[key] = n; }
const snapOf = (ctx, W, H) => { const s = scratch("fx2snap", W, H); s.ctx.clearRect(0, 0, W, H); s.ctx.drawImage(ctx.canvas, 0, 0); return s.canvas; };
const sh = (mode, p0f, p1f) => (ctx, W, H, fx, lt, len, T, k) => FXGL.run(ctx, W, H, mode, p0f ? p0f(fx, k, lt) : null, p1f ? p1f(fx, k, lt) : null, 1, T * (fx.speed || 1));
const shMix = (mode, p0f, p1f) => (ctx, W, H, fx, lt, len, T, k) => FXGL.run(ctx, W, H, mode, p0f ? p0f(fx, k, lt) : null, p1f ? p1f(fx, k, lt) : null, k, T * (fx.speed || 1));
const C2 = [0.5, 0.5];
// blur & sharpen
def("gblur", "Gaussian Blur", 0, { r: ["Độ mờ", 0, 100, 20, 0.5], dim: ["Hướng", 0, 2, 0, 1, ["Cả hai", "Ngang", "Dọc"]] }, (ctx, W, H, fx, lt, len, T, k) => {
  const r = fxP(fx, "r") * k * W / 1080, dim = fxP(fx, "dim"), src = snapOf(ctx, W, H); if (r < 0.3) return;
  ctx.save(); if (!dim) { ctx.filter = `blur(${r}px)`; ctx.drawImage(src, 0, 0); } else { const n = 12; ctx.globalCompositeOperation = "copy"; ctx.drawImage(src, 0, 0); ctx.globalCompositeOperation = "source-over"; for (let i = 0; i < n; i++) { const o = (i / (n - 1) - 0.5) * 2 * r; ctx.globalAlpha = 1 / (i + 1); ctx.drawImage(src, dim === 1 ? o : 0, dim === 2 ? o : 0); } } ctx.restore();
});
def("dblur", "Directional Blur", 0, { a: ["Hướng (°)", -180, 180, 0, 1], l: ["Độ dài", 0, 100, 25, 0.5] }, (ctx, W, H, fx, lt, len, T, k) => {
  const L = fxP(fx, "l") * k * W / 1080, a = fxP(fx, "a") * deg, src = snapOf(ctx, W, H), n = 14; if (L < 0.5) return;
  ctx.save(); ctx.globalCompositeOperation = "copy"; ctx.drawImage(src, 0, 0); ctx.globalCompositeOperation = "source-over"; for (let i = 0; i < n; i++) { const o = (i / (n - 1) - 0.5) * L; ctx.globalAlpha = 1 / (i + 1); ctx.drawImage(src, Math.cos(a) * o, Math.sin(a) * o); } ctx.restore();
});
def("zblur", "Radial Blur (Zoom)", 0, { a: ["Mức", 0, 100, 30, 0.5], x: ["Tâm X", 0, 1, 0.5, 0.01], y: ["Tâm Y", 0, 1, 0.5, 0.01] }, (ctx, W, H, fx, lt, len, T, k) => {
  const A = fxP(fx, "a") * k / 400, cx = fxP(fx, "x") * W, cy = fxP(fx, "y") * H, src = snapOf(ctx, W, H), n = 12; if (A < 0.002) return;
  ctx.save(); ctx.globalCompositeOperation = "copy"; ctx.drawImage(src, 0, 0); ctx.globalCompositeOperation = "source-over"; for (let i = 1; i < n; i++) { const z = 1 + A * i / n; ctx.globalAlpha = 1 / (i + 1); ctx.setTransform(z, 0, 0, z, cx - cx * z, cy - cy * z); ctx.drawImage(src, 0, 0); } ctx.restore();
});
def("sharpen", "Sharpen", 0, { a: ["Mức", 0, 100, 40, 1] }, (ctx, W, H, fx, lt, len, T, k) => { const out = GLFX.run(ctx.canvas, 0, 0, W, H, { sharp: fxP(fx, "a") / 50 * k }, { time: T, maxSide: Math.max(W, H), fullW: W, fullH: H }); if (out) { ctx.save(); ctx.globalCompositeOperation = "copy"; ctx.drawImage(out, 0, 0, W, H); ctx.restore(); } });
// distort
def("lens", "Lens Distortion", 1, { c: ["Độ cong", -100, 100, 35, 1] }, sh(5, (fx, k) => [fxP(fx, "c") / 100 * k, 0, 0, 0]));
def("wave", "Wave Warp", 1, { a: ["Biên độ", 0, 100, 20, 1], f: ["Tần số", 0.5, 30, 6, 0.5], s: ["Tốc độ", 0, 20, 4, 0.1], d: ["Hướng", 0, 1, 0, 1, ["Ngang", "Dọc"]] }, sh(6, (fx, k) => [fxP(fx, "a") / 1000 * k, fxP(fx, "f"), fxP(fx, "s"), fxP(fx, "d")]));
def("twirl", "Twirl", 1, { a: ["Góc (°)", -720, 720, 180, 1], r: ["Bán kính", 0.05, 1.5, 0.5, 0.01], x: ["Tâm X", 0, 1, 0.5, 0.01], y: ["Tâm Y", 0, 1, 0.5, 0.01] }, sh(7, (fx, k) => [fxP(fx, "a") * deg * k, fxP(fx, "r"), 0, 0], fx => [fxP(fx, "x"), fxP(fx, "y"), 0, 0]));
def("spherize", "Spherize", 1, { a: ["Mức", -100, 100, 60, 1], r: ["Bán kính", 0.05, 1.5, 0.45, 0.01], x: ["Tâm X", 0, 1, 0.5, 0.01], y: ["Tâm Y", 0, 1, 0.5, 0.01] }, sh(8, (fx, k) => [fxP(fx, "a") / 100 * k, fxP(fx, "r"), 0, 0], fx => [fxP(fx, "x"), fxP(fx, "y"), 0, 0]));
def("turb", "Turbulent Displace", 1, { a: ["Mức", 0, 100, 20, 1], s: ["Kích thước", 1, 40, 8, 0.5], e: ["Biến đổi", 0, 5, 0.6, 0.05] }, sh(14, (fx, k) => [fxP(fx, "a") / 400 * k, fxP(fx, "s"), fxP(fx, "e"), 0]));
def("cornerpin", "Corner Pin", 1, { tlx: ["Trên trái X", -0.5, 1.5, 0, 0.005], tly: ["Trên trái Y", -0.5, 1.5, 0, 0.005], trx: ["Trên phải X", -0.5, 1.5, 1, 0.005], try_: ["Trên phải Y", -0.5, 1.5, 0, 0.005], brx: ["Dưới phải X", -0.5, 1.5, 1, 0.005], bry: ["Dưới phải Y", -0.5, 1.5, 1, 0.005], blx: ["Dưới trái X", -0.5, 1.5, 0, 0.005], bly: ["Dưới trái Y", -0.5, 1.5, 1, 0.005] },
  sh(17, (fx, k) => { const l = (a, d) => d + (a - d) * k; return [l(fxP(fx, "tlx"), 0), l(fxP(fx, "tly"), 0), l(fxP(fx, "trx"), 1), l(fxP(fx, "try_"), 0)]; }, (fx, k) => { const l = (a, d) => d + (a - d) * k; return [l(fxP(fx, "brx"), 1), l(fxP(fx, "bry"), 1), l(fxP(fx, "blx"), 0), l(fxP(fx, "bly"), 1)]; }));
def("mirror2", "Mirror", 1, { a: ["Góc phản chiếu (°)", -180, 180, 0, 1], x: ["Tâm X", 0, 1, 0.5, 0.01], y: ["Tâm Y", 0, 1, 0.5, 0.01] }, sh(12, fx => [fxP(fx, "a") * deg, 0, 0, 0], fx => [fxP(fx, "x"), fxP(fx, "y"), 0, 0]));
def("kaleido", "Kaleidoscope", 1, { n: ["Số cánh", 2, 16, 6, 1], r: ["Xoay (°)", -180, 180, 0, 1] }, shMix(13, (fx, k, lt) => [fxP(fx, "n"), fxP(fx, "r") * deg + lt * 0, 0, 0]));
def("magnify", "Magnify", 1, { m: ["Phóng đại", 1, 6, 2, 0.05], r: ["Bán kính", 0.05, 0.8, 0.22, 0.01], x: ["Tâm X", 0, 1, 0.5, 0.01], y: ["Tâm Y", 0, 1, 0.5, 0.01] }, sh(16, (fx, k) => [1 + (fxP(fx, "m") - 1) * k, fxP(fx, "r"), 0, 0], fx => [fxP(fx, "x"), fxP(fx, "y"), 0, 0]));
def("offset", "Offset", 1, { x: ["Dịch X", -1, 1, 0.25, 0.005], y: ["Dịch Y", -1, 1, 0, 0.005] }, sh(11, (fx, k) => [fxP(fx, "x") * k, fxP(fx, "y") * k, 0, 0]));
def("replicate", "Replicate", 1, { n: ["Số ô mỗi cạnh", 2, 8, 2, 1] }, shMix(15, fx => [fxP(fx, "n"), 0, 0, 0]));
// stylize
def("mosaic", "Mosaic", 2, { n: ["Số khối ngang", 4, 200, 40, 1] }, (ctx, W, H, fx, lt, len, T, k) => { const n = Math.max(2, Math.round(fxP(fx, "n") / Math.max(0.05, k))), m = Math.max(2, Math.round(n * H / W)), src = snapOf(ctx, W, H), s = scratch("mosaic", n, m); s.ctx.imageSmoothingEnabled = true; s.ctx.drawImage(src, 0, 0, n, m); ctx.save(); ctx.imageSmoothingEnabled = false; ctx.globalCompositeOperation = "copy"; ctx.drawImage(s.canvas, 0, 0, n, m, 0, 0, W, H); ctx.restore(); });
def("posterize", "Posterize", 2, { n: ["Số mức màu", 2, 32, 5, 1] }, shMix(1, fx => [fxP(fx, "n"), 0, 0, 0]));
def("invert", "Invert", 2, {}, shMix(2));
def("bw", "Black & White", 2, {}, (ctx, W, H, fx, lt, len, T, k) => { const out = GLFX.run(ctx.canvas, 0, 0, W, H, { s: -1 * Math.min(1, k) }, { time: T, maxSide: Math.max(W, H), fullW: W, fullH: H }); if (out) { ctx.save(); ctx.globalCompositeOperation = "copy"; ctx.drawImage(out, 0, 0, W, H); ctx.restore(); } });
def("threshold", "Threshold", 2, { l: ["Ngưỡng", 0, 1, 0.5, 0.01] }, shMix(4, fx => [fxP(fx, "l"), 0, 0, 0]));
def("edges", "Find Edges", 2, { inv: ["Kiểu", 0, 1, 0, 1, ["Nét tối trên nền sáng", "Nét sáng trên nền tối"]] }, shMix(10, fx => [fxP(fx, "inv"), 0, 0, 0]));
def("emboss", "Emboss", 2, { a: ["Độ nổi", 0.2, 4, 1.5, 0.05], d: ["Khoảng cách", 0.5, 6, 1.5, 0.1] }, shMix(18, fx => [fxP(fx, "a"), fxP(fx, "d"), 0, 0]));
def("halftone", "Halftone", 2, { s: ["Cỡ chấm (px)", 3, 40, 10, 1], bw: ["Kiểu", 0, 1, 0, 1, ["Màu", "Đen trắng"]] }, shMix(21, fx => [fxP(fx, "s"), fxP(fx, "bw"), 0, 0]));
def("tint", "Tint", 2, { b: ["Màu tối", 0, 0, "#1b1440", 0, "color"], w: ["Màu sáng", 0, 0, "#ffe2b8", 0, "color"] }, shMix(3, fx => { const a = hexRgb(fxP(fx, "b")); return [a[0], a[1], a[2], 1]; }, fx => { const a = hexRgb(fxP(fx, "w")); return [a[0], a[1], a[2], 1]; }));
def("colorpass", "Leave Color", 2, { h: ["Màu giữ lại (°)", 0, 360, 0, 1], r: ["Độ rộng (°)", 2, 90, 20, 1], inv: ["Chế độ", 0, 1, 0, 1, ["Giữ màu này", "Bỏ màu này"]] }, shMix(19, fx => [fxP(fx, "h") / 360, fxP(fx, "r") / 360, fxP(fx, "inv"), 0]));
def("colorrep", "Change to Color", 2, { h: ["Màu gốc (°)", 0, 360, 200, 1], r: ["Độ rộng (°)", 2, 90, 25, 1], to: ["Đổi thành (°)", 0, 360, 330, 1] }, shMix(20, fx => [fxP(fx, "h") / 360, fxP(fx, "r") / 360, fxP(fx, "to") / 360, 0]));
def("noise2", "Noise", 2, { a: ["Mức", 0, 1, 0.25, 0.01], c: ["Kiểu", 0, 1, 1, 1, ["Đơn sắc", "Màu"]] }, sh(9, (fx, k) => [fxP(fx, "a") * k, fxP(fx, "c"), 0, 0]));
// light & colour
def("flare", "Lens Flare", 3, { x: ["Vị trí X", 0, 1, 0.75, 0.01], y: ["Vị trí Y", 0, 1, 0.22, 0.01], b: ["Độ sáng", 0, 2, 1, 0.01], c: ["Màu", 0, 0, "#ffd9a0", 0, "color"] }, (ctx, W, H, fx, lt, len, T, k) => {
  const x = fxP(fx, "x") * W, y = fxP(fx, "y") * H, B = fxP(fx, "b") * k, [r, g2, b] = hexRgb(fxP(fx, "c")).map(v => Math.round(v * 255)), R = Math.max(W, H);
  ctx.save(); ctx.globalCompositeOperation = "screen";
  const glow = ctx.createRadialGradient(x, y, 0, x, y, R * 0.45); glow.addColorStop(0, `rgba(255,255,255,${0.9 * B})`); glow.addColorStop(0.08, `rgba(${r},${g2},${b},${0.55 * B})`); glow.addColorStop(1, `rgba(${r},${g2},${b},0)`); ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  const cx = W / 2, cy = H / 2; for (const [f, s, a, col] of [[0.35, 0.05, 0.25, "120,180,255"], [0.6, 0.08, 0.18, "255,160,90"], [1.2, 0.03, 0.3, "160,255,200"], [1.5, 0.12, 0.12, "255,120,200"], [1.85, 0.06, 0.2, "255,230,140"]]) { const px = x + (cx - x) * f, py = y + (cy - y) * f, rr = R * s, gr = ctx.createRadialGradient(px, py, rr * 0.5, px, py, rr); gr.addColorStop(0, `rgba(${col},${a * B})`); gr.addColorStop(1, `rgba(${col},0)`); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(px, py, rr, 0, 7); ctx.fill(); }
  ctx.strokeStyle = `rgba(255,255,255,${0.25 * B})`; ctx.lineWidth = Math.max(1, W / 900); ctx.beginPath(); ctx.moveTo(x - R * 0.3, y); ctx.lineTo(x + R * 0.3, y); ctx.stroke(); ctx.restore();
});
def("grad4", "4-Color Gradient", 3, { a: ["Màu 1", 0, 0, "#ff6b9a", 0, "color"], b: ["Màu 2", 0, 0, "#7b6cf6", 0, "color"], c: ["Màu 3", 0, 0, "#4cd9a8", 0, "color"], d: ["Màu 4", 0, 0, "#ffa24c", 0, "color"], m: ["Hoà trộn", 0, 3, 1, 1, ["Bình thường", "Ánh sáng dịu", "Chồng phủ", "Màn hình"]] }, (ctx, W, H, fx, lt, len, T, k) => {
  const s = scratch("grad4", 64, 64), d = s.ctx.createImageData(64, 64), cs = ["a", "b", "c", "d"].map(q => hexRgb(fxP(fx, q)));
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const u = x / 63, v = y / 63, w = [(1 - u) * (1 - v), u * (1 - v), (1 - u) * v, u * v], i = (y * 64 + x) * 4; for (let ch = 0; ch < 3; ch++) d.data[i + ch] = 255 * (cs[0][ch] * w[0] + cs[1][ch] * w[1] + cs[2][ch] * w[2] + cs[3][ch] * w[3]); d.data[i + 3] = 255; }
  s.ctx.putImageData(d, 0, 0); ctx.save(); ctx.globalAlpha = Math.min(1, k) * (fxP(fx, "m") ? 0.85 : 0.55); ctx.globalCompositeOperation = ["source-over", "soft-light", "overlay", "screen"][fxP(fx, "m")] || "source-over"; ctx.imageSmoothingEnabled = true; ctx.drawImage(s.canvas, 0, 0, W, H); ctx.restore();
});
def("strobe", "Strobe Light", 3, { p: ["Chu kỳ (giây)", 0.05, 2, 0.25, 0.01], d: ["Thời gian loé (%)", 5, 90, 30, 1], c: ["Màu", 0, 0, "#ffffff", 0, "color"] }, (ctx, W, H, fx, lt, len, T, k) => { const per = fxP(fx, "p") / (fx.speed || 1), on = (lt % per) / per < fxP(fx, "d") / 100; if (!on) return; ctx.save(); ctx.globalAlpha = Math.min(1, 0.85 * k); ctx.fillStyle = fxP(fx, "c"); ctx.fillRect(0, 0, W, H); ctx.restore(); });
// time
const _echoHist = []; let _echoKey = "";
def("echo", "Echo", 4, { d: ["Độ trễ (giây)", 0.02, 0.5, 0.08, 0.01], n: ["Số lần lặp", 1, 8, 4, 1], dec: ["Mờ dần", 0.1, 0.95, 0.55, 0.01] }, (ctx, W, H, fx, lt, len, T, k) => {
  const key = fx.id + ":" + W + "x" + H + ":" + renderMode; if (key !== _echoKey) { _echoHist.length = 0; _echoKey = key; }
  const s = document.createElement("canvas"); s.width = Math.round(W / 2); s.height = Math.round(H / 2); s.getContext("2d").drawImage(ctx.canvas, 0, 0, s.width, s.height);
  while (_echoHist.length && (_echoHist[_echoHist.length - 1].T >= T || T - _echoHist[0].T > 1.2)) { if (_echoHist[_echoHist.length - 1].T >= T) _echoHist.pop(); else _echoHist.shift(); }
  const D = fxP(fx, "d"), N = fxP(fx, "n"), dec = fxP(fx, "dec"); ctx.save(); ctx.globalCompositeOperation = "lighten";
  for (let i = N; i >= 1; i--) { const want = T - i * D; let best = null; for (const h of _echoHist) if (!best || Math.abs(h.T - want) < Math.abs(best.T - want)) best = h; if (best && Math.abs(best.T - want) < D) { ctx.globalAlpha = Math.pow(dec, i) * Math.min(1, k); ctx.drawImage(best.c, 0, 0, W, H); } }
  ctx.restore(); _echoHist.push({ T, c: s }); if (_echoHist.length > 90) _echoHist.shift();
});
// transform & misc
def("transform2", "Transform", 5, { x: ["Vị trí X", -1, 1, 0, 0.005], y: ["Vị trí Y", -1, 1, 0, 0.005], s: ["Tỉ lệ", 0.1, 4, 1, 0.01], r: ["Xoay (°)", -360, 360, 0, 1], sk: ["Nghiêng (°)", -60, 60, 0, 1], o: ["Độ mờ", 0, 1, 1, 0.01] }, (ctx, W, H, fx, lt, len, T, k) => {
  const src = snapOf(ctx, W, H), l = (v, d) => d + (v - d) * k; ctx.save(); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = l(fxP(fx, "o"), 1);
  ctx.translate(W / 2 + l(fxP(fx, "x"), 0) * W, H / 2 + l(fxP(fx, "y"), 0) * H); ctx.rotate(l(fxP(fx, "r"), 0) * deg); ctx.transform(1, 0, Math.tan(l(fxP(fx, "sk"), 0) * deg), 1, 0, 0); const sc = l(fxP(fx, "s"), 1); ctx.scale(sc, sc); ctx.drawImage(src, -W / 2, -H / 2); ctx.restore();
});
def("crop2", "Crop", 5, { l: ["Trái", 0, 0.5, 0.1, 0.005], r: ["Phải", 0, 0.5, 0.1, 0.005], t: ["Trên", 0, 0.5, 0, 0.005], b: ["Dưới", 0, 0.5, 0, 0.005] }, (ctx, W, H, fx, lt, len, T, k) => { ctx.save(); ctx.fillStyle = "#000"; const L = fxP(fx, "l") * k * W, R = fxP(fx, "r") * k * W, Tt = fxP(fx, "t") * k * H, B = fxP(fx, "b") * k * H; ctx.fillRect(0, 0, L, H); ctx.fillRect(W - R, 0, R, H); ctx.fillRect(0, 0, W, Tt); ctx.fillRect(0, H - B, W, B); ctx.restore(); });
def("blinds", "Venetian Blinds", 5, { c: ["Mức hoàn thành", 0, 1, 0.3, 0.01], a: ["Hướng (°)", -90, 90, 0, 1], w: ["Độ rộng sọc", 10, 300, 80, 1] }, (ctx, W, H, fx, lt, len, T, k) => { const w = fxP(fx, "w") * W / 1080, cpl = fxP(fx, "c") * k, a = fxP(fx, "a") * deg, R = Math.hypot(W, H); ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(a); ctx.fillStyle = "#000"; for (let y = -R; y < R; y += w) ctx.fillRect(-R, y, 2 * R, w * cpl); ctx.restore(); });
def("timecode", "Timecode", 5, { s: ["Cỡ chữ", 16, 120, 44, 1], y: ["Vị trí dọc", 0, 1, 0.92, 0.01] }, (ctx, W, H, fx, lt, len, T) => { const s = fxP(fx, "s") * W / 1080, f = Math.floor((T % 1) * FPS), tc = fmt(T).slice(0, 5) + ":" + String(f).padStart(2, "0"); ctx.save(); ctx.font = `700 ${s}px ui-monospace,monospace`; const w = ctx.measureText(tc).width; ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillRect(W / 2 - w / 2 - s * 0.4, fxP(fx, "y") * H - s * 0.9, w + s * 0.8, s * 1.3); ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.fillText(tc, W / 2, fxP(fx, "y") * H + s * 0.1); ctx.restore(); });

/* hook into the compositor */
const _applyEffect0 = applyEffect;
applyEffect = function (ctx, W, H, fx, lt, len, T) {
  const D = FX2[fx.effect]; if (!D) return _applyEffect0(ctx, W, H, fx, lt, len, T);
  const k = kfVal(fx, "amt", lt, fx.amt == null ? 1 : fx.amt); if (k <= 0.001) return;
  try { D.run(ctx, W, H, fx, lt, len, T, k); } catch (e) { console.warn("effect", fx.effect, e); }
};
function fxCat(k) { return FX2[k] ? FX_CATS[FX2[k].cat] : FX_CATS[6]; }
function fxParamsUI(box, c) {
  const D = FX2[c.effect]; if (!D || !Object.keys(D.params).length) return;
  const b = section(box, "Thông số · " + D.n); const P = () => c.p || {}, setP = (key, v) => { c.p = Object.assign({}, c.p, { [key]: v }); };
  for (const [key, [label, min, max, dv, step, extra]] of Object.entries(D.params)) {
    if (extra === "color") colorIn(b, label, () => P()[key] || dv, v => setP(key, v));
    else if (Array.isArray(extra)) select(b, label, Object.fromEntries(extra.map((n, i) => [String(i), n])), () => String(P()[key] == null ? dv : P()[key]), v => setP(key, +v));
    else slider(b, { label, min, max, step, get: () => P()[key] == null ? dv : P()[key], set: v => setP(key, v), fmt: v => step >= 1 ? String(Math.round(v)) : (+v).toFixed(step < 0.01 ? 3 : 2) });
  }
  btnRow(b, [["Đặt lại thông số", () => { pushUndo(); delete c.p; renderInspector(); drawFrame(); }]]);
}

/* ---------- transitions ---------- */
const TR2 = {
  additive: "Additive Dissolve", film: "Film Dissolve", nonadd: "Non-Additive Dissolve", irisBox: "Iris Box", irisDiamond: "Iris Diamond", irisCross: "Iris Cross", barn: "Barn Doors", band: "Band Wipe", clock: "Clock Wipe", checker: "Checker Wipe", inset: "Inset", split: "Split", pageTurn: "Page Turn", pagePeel: "Page Peel", cube: "Cube Spin", flip: "Flip Over", random: "Random Blocks", blinds: "Venetian Blinds", radial: "Radial Wipe", wedge: "Wedge Wipe", zigzag: "Zig-Zag Blocks", crossZoom: "Cross Zoom", gradient: "Gradient Wipe"
};
Object.assign(TRANSITIONS, TR2);
const _mix0 = mixTransition;
mixTransition = function (ctx, W, H, type, p, A, B, T) {
  if (!TR2[type]) return _mix0(ctx, W, H, type, p, A, B, T);
  const e = EASE.inout(p), cl = path => { ctx.save(); ctx.beginPath(); path(); ctx.clip(); ctx.drawImage(B, 0, 0); ctx.restore(); };
  ctx.save();
  switch (type) {
    case "additive": ctx.globalAlpha = 1; ctx.drawImage(A, 0, 0); ctx.globalAlpha = 1 - e; ctx.globalCompositeOperation = "copy"; ctx.drawImage(A, 0, 0); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = e; ctx.drawImage(B, 0, 0); break;
    case "film": { ctx.drawImage(A, 0, 0); ctx.globalAlpha = Math.pow(e, 0.6); ctx.drawImage(B, 0, 0); break; }
    case "nonadd": { ctx.drawImage(A, 0, 0); ctx.globalCompositeOperation = "lighten"; ctx.globalAlpha = Math.min(1, e * 1.6); ctx.drawImage(B, 0, 0); if (e > 0.6) { ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = (e - 0.6) / 0.4; ctx.drawImage(B, 0, 0); } break; }
    case "irisBox": ctx.drawImage(A, 0, 0); cl(() => ctx.rect(W / 2 - W / 2 * e, H / 2 - H / 2 * e, W * e, H * e)); break;
    case "irisDiamond": { ctx.drawImage(A, 0, 0); const r = (W + H) / 2 * e; cl(() => { ctx.moveTo(W / 2, H / 2 - r); ctx.lineTo(W / 2 + r, H / 2); ctx.lineTo(W / 2, H / 2 + r); ctx.lineTo(W / 2 - r, H / 2); ctx.closePath(); }); break; }
    case "irisCross": { ctx.drawImage(A, 0, 0); const a = W * e * 0.6, b2 = H * e * 0.6, m = Math.max(W, H) * e; cl(() => { ctx.rect(W / 2 - a / 2, H / 2 - m, a, 2 * m); ctx.rect(W / 2 - m, H / 2 - b2 / 2, 2 * m, b2); }); break; }
    case "barn": ctx.drawImage(A, 0, 0); cl(() => ctx.rect(W / 2 - W / 2 * e, 0, W * e, H)); break;
    case "band": { ctx.drawImage(A, 0, 0); const n = 8, h = H / n; cl(() => { for (let i = 0; i < n; i++) ctx.rect(i % 2 ? W * (1 - e) : 0, i * h, W * e, h + 0.5); }); break; }
    case "clock": { ctx.drawImage(A, 0, 0); const R = Math.hypot(W, H); cl(() => { ctx.moveTo(W / 2, H / 2); ctx.arc(W / 2, H / 2, R, -Math.PI / 2, -Math.PI / 2 + e * Math.PI * 2); ctx.closePath(); }); break; }
    case "checker": { ctx.drawImage(A, 0, 0); const n = 8, cw = W / n, ch = H / Math.round(n * H / W), rows = Math.round(n * H / W); cl(() => { for (let y = 0; y < rows; y++) for (let x = 0; x < n; x++) { const q = clamp(e * 2 - ((x + y) % 2) * 0.9, 0, 1); ctx.rect(x * cw, y * ch, cw * q, ch + 0.5); } }); break; }
    case "inset": ctx.drawImage(A, 0, 0); cl(() => ctx.rect(0, 0, W * e, H * e)); break;
    case "split": { ctx.drawImage(B, 0, 0); const o = W / 2 * e; ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W / 2 - o, H); ctx.clip(); ctx.drawImage(A, -o, 0); ctx.restore(); ctx.save(); ctx.beginPath(); ctx.rect(W / 2 + o, 0, W / 2, H); ctx.clip(); ctx.drawImage(A, o, 0); ctx.restore(); break; }
    case "pageTurn": case "pagePeel": {
      ctx.drawImage(B, 0, 0); const x = W * (1 - e) * 1.05; ctx.save(); ctx.beginPath(); ctx.rect(0, 0, Math.max(0, x), H); ctx.clip(); ctx.drawImage(A, 0, 0); ctx.restore();
      const fw = Math.min(W * 0.3, W - x + 1) * (type === "pagePeel" ? 0.6 : 1); if (x < W) { ctx.save(); ctx.beginPath(); ctx.rect(x - fw, 0, fw, H); ctx.clip(); ctx.translate(2 * x, 0); ctx.scale(-1, 1); ctx.globalAlpha = 0.9; ctx.drawImage(A, 0, 0); ctx.restore(); const gr = ctx.createLinearGradient(x - fw, 0, x + 40 * W / 1080, 0); gr.addColorStop(0, "rgba(255,255,255,.25)"); gr.addColorStop(0.85, "rgba(0,0,0,.35)"); gr.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = gr; ctx.fillRect(x - fw, 0, fw + 40 * W / 1080, H); }
      break;
    }
    case "cube": { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); const a = e * Math.PI / 2, wa = W * Math.cos(a), wb = W * Math.sin(a); ctx.save(); ctx.globalAlpha = 1; ctx.drawImage(A, 0, 0, W, H, 0, 0, wa, H); ctx.fillStyle = `rgba(0,0,0,${0.5 * e})`; ctx.fillRect(0, 0, wa, H); ctx.drawImage(B, 0, 0, W, H, wa, 0, wb, H); ctx.fillStyle = `rgba(0,0,0,${0.5 * (1 - e)})`; ctx.fillRect(wa, 0, wb, H); ctx.restore(); break; }
    case "flip": { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); const s = Math.abs(Math.cos(e * Math.PI)), img = e < 0.5 ? A : B; ctx.translate(W / 2, H / 2); ctx.scale(Math.max(0.001, s), 1 - 0.08 * Math.sin(e * Math.PI)); ctx.drawImage(img, -W / 2, -H / 2); ctx.fillStyle = `rgba(0,0,0,${0.4 * (1 - s)})`; ctx.fillRect(-W / 2, -H / 2, W, H); break; }
    case "random": case "zigzag": { ctx.drawImage(A, 0, 0); const n = 10, rows = Math.max(1, Math.round(n * H / W)), cw = W / n, ch = H / rows, N = n * rows; cl(() => { for (let i = 0; i < N; i++) { const y = Math.floor(i / n), x0 = i % n, x = type === "zigzag" && y % 2 ? n - 1 - x0 : x0, order = type === "random" ? seeded(i * 3.7) : i / N; if (order < e) ctx.rect(x * cw, y * ch, cw + 0.5, ch + 0.5); } }); break; }
    case "blinds": { ctx.drawImage(A, 0, 0); const n = 12, h = H / n; cl(() => { for (let i = 0; i < n; i++) ctx.rect(0, i * h, W, h * e + 0.5); }); break; }
    case "radial": { ctx.drawImage(A, 0, 0); const R = Math.hypot(W, H); cl(() => { ctx.moveTo(0, 0); ctx.arc(0, 0, R, 0, e * Math.PI / 2); ctx.closePath(); }); break; }
    case "wedge": { ctx.drawImage(A, 0, 0); const R = Math.hypot(W, H); cl(() => { ctx.moveTo(W / 2, H / 2); ctx.arc(W / 2, H / 2, R, -Math.PI / 2 - e * Math.PI, -Math.PI / 2 + e * Math.PI); ctx.closePath(); }); break; }
    case "crossZoom": { const img = p < 0.5 ? A : B, z = p < 0.5 ? 1 + e * 2 : 3 - (e - 0.5) * 4, b = Math.sin(p * Math.PI) * 24 * W / 1080; ctx.filter = `blur(${b}px)`; ctx.translate(W / 2, H / 2); ctx.scale(Math.max(1, z), Math.max(1, z)); ctx.drawImage(img, -W / 2, -H / 2); break; }
    case "gradient": { ctx.drawImage(A, 0, 0); const s = scratch("trgrad", W, H), g3 = s.ctx; g3.clearRect(0, 0, W, H); g3.drawImage(B, 0, 0); g3.globalCompositeOperation = "destination-in"; const gr = g3.createLinearGradient(0, 0, W * 0.6, H); const a = clamp(e * 1.4 - 0.2, 0, 1); gr.addColorStop(clamp(a - 0.2, 0, 1), "rgba(0,0,0,1)"); gr.addColorStop(clamp(a, 0, 1), "rgba(0,0,0,0)"); g3.fillStyle = gr; g3.fillRect(0, 0, W, H); g3.globalCompositeOperation = "source-over"; ctx.drawImage(s.canvas, 0, 0); if (e > 0.98) ctx.drawImage(B, 0, 0); break; }
  }
  ctx.restore();
};

/* ---------- constant-power audio dip at main-track transitions ---------- */
const _clipGain0 = clipGain;
clipGain = function (c, lt, len) {
  let g0 = _clipGain0(c, lt, len); const i = V.indexOf(c); if (i < 0) return g0;
  const out = c.tr && c.tr.type && V[i + 1] && !(V[i + 1].gap > 0) ? Math.min(c.tr.dur || 0.5, vlen(c), vlen(V[i + 1])) / 2 : 0;
  const pv = V[i - 1], inn = pv && pv.tr && pv.tr.type && !(c.gap > 0) ? Math.min(pv.tr.dur || 0.5, vlen(pv), vlen(c)) / 2 : 0;
  if (out > 0 && lt > len - out) g0 *= Math.cos(clamp((lt - (len - out)) / out, 0, 1) * Math.PI / 2 * 0.98);
  if (inn > 0 && lt < inn) g0 *= Math.sin(clamp(lt / inn, 0, 1) * Math.PI / 2 * 0.98 + 0.02);
  return g0;
};
