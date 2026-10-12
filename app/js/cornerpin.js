"use strict";
/* ============================================================================
   Corner pin theo phối cảnh cho clip (dùng cho Motion Tracking: thay màn hình,
   dán ảnh lên mặt phẳng đang chuyển động).
   c.pin = { keys: [{ t, v: [x0,y0, x1,y1, x2,y2, x3,y3] }] }  — 4 góc TL, TR, BR, BL
   theo toạ độ 0..1 của khung hình, t = giây tính từ đầu clip. Vẽ bằng WebGL
   (đúng phối cảnh, khử răng cưa mép); không có WebGL thì vẽ gần đúng bằng affine.
   ========================================================================== */
function pinAt(c, lt) {
  const K = c && c.pin && c.pin.on !== false && c.pin.keys; if (!K || !K.length) return null;
  if (lt <= K[0].t) return K[0].v; if (lt >= K[K.length - 1].t) return K[K.length - 1].v;
  let lo = 0, hi = K.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (K[m].t <= lt) lo = m; else hi = m; }
  const a = K[lo], b = K[hi], p = (lt - a.t) / Math.max(1e-6, b.t - a.t); return a.v.map((v, i) => v + (b.v[i] - v) * p);
}
/* ma trận đồng nhất: hình vuông đơn vị → tứ giác (px) */
function pinSquareToQuad(q) {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = q, dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2, sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  let g = 0, h = 0; if (Math.abs(sx) > 1e-9 || Math.abs(sy) > 1e-9) { const d = dx1 * dy2 - dx2 * dy1; if (Math.abs(d) < 1e-12) return null; g = (sx * dy2 - dx2 * sy) / d; h = (dx1 * sy - sx * dy1) / d; }
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
}
function pinInv(M) {
  const [a, b, c, d, e, f, g, h, i] = M, A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C; if (Math.abs(det) < 1e-12) return null; const k = 1 / det;
  return [A * k, -(b * i - c * h) * k, (b * f - c * e) * k, B * k, (a * i - c * g) * k, -(a * f - c * d) * k, C * k, -(a * h - b * g) * k, (a * e - b * d) * k];
}
const PINGL = (() => {
  let cnv = null, gl = null, prog = null, tex = null, U = {}, ok = null;
  const VS = "attribute vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }";
  const FS = `precision highp float; uniform sampler2D T; uniform mat3 Hi; uniform vec2 res; uniform vec4 src;
    vec2 uvOf(vec2 px){ vec3 q = Hi * vec3(px, 1.); return q.xy / q.z; }
    float inside(vec2 u){ return step(0., u.x) * step(u.x, 1.) * step(0., u.y) * step(u.y, 1.); }
    void main(){
      vec2 px = vec2(gl_FragCoord.x, res.y - gl_FragCoord.y);
      float cov = inside(uvOf(px + vec2(-.25, -.25))) + inside(uvOf(px + vec2(.25, -.25))) + inside(uvOf(px + vec2(-.25, .25))) + inside(uvOf(px + vec2(.25, .25)));
      if (cov < .5) { gl_FragColor = vec4(0.); return; }
      vec2 u = clamp(uvOf(px), 0., 1.);
      vec4 col = texture2D(T, src.xy + u * src.zw);
      gl_FragColor = col * (cov / 4.);
    }`;
  function init() {
    if (ok !== null) return ok; ok = false;
    try {
      cnv = document.createElement("canvas"); gl = cnv.getContext("webgl", { premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false }); if (!gl) return false;
      const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
      prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog); if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
      gl.useProgram(prog); const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const pl = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(pl); gl.vertexAttribPointer(pl, 2, gl.FLOAT, false, 0, 0);
      tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      for (const [k, v] of [[gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
      for (const n of ["T", "Hi", "res", "src"]) U[n] = gl.getUniformLocation(prog, n);
      ok = true;
    } catch (e) { console.warn("[Bravin] corner pin WebGL:", e); ok = false; }
    return ok;
  }
  return {
    draw(img, sx, sy, sw, sh, quadPx, W, H, nearest) {
      if (!init()) return null; const M = pinSquareToQuad(quadPx), Hi = M && pinInv(M); if (!Hi) return null;
      const iw = img.videoWidth || img.naturalWidth || img.width, ih = img.videoHeight || img.naturalHeight || img.height; if (!iw || !ih) return null;
      if (cnv.width !== W || cnv.height !== H) { cnv.width = W; cnv.height = H; }
      gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindTexture(gl.TEXTURE_2D, tex); const f = nearest ? gl.NEAREST : gl.LINEAR; gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
      try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img); } catch (e) { return null; }
      gl.uniform1i(U.T, 0); gl.uniform2f(U.res, W, H); gl.uniform4f(U.src, sx / iw, sy / ih, sw / iw, sh / ih);
      gl.uniformMatrix3fv(U.Hi, false, new Float32Array([Hi[0], Hi[3], Hi[6], Hi[1], Hi[4], Hi[7], Hi[2], Hi[5], Hi[8]]));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); return cnv;
    }
  };
})();
function drawPinned(ctx, img, sx, sy, sw, sh, q, W, H, nearest) {
  const P = [q[0] * W, q[1] * H, q[2] * W, q[3] * H, q[4] * W, q[5] * H, q[6] * W, q[7] * H], out = PINGL.draw(img, sx, sy, sw, sh, P, W, H, nearest);
  if (out) { ctx.drawImage(out, 0, 0); return; }
  // dự phòng: affine theo 3 góc TL, TR, BL
  ctx.save(); if (nearest) ctx.imageSmoothingEnabled = false;
  ctx.transform((P[2] - P[0]) / sw, (P[3] - P[1]) / sw, (P[6] - P[0]) / sh, (P[7] - P[1]) / sh, P[0], P[1]);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh); ctx.restore();
}
