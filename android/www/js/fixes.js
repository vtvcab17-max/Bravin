"use strict";
/* ============================================================================
   "Sửa lỗi & nâng cao" — Bravin's own versions of popular plugin jobs
   (no third-party code): video denoise (spatial + motion-adaptive
   temporal), deflicker (analysed), stabiliser (analysed, similarity
   motion + smoothing + auto zoom), optical-flow slow motion (rendered to
   a new clip), skin smoothing, film emulation (stocks, grain, halation,
   gate weave), audio sync by waveform (PluralEyes-style), plus a
   Sapphire-style effect pack (glow, glint, light rays, defocus, film
   damage, duotone, edge glow, prism).
   Clip data: c.fix = {dn:{s,t}, beauty:{amt,detail,tone}, film:{stock,amt,grain,size,hal,weave,fade}}
              c.dfl = {fps,t0,g:[]} · c.stab = {fps,t0,x:[],y:[],a:[],z,smooth,on}
   ========================================================================== */
const hasFix = c => !!(c && c.fix && ((c.fix.dn && (c.fix.dn.s > 0 || c.fix.dn.t > 0)) || (c.fix.beauty && c.fix.beauty.amt > 0) || (c.fix.film && c.fix.film.amt > 0))) && !window.__noGrade;
const FILM_STOCKS = {
  warm250: { n: "Ấm 250D (nắng)", m: [1.06, -0.04, -0.02, -0.02, 1.02, 0, -0.03, -0.05, 0.98], sat: 0.95, con: 0.12, sh: [0.02, 0.01, -0.01], hi: [0.03, 0.01, -0.03], grain: 0.35, hal: 0.25 },
  night500: { n: "Đêm 500T (đèn vàng)", m: [0.98, 0.02, 0, -0.02, 1, 0.02, -0.02, 0.04, 1.06], sat: 0.9, con: 0.16, sh: [-0.01, 0.01, 0.03], hi: [0.04, 0.01, -0.02], grain: 0.5, hal: 0.45 },
  slide: { n: "Dương bản rực", m: [1.08, -0.05, -0.03, -0.03, 1.07, -0.04, -0.03, -0.04, 1.07], sat: 1.25, con: 0.24, sh: [0, 0, 0.02], hi: [0.02, 0.01, 0], grain: 0.2, hal: 0.1 },
  green: { n: "Lục mát 400H", m: [0.97, 0.03, 0, -0.01, 1.03, -0.02, 0, 0.03, 0.98], sat: 0.88, con: 0.08, sh: [-0.01, 0.02, 0.01], hi: [0.01, 0.02, 0], grain: 0.35, hal: 0.15 },
  fade70: { n: "Bạc màu thập niên 70", m: [1.04, 0, -0.04, 0.02, 0.98, 0, 0.02, 0.02, 0.9], sat: 0.75, con: -0.05, sh: [0.06, 0.04, 0.03], hi: [0.03, 0.02, -0.04], grain: 0.45, hal: 0.2, fade: 0.12 },
  bw400: { n: "Đen trắng 400", m: [0.3, 0.59, 0.11, 0.3, 0.59, 0.11, 0.3, 0.59, 0.11], sat: 0, con: 0.22, sh: [0, 0, 0], hi: [0, 0, 0], grain: 0.6, hal: 0 }
};
const FIXGL = (() => {
  let cnv = null, gl = null, prog = null, tex = null, ptex = null, U = {}, ok = null;
  const VS = `attribute vec2 p; varying vec2 uv; void main(){ uv = vec2((p.x+1.)*.5, 1.-(p.y+1.)*.5); gl_Position = vec4(p,0.,1.); }`;
  const FS = `precision mediump float; varying vec2 uv; uniform sampler2D T, PV; uniform vec2 res; uniform float mode, time;
  uniform float dnS, dnT, prevOn; uniform float bAmt, bDet, bTone; uniform float fAmt, fGrain, fSize, fHal, fWeave, fFade, fCon, fSat; uniform mat3 fM; uniform vec3 fSh, fHi;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
  float luma(vec3 c){ return dot(c, vec3(.299,.587,.114)); }
  vec3 bilateral(vec2 u, float rad, float sr){ vec3 c0 = texture2D(T, u).rgb, s = vec3(0.); float w = 0.;
    for (int i = -3; i <= 3; i++) for (int j = -3; j <= 3; j++) { vec2 o = vec2(float(i), float(j)); vec3 c = texture2D(T, u + o * rad / res).rgb; float d = dot(c - c0, c - c0); float ww = exp(-dot(o, o) / 18.) * exp(-d / (sr * sr + 1e-5)); s += c * ww; w += ww; } return s / w; }
  void main(){
    int m = int(mode + .5); vec4 t0 = texture2D(T, uv); vec3 col = t0.rgb; float a = t0.a;
    if (m == 1) {
      if (dnS > 0.) col = mix(col, bilateral(uv, 1. + dnS * 1.6, .03 + dnS * .12), clamp(dnS * 1.4, 0., 1.));
      if (prevOn > 0. && dnT > 0.) { vec3 pv = texture2D(PV, uv).rgb; float diff = length(col - pv); float w = dnT * .85 * (1. - smoothstep(.04 + dnT * .03, .12 + dnT * .08, diff)); col = mix(col, pv, w); }
    } else if (m == 2) {
      vec3 c255 = col * 255.; float cb = 128. - .168736 * c255.r - .331264 * c255.g + .5 * c255.b, cr = 128. + .5 * c255.r - .418688 * c255.g - .081312 * c255.b;
      float skin = smoothstep(70., 82., cb) * (1. - smoothstep(128., 142., cb)) * smoothstep(130., 138., cr) * (1. - smoothstep(168., 180., cr)) * smoothstep(.12, .25, luma(col));
      vec3 sm = bilateral(uv, 2.2, .09); vec3 big = bilateral(uv, 4.5, .2); vec3 det = col - big;
      vec3 smooth2 = sm + det * bDet * .5 + vec3(.035, .012, .004) * bTone;
      col = mix(col, smooth2, skin * bAmt);
    } else if (m == 3) {
      vec2 u2 = uv + vec2(sin(time * 13.1) * .0006, cos(time * 9.7) * .0011) * fWeave; vec3 c = texture2D(T, u2).rgb;
      vec3 f = fM * c; float l = luma(f); f = mix(vec3(l), f, fSat);
      f = (f - .5) * (1. + fCon) + .5; f = f / (1. + max(f - .85, 0.) * 1.8);
      float lw = smoothstep(0., .5, l), hw = smoothstep(.5, 1., l); f += fSh * (1. - lw) + fHi * hw;
      f = mix(f, f * .88 + .07, fFade);
      if (fHal > 0.) { vec3 hs = vec3(0.); for (int i = 0; i < 12; i++) { float an = float(i) * .5236; vec2 o = vec2(cos(an), sin(an)) * 7. / res; vec3 s1 = texture2D(T, u2 + o).rgb; vec3 s2 = texture2D(T, u2 + o * 2.2).rgb; hs += max(s1 - .72, 0.) + max(s2 - .72, 0.) * .6; } f += hs / 12. * vec3(1., .35, .12) * fHal * 2.2; }
      if (fGrain > 0.) { vec2 g = floor(uv * res / max(1., fSize)); float n = hash(g + fract(time * 7.3) * 91.) - .5; float n2 = hash(g * 1.7 + 3.1 + fract(time * 5.1) * 57.) - .5; float mid = 1. - abs(l - .5) * 1.4; f += vec3(n * .8 + n2 * .2, n, n * .9 + n2 * .1) * fGrain * .16 * mid; }
      col = mix(col, clamp(f, 0., 1.), fAmt);
    }
    gl_FragColor = vec4(clamp(col, 0., 1.) * a, a);
  }`;
  function init() {
    if (ok !== null) return ok;
    try {
      cnv = document.createElement("canvas"); gl = cnv.getContext("webgl", { premultipliedAlpha: true, preserveDrawingBuffer: true }); if (!gl) return ok = false;
      const sh = (ty, src) => { const s = gl.createShader(ty); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog); if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog)); gl.useProgram(prog);
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW); const loc = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      const mk = () => { const t2 = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t2); for (const [k, v] of [[gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR]]) gl.texParameteri(gl.TEXTURE_2D, k, v); return t2; };
      tex = mk(); ptex = mk();
      for (const n of ["T", "PV", "res", "mode", "time", "dnS", "dnT", "prevOn", "bAmt", "bDet", "bTone", "fAmt", "fGrain", "fSize", "fHal", "fWeave", "fFade", "fCon", "fSat", "fM", "fSh", "fHi"]) U[n] = gl.getUniformLocation(prog, n);
      gl.uniform1i(U.T, 0); gl.uniform1i(U.PV, 1); return ok = true;
    } catch (e) { console.warn("fix shader off", e); return ok = false; }
  }
  function run(src, mode, P, prev) {
    if (!init()) return null; const W = src.width, H = src.height; if (cnv.width !== W || cnv.height !== H) { cnv.width = W; cnv.height = H; } gl.viewport(0, 0, W, H);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); } catch (e) { return null; }
    gl.uniform1f(U.prevOn, prev ? 1 : 0); if (prev) { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, ptex); try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, prev); } catch (_) {} gl.activeTexture(gl.TEXTURE0); }
    gl.uniform2f(U.res, W, H); gl.uniform1f(U.mode, mode); gl.uniform1f(U.time, (P.time || 0) % 100);
    for (const k of ["dnS", "dnT", "bAmt", "bDet", "bTone", "fAmt", "fGrain", "fSize", "fHal", "fWeave", "fFade", "fCon", "fSat"]) gl.uniform1f(U[k], +(P[k] || 0));
    gl.uniformMatrix3fv(U.fM, false, new Float32Array(P.fM || [1, 0, 0, 0, 1, 0, 0, 0, 1])); gl.uniform3fv(U.fSh, P.fSh || [0, 0, 0]); gl.uniform3fv(U.fHi, P.fHi || [0, 0, 0]);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); return cnv;
  }
  return { run, available: () => init() };
})();
const _dnPrev = new Map(); // clip id → {T, canvas}
function fixPre(c, img, cx, cy, cw, ch, lt, T) {
  const F = c.fix, maxS = renderMode === "export" ? 1920 : 960, k = Math.min(1, maxS / Math.max(cw, ch)), W = Math.max(2, Math.round(cw * k)), H = Math.max(2, Math.round(ch * k));
  const work = scratch("fixw", W, H); work.ctx.clearRect(0, 0, W, H); work.ctx.drawImage(img, cx, cy, cw, ch, 0, 0, W, H); let cur = work.canvas;
  const pass = (mode, P, prev) => { const o = FIXGL.run(cur, mode, P, prev); if (!o) return; const s2 = scratch("fixo" + mode, W, H); s2.ctx.clearRect(0, 0, W, H); s2.ctx.drawImage(o, 0, 0); cur = s2.canvas; };
  if (F.dn && (F.dn.s > 0 || F.dn.t > 0)) {
    const key = c.id + ":" + renderMode, pv = _dnPrev.get(key), dt = pv ? Math.abs(T - pv.T) : 99, usePrev = pv && pv.c.width === W && pv.c.height === H && dt > 1e-4 && dt < 2.5 / FPS;
    pass(1, { dnS: F.dn.s || 0, dnT: F.dn.t || 0 }, usePrev ? pv.c : null);
    let keep = pv && pv.c.width === W && pv.c.height === H ? pv.c : null; if (!keep) { keep = document.createElement("canvas"); keep.width = W; keep.height = H; } keep.getContext("2d").clearRect(0, 0, W, H); keep.getContext("2d").drawImage(cur, 0, 0); _dnPrev.set(key, { T, c: keep }); if (_dnPrev.size > 12) _dnPrev.delete(_dnPrev.keys().next().value);
  }
  if (F.beauty && F.beauty.amt > 0) pass(2, { bAmt: F.beauty.amt, bDet: F.beauty.detail == null ? 0.5 : F.beauty.detail, bTone: F.beauty.tone || 0 });
  if (F.film && F.film.amt > 0) { const S2 = FILM_STOCKS[F.film.stock] || FILM_STOCKS.warm250; pass(3, { time: T, fAmt: F.film.amt, fGrain: F.film.grain == null ? S2.grain : F.film.grain, fSize: (F.film.size || 1.6) * W / 1080 * 1.5, fHal: F.film.hal == null ? S2.hal : F.film.hal, fWeave: F.film.weave || 0, fFade: (S2.fade || 0) + (F.film.fade || 0), fCon: S2.con, fSat: S2.sat, fM: [S2.m[0], S2.m[3], S2.m[6], S2.m[1], S2.m[4], S2.m[7], S2.m[2], S2.m[5], S2.m[8]], fSh: S2.sh, fHi: S2.hi }); }
  return cur;
}

/* ---------- analysis helpers (frame-accurate, via a hidden video element) ---------- */
let anaCancel = false;
function anaProgress(text) { const el2 = document.createElement("div"); el2.className = "trackprog"; el2.innerHTML = `<span></span><button type="button">Dừng</button>`; el2.querySelector("span").textContent = text; el2.querySelector("button").onclick = () => { anaCancel = true; }; document.body.appendChild(el2); anaCancel = false; return { set: s => { el2.querySelector("span").textContent = s; }, done: () => el2.remove() }; }
async function grabGray(src, t2, W0, H0, can) { const fr = await src.frameAt(t2, 30); const x = can.ctx; x.drawImage(fr.img, 0, 0, W0, H0); const d = x.getImageData(0, 0, W0, H0).data, g2 = new Float32Array(W0 * H0); for (let i = 0, j = 0; i < d.length; i += 4, j++) g2[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; return g2; }
const ANA_FPS = 30;
async function analyzeDeflicker(c) {
  const m = media.get(c.mediaId); if (!m || m.kind !== "video") { toast("Chống nhấp nháy dùng cho clip video."); return; }
  const src = await new ElemSource(m).init(), W0 = 96, H0 = 54, can = scratch("anag", W0, H0), n = Math.max(2, Math.ceil((c.out - c.in) * ANA_FPS)), lum = [], pg = anaProgress("Đang phân tích độ sáng…");
  try { for (let i = 0; i < n && !anaCancel; i++) { const g2 = await grabGray(src, c.in + i / ANA_FPS, W0, H0, can); let s = 0; for (const v of g2) s += v; lum.push(s / g2.length + 1); if (i % 10 === 0) { pg.set(`Đang phân tích độ sáng… ${Math.round(i / n * 100)}%`); await sleep(0); } } } finally { src.close(); pg.done(); }
  if (anaCancel || lum.length < 2) { toast("Đã dừng phân tích."); return; }
  const R = 5, gain = lum.map((v, i) => { let s = 0, k = 0; for (let j = Math.max(0, i - R); j <= Math.min(lum.length - 1, i + R); j++) { s += lum[j]; k++; } return clamp((s / k) / v, 0.6, 1.6); });
  pushUndo(); c.dfl = { fps: ANA_FPS, t0: c.in, g: gain.map(v => Math.round(v * 1000) / 1000), on: true }; renderAll(); const worst = Math.max(...gain.map(v => Math.abs(1 - v))); toast(`Đã phân tích ${lum.length} khung. Dao động sáng lớn nhất ${Math.round(worst * 100)}% đã được bù.`);
}
function dflGain(c, lt) { const D = c.dfl; if (!D || D.on === false || !D.g || !D.g.length) return 1; const x = (srcTime(c, lt) - D.t0) * D.fps, i = clamp(Math.floor(x), 0, D.g.length - 1), j = Math.min(D.g.length - 1, i + 1), f = clamp(x - i, 0, 1); return D.g[i] * (1 - f) + D.g[j] * f; }
async function analyzeStab(c) {
  const m = media.get(c.mediaId); if (!m || m.kind !== "video") { toast("Ổn định hình dùng cho clip video."); return; }
  const src = await new ElemSource(m).init(), W0 = 192, H0 = Math.round(192 * (m.h || 1080) / (m.w || 1920)) || 108, can = scratch("anas", W0, H0), n = Math.max(2, Math.ceil((c.out - c.in) * ANA_FPS)), pg = anaProgress("Đang phân tích rung lắc…");
  const fit = await src.frameAt(c.in, 30); const H1 = Math.max(16, Math.round(W0 * fit.h / fit.w)); can.canvas.height = H1;
  const blocks = []; for (let by = 1; by <= 3; by++) for (let bx = 1; bx <= 4; bx++) blocks.push([Math.round(W0 * bx / 5), Math.round(H1 * by / 4)]);
  const B = 10, R = 10, raw = [{ x: 0, y: 0, a: 0, s: 0 }]; let prev = null;
  try {
    for (let i = 0; i < n && !anaCancel; i++) {
      const g2 = await grabGray(src, c.in + i / ANA_FPS, W0, H1, can);
      if (prev) {
        const vecs = [];
        for (const [bx, by] of blocks) { let best = [0, 0], bs = Infinity; for (let oy = -R; oy <= R; oy++) for (let ox = -R; ox <= R; ox++) { let s = 0; for (let j = -B; j <= B; j += 2) { const y1 = by + j, y2 = y1 + oy; if (y1 < 0 || y2 < 0 || y1 >= H1 || y2 >= H1) continue; for (let k = -B; k <= B; k += 2) { const x1 = bx + k, x2 = x1 + ox; if (x1 < 0 || x2 < 0 || x1 >= W0 || x2 >= W0) continue; s += Math.abs(prev[y1 * W0 + x1] - g2[y2 * W0 + x2]); } if (s > bs) break; } if (s < bs) { bs = s; best = [ox, oy]; } } vecs.push([bx - W0 / 2, by - H1 / 2, best[0], best[1]]); }
        // least squares similarity: u = tx + sx*x - r*y, v = ty + r*x + sx*y  (small angle)
        let mu = 0, mv = 0; vecs.forEach(q => { mu += q[2]; mv += q[3]; }); mu /= vecs.length; mv /= vecs.length;
        let num = 0, nr = 0, den = 0; vecs.forEach(([x, y, u, v]) => { num += x * (u - mu) + y * (v - mv); nr += x * (v - mv) - y * (u - mu); den += x * x + y * y; });
        const sc = den ? num / den : 0, rr = den ? nr / den : 0, L = raw[raw.length - 1];
        // reject outliers (subject motion): median translation
        const us = vecs.map(q => q[2]).sort((a, b) => a - b), vs = vecs.map(q => q[3]).sort((a, b) => a - b), tx = us[us.length >> 1], ty = vs[vs.length >> 1];
        raw.push({ x: L.x + tx / W0, y: L.y + ty / H1, a: L.a + rr, s: L.s + clamp(sc, -0.05, 0.05) });
      }
      prev = g2; if (i % 8 === 0) { pg.set(`Đang phân tích rung lắc… ${Math.round(i / n * 100)}%`); await sleep(0); }
    }
  } finally { src.close(); pg.done(); }
  if (anaCancel || raw.length < 3) { toast("Đã dừng phân tích."); return; }
  pushUndo(); c.stab = { fps: ANA_FPS, t0: c.in, raw, smooth: 0.6, on: true, mode: "smooth" }; stabBuild(c); renderAll(); toast(`Đã ổn định ${raw.length} khung. Phóng to tự động ${Math.round((c.stab.z - 1) * 100)}% để giấu viền.`);
}
function stabBuild(c) {
  const S = c.stab, raw = S.raw, n = raw.length, rad = Math.max(1, Math.round((S.mode === "lock" ? 9999 : S.smooth * 45) )); const ker = []; for (let k = -Math.min(rad, 90); k <= Math.min(rad, 90); k++) ker.push(Math.exp(-(k * k) / (2 * (rad / 2.5) ** 2)));
  const sm = key => raw.map((_, i) => { if (S.mode === "lock") return raw[0][key]; let s = 0, w = 0; ker.forEach((kw, j) => { const ii = clamp(i + j - (ker.length >> 1), 0, n - 1); s += raw[ii][key] * kw; w += kw; }); return s / w; });
  const X = sm("x"), Y = sm("y"), A = sm("a"), Z = sm("s");
  S.x = raw.map((r, i) => Math.round((X[i] - r.x) * 1e5) / 1e5); S.y = raw.map((r, i) => Math.round((Y[i] - r.y) * 1e5) / 1e5); S.a = raw.map((r, i) => Math.round((A[i] - r.a) * 1e5) / 1e5); S.s = raw.map((r, i) => Math.round((Z[i] - r.s) * 1e5) / 1e5);
  const need = Math.max(...S.x.map(Math.abs), ...S.y.map(Math.abs)) * 2 + Math.max(...S.a.map(Math.abs)) * 0.9; S.z = Math.round(clamp(1 + need + 0.01, 1, 1.5) * 1000) / 1000; if (S.zoomUser) S.z = S.zoomUser;
}
function stabAt(c, lt) { const S = c.stab; if (!S || S.on === false || !S.x) return null; const xx = (srcTime(c, lt) - S.t0) * S.fps, i = clamp(Math.floor(xx), 0, S.x.length - 1), j = Math.min(S.x.length - 1, i + 1), f = clamp(xx - i, 0, 1), L = (arr) => arr[i] * (1 - f) + arr[j] * f; return { x: L(S.x), y: L(S.y), a: L(S.a) * 180 / Math.PI, z: S.z * (1 + L(S.s)) }; }

/* ---------- optical-flow slow motion (rendered to a new clip) ---------- */
async function renderSmoothSlow(c, k) {
  const m = media.get(c.mediaId); if (!m || m.kind !== "video") { toast("Slow-motion mượt dùng cho clip video."); return; }
  if (!window.VideoEncoder || !window.Mp4Muxer) { toast("Trình duyệt này không có bộ mã hoá video để dựng slow-motion."); return; }
  const srcF = 30, outF = 30, L = c.out - c.in, outN = Math.max(2, Math.round(L * k * outF));
  const src = await new ElemSource(m).init(); const f0 = await src.frameAt(c.in, srcF); let W = f0.w, H = f0.h; const sc = Math.min(1, 1280 / Math.max(W, H)); W = Math.round(W * sc / 2) * 2; H = Math.round(H * sc / 2) * 2;
  const vc = await pickVideoCodec(W, H, outF, 8e6); if (!vc) { src.close(); toast("Không có bộ mã hoá video phù hợp."); return; }
  const target = new Mp4Muxer.ArrayBufferTarget(), mux = new Mp4Muxer.Muxer({ target, fastStart: "in-memory", video: { codec: vc.mux, width: W, height: H, frameRate: outF } }); let verr = null;
  const enc = new VideoEncoder({ output: (ch2, meta) => mux.addVideoChunk(ch2, meta), error: e => { verr = e; } }); enc.configure(vc.cfg);
  const FW = 160, FH = Math.max(16, Math.round(160 * H / W)), A = document.createElement("canvas"), Bc = document.createElement("canvas"); A.width = Bc.width = W; A.height = Bc.height = H; const a2 = A.getContext("2d"), b2 = Bc.getContext("2d"), sm = scratch("flowsm", FW, FH);
  const grayOf = cv2 => { sm.ctx.drawImage(cv2, 0, 0, FW, FH); const d = sm.ctx.getImageData(0, 0, FW, FH).data, g2 = new Float32Array(FW * FH); for (let i = 0, j = 0; i < d.length; i += 4, j++) g2[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; return g2; };
  const BS = 8, R = 8, GX = Math.ceil(FW / BS), GY = Math.ceil(FH / BS), flowData = new Uint8Array(GX * GY * 4);
  const flow = (ga, gb) => { for (let by = 0; by < GY; by++) for (let bx = 0; bx < GX; bx++) { let best = [0, 0], bs = Infinity; const x0 = bx * BS, y0 = by * BS; for (let oy = -R; oy <= R; oy++) for (let ox = -R; ox <= R; ox++) { let s = 0; for (let j = 0; j < BS; j++) { const y1 = y0 + j, y2 = y1 + oy; if (y1 >= FH || y2 < 0 || y2 >= FH) { s += 40; continue; } for (let i = 0; i < BS; i++) { const x1 = x0 + i, x2 = x1 + ox; if (x1 >= FW || x2 < 0 || x2 >= FW) { s += 40; continue; } s += Math.abs(ga[y1 * FW + x1] - gb[y2 * FW + x2]); } if (s > bs) break; } s += (Math.abs(ox) + Math.abs(oy)) * 2; if (s < bs) { bs = s; best = [ox, oy]; } } const o = (by * GX + bx) * 4; flowData[o] = clamp(Math.round((best[0] / R * 0.5 + 0.5) * 255), 0, 255); flowData[o + 1] = clamp(Math.round((best[1] / R * 0.5 + 0.5) * 255), 0, 255); flowData[o + 2] = 0; flowData[o + 3] = 255; } };
  const pg = anaProgress("Đang dựng slow-motion mượt…"); let ia = -1, ga = null, gb = null; const t0 = performance.now();
  try {
    for (let n = 0; n < outN && !anaCancel; n++) {
      if (verr) throw verr; const st = n / outF / k, fi = Math.floor(st * srcF), fr = st * srcF - fi;
      if (fi !== ia) { if (fi === ia + 1 && ia >= 0) { a2.drawImage(Bc, 0, 0); ga = gb; } else { const fa = await src.frameAt(c.in + fi / srcF, srcF); a2.drawImage(fa.img, 0, 0, W, H); ga = grayOf(A); } const fb = await src.frameAt(Math.min(c.out - 0.01, c.in + (fi + 1) / srcF), srcF); b2.drawImage(fb.img, 0, 0, W, H); gb = grayOf(Bc); flow(ga, gb); ia = fi; }
      const out = FLOWGL.run(A, Bc, flowData, GX, GY, fr, R / FW, R / FH) || A;
      const vf = new VideoFrame(out, { timestamp: Math.round(n / outF * 1e6), duration: Math.round(1e6 / outF) }); enc.encode(vf, { keyFrame: n % 60 === 0 }); vf.close(); while (enc.encodeQueueSize > 4) await sleep(1);
      if (n % 5 === 0) { const rate = (n + 1) / ((performance.now() - t0) / 1000); pg.set(`Đang dựng slow-motion mượt… ${Math.round(n / outN * 100)}% · ${rate.toFixed(1)} khung/giây`); await sleep(0); }
    }
    if (anaCancel) { toast("Đã huỷ dựng slow-motion."); return; }
    await enc.flush(); enc.close(); mux.finalize();
  } finally { src.close(); pg.done(); }
  const blob = new Blob([target.buffer], { type: "video/mp4" }), nm = m.name.replace(/\.[^.]+$/, "") + ` · slow ${Math.round(100 / k)}%.mp4`, nmMedia = await addMediaFile(blob, nm); if (!nmMedia) { toast("Không nạp được clip slow-motion."); return; }
  pushUndo(); const before = V.includes(c) ? vMap() : null; c.mediaId = nmMedia.id; c.in = 0; c.out = nmMedia.duration || outN / outF; delete c.speed; if (c.kf) delete c.kf.speed; delete c.stab; delete c.dfl; c.audioOut = true; if (before) linkShift(before); renderBin(); renderAll();
  toast(`Đã dựng slow-motion ${Math.round(100 / k)}% bằng nội suy chuyển động (${outN} khung). Clip gốc vẫn còn trong Thư viện.`);
}
const FLOWGL = (() => {
  let cnv = null, gl = null, prog = null, ta = null, tb = null, tf = null, U = {}, ok = null;
  const VS = `attribute vec2 p; varying vec2 uv; void main(){ uv = vec2((p.x+1.)*.5, 1.-(p.y+1.)*.5); gl_Position = vec4(p,0.,1.); }`;
  const FS = `precision mediump float; varying vec2 uv; uniform sampler2D A, B, F; uniform float t; uniform vec2 mx;
  void main(){ vec2 f = (texture2D(F, uv).xy - .5) * 2. * mx; vec4 ca = texture2D(A, clamp(uv - f * t, 0., 1.)), cb = texture2D(B, clamp(uv + f * (1. - t), 0., 1.)); gl_FragColor = mix(ca, cb, t); }`;
  function init() { if (ok !== null) return ok; try { cnv = document.createElement("canvas"); gl = cnv.getContext("webgl", { preserveDrawingBuffer: true }); if (!gl) return ok = false; const sh = (ty, s) => { const x = gl.createShader(ty); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; }; prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog); gl.useProgram(prog); const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW); const loc = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0); const mk = () => { const t2 = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t2); for (const [k2, v] of [[gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR]]) gl.texParameteri(gl.TEXTURE_2D, k2, v); return t2; }; ta = mk(); tb = mk(); tf = mk(); for (const n of ["A", "B", "F", "t", "mx"]) U[n] = gl.getUniformLocation(prog, n); gl.uniform1i(U.A, 0); gl.uniform1i(U.B, 1); gl.uniform1i(U.F, 2); return ok = true; } catch (e) { console.warn("flow off", e); return ok = false; } }
  function run(A, B, fd, gx, gy, t2, mxx, mxy) { if (!init()) return null; if (cnv.width !== A.width || cnv.height !== A.height) { cnv.width = A.width; cnv.height = A.height; } gl.viewport(0, 0, A.width, A.height); for (const [unit, tex, src] of [[0, ta, A], [1, tb, B]]) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); } gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tf); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gx, gy, 0, gl.RGBA, gl.UNSIGNED_BYTE, fd); gl.uniform1f(U.t, t2); gl.uniform2f(U.mx, mxx, mxy); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); return cnv; }
  return { run };
})();

/* ---------- audio sync by waveform (PluralEyes-style) ---------- */
function envelope(buf, from, to, rate = 200) { const sr = buf.sampleRate, d = buf.getChannelData(0), a = Math.max(0, Math.floor(from * sr)), b = Math.min(d.length, Math.floor(to * sr)), hop = Math.floor(sr / rate), n = Math.max(1, Math.floor((b - a) / hop)), e = new Float32Array(n); for (let i = 0; i < n; i++) { let s = 0; const o = a + i * hop; for (let j = 0; j < hop; j += 4) { const v = d[o + j] || 0; s += v * v; } e[i] = Math.sqrt(s / (hop / 4)); } const o2 = new Float32Array(n); for (let i = 1; i < n; i++) o2[i] = Math.max(0, e[i] - e[i - 1]); let mean = 0; for (const v of o2) mean += v; mean /= n; let sd = 0; for (const v of o2) sd += (v - mean) ** 2; sd = Math.sqrt(sd / n) || 1; for (let i = 0; i < n; i++) o2[i] = (o2[i] - mean) / sd; return o2; }
function xcorrBest(a, b, maxLag) { // lag L (samples) maximising sum a[i]*b[i+L]
  let n = 1; while (n < a.length + b.length) n <<= 1; const ar = new Float32Array(n), ai = new Float32Array(n), br = new Float32Array(n), bi = new Float32Array(n); ar.set(a); br.set(b); fftInPlace(ar, ai); fftInPlace(br, bi);
  const cr = new Float32Array(n), ci = new Float32Array(n); for (let i = 0; i < n; i++) { cr[i] = ar[i] * br[i] + ai[i] * bi[i]; ci[i] = ar[i] * bi[i] - ai[i] * br[i]; } for (let i = 0; i < n; i++) ci[i] = -ci[i]; fftInPlace(cr, ci);
  let best = 0, bv = -Infinity, second = -Infinity; for (let i = 0; i < n; i++) { const lag = i < n / 2 ? i : i - n; if (Math.abs(lag) > maxLag) continue; const v = cr[i] / n; if (v > bv) { second = bv; bv = v; best = lag; } else if (v > second) second = v; } return { lag: best, score: bv };
}
async function syncAudio() {
  const L = (typeof selectedClips === "function" ? selectedClips() : []).map(f => f.c); if (L.length < 2) { toast("Chọn ít nhất 2 clip (1 video có tiếng + 1 file âm thanh) bằng Ctrl+bấm, rồi chạy lại."); return; }
  const bufOf = async c => { const m = media.get(c.mediaId); if (!m) return null; if (m.buf) return m.buf; if (m.kind === "video") { try { return (await extractAudioMedia(m)).buf; } catch (_) { return null; } } return null; };
  const startOf = c => V.includes(c) ? vStarts()[V.indexOf(c)] : c.start;
  const ref = L.find(c => c.type !== "audio") || L[0], rb = await bufOf(ref); if (!rb) { toast("Clip tham chiếu không có tiếng."); return; }
  const RATE = 200, eRef = envelope(rb, ref.in, ref.out, RATE); let moved = 0; pushUndo();
  for (const c of L) { if (c === ref || V.includes(c)) continue; const b = await bufOf(c); if (!b) continue; const e = envelope(b, 0, b.duration, RATE); const { lag, score } = xcorrBest(eRef, e, Math.max(eRef.length, e.length));
    if (score < 0.05 * Math.min(eRef.length, e.length)) { toast("Không chắc khớp được " + (media.get(c.mediaId) || {}).name + " (tiếng quá khác)."); continue; }
    const Ls = lag / RATE; let st = startOf(ref) + c.in - Ls; if (st < 0) { c.in = Math.min(c.out - 0.1, c.in - st); st = 0; } c.start = Math.round(st * 1000) / 1000; moved++; }
  if (!moved) { undoStack.pop(); return; }
  renderAll(); const ok = await confirm2(`Đã khớp ${moved} clip âm thanh theo tiếng của "${(media.get(ref.mediaId) || {}).name || "clip"}". Tắt tiếng thu từ máy quay?`, "Tắt tiếng máy quay"); if (ok) { pushUndo(); ref.muted = true; renderAll(); }
}

/* ---------- Sapphire-style effect pack ---------- */
const cpyCanvas = (ctx, W, H, nm) => { const s = scratch(nm, W, H); s.ctx.clearRect(0, 0, W, H); s.ctx.drawImage(ctx.canvas, 0, 0); return s; };
const brightPass = (ctx, W, H, thr, nm) => { const s = cpyCanvas(ctx, W, H, nm), x = s.ctx; const d = x.getImageData(0, 0, W, H); const a = d.data; for (let i = 0; i < a.length; i += 4) { const l = (0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2]) / 255, k = clamp((l - thr) / (1 - thr + 1e-3), 0, 1); a[i] *= k; a[i + 1] *= k; a[i + 2] *= k; } x.putImageData(d, 0, 0); return s.canvas; };
const smallBright = (ctx, W, H, thr) => { const w = Math.max(32, Math.round(W / 4)), h = Math.max(32, Math.round(H / 4)), s = scratch("sbright", w, h); s.ctx.clearRect(0, 0, w, h); s.ctx.drawImage(ctx.canvas, 0, 0, w, h); const d = s.ctx.getImageData(0, 0, w, h), a = d.data; for (let i = 0; i < a.length; i += 4) { const l = (0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2]) / 255, k = clamp((l - thr) / (1 - thr + 1e-3), 0, 1) ** 1.5; a[i] *= k; a[i + 1] *= k; a[i + 2] *= k; } s.ctx.putImageData(d, 0, 0); return s.canvas; };
if (typeof def === "function") {
  FX_CATS.splice(6, 0, "Kiểu Sapphire");
  const SC = FX_CATS.indexOf("Kiểu Sapphire");
  def("sglow", "S_Glow", SC, { thr: ["Ngưỡng sáng", 0, 1, 0.6, 0.01], r: ["Độ lan", 2, 80, 24, 1], c: ["Màu", 0, 0, "#ffffff", 0, "color"] }, (ctx, W, H, fx, lt, len, T, k) => { const b = smallBright(ctx, W, H, fxP(fx, "thr")); ctx.save(); ctx.globalCompositeOperation = "screen"; ctx.globalAlpha = Math.min(1, k); ctx.filter = `blur(${fxP(fx, "r") * W / 1080}px)`; ctx.drawImage(b, 0, 0, W, H); ctx.filter = `blur(${fxP(fx, "r") * W / 2160}px)`; ctx.drawImage(b, 0, 0, W, H); ctx.filter = "none"; if (fxP(fx, "c") !== "#ffffff") { ctx.globalCompositeOperation = "soft-light"; ctx.globalAlpha = 0.35 * k; ctx.fillStyle = fxP(fx, "c"); ctx.fillRect(0, 0, W, H); } ctx.restore(); });
  def("sglint", "S_Glint (lấp lánh tia)", SC, { thr: ["Ngưỡng sáng", 0.5, 1, 0.82, 0.01], len: ["Độ dài tia", 10, 400, 120, 1], n: ["Số tia", 2, 8, 4, 1], a: ["Góc", 0, 90, 45, 1] }, (ctx, W, H, fx, lt, len, T, k) => { const b = smallBright(ctx, W, H, fxP(fx, "thr")), L2 = fxP(fx, "len") * W / 1080, N = fxP(fx, "n"); ctx.save(); ctx.globalCompositeOperation = "lighter"; for (let i = 0; i < N; i++) { const an = (fxP(fx, "a") + i * 180 / N) * Math.PI / 180; for (let s = 1; s <= 8; s++) { const d = L2 * s / 8; ctx.globalAlpha = 0.16 * k * (1 - s / 9); ctx.drawImage(b, Math.cos(an) * d, Math.sin(an) * d, W, H); ctx.drawImage(b, -Math.cos(an) * d, -Math.sin(an) * d, W, H); } } ctx.restore(); });
  def("srays", "S_Rays (tia sáng toả)", SC, { x: ["Tâm X", 0, 1, 0.5, 0.01], y: ["Tâm Y", 0, 1, 0.25, 0.01], thr: ["Ngưỡng sáng", 0, 1, 0.55, 0.01], l: ["Độ dài", 0.05, 1, 0.45, 0.01] }, (ctx, W, H, fx, lt, len, T, k) => { const b = smallBright(ctx, W, H, fxP(fx, "thr")), cx = fxP(fx, "x") * W, cy = fxP(fx, "y") * H; ctx.save(); ctx.globalCompositeOperation = "lighter"; for (let i = 1; i <= 14; i++) { const z = 1 + fxP(fx, "l") * i / 14; ctx.globalAlpha = 0.11 * k * (1 - i / 15); ctx.setTransform(z, 0, 0, z, cx - cx * z, cy - cy * z); ctx.drawImage(b, 0, 0, W, H); } ctx.restore(); });
  def("sdefocus", "S_RackDefocus (nhoè ống kính)", SC, { r: ["Độ nhoè", 0, 60, 18, 0.5], bok: ["Đốm sáng bokeh", 0, 1, 0.6, 0.01] }, (ctx, W, H, fx, lt, len, T, k) => { const r = fxP(fx, "r") * k * W / 1080; if (r < 0.5) return; const src = cpyCanvas(ctx, W, H, "sdf0").canvas, b = smallBright(ctx, W, H, 0.7); ctx.save(); ctx.filter = `blur(${r}px)`; ctx.globalCompositeOperation = "copy"; ctx.drawImage(src, 0, 0); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = fxP(fx, "bok") * 0.6; ctx.filter = `blur(${r * 0.6}px)`; for (const [ox, oy] of [[0, 0], [r * 0.5, 0], [-r * 0.5, 0], [0, r * 0.5], [0, -r * 0.5]]) ctx.drawImage(b, ox, oy, W, H); ctx.restore(); });
  def("sdamage", "S_FilmDamage (phim cũ trầy)", SC, { s: ["Vết xước", 0, 1, 0.5, 0.01], d: ["Bụi", 0, 1, 0.5, 0.01], f: ["Nhấp nháy", 0, 1, 0.3, 0.01], sep: ["Ngả nâu", 0, 1, 0.4, 0.01] }, (ctx, W, H, fx, lt, len, T, k) => { const fr = Math.floor(T * 24); ctx.save(); if (fxP(fx, "sep") > 0) { ctx.globalCompositeOperation = "color"; ctx.globalAlpha = fxP(fx, "sep") * k * 0.6; ctx.fillStyle = "#8a6a3c"; ctx.fillRect(0, 0, W, H); } ctx.globalCompositeOperation = "source-over"; const fl = (seeded(fr * 3.1) - 0.5) * fxP(fx, "f") * 0.25 * k; ctx.globalAlpha = Math.abs(fl); ctx.fillStyle = fl > 0 ? "#fff" : "#000"; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 0.5 * k; ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.lineWidth = Math.max(1, W / 900); const ns = Math.round(fxP(fx, "s") * 4); for (let i = 0; i < ns; i++) { if (seeded(fr * 7 + i) > 0.6) continue; const x = seeded(fr * 13 + i * 5) * W; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (seeded(i + fr) - 0.5) * 20, H); ctx.stroke(); } ctx.fillStyle = "rgba(20,15,10,.85)"; const nd = Math.round(fxP(fx, "d") * 25); for (let i = 0; i < nd; i++) { const x = seeded(fr * 17 + i * 3) * W, y = seeded(fr * 19 + i * 7) * H, r = (1 + seeded(fr + i * 11) * 3) * W / 1080; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); } ctx.restore(); });
  def("sduotone", "S_Duotone", SC, { a: ["Màu tối", 0, 0, "#1b1446", 0, "color"], b: ["Màu sáng", 0, 0, "#ff7a59", 0, "color"] }, shMix(3, fx => { const a = hexRgb(fxP(fx, "a")); return [a[0], a[1], a[2], 1]; }, fx => { const a = hexRgb(fxP(fx, "b")); return [a[0], a[1], a[2], 1]; }));
  def("sedge", "S_EdgeGlow (viền phát sáng)", SC, { c: ["Màu", 0, 0, "#7b6cf6", 0, "color"], r: ["Độ lan", 1, 40, 10, 1], g: ["Độ sáng", 0, 3, 1.4, 0.05] }, (ctx, W, H, fx, lt, len, T, k) => { const e = cpyCanvas(ctx, W, H, "sedge1"); FXGL.run(e.ctx, W, H, 10, [1, 0, 0, 0], null, 1, T); e.ctx.save(); e.ctx.globalCompositeOperation = "multiply"; e.ctx.fillStyle = fxP(fx, "c"); e.ctx.fillRect(0, 0, W, H); e.ctx.restore(); const gl = fxP(fx, "g") * k; ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = Math.min(1, gl * 0.8); ctx.drawImage(e.canvas, 0, 0); ctx.filter = `blur(${fxP(fx, "r") * W / 1080}px)`; for (let j = 0; j < Math.ceil(gl * 2); j++) { ctx.globalAlpha = Math.min(1, gl * 2 - j); ctx.drawImage(e.canvas, 0, 0); } ctx.restore(); });
  def("sprism", "S_Prism (tán sắc)", SC, { d: ["Độ tách", 0, 40, 10, 0.5], a: ["Góc", 0, 360, 0, 1] }, (ctx, W, H, fx, lt, len, T, k) => { const d = fxP(fx, "d") * k * W / 1080, an = fxP(fx, "a") * Math.PI / 180, src = cpyCanvas(ctx, W, H, "sprism0").canvas; ctx.save(); ctx.fillStyle = "#000"; ctx.globalCompositeOperation = "copy"; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = "lighter"; const ch = [["#ff0000", -1], ["#00ff00", 0], ["#0000ff", 1]]; for (const [col, s] of ch) { const t2 = scratch("sprismC" + s, W, H); t2.ctx.globalCompositeOperation = "copy"; t2.ctx.drawImage(src, 0, 0); t2.ctx.globalCompositeOperation = "multiply"; t2.ctx.fillStyle = col; t2.ctx.fillRect(0, 0, W, H); t2.ctx.globalCompositeOperation = "source-over"; ctx.drawImage(t2.canvas, Math.cos(an) * d * s, Math.sin(an) * d * s); } ctx.restore(); });
}

/* ---------- inspector tab ---------- */
function fixPanel(box, c) {
  const m = c.mediaId ? media.get(c.mediaId) : null, isVideo = m && m.kind === "video", F = () => c.fix || {}, setF = (k, v) => { c.fix = Object.assign({}, c.fix, { [k]: v }); if (!v) delete c.fix[k]; if (!Object.keys(c.fix).length) delete c.fix; };
  let b = section(box, "Khử nhiễu hạt (kiểu Neat Video)", !!F().dn);
  const dn = () => F().dn || {}; slider(b, { label: "Khử nhiễu không gian", min: 0, max: 1, step: 0.01, get: () => dn().s || 0, set: v => setF("dn", Object.assign({}, dn(), { s: v })), fmt: v => v ? Math.round(v * 100) + "%" : "Tắt" });
  slider(b, { label: "Khử nhiễu theo thời gian", min: 0, max: 1, step: 0.01, get: () => dn().t || 0, set: v => setF("dn", Object.assign({}, dn(), { t: v })), fmt: v => v ? Math.round(v * 100) + "%" : "Tắt" });
  note(b, "Theo thời gian: trộn với khung trước ở vùng đứng yên (tự tránh vùng chuyển động), rõ nhất khi phát hoặc khi xuất.");
  if (isVideo) {
    b = section(box, "Chống nhấp nháy (kiểu Deflicker)", !!c.dfl);
    if (c.dfl) { toggle(b, c.dfl.on === false ? "Đang tắt" : "Đang bật", () => c.dfl.on !== false, v => c.dfl.on = v); note(b, `Đã phân tích ${c.dfl.g.length} khung.`); }
    btnRow(b, [[c.dfl ? "Phân tích lại" : "Phân tích và bù độ sáng", () => analyzeDeflicker(c), !c.dfl], c.dfl ? ["Bỏ", () => { pushUndo(); delete c.dfl; renderAll(); }] : null].filter(Boolean));
    b = section(box, "Ổn định hình (kiểu Warp Stabilizer / Mercalli)", !!c.stab);
    if (c.stab) {
      toggle(b, c.stab.on === false ? "Đang tắt" : "Đang bật", () => c.stab.on !== false, v => c.stab.on = v);
      select(b, "Kiểu", { smooth: "Mượt chuyển động (giữ lia máy)", lock: "Khoá cố định (như chân máy)" }, () => c.stab.mode || "smooth", v => { c.stab.mode = v; stabBuild(c); });
      slider(b, { label: "Độ mượt", min: 0.05, max: 1, step: 0.01, get: () => c.stab.smooth, set: v => { c.stab.smooth = v; stabBuild(c); }, fmt: v => Math.round(v * 100) + "%" });
      slider(b, { label: "Phóng to giấu viền", min: 1, max: 1.5, step: 0.005, get: () => c.stab.z, set: v => { c.stab.zoomUser = v; c.stab.z = v; }, fmt: v => Math.round((v - 1) * 100) + "%" });
    }
    btnRow(b, [[c.stab ? "Phân tích lại" : "Phân tích rung lắc", () => analyzeStab(c), !c.stab], c.stab ? ["Bỏ", () => { pushUndo(); delete c.stab; renderAll(); }] : null].filter(Boolean));
    b = section(box, "Slow-motion mượt (kiểu Twixtor)", false);
    note(b, "Tạo khung hình trung gian bằng nội suy chuyển động rồi dựng thành clip mới (clip gốc vẫn giữ trong Thư viện). Nên dùng clip ngắn.");
    btnRow(b, [["50%", () => renderSmoothSlow(c, 2)], ["25%", () => renderSmoothSlow(c, 4)], ["12,5%", () => renderSmoothSlow(c, 8)]]);
  }
  b = section(box, "Làm mịn da (kiểu Beauty Box)", !!F().beauty);
  const bt = () => F().beauty || {}; slider(b, { label: "Mịn da", min: 0, max: 1, step: 0.01, get: () => bt().amt || 0, set: v => setF("beauty", Object.assign({ detail: 0.5 }, bt(), { amt: v })), fmt: v => v ? Math.round(v * 100) + "%" : "Tắt" });
  slider(b, { label: "Giữ chi tiết", min: 0, max: 1, step: 0.01, get: () => bt().detail == null ? 0.5 : bt().detail, set: v => setF("beauty", Object.assign({}, bt(), { detail: v })), fmt: v => Math.round(v * 100) + "%" });
  slider(b, { label: "Hồng hào", min: 0, max: 1, step: 0.01, get: () => bt().tone || 0, set: v => setF("beauty", Object.assign({}, bt(), { tone: v })), fmt: v => Math.round(v * 100) + "%" });
  note(b, "Tự nhận vùng da theo màu. Muốn giới hạn vào khuôn mặt, dùng thêm Mask hoặc Cửa sổ trong trang chỉnh màu.");
  b = section(box, "Giả lập phim nhựa (kiểu FilmConvert)", !!F().film);
  const fm = () => F().film || {};
  tiles(b, [["", "Tắt"], ...Object.entries(FILM_STOCKS).map(([k, s]) => [k, s.n])], fm().amt > 0 ? fm().stock : "", k => { pushUndo(); if (!k) setF("film", null); else setF("film", Object.assign({ amt: 0.85, size: 1.6, weave: 0.3 }, fm(), { stock: k, grain: FILM_STOCKS[k].grain, hal: FILM_STOCKS[k].hal })); renderInspector(); drawFrame(); }, "curves");
  if (fm().amt > 0) {
    slider(b, { label: "Cường độ", min: 0, max: 1, step: 0.01, get: () => fm().amt, set: v => setF("film", Object.assign({}, fm(), { amt: v })), fmt: v => Math.round(v * 100) + "%" });
    slider(b, { label: "Hạt phim", min: 0, max: 1.5, step: 0.01, get: () => fm().grain || 0, set: v => setF("film", Object.assign({}, fm(), { grain: v })), fmt: v => Math.round(v * 100) });
    slider(b, { label: "Cỡ hạt", min: 0.5, max: 4, step: 0.05, get: () => fm().size || 1.6, set: v => setF("film", Object.assign({}, fm(), { size: v })), fmt: v => (+v).toFixed(1) });
    slider(b, { label: "Hào quang (halation)", min: 0, max: 1, step: 0.01, get: () => fm().hal || 0, set: v => setF("film", Object.assign({}, fm(), { hal: v })), fmt: v => Math.round(v * 100) });
    slider(b, { label: "Rung khung phim", min: 0, max: 2, step: 0.01, get: () => fm().weave || 0, set: v => setF("film", Object.assign({}, fm(), { weave: v })), fmt: v => Math.round(v * 100) });
    slider(b, { label: "Bạc màu", min: 0, max: 0.4, step: 0.01, get: () => fm().fade || 0, set: v => setF("film", Object.assign({}, fm(), { fade: v })), fmt: v => Math.round(v * 100) });
  }
  if (!FIXGL.available()) note(box, "Thiết bị không hỗ trợ WebGL nên các bộ lọc ở đây sẽ không hiện.");
}
