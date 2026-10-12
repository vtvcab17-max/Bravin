/* Bravin Motion Tracking — lõi thuật toán (không phụ thuộc DOM, chạy được cả trong Node để kiểm thử).
   Planar tracker: điểm đặc trưng Shi-Tomasi + Lucas-Kanade kim tự tháp (kiểm tra xuôi/ngược)
   + RANSAC (tịnh tiến / tương tự / phối cảnh) + chống trôi bằng cách căn lại về khung neo
   + xử lý che khuất (dự đoán theo vận tốc, tự bắt lại khi vùng hiện ra). */
(function (root) {
  "use strict";
  /* ===== ma trận 3x3 (mảng 9 phần tử, hàng trước) ===== */
  const I3 = () => [1, 0, 0, 0, 1, 0, 0, 0, 1];
  function mul(A, B) { const C = new Array(9); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) C[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c]; return C; }
  function inv(M) {
    const [a, b, c, d, e, f, g, h, i] = M, A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
    if (Math.abs(det) < 1e-12) return null; const k = 1 / det;
    return [A * k, -(b * i - c * h) * k, (b * f - c * e) * k, B * k, (a * i - c * g) * k, -(a * f - c * d) * k, C * k, -(a * h - b * g) * k, (a * e - b * d) * k];
  }
  function apply(H, x, y) { const w = H[6] * x + H[7] * y + H[8]; return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w]; }
  const norm9 = H => { const s = H[8]; return Math.abs(s) > 1e-12 ? H.map(v => v / s) : H; };
  /* đổi hệ toạ độ: H trên pixel (w,h) -> H trên toạ độ chuẩn 0..1 và ngược lại */
  const toNorm = (H, w, h) => norm9(mul(mul([1 / w, 0, 0, 0, 1 / h, 0, 0, 0, 1], H), [w, 0, 0, 0, h, 0, 0, 0, 1]));
  const fromNorm = (H, w, h) => norm9(mul(mul([w, 0, 0, 0, h, 0, 0, 0, 1], H), [1 / w, 0, 0, 0, 1 / h, 0, 0, 0, 1]));

  /* ===== ảnh ===== */
  function toGray(rgba, w, h) { const g = new Float32Array(w * h); for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]; return g; }
  function blur5(src, w, h) { // [1 4 6 4 1]/16 tách hai chiều
    const t = new Float32Array(w * h), o = new Float32Array(w * h);
    for (let y = 0; y < h; y++) { const r = y * w; for (let x = 0; x < w; x++) { const a = x > 1 ? x - 2 : 0, b = x > 0 ? x - 1 : 0, c = x < w - 1 ? x + 1 : w - 1, d = x < w - 2 ? x + 2 : w - 1; t[r + x] = (src[r + a] + 4 * src[r + b] + 6 * src[r + x] + 4 * src[r + c] + src[r + d]) / 16; } }
    for (let y = 0; y < h; y++) { const a = (y > 1 ? y - 2 : 0) * w, b = (y > 0 ? y - 1 : 0) * w, c = (y < h - 1 ? y + 1 : h - 1) * w, d = (y < h - 2 ? y + 2 : h - 1) * w, r = y * w; for (let x = 0; x < w; x++) o[r + x] = (t[a + x] + 4 * t[b + x] + 6 * t[r + x] + 4 * t[c + x] + t[d + x]) / 16; }
    return o;
  }
  function down2(src, w, h) { const b = blur5(src, w, h), W = Math.max(1, w >> 1), H = Math.max(1, h >> 1), o = new Float32Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) o[y * W + x] = b[(2 * y) * w + 2 * x]; return { d: o, w: W, h: H }; }
  function grads(d, w, h) { // Scharr / 32  ≈ đạo hàm theo pixel
    const gx = new Float32Array(w * h), gy = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x, tl = d[i - w - 1], t = d[i - w], tr = d[i - w + 1], l = d[i - 1], r = d[i + 1], bl = d[i + w - 1], b = d[i + w], br = d[i + w + 1];
      gx[i] = (3 * (tr - tl) + 10 * (r - l) + 3 * (br - bl)) / 32; gy[i] = (3 * (bl - tl) + 10 * (b - t) + 3 * (br - tr)) / 32;
    }
    return { gx, gy };
  }
  function pyramid(gray, w, h, levels) {
    const P = []; let cur = { d: blur5(gray, w, h), w, h };
    for (let L = 0; L < levels; L++) { const g = grads(cur.d, cur.w, cur.h); P.push({ d: cur.d, w: cur.w, h: cur.h, gx: g.gx, gy: g.gy }); if (L < levels - 1) { if (cur.w < 40 || cur.h < 40) break; cur = down2(cur.d, cur.w, cur.h); } }
    return P;
  }
  function bil(d, w, h, x, y) {
    if (x < 0) x = 0; else if (x > w - 1.001) x = w - 1.001; if (y < 0) y = 0; else if (y > h - 1.001) y = h - 1.001;
    const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * w + x0;
    return (d[i] * (1 - fx) + d[i + 1] * fx) * (1 - fy) + (d[i + w] * (1 - fx) + d[i + w + 1] * fx) * fy;
  }

  /* ===== đa giác ===== */
  function inPoly(poly, x, y) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi) c = !c; } return c; }
  function segDist(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0, x = ax + t * dx - px, y = ay + t * dy - py; return Math.sqrt(x * x + y * y); }
  function edgeDist(poly, x, y) { let m = Infinity; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) m = Math.min(m, segDist(x, y, poly[j][0], poly[j][1], poly[i][0], poly[i][1])); return m; }
  function bbox(poly) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of poly) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; } return { x0, y0, x1, y1 }; }
  function area(poly) { let a = 0; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1]); return a / 2; }

  /* ===== điểm đặc trưng Shi-Tomasi trong vùng ===== */
  function goodFeatures(lv, poly, opt) {
    const { d, w, h, gx, gy } = lv, maxN = opt.maxN || 160, minDist = opt.minDist || 6, margin = opt.margin == null ? 3 : opt.margin;
    const b = bbox(poly), X0 = Math.max(2, Math.floor(b.x0)), Y0 = Math.max(2, Math.floor(b.y0)), X1 = Math.min(w - 3, Math.ceil(b.x1)), Y1 = Math.min(h - 3, Math.ceil(b.y1));
    if (X1 <= X0 || Y1 <= Y0) return [];
    const BW = X1 - X0 + 1, BH = Y1 - Y0 + 1, eig = new Float32Array(BW * BH), R = 2;
    for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
      let a = 0, bb = 0, c = 0;
      for (let j = -R; j <= R; j++) { const r = (y + j) * w; for (let i = -R; i <= R; i++) { const u = gx[r + x + i], v = gy[r + x + i]; a += u * u; bb += u * v; c += v * v; } }
      eig[(y - Y0) * BW + x - X0] = (a + c - Math.sqrt((a - c) * (a - c) + 4 * bb * bb)) / 2;
    }
    let mx = 0; for (let i = 0; i < eig.length; i++) if (eig[i] > mx) mx = eig[i];
    const thr = mx * (opt.quality || 0.01), cand = [];
    for (let y = Y0 + 1; y < Y1; y++) for (let x = X0 + 1; x < X1; x++) {
      const v = eig[(y - Y0) * BW + x - X0]; if (v <= thr || v < 1) continue;
      let peak = true; for (let j = -1; j <= 1 && peak; j++) for (let i = -1; i <= 1; i++) if ((i || j) && eig[(y - Y0 + j) * BW + x - X0 + i] > v) { peak = false; break; }
      if (!peak || !inPoly(poly, x, y) || edgeDist(poly, x, y) < margin) continue;
      cand.push([v, x, y]);
    }
    cand.sort((p, q) => q[0] - p[0]);
    const cs = Math.max(1, minDist), gw = Math.ceil(w / cs) + 1, grid = new Map(), out = [];
    for (const [, x, y] of cand) {
      const gxi = (x / cs) | 0, gyi = (y / cs) | 0; let ok = true;
      for (let j = -1; j <= 1 && ok; j++) for (let i = -1; i <= 1; i++) { const L = grid.get((gyi + j) * gw + gxi + i); if (L) for (const [px, py] of L) if ((px - x) * (px - x) + (py - y) * (py - y) < minDist * minDist) { ok = false; break; } if (!ok) break; }
      if (!ok) continue; const k = gyi * gw + gxi; (grid.get(k) || grid.set(k, []).get(k)).push([x, y]); out.push([x, y]); if (out.length >= maxN) break;
    }
    return out;
  }

  /* ===== Lucas-Kanade kim tự tháp =====
     pts: [[x,y]] trên ảnh A (mức 0); guess: [[dx,dy]] dịch chuyển dự đoán hoặc null.
     → [{x,y,ok,err}] trên ảnh B */
  function lk(PA, PB, pts, guess, opt) {
    const win = opt.win || 7, iters = opt.iters || 12, eps = opt.eps || 0.03, top = Math.min(PA.length, PB.length) - 1, N = (2 * win + 1) * (2 * win + 1);
    const pa = new Float32Array(N), pgx = new Float32Array(N), pgy = new Float32Array(N), out = [];
    for (let n = 0; n < pts.length; n++) {
      const px = pts[n][0], py = pts[n][1]; let dx = guess ? guess[n][0] / (1 << top) : 0, dy = guess ? guess[n][1] / (1 << top) : 0, ok = true, err = 0;
      for (let L = top; L >= 0; L--) {
        const A = PA[L], B = PB[L], s = 1 << L, ax = px / s, ay = py / s;
        if (ax < 1 || ay < 1 || ax > A.w - 2 || ay > A.h - 2) { ok = false; break; }
        let G11 = 0, G12 = 0, G22 = 0, k = 0;
        for (let j = -win; j <= win; j++) for (let i = -win; i <= win; i++, k++) { const x = ax + i, y = ay + j; pa[k] = bil(A.d, A.w, A.h, x, y); const u = pgx[k] = bil(A.gx, A.w, A.h, x, y), v = pgy[k] = bil(A.gy, A.w, A.h, x, y); G11 += u * u; G12 += u * v; G22 += v * v; }
        const det = G11 * G22 - G12 * G12, minE = (G11 + G22 - Math.sqrt((G11 - G22) * (G11 - G22) + 4 * G12 * G12)) / 2 / N;
        if (det < 1e-9 || minE < (opt.minEig || 0.02)) { if (L === 0) { ok = false; break; } dx *= 2; dy *= 2; continue; }
        let vx = 0, vy = 0;
        for (let it = 0; it < iters; it++) {
          const bx0 = ax + dx + vx, by0 = ay + dy + vy;
          if (bx0 < -win || by0 < -win || bx0 > B.w + win || by0 > B.h + win) { ok = false; break; }
          let bx = 0, by = 0; k = 0; err = 0;
          for (let j = -win; j <= win; j++) for (let i = -win; i <= win; i++, k++) { const diff = pa[k] - bil(B.d, B.w, B.h, bx0 + i, by0 + j); bx += diff * pgx[k]; by += diff * pgy[k]; err += diff < 0 ? -diff : diff; }
          const nx = (G22 * bx - G12 * by) / det, ny = (G11 * by - G12 * bx) / det; vx += nx; vy += ny;
          if (nx * nx + ny * ny < eps * eps) break;
        }
        if (!ok) break;
        if (L > 0) { dx = 2 * (dx + vx); dy = 2 * (dy + vy); } else { dx += vx; dy += vy; }
      }
      const x = px + dx, y = py + dy, B0 = PB[0];
      if (x < 0 || y < 0 || x > B0.w - 1 || y > B0.h - 1) ok = false;
      out.push({ x, y, ok, err: err / N });
    }
    return out;
  }

  /* ===== ước lượng mô hình ===== */
  function fitT(S, D, idx) { let x = 0, y = 0; for (const i of idx) { x += D[i][0] - S[i][0]; y += D[i][1] - S[i][1]; } x /= idx.length; y /= idx.length; return [1, 0, x, 0, 1, y, 0, 0, 1]; }
  function fitS(S, D, idx) {
    let sx = 0, sy = 0, dx = 0, dy = 0; const n = idx.length; for (const i of idx) { sx += S[i][0]; sy += S[i][1]; dx += D[i][0]; dy += D[i][1]; } sx /= n; sy /= n; dx /= n; dy /= n;
    let ss = 0, a = 0, b = 0; for (const i of idx) { const x = S[i][0] - sx, y = S[i][1] - sy, u = D[i][0] - dx, v = D[i][1] - dy; ss += x * x + y * y; a += x * u + y * v; b += x * v - y * u; }
    if (ss < 1e-9) return fitT(S, D, idx); a /= ss; b /= ss;
    return [a, -b, dx - (a * sx - b * sy), b, a, dy - (b * sx + a * sy), 0, 0, 1];
  }
  function normT(P, idx) { let cx = 0, cy = 0; for (const i of idx) { cx += P[i][0]; cy += P[i][1]; } cx /= idx.length; cy /= idx.length; let m = 0; for (const i of idx) m += Math.hypot(P[i][0] - cx, P[i][1] - cy); m = m / idx.length || 1; const s = Math.SQRT2 / m; return [s, 0, -s * cx, 0, s, -s * cy, 0, 0, 1]; }
  function solve(A, b) { // Gauss có chọn trụ, A n×n (mảng các hàng)
    const n = b.length; for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; if (Math.abs(A[p][c]) < 1e-14) return null; [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]]; for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; if (!f) continue; for (let k = c; k < n; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; } }
    const x = new Array(n); for (let r = n - 1; r >= 0; r--) { let s = b[r]; for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k]; x[r] = s / A[r][r]; } return x;
  }
  function fitH(S, D, idx) {
    if (idx.length < 4) return null; const Ts = normT(S, idx), Td = normT(D, idx);
    const AtA = Array.from({ length: 8 }, () => new Array(8).fill(0)), Atb = new Array(8).fill(0);
    for (const i of idx) {
      const [x, y] = apply(Ts, S[i][0], S[i][1]), [u, v] = apply(Td, D[i][0], D[i][1]);
      const r1 = [x, y, 1, 0, 0, 0, -u * x, -u * y], r2 = [0, 0, 0, x, y, 1, -v * x, -v * y];
      for (let a = 0; a < 8; a++) { Atb[a] += r1[a] * u + r2[a] * v; for (let b = 0; b < 8; b++) AtA[a][b] += r1[a] * r1[b] + r2[a] * r2[b]; }
    }
    const h = solve(AtA, Atb); if (!h || h.some(v => !isFinite(v))) return null;
    const Hn = [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1], Ti = inv(Td); if (!Ti) return null;
    return norm9(mul(mul(Ti, Hn), Ts));
  }
  const FIT = { trans: [fitT, 1], sim: [fitS, 2], persp: [fitH, 4] };
  function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function sane(H, model) { if (!H || H.some(v => !isFinite(v))) return false; if (model !== "persp") return true; const det = H[0] * H[4] - H[1] * H[3]; return det > 0.02 && det < 50 && Math.abs(H[6]) < 0.02 && Math.abs(H[7]) < 0.02; }
  function inliersOf(H, S, D, thr) { const t2 = thr * thr, out = []; for (let i = 0; i < S.length; i++) { const [x, y] = apply(H, S[i][0], S[i][1]), e = (x - D[i][0]) ** 2 + (y - D[i][1]) ** 2; if (e < t2) out.push(i); } return out; }
  function ransac(S, D, model, thr, seed) {
    const [fit, m] = FIT[model], n = S.length; if (n < Math.max(m, model === "persp" ? 6 : m)) return null;
    const rand = rng(seed || 7); let best = null, bestIn = [], iters = 400, it = 0;
    const all = [...Array(n).keys()];
    while (it++ < iters) {
      const s = new Set(); while (s.size < m) s.add((rand() * n) | 0); const idx = [...s];
      if (model === "persp") { const p = idx.map(i => S[i]); let bad = false; for (let a = 0; a < 4 && !bad; a++) for (let b = a + 1; b < 4 && !bad; b++) for (let c = b + 1; c < 4; c++) { const ar = Math.abs((p[b][0] - p[a][0]) * (p[c][1] - p[a][1]) - (p[c][0] - p[a][0]) * (p[b][1] - p[a][1])); if (ar < 4) { bad = true; break; } } if (bad) continue; }
      const H = fit(S, D, idx); if (!sane(H, model)) continue;
      const inl = inliersOf(H, S, D, thr);
      if (inl.length > bestIn.length) { best = H; bestIn = inl; const w = inl.length / n, p = Math.pow(w, m); iters = Math.min(400, Math.max(20, Math.ceil(Math.log(0.01) / Math.log(1 - Math.max(1e-6, Math.min(0.999999, p)))))); }
    }
    if (!best || bestIn.length < m) return null;
    for (let k = 0; k < 3; k++) { const H = fit(S, D, bestIn); if (!sane(H, model)) break; const inl = inliersOf(H, S, D, thr); if (inl.length < bestIn.length) break; best = H; bestIn = inl; }
    let e = 0; for (const i of bestIn) { const [x, y] = apply(best, S[i][0], S[i][1]); e += Math.hypot(x - D[i][0], y - D[i][1]); }
    return { H: best, inliers: bestIn, count: bestIn.length, ratio: bestIn.length / n, rms: e / Math.max(1, bestIn.length), all };
  }

  /* ===== nắn ảnh hiện tại về hệ toạ độ khung neo (chỉ trong hộp quanh vùng) ===== */
  function warpCrop(lv, H, box) {
    const w = box.x1 - box.x0, h = box.y1 - box.y0, o = new Float32Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const X = box.x0 + i, Y = box.y0 + j, ww = H[6] * X + H[7] * Y + H[8]; o[j * w + i] = bil(lv.d, lv.w, lv.h, (H[0] * X + H[1] * Y + H[2]) / ww, (H[3] * X + H[4] * Y + H[5]) / ww); }
    return o;
  }
  function crop(lv, box) { const w = box.x1 - box.x0, h = box.y1 - box.y0, o = new Float32Array(w * h); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) o[j * w + i] = lv.d[(box.y0 + j) * lv.w + box.x0 + i]; return o; }
  function rawPyr(d, w, h, levels) { // ảnh đã sẵn (không làm mờ lần đầu để giữ chi tiết)
    const P = []; let cur = { d, w, h };
    for (let L = 0; L < levels; L++) { const g = grads(cur.d, cur.w, cur.h); P.push({ d: cur.d, w: cur.w, h: cur.h, gx: g.gx, gy: g.gy }); if (L < levels - 1) { if (cur.w < 30 || cur.h < 30) break; cur = down2(cur.d, cur.w, cur.h); } }
    return P;
  }

  /* ===== Tracker =====
     opts: { model: 'persp'|'sim'|'trans', maxPts, antiDrift, occlusion, maxLost }
     setAnchor(gray,w,h, polyPx, Hanchor)  — polyPx: vùng trên khung neo; Hanchor: ref → neo (pixel).
     step(gray) → { H (ref→khung hiện tại, pixel), conf, lost, stop, pts:[[x,y,inlier]] } */
  class Tracker {
    constructor(opts) { this.o = Object.assign({ model: "persp", maxPts: 160, antiDrift: true, occlusion: true, maxLost: 45, levels: 4 }, opts || {}); }
    setAnchor(gray, w, h, polyPx, Hanchor) {
      const o = this.o; this.w = w; this.h = h; this.Ha = Hanchor || I3(); this.poly = polyPx.map(p => p.slice());
      this.pyr = pyramid(gray, w, h, o.levels);
      let pts = goodFeatures(this.pyr[0], polyPx, { maxN: o.maxPts, minDist: Math.max(4, Math.round(Math.min(w, h) / 90)), quality: 0.01 });
      if (pts.length < 12) pts = goodFeatures(this.pyr[0], polyPx, { maxN: o.maxPts, minDist: 3, quality: 0.002, margin: 1 });
      this.ref = pts; this.G = I3(); this.Mlast = I3(); this.lostRun = 0; this.prevOk = true;
      // hộp chống trôi: quanh vùng, nới 20%
      const b = bbox(polyPx), mx = Math.max(16, (b.x1 - b.x0) * 0.2), my = Math.max(16, (b.y1 - b.y0) * 0.2);
      this.box = { x0: Math.max(0, Math.floor(b.x0 - mx)), y0: Math.max(0, Math.floor(b.y0 - my)), x1: Math.min(w, Math.ceil(b.x1 + mx)), y1: Math.min(h, Math.ceil(b.y1 + my)) };
      const bw = this.box.x1 - this.box.x0, bh = this.box.y1 - this.box.y0;
      this.boxPyr = rawPyr(crop(this.pyr[0], this.box), bw, bh, 3);
      this.refBox = pts.map(([x, y]) => [x - this.box.x0, y - this.box.y0]);
      return pts.length;
    }
    get features() { return this.ref.length; }
    step(gray) {
      const o = this.o, P = pyramid(gray, this.w, this.h, o.levels), S = this.ref, n = S.length;
      if (n < 4) return { H: mul(this.G, this.Ha), conf: 0, lost: true, stop: true, pts: [] };
      // 1) khung trước → khung này
      const prev = S.map(p => apply(this.G, p[0], p[1])), pred = prev.map(p => { const q = apply(this.Mlast, p[0], p[1]); return [q[0] - p[0], q[1] - p[1]]; });
      const fw = lk(this.pyr, P, prev, pred, { win: 7, iters: 12 });
      const bwIn = [], bwIdx = []; for (let i = 0; i < n; i++) if (fw[i].ok) { bwIn.push([fw[i].x, fw[i].y]); bwIdx.push(i); }
      const bk = bwIn.length ? lk(P, this.pyr, bwIn, null, { win: 7, iters: 12 }) : [];
      const Ssel = [], Dsel = [], Isel = [];
      for (let k = 0; k < bwIdx.length; k++) { const i = bwIdx[k], b = bk[k]; if (b.ok && Math.hypot(b.x - prev[i][0], b.y - prev[i][1]) < 1.0) { Ssel.push(S[i]); Dsel.push([fw[i].x, fw[i].y]); Isel.push(i); } }
      // mô hình: tham chiếu → khung này, khớp trực tiếp từ điểm gốc (không cộng dồn sai số)
      let res = Ssel.length >= 6 ? ransac(Ssel, Dsel, o.model, 1.5, 11) : null, Gc = null, conf = 0, inl = new Set();
      const minIn = Math.max(6, Math.round(n * 0.12));
      if (res && res.count >= minIn) {
        Gc = res.H; conf = Math.min(1, res.count / Math.max(8, n * 0.5)); res.inliers.forEach(k => inl.add(Isel[k]));
        // bị che một phần: điểm còn thấy dồn vào một góc → phối cảnh ngoại suy kém, chỉ cập nhật bước tương tự rồi giữ phối cảnh cũ
        if (o.model === "persp") { const cov = coverage(res.inliers.map(k => Ssel[k]), S); if (cov < 0.4) { const P0 = res.inliers.map(k => apply(this.G, Ssel[k][0], Ssel[k][1])), D0 = res.inliers.map(k => Dsel[k]); Gc = mul(fitModel(P0, D0, "sim"), this.G); conf *= 0.7; this.partial = true; } else this.partial = false; }
      }
      else Gc = o.occlusion ? mul(this.Mlast, this.G) : this.G;
      // 2) chống trôi: so khớp lại với khung neo
      let refOk = false;
      if (o.antiDrift || !res || res.count < minIn) {
        const box = this.box, bw = box.x1 - box.x0, bh = box.y1 - box.y0, Wp = rawPyr(warpCrop(P[0], Gc, box), bw, bh, 3);
        const r2 = lk(this.boxPyr, Wp, this.refBox, null, { win: 6, iters: 10 }), S2 = [], D2 = [], I2 = [];
        for (let i = 0; i < n; i++) if (r2[i].ok && r2[i].err < 28) { S2.push(S[i]); D2.push(apply(Gc, r2[i].x + box.x0, r2[i].y + box.y0)); I2.push(i); }
        const rr = S2.length >= 6 ? ransac(S2, D2, o.model, 2.0, 23) : null;
        if (rr && rr.count >= Math.max(8, n * 0.2)) {
          // chỉ nhận nếu không nhảy quá xa so với dự đoán
          const b = bbox(this.poly); let jump = 0; for (const [x, y] of [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]]) { const p = apply(Gc, x, y), q = apply(rr.H, x, y); jump = Math.max(jump, Math.hypot(p[0] - q[0], p[1] - q[1])); }
          const lim = Math.max(12, 0.35 * Math.hypot(b.x1 - b.x0, b.y1 - b.y0));
          if (jump < lim || !res || res.count < minIn) { Gc = rr.H; refOk = true; conf = Math.max(conf, Math.min(1, rr.count / Math.max(8, n * 0.45))); rr.inliers.forEach(k => inl.add(I2[k])); }
        }
      }
      const good = (res && res.count >= minIn) || refOk;
      if (good) { this.Mlast = mul(Gc, inv(this.G) || I3()); this.lostRun = 0; }
      else { this.lostRun++; conf = 0; this.Mlast = damp(this.Mlast, 0.85); }
      this.G = Gc; this.pyr = P;
      const H = mul(this.G, this.Ha), pts = S.map((p, i) => { const q = apply(this.G, p[0], p[1]); return [q[0], q[1], inl.has(i) ? 1 : 0]; });
      return { H, conf, lost: !good, stop: this.lostRun > o.maxLost, pts };
    }
  }
  function coverage(sub, all) { const a = bbox(all), b = bbox(sub), A = (a.x1 - a.x0) * (a.y1 - a.y0); return A > 0 ? (b.x1 - b.x0) * (b.y1 - b.y0) / A : 0; }
  function damp(M, k) { return [1 + (M[0] - 1) * k, M[1] * k, M[2] * k, M[3] * k, 1 + (M[4] - 1) * k, M[5] * k, M[6] * k, M[7] * k, 1]; }

  /* ===== tiện ích cho app ===== */
  function fitModel(S, D, model) { const idx = [...Array(S.length).keys()]; const m = model === "persp" && S.length >= 4 ? "persp" : S.length >= 2 && model !== "trans" ? "sim" : "trans"; return FIT[m][0](S, D, idx); }
  function similarityOf(H, poly) { // góc (độ, theo chiều kim đồng hồ trên màn hình), tỉ lệ, tâm
    const D = poly.map(p => apply(H, p[0], p[1])), idx = [...Array(poly.length).keys()], M = fitS(poly, D, idx);
    let cx = 0, cy = 0; for (const p of poly) { cx += p[0]; cy += p[1]; } cx /= poly.length; cy /= poly.length;
    const c = apply(H, cx, cy); return { cx: c[0], cy: c[1], angle: Math.atan2(M[3], M[0]) * 180 / Math.PI, scale: Math.hypot(M[0], M[3]) };
  }
  function smoothSeries(arr, sigma) { // arr: [[...số]] theo khung, null = không có
    if (!sigma) return arr; const R = Math.ceil(sigma * 2.5), wts = []; for (let k = -R; k <= R; k++) wts.push(Math.exp(-k * k / (2 * sigma * sigma)));
    return arr.map((v, i) => { if (!v) return v; const s = new Array(v.length).fill(0); let W = 0; for (let k = -R; k <= R; k++) { const u = arr[i + k]; if (!u) continue; const w = wts[k + R]; W += w; for (let j = 0; j < v.length; j++) s[j] += u[j] * w; } return s.map(x => x / W); });
  }
  const API = { Tracker, I3, mul, inv, apply, toNorm, fromNorm, toGray, pyramid, goodFeatures, lk, ransac, fitModel, similarityOf, smoothSeries, inPoly, area, bbox };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.MT = API;
})(typeof window !== "undefined" ? window : globalThis);
