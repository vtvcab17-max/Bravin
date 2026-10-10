"use strict";
/* ============================================================================
   Lumetri-style colour (own implementation): Basic correction, Creative,
   RGB curves, three-way colour wheels, HSL secondary, vignette, 3D LUTs
   (.cube import + built-in looks generated here), and scopes
   (waveform / RGB parade / vectorscope / histogram).
   Data on a clip:  c.adj (basic sliders) · c.filter/filterAmt (look)
   c.curves {m,r,g,b:[[x,y]…]} · c.wheels {sh,mid,hi:{x,y,l}} · c.ctint {sh,hi:{x,y}}
   c.hsl {h,r,s,dh,ds,dl,show} · c.lumv {amt,mid,round,feather} · c.lut {id,amt}
   ========================================================================== */

/* ---------- LUTs ---------- */
const LUTS = new Map(); // id → {name, n, data:Uint8Array (n*n × n RGBA), key, builtin}
function lutFromFn(id, name, fn, n = 17) {
  const data = new Uint8Array(n * n * n * 4);
  for (let b = 0; b < n; b++) for (let g2 = 0; g2 < n; g2++) for (let r = 0; r < n; r++) {
    const o = fn(r / (n - 1), g2 / (n - 1), b / (n - 1)), i = ((g2 * n * n) + b * n + r) * 4;
    data[i] = clamp(Math.round(o[0] * 255), 0, 255); data[i + 1] = clamp(Math.round(o[1] * 255), 0, 255); data[i + 2] = clamp(Math.round(o[2] * 255), 0, 255); data[i + 3] = 255;
  }
  LUTS.set(id, { id, name, n, data, key: id + ":" + n, builtin: true });
}
(function builtinLuts() {
  const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b, mix = (a, b, k) => a + (b - a) * k, sm = (a, b, x) => { const t2 = clamp((x - a) / (b - a), 0, 1); return t2 * t2 * (3 - 2 * t2); };
  const sCurve = (x, k) => x + k * (x - 0.5) * (1 - Math.abs(2 * x - 1));
  lutFromFn("b_teal", "Teal & Orange", (r, g, b) => { const L = lum(r, g, b), w = sm(0.25, 0.75, L); return [sCurve(mix(r * 0.86, r * 1.08 + 0.04, w), 0.3), sCurve(mix(g * 1.0 + 0.03, g * 0.98 + 0.01, w), 0.3), sCurve(mix(b * 1.1 + 0.07, b * 0.82, w), 0.3)]; });
  lutFromFn("b_bleach", "Bleach bypass", (r, g, b) => { const L = lum(r, g, b); return [sCurve(mix(r, L, 0.55), 0.45), sCurve(mix(g, L, 0.55), 0.45), sCurve(mix(b, L, 0.55), 0.45)]; });
  lutFromFn("b_warm", "Phim ấm", (r, g, b) => [0.04 + 0.94 * Math.pow(r, 0.92), 0.03 + 0.93 * Math.pow(g, 0.97), 0.05 + 0.85 * Math.pow(b, 1.05)]);
  lutFromFn("b_night", "Đêm xanh", (r, g, b) => { const L = lum(r, g, b); return [L * 0.55 + r * 0.25, L * 0.7 + g * 0.2, Math.min(1, L * 0.85 + b * 0.35 + 0.04)]; });
  lutFromFn("b_sepia", "Sepia", (r, g, b) => { const L = sCurve(lum(r, g, b), 0.2); return [L * 1.07 + 0.03, L * 0.9 + 0.02, L * 0.7]; });
  lutFromFn("b_matte", "Matte mềm", (r, g, b) => [0.08 + 0.84 * sCurve(r, 0.15), 0.08 + 0.84 * sCurve(g, 0.15), 0.1 + 0.8 * sCurve(b, 0.15)]);
  lutFromFn("b_cine", "Cine xanh lá", (r, g, b) => { const L = lum(r, g, b), w = sm(0.2, 0.7, L); return [sCurve(r * mix(0.9, 1.03, w), 0.25), sCurve(g * 1.02 + 0.02, 0.25), sCurve(b * mix(1.02, 0.86, w), 0.25)]; });
})();
function parseCube(text) {
  let n = 0, dmin = [0, 0, 0], dmax = [1, 1, 1]; const vals = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line[0] === "#") continue; const p = line.split(/\s+/);
    if (/^LUT_3D_SIZE$/i.test(p[0])) n = +p[1]; else if (/^DOMAIN_MIN$/i.test(p[0])) dmin = p.slice(1, 4).map(Number); else if (/^DOMAIN_MAX$/i.test(p[0])) dmax = p.slice(1, 4).map(Number);
    else if (/^LUT_1D_SIZE$/i.test(p[0])) throw new Error("LUT 1D chưa hỗ trợ, cần LUT 3D.");
    else if (/^[-+.\d]/.test(p[0]) && p.length >= 3) vals.push(+p[0], +p[1], +p[2]);
  }
  if (!n || vals.length < n * n * n * 3) throw new Error("File .cube không hợp lệ.");
  const N = Math.min(n, 33), at = (r, g2, b) => { const i = (r + g2 * n + b * n * n) * 3; return [vals[i], vals[i + 1], vals[i + 2]]; };
  const sample = (x, y, z) => { // trilinear in source grid (resamples big LUTs to 33³ for mobile GPUs)
    const fx = x * (n - 1), fy = y * (n - 1), fz = z * (n - 1), x0 = Math.floor(fx), y0 = Math.floor(fy), z0 = Math.floor(fz), x1 = Math.min(n - 1, x0 + 1), y1 = Math.min(n - 1, y0 + 1), z1 = Math.min(n - 1, z0 + 1), ax = fx - x0, ay = fy - y0, az = fz - z0;
    const out = [0, 0, 0]; for (const [xi, wx] of [[x0, 1 - ax], [x1, ax]]) for (const [yi, wy] of [[y0, 1 - ay], [y1, ay]]) for (const [zi, wz] of [[z0, 1 - az], [z1, az]]) { const v = at(xi, yi, zi), w = wx * wy * wz; out[0] += v[0] * w; out[1] += v[1] * w; out[2] += v[2] * w; } return out;
  };
  const data = new Uint8Array(N * N * N * 4);
  for (let b = 0; b < N; b++) for (let g2 = 0; g2 < N; g2++) for (let r = 0; r < N; r++) {
    const v = N === n ? at(r, g2, b) : sample(r / (N - 1), g2 / (N - 1), b / (N - 1)), i = ((g2 * N * N) + b * N + r) * 4;
    for (let k = 0; k < 3; k++) data[i + k] = clamp(Math.round((v[k] - dmin[k]) / ((dmax[k] - dmin[k]) || 1) * 255), 0, 255); data[i + 3] = 255;
  }
  return { n: N, data };
}
async function loadUserLuts() { try { const idx = await STORE.getBlob("lut:index"); for (const id of idx || []) { const o = await STORE.getBlob("lut:" + id); if (o && o.data) LUTS.set(id, { id, name: o.name, n: o.n, data: new Uint8Array(o.data), key: id + ":" + o.n }); } } catch (_) {} }
function importCube(onDone) {
  const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".cube,text/plain";
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      const { n, data } = parseCube(await f.text()), id = "u" + Date.now().toString(36), name = f.name.replace(/\.cube$/i, "");
      LUTS.set(id, { id, name, n, data, key: id + ":" + n });
      try { await STORE.putBlob("lut:" + id, { name, n, data: data.buffer.slice(0) }); const idx = (await STORE.getBlob("lut:index")) || []; idx.push(id); await STORE.putBlob("lut:index", idx); } catch (_) {}
      toast("Đã nạp LUT " + name + " (" + n + "³)."); onDone && onDone(id);
    } catch (e) { toast(e.message || "Không đọc được file LUT."); }
  };
  inp.click();
}
setTimeout(loadUserLuts, 400);

/* ---------- curves: monotone cubic through points → 256-entry tables ---------- */
function curveTable(pts) {
  const P = (pts && pts.length >= 2 ? pts : [[0, 0], [1, 1]]).slice().sort((a, b) => a[0] - b[0]), n = P.length, out = new Float32Array(256);
  const dx = [], dy = [], m = []; for (let i = 0; i < n - 1; i++) { dx[i] = Math.max(1e-6, P[i + 1][0] - P[i][0]); dy[i] = (P[i + 1][1] - P[i][1]) / dx[i]; }
  m[0] = dy[0]; m[n - 1] = dy[n - 2]; for (let i = 1; i < n - 1; i++) m[i] = dy[i - 1] * dy[i] <= 0 ? 0 : (dy[i - 1] + dy[i]) / 2;
  for (let i = 0; i < n - 1; i++) { if (Math.abs(dy[i]) < 1e-9) { m[i] = m[i + 1] = 0; continue; } const a = m[i] / dy[i], b = m[i + 1] / dy[i], h = a * a + b * b; if (h > 9) { const k = 3 / Math.sqrt(h); m[i] = k * a * dy[i]; m[i + 1] = k * b * dy[i]; } }
  for (let j = 0; j < 256; j++) {
    const x = j / 255; let i = 0; while (i < n - 2 && x > P[i + 1][0]) i++;
    if (x <= P[0][0]) { out[j] = P[0][1]; continue; } if (x >= P[n - 1][0]) { out[j] = P[n - 1][1]; continue; }
    const h = dx[i], t2 = (x - P[i][0]) / h, t3 = t2 * t2 * t2, t22 = t2 * t2;
    out[j] = clamp((2 * t3 - 3 * t22 + 1) * P[i][1] + (t3 - 2 * t22 + t2) * h * m[i] + (-2 * t3 + 3 * t22) * P[i + 1][1] + (t3 - t22) * h * m[i + 1], 0, 1);
  }
  return out;
}
const isIdentityCurve = p => !p || (p.length === 2 && p[0][0] === 0 && p[0][1] === 0 && p[1][0] === 1 && p[1][1] === 1);
const _curveCache = new Map();
function curveTexture(cv2) {
  const key = JSON.stringify(cv2); if (_curveCache.has(key)) return _curveCache.get(key);
  const M = curveTable(cv2.m), R = curveTable(cv2.r), G = curveTable(cv2.g), B = curveTable(cv2.b), data = new Uint8Array(1024);
  const idx = v => Math.round(clamp(v, 0, 1) * 255);
  for (let j = 0; j < 256; j++) { const m = M[j]; data[j * 4] = Math.round(R[idx(m)] * 255); data[j * 4 + 1] = Math.round(G[idx(m)] * 255); data[j * 4 + 2] = Math.round(B[idx(m)] * 255); data[j * 4 + 3] = 255; }
  const o = { key: "cv" + key.length + ":" + hashStr(key), data }; if (_curveCache.size > 40) _curveCache.clear(); _curveCache.set(key, o); return o;
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

/* ---------- wheels → rgb offsets ---------- */
function wheelRGB(w, k = 0.16) {
  if (!w) return [0, 0, 0]; const x = w.x || 0, y = w.y || 0, a = Math.hypot(x, y), h = Math.atan2(y, x), l = (w.l || 0) * 0.18;
  const r = Math.cos(h), g2 = Math.cos(h - 2.0944), b = Math.cos(h + 2.0944); // hue direction, zero-mean
  return [r * a * k + l, g2 * a * k + l, b * a * k + l];
}
function lumetriParams(c, out) {
  const W = c.wheels || {}, T = c.ctint || {}, add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  if (c.wheels || c.ctint) { out.shT = add(wheelRGB(W.sh), wheelRGB(T.sh, 0.1)); out.midT = wheelRGB(W.mid); out.hiT = add(wheelRGB(W.hi), wheelRGB(T.hi, 0.1)); if ([...out.shT, ...out.midT, ...out.hiT].every(v => Math.abs(v) < 1e-5)) { delete out.shT; delete out.midT; delete out.hiT; } }
  const cv2 = c.curves; if (cv2 && !["m", "r", "g", "b"].every(k => isIdentityCurve(cv2[k]))) out.curve = curveTexture(cv2);
  const H = c.hsl; if (H && (H.show || H.dh || H.ds || H.dl)) Object.assign(out, { hslOn: 1, hslH: (H.h || 0) / 360, hslR: (H.r == null ? 30 : H.r) / 360, hslS: (H.s == null ? 20 : H.s) / 360, hslDH: (H.dh || 0) / 360, hslDS: H.ds || 0, hslDL: H.dl || 0, hslShow: H.show ? 1 : 0 });
  const Lv = c.lumv; if (Lv && Lv.amt) Object.assign(out, { lvAmt: Lv.amt, lvMid: Lv.mid == null ? 0.5 : Lv.mid, lvRound: Lv.round || 0, lvFeather: Lv.feather == null ? 0.5 : Lv.feather });
  if (c.lut && c.lut.id && LUTS.has(c.lut.id) && (c.lut.amt == null || c.lut.amt > 0)) { out.lut = LUTS.get(c.lut.id); out.lutAmt = c.lut.amt == null ? 1 : c.lut.amt; }
}

/* ---------- auto tone / white balance from the clip's own frame ---------- */
function clipPixels(c, size = 64) {
  const S = frameFor(c, curLt(c), sel && sel.k === "v" ? V.indexOf(c) % 2 : 2); if (!S) return null;
  const k = scratch("lumsamp", size, size); k.ctx.drawImage(S.img, 0, 0, size, size); return k.ctx.getImageData(0, 0, size, size).data;
}
function autoTone(c) {
  const d = clipPixels(c); if (!d) { toast("Chưa có khung hình để phân tích."); return; }
  const L = []; let sum = 0; for (let i = 0; i < d.length; i += 4) { const l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255; L.push(l); sum += l; }
  L.sort((a, b) => a - b); const p1 = L[Math.floor(L.length * 0.01)], p99 = L[Math.floor(L.length * 0.99)], mean = sum / L.length;
  pushUndo(); c.adj = Object.assign({}, c.adj, { ex: clamp(Math.log2(0.46 / Math.max(0.03, mean)) * 0.8, -1, 1), wh: clamp((0.96 - p99) * 3, -1, 1), bl: clamp((0.03 - p1) * 4, -1, 1), c: clamp((0.75 - (p99 - p1)) * 0.3, -0.3, 0.3) });
  renderInspector(); drawFrame(); toast("Đã tự cân sáng cho clip.");
}
function pickWhite(c) {
  startEyedropper(hex => { const [r, g2, b] = hexRgb(hex); pushUndo(); const a = Object.assign({}, c.adj); a.temp = clamp((a.temp || 0) + (b - r) / 0.18, -1, 1); a.tint = clamp((a.tint || 0) + (g2 - (r + b) / 2) / 0.09, -1, 1); c.adj = a; renderInspector(); drawFrame(); toast("Đã cân bằng trắng theo điểm vừa chọn."); }, "Bấm vào một vùng màu trắng hoặc xám trên khung xem trước.");
}

/* ---------- small widgets ---------- */
function curveEditor(box, c) {
  const wrap = el("div", "lcurve"); const tabs = el("div", "lctabs"); let ch = "m";
  const names = [["m", "Chung"], ["r", "Đỏ"], ["g", "Lục"], ["b", "Lam"]], cols = { m: "#e7e7ec", r: "#ff6b6b", g: "#4cd98a", b: "#5aa7ff" };
  const cnv = el("canvas"); cnv.width = 520; cnv.height = 360; cnv.setAttribute("aria-label", "Đường cong màu"); cnv.style.touchAction = "none";
  const pts = () => { c.curves = c.curves || {}; if (!c.curves[ch]) c.curves[ch] = [[0, 0], [1, 1]]; return c.curves[ch]; };
  const draw = () => {
    const x = cnv.getContext("2d"), W = cnv.width, H = cnv.height; x.clearRect(0, 0, W, H); x.fillStyle = "#17181c"; x.fillRect(0, 0, W, H);
    x.strokeStyle = "rgba(255,255,255,.08)"; x.lineWidth = 1; for (let i = 1; i < 4; i++) { x.beginPath(); x.moveTo(W * i / 4, 0); x.lineTo(W * i / 4, H); x.moveTo(0, H * i / 4); x.lineTo(W, H * i / 4); x.stroke(); }
    x.strokeStyle = "rgba(255,255,255,.18)"; x.beginPath(); x.moveTo(0, H); x.lineTo(W, 0); x.stroke();
    for (const k of ["m", "r", "g", "b"]) { if (k !== ch && isIdentityCurve(c.curves && c.curves[k])) continue; const T = curveTable(c.curves && c.curves[k]); x.strokeStyle = cols[k]; x.globalAlpha = k === ch ? 1 : 0.35; x.lineWidth = k === ch ? 2.5 : 1.5; x.beginPath(); for (let j = 0; j < 256; j++) { const px = j / 255 * W, py = H - T[j] * H; j ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke(); }
    x.globalAlpha = 1; for (const p of pts()) { x.fillStyle = "#fff"; x.strokeStyle = cols[ch]; x.lineWidth = 2.5; x.beginPath(); x.arc(p[0] * W, H - p[1] * H, 7, 0, 7); x.fill(); x.stroke(); }
  };
  for (const [k, n] of names) { const b = el("button", "", n); b.type = "button"; b.setAttribute("aria-pressed", k === ch); b.style.color = k === "m" ? "" : cols[k]; b.onclick = () => { ch = k; tabs.querySelectorAll("button").forEach(z => z.setAttribute("aria-pressed", z === b)); draw(); }; tabs.appendChild(b); }
  const rs = el("button", "", "↺"); rs.type = "button"; rs.title = "Đặt lại đường cong đang chọn"; rs.onclick = () => { pushUndo(); if (c.curves) { delete c.curves[ch]; if (!Object.keys(c.curves).length) delete c.curves; } draw(); drawFrame(); }; tabs.appendChild(rs);
  const toP = e => { const r = cnv.getBoundingClientRect(); return [clamp((e.clientX - r.left) / r.width, 0, 1), clamp(1 - (e.clientY - r.top) / r.height, 0, 1)]; };
  cnv.addEventListener("pointerdown", e => {
    e.preventDefault(); const P = pts(), q = toP(e), r = cnv.getBoundingClientRect(); pushUndo();
    let i = P.findIndex(p => Math.hypot((p[0] - q[0]) * r.width, (p[1] - q[1]) * r.height) < 14);
    if (i < 0) { P.push([q[0], q[1]]); P.sort((a, b) => a[0] - b[0]); i = P.findIndex(p => p[0] === q[0] && p[1] === q[1]); }
    const end = i === 0 || i === P.length - 1, pt = P[i];
    try { cnv.setPointerCapture(e.pointerId); } catch (_) {}
    const mv = ev => { const z = toP(ev); const lo = i > 0 ? P[i - 1][0] + 0.01 : 0, hi = i < P.length - 1 ? P[i + 1][0] - 0.01 : 1; pt[0] = end ? (i === 0 ? clamp(z[0], 0, hi) : clamp(z[0], lo, 1)) : clamp(z[0], lo, hi); pt[1] = z[1]; draw(); drawFrame(); };
    const up = () => { cnv.removeEventListener("pointermove", mv); cnv.removeEventListener("pointerup", up); };
    cnv.addEventListener("pointermove", mv); cnv.addEventListener("pointerup", up); draw(); drawFrame();
  });
  cnv.addEventListener("dblclick", e => { const P = pts(), q = toP(e), r = cnv.getBoundingClientRect(); const i = P.findIndex(p => Math.hypot((p[0] - q[0]) * r.width, (p[1] - q[1]) * r.height) < 14); if (i > 0 && i < P.length - 1) { pushUndo(); P.splice(i, 1); draw(); drawFrame(); } });
  wrap.append(tabs, cnv); box.appendChild(wrap); draw();
  note(box, "Chạm lên đường để thêm điểm, kéo để uốn, chạm đúp để xoá điểm.");
}
function colorWheel(box, label, get, set, withLum = true) {
  const w = el("div", "lwheel"); const cnv = el("canvas"); cnv.width = cnv.height = 220; cnv.style.touchAction = "none"; cnv.setAttribute("aria-label", "Bánh xe màu " + label);
  const cap = el("div", "lwcap"); cap.textContent = label;
  const draw = () => {
    const x = cnv.getContext("2d"), R = 100, C2 = 110; x.clearRect(0, 0, 220, 220);
    for (let a = 0; a < 360; a += 2) { x.beginPath(); x.moveTo(C2, C2); x.arc(C2, C2, R, (a - 1.5) * Math.PI / 180, (a + 1.5) * Math.PI / 180); x.closePath(); x.fillStyle = `hsl(${-a},80%,55%)`; x.fill(); }
    const gr = x.createRadialGradient(C2, C2, 0, C2, C2, R); gr.addColorStop(0, "#2a2b31"); gr.addColorStop(1, "rgba(42,43,49,0)"); x.fillStyle = gr; x.beginPath(); x.arc(C2, C2, R, 0, 7); x.fill();
    x.strokeStyle = "rgba(255,255,255,.15)"; x.beginPath(); x.moveTo(C2 - 8, C2); x.lineTo(C2 + 8, C2); x.moveTo(C2, C2 - 8); x.lineTo(C2, C2 + 8); x.stroke();
    const v = get() || {}; const px = C2 + (v.x || 0) * R, py = C2 - (v.y || 0) * R; x.lineWidth = 3; x.strokeStyle = "#fff"; x.beginPath(); x.arc(px, py, 9, 0, 7); x.stroke();
  };
  const move = e => { const r = cnv.getBoundingClientRect(); let x = ((e.clientX - r.left) / r.width - 0.5) * 2 * 1.1, y = -((e.clientY - r.top) / r.height - 0.5) * 2 * 1.1; const L = Math.hypot(x, y); if (L > 1) { x /= L; y /= L; } const v = Object.assign({}, get(), { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 }); set(v); draw(); drawFrame(); };
  cnv.addEventListener("pointerdown", e => { e.preventDefault(); pushUndo(); try { cnv.setPointerCapture(e.pointerId); } catch (_) {} move(e); const up = () => { cnv.removeEventListener("pointermove", move); cnv.removeEventListener("pointerup", up); }; cnv.addEventListener("pointermove", move); cnv.addEventListener("pointerup", up); });
  cnv.addEventListener("dblclick", () => { pushUndo(); set(Object.assign({}, get(), { x: 0, y: 0 })); draw(); drawFrame(); });
  w.append(cnv, cap); box.appendChild(w); draw();
  if (withLum) { const s = slider(w, { label: "Độ sáng", min: -1, max: 1, step: 0.01, get: () => (get() || {}).l || 0, set: v => set(Object.assign({}, get(), { l: v })), fmt: v => (v > 0 ? "+" : "") + Math.round(v * 100) }); s.classList.add("lwl"); }
  return w;
}

/* ---------- scopes ---------- */
let scopeMode = "wave", scopeOn = false, _scopeT = 0, _scopeCv = null;
function drawScopes(force) {
  if (!scopeOn || !_scopeCv || !_scopeCv.isConnected) return; const now = performance.now(); if (!force && now - _scopeT < (playing ? 220 : 60)) return; _scopeT = now;
  const sw = _scopeCv.width, sh = Math.min(240, Math.max(32, Math.round(sw * cv.height / cv.width))), k = scratch("scopesrc", sw, sh); k.ctx.drawImage(cv, 0, 0, sw, sh); const d = k.ctx.getImageData(0, 0, sw, sh).data;
  const o = _scopeCv, x = o.getContext("2d"), W = o.width, H = o.height; x.fillStyle = "#0e0f12"; x.fillRect(0, 0, W, H);
  const img = x.getImageData(0, 0, W, H), D = img.data, plot = (px, py, r, g2, b, a = 40) => { if (px < 0 || py < 0 || px >= W || py >= H) return; const i = ((py | 0) * W + (px | 0)) * 4; D[i] = Math.min(255, D[i] + r * a / 255); D[i + 1] = Math.min(255, D[i + 1] + g2 * a / 255); D[i + 2] = Math.min(255, D[i + 2] + b * a / 255); };
  if (scopeMode === "wave" || scopeMode === "parade") {
    for (let y = 0; y < sh; y++) for (let xx = 0; xx < sw; xx++) { const i = (y * sw + xx) * 4, r = d[i], g2 = d[i + 1], b = d[i + 2];
      if (scopeMode === "wave") { const l = 0.299 * r + 0.587 * g2 + 0.114 * b; plot(xx, H - 1 - l / 255 * (H - 1), 160, 255, 190, 34); }
      else { const third = W / 3; plot(xx / sw * third, H - 1 - r / 255 * (H - 1), 255, 70, 70, 70); plot(third + xx / sw * third, H - 1 - g2 / 255 * (H - 1), 70, 255, 120, 70); plot(2 * third + xx / sw * third, H - 1 - b / 255 * (H - 1), 80, 150, 255, 70); } }
  } else if (scopeMode === "vector") {
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 6;
    for (let i = 0; i < d.length; i += 4) { const r = d[i] / 255, g2 = d[i + 1] / 255, b = d[i + 2] / 255, u = -0.169 * r - 0.331 * g2 + 0.5 * b, v = 0.5 * r - 0.419 * g2 - 0.081 * b; plot(cx + u * 2 * R, cy - v * 2 * R, d[i] * 0.6 + 100, d[i + 1] * 0.6 + 100, d[i + 2] * 0.6 + 100, 70); }
  } else {
    const hr = new Uint32Array(256), hg = new Uint32Array(256), hb = new Uint32Array(256); for (let i = 0; i < d.length; i += 4) { hr[d[i]]++; hg[d[i + 1]]++; hb[d[i + 2]]++; }
    const mx = Math.max(1, ...hr, ...hg, ...hb) * 0.9; for (let j = 0; j < 256; j++) { const xx = j / 255 * (W - 1); for (const [h, col] of [[hr, [255, 70, 70]], [hg, [70, 255, 120]], [hb, [80, 150, 255]]]) { const top = H - Math.min(H, h[j] / mx * H); for (let y = H - 1; y >= top; y--) plot(xx, y, col[0], col[1], col[2], 90); } }
  }
  x.putImageData(img, 0, 0);
  x.strokeStyle = "rgba(255,255,255,.1)"; x.lineWidth = 1; x.font = "10px ui-monospace,monospace"; x.fillStyle = "rgba(255,255,255,.35)";
  if (scopeMode === "vector") { const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 6; x.beginPath(); x.arc(cx, cy, R, 0, 7); x.arc(cx, cy, R * 0.5, 0, 7); x.stroke(); const skin = -2.15; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(skin) * R, cy + Math.sin(skin) * R); x.strokeStyle = "rgba(242,193,78,.4)"; x.stroke(); }
  else if (scopeMode !== "hist") for (const v of [0, 25, 50, 75, 100]) { const y = H - 1 - v / 100 * (H - 1); x.beginPath(); x.moveTo(0, y); x.lineTo(W, y); x.stroke(); x.fillText(v, 3, Math.max(10, y - 2)); }
}
function scopesBox(box) {
  const b = section(box, "Biểu đồ kiểm tra màu", scopeOn); const d = b.parentElement;
  const tabs = el("div", "lctabs"); for (const [k, n] of [["wave", "Waveform"], ["parade", "RGB Parade"], ["vector", "Vectorscope"], ["hist", "Histogram"]]) { const bt = el("button", "", n); bt.type = "button"; bt.setAttribute("aria-pressed", k === scopeMode); bt.onclick = () => { scopeMode = k; tabs.querySelectorAll("button").forEach(z => z.setAttribute("aria-pressed", z === bt)); drawScopes(true); }; tabs.appendChild(bt); }
  const cnv = el("canvas", "lscope"); cnv.width = 384; cnv.height = 192; b.append(tabs, cnv); _scopeCv = cnv;
  d.addEventListener("toggle", () => { scopeOn = d.open; if (scopeOn) drawScopes(true); });
  if (scopeOn) requestAnimationFrame(() => drawScopes(true));
}

/* ---------- the Lumetri panel ---------- */
const lumOpen = { basic: true };
function lsec(box, id, title, active) { const b = section(box, title, lumOpen[id] != null ? lumOpen[id] : !!active); const d = b.parentElement; d.addEventListener("toggle", () => { lumOpen[id] = d.open; }); return b; }
function lumetriPanel(box, c) {
  const A = () => c.adj || {}, setA = (k, v) => { c.adj = Object.assign({}, c.adj, { [k]: v }); if (!v) delete c.adj[k]; if (!Object.keys(c.adj).length) delete c.adj; };
  const sl = (b, k, label, min, max, opt = {}) => slider(b, { label, min, max, step: opt.step || 0.01, get: () => A()[k] || 0, set: v => setA(k, v), fmt: opt.fmt || (v => (v > 0 ? "+" : "") + (Math.abs(v) < 1 ? Math.round(v * 100) : (+v).toFixed(1))) });
  scopesBox(box);
  /* Basic */
  let b = lsec(box, "basic", "Chỉnh cơ bản", true);
  const lutOpts = { "": "Không dùng LUT" }; for (const [id, L] of LUTS) lutOpts[id] = (L.builtin ? "" : "★ ") + L.name; lutOpts.__import = "Nạp LUT .cube…";
  select(b, "LUT đầu vào", lutOpts, () => (c.lut && c.lut.id) || "", v => { if (v === "__import") { importCube(id => { pushUndo(); c.lut = { id, amt: 1 }; renderInspector(); drawFrame(); }); return; } if (!v) delete c.lut; else c.lut = { id: v, amt: c.lut && c.lut.amt != null ? c.lut.amt : 1 }; });
  if (c.lut) slider(b, { label: "Cường độ LUT", min: 0, max: 1, step: 0.01, get: () => c.lut.amt == null ? 1 : c.lut.amt, set: v => c.lut.amt = v, fmt: v => Math.round(v * 100) + "%" });
  const h1 = el("p", "lsub", "Cân bằng trắng"); b.appendChild(h1);
  btnRow(b, [["Hút điểm trắng", () => pickWhite(c)]]);
  sl(b, "temp", "Nhiệt độ", -1, 1); sl(b, "tint", "Sắc thái", -1, 1);
  b.appendChild(el("p", "lsub", "Tông"));
  sl(b, "ex", "Phơi sáng", -1, 1); sl(b, "c", "Tương phản", -0.5, 0.5); sl(b, "hi", "Vùng sáng", -1, 1); sl(b, "sh", "Vùng tối", -1, 1); sl(b, "wh", "Điểm trắng", -1, 1); sl(b, "bl", "Điểm đen", -1, 1);
  btnRow(b, [["Tự động", () => autoTone(c)], ["Đặt lại", () => { pushUndo(); for (const k of ["temp", "tint", "ex", "c", "hi", "sh", "wh", "bl", "s", "vib"]) setA(k, 0); delete c.lut; renderInspector(); drawFrame(); }]]);
  sl(b, "s", "Bão hoà", -1, 1); sl(b, "vib", "Độ rực", -1, 1);
  /* Creative */
  b = lsec(box, "creative", "Sáng tạo", !!(c.filter && c.filter !== "none"));
  const prevs = filterPreviews(c);
  tiles(b, Object.entries(FILTERS).map(([k, f]) => [k, f.n, prevs[k] || null]), c.filter || "none", k => { applyFilterTo(c, k === "none" ? undefined : k); if (k === "none") delete c.filter; renderInspector(); }, "filters");
  if (c.filter && c.filter !== "none") slider(b, { label: "Cường độ look", min: 0, max: 1, step: 0.01, get: () => c.filterAmt == null ? 1 : c.filterAmt, set: v => c.filterAmt = v, fmt: v => Math.round(v * 100) + "%" });
  sl(b, "fade", "Phim bạc màu", 0, 1); sl(b, "sharp", "Làm nét", 0, 1); sl(b, "grain", "Hạt phim", 0, 1); sl(b, "hue", "Xoay màu", -180, 180, { step: 1, fmt: v => Math.round(v) + "°" });
  const tw = el("div", "lwheels two"); b.appendChild(tw);
  colorWheel(tw, "Tông vùng tối", () => (c.ctint || {}).sh, v => { c.ctint = Object.assign({}, c.ctint, { sh: v }); }, false);
  colorWheel(tw, "Tông vùng sáng", () => (c.ctint || {}).hi, v => { c.ctint = Object.assign({}, c.ctint, { hi: v }); }, false);
  /* Curves */
  b = lsec(box, "curves", "Đường cong RGB", !!c.curves); curveEditor(b, c);
  /* Wheels */
  b = lsec(box, "wheels", "Bánh xe màu", !!c.wheels);
  const ww = el("div", "lwheels"); b.appendChild(ww);
  for (const [k, n] of [["sh", "Vùng tối"], ["mid", "Trung tính"], ["hi", "Vùng sáng"]]) colorWheel(ww, n, () => (c.wheels || {})[k], v => { c.wheels = Object.assign({}, c.wheels, { [k]: v }); });
  btnRow(b, [["Đặt lại bánh xe", () => { pushUndo(); delete c.wheels; delete c.ctint; renderInspector(); drawFrame(); }]]);
  /* HSL secondary */
  b = lsec(box, "hsl", "Chỉnh riêng một màu (HSL)", !!c.hsl);
  const H = () => c.hsl || {}, setH = (k, v) => { c.hsl = Object.assign({ h: 20, r: 30, s: 20 }, c.hsl, { [k]: v }); };
  const hueBar = el("div", "lhue"); b.appendChild(hueBar); hueBar.style.setProperty("--h", H().h || 20);
  btnRow(b, [["Hút màu cần chỉnh", () => startEyedropper(hex => { const [r, g2, bb] = hexRgb(hex), mx = Math.max(r, g2, bb), mn = Math.min(r, g2, bb), d = mx - mn; let h = 0; if (d > 1e-4) { h = mx === r ? ((g2 - bb) / d) % 6 : mx === g2 ? (bb - r) / d + 2 : (r - g2) / d + 4; h = (h * 60 + 360) % 360; } pushUndo(); setH("h", Math.round(h)); renderInspector(); drawFrame(); }, "Bấm vào màu cần chỉnh trên khung xem trước.")]]);
  slider(b, { label: "Màu chọn", min: 0, max: 360, step: 1, get: () => H().h == null ? 20 : H().h, set: v => { setH("h", v); hueBar.style.setProperty("--h", v); }, fmt: v => Math.round(v) + "°" });
  slider(b, { label: "Độ rộng", min: 2, max: 90, step: 1, get: () => H().r == null ? 30 : H().r, set: v => setH("r", v), fmt: v => Math.round(v) + "°" });
  slider(b, { label: "Viền mềm", min: 0, max: 60, step: 1, get: () => H().s == null ? 20 : H().s, set: v => setH("s", v), fmt: v => Math.round(v) + "°" });
  toggle(b, "Hiện vùng đang chọn", () => !!H().show, v => setH("show", v), "keep");
  slider(b, { label: "Đổi màu", min: -180, max: 180, step: 1, get: () => H().dh || 0, set: v => setH("dh", v), fmt: v => Math.round(v) + "°" });
  slider(b, { label: "Bão hoà", min: -1, max: 1, step: 0.01, get: () => H().ds || 0, set: v => setH("ds", v), fmt: v => (v > 0 ? "+" : "") + Math.round(v * 100) });
  slider(b, { label: "Độ sáng", min: -1, max: 1, step: 0.01, get: () => H().dl || 0, set: v => setH("dl", v), fmt: v => (v > 0 ? "+" : "") + Math.round(v * 100) });
  if (c.hsl) btnRow(b, [["Bỏ chỉnh HSL", () => { pushUndo(); delete c.hsl; renderInspector(); drawFrame(); }]]);
  /* Vignette */
  b = lsec(box, "vig", "Tối viền", !!(c.lumv && c.lumv.amt));
  const Lv = () => c.lumv || {}, setV = (k, v) => { c.lumv = Object.assign({ amt: 0, mid: 0.5, round: 0, feather: 0.5 }, c.lumv, { [k]: v }); };
  slider(b, { label: "Mức", min: -1, max: 1, step: 0.01, get: () => Lv().amt || 0, set: v => setV("amt", v), fmt: v => (v > 0 ? "+" : "") + Math.round(v * 100) });
  slider(b, { label: "Điểm giữa", min: 0, max: 1, step: 0.01, get: () => Lv().mid == null ? 0.5 : Lv().mid, set: v => setV("mid", v) });
  slider(b, { label: "Độ tròn", min: -1, max: 1, step: 0.01, get: () => Lv().round || 0, set: v => setV("round", v) });
  slider(b, { label: "Viền mềm", min: 0, max: 1, step: 0.01, get: () => Lv().feather == null ? 0.5 : Lv().feather, set: v => setV("feather", v) });
  /* footer */
  btnRow(box, [["Đặt lại toàn bộ màu", () => { pushUndo(); for (const k of ["adj", "filter", "filterAmt", "curves", "wheels", "ctint", "hsl", "lumv", "lut"]) delete c[k]; renderInspector(); drawFrame(); }], sel.k === "v" ? ["Áp dụng cho mọi cảnh", () => { pushUndo(); const keys = ["adj", "filter", "filterAmt", "curves", "wheels", "ctint", "hsl", "lumv", "lut"]; for (const x of V) if (x !== c) for (const k of keys) { if (c[k] == null) delete x[k]; else x[k] = JSON.parse(JSON.stringify(c[k])); } renderAll(); toast("Đã áp dụng màu cho " + V.length + " cảnh."); }] : null].filter(Boolean));
  if (!GLFX.available()) note(box, "Thiết bị này không hỗ trợ WebGL nên chỉnh màu nâng cao sẽ không hiện.");
}
