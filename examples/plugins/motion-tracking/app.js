/* Bravin Motion Tracking — giao diện plugin (chạy trong khung cách ly của Bravin, nói chuyện qua SDK). */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const S = {
    bv: null, clip: null, sess: null, W: 0, H: 0, fps: 30, nF: 0, f: 0,
    cache: new Map(), poly: [], closed: false, refF: 0, track: [], anchors: new Set(),
    tool: "pen", busy: false, stop: false, drag: null, hover: -1, selPt: -1, lastSel: [], saveT: 0
  };
  const MT = window.MT;

  /* ---------- tiện ích ---------- */
  const fmt = s => { const m = Math.floor(s / 60), r = s - m * 60; return m + ":" + (r < 10 ? "0" : "") + r.toFixed(2); };
  const hint = (t, cls) => { const h = $("hint"); h.textContent = t || ""; h.className = "hint" + (cls ? " " + cls : ""); };
  const stat = (t, cls) => { const h = $("stat"); h.textContent = t; h.className = "stat" + (cls ? " " + cls : ""); };
  const toast = t => S.bv && S.bv.ui.toast(t).catch(() => {});
  const busy = t => { const b = $("busy"); b.hidden = !t; b.textContent = t || ""; };
  const tOf = f => f / S.fps;
  const clampF = f => Math.max(0, Math.min(S.nF - 1, f | 0));
  const model = () => $("model").value;
  const pxPoly = (poly, H) => poly.map(p => { const q = H ? MT.apply(H, p[0], p[1]) : p; return [q[0] * S.W, q[1] * S.H]; });
  const polyAt = f => { const r = S.track[f]; if (r) return S.poly.map(p => MT.apply(r.H, p[0], p[1])); return f === S.refF && !S.track.some(Boolean) ? S.poly : null; };

  /* ---------- khung hình ---------- */
  async function frame(f) {
    f = clampF(f); let fr = S.cache.get(f); if (fr) { S.cache.delete(f); S.cache.set(f, fr); return fr; }
    const r = await S.bv.frames.get(S.sess.session, tOf(f) + 0.5 / S.fps * 0.2);
    const rgba = new Uint8ClampedArray(r.data); fr = { img: new ImageData(rgba, r.width, r.height), gray: MT.toGray(rgba, r.width, r.height) };
    S.cache.set(f, fr); while (S.cache.size > 48) S.cache.delete(S.cache.keys().next().value);
    return fr;
  }
  async function show(f, opts) {
    if (!S.sess) return; f = clampF(f); S.f = f; $("seek").value = f; $("tc").textContent = fmt(tOf(f)) + " · khung " + (f + 1) + "/" + S.nF;
    try { const fr = await frame(f); if (S.f !== f) return; const c = $("cvFrame").getContext("2d"); c.putImageData(fr.img, 0, 0); } catch (e) { hint("Không đọc được khung hình: " + e.message, "bad"); }
    drawOv(); drawBar(); if (!opts || !opts.noSeek) syncBravin();
    if (!S.busy) updateHint();
  }
  let seekT = 0; function syncBravin() { clearTimeout(seekT); seekT = setTimeout(() => { if (S.clip) S.bv.timeline.seek(S.clip.start + tOf(S.f) + 0.001).catch(() => {}); }, 120); }

  /* ---------- vẽ lớp phủ ---------- */
  function layout() {
    const fc = $("cvFrame"), ov = $("cvOv"), v = $("view"), r = v.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    if (S.W) { const k = Math.min(r.width / S.W, r.height / S.H); fc.style.width = Math.floor(S.W * k) + "px"; fc.style.height = Math.floor(S.H * k) + "px"; }
    const fr = fc.getBoundingClientRect();
    ov.width = Math.round(r.width * dpr); ov.height = Math.round(r.height * dpr);
    S.vx = (fr.left - r.left) * dpr; S.vy = (fr.top - r.top) * dpr; S.vs = (fr.width * dpr) / (S.W || 1); S.dpr = dpr;
  }
  const toScr = (x, y) => [S.vx + x * S.W * S.vs, S.vy + y * S.H * S.vs];          // chuẩn 0..1 → px lớp phủ
  const fromEvt = e => { const r = $("cvOv").getBoundingClientRect(), x = (e.clientX - r.left) * S.dpr, y = (e.clientY - r.top) * S.dpr; return [(x - S.vx) / S.vs / S.W, (y - S.vy) / S.vs / S.H, x, y]; };
  function drawOv() {
    const ov = $("cvOv"), g = ov.getContext("2d"); g.clearRect(0, 0, ov.width, ov.height); if (!S.sess) return;
    const P = curPoly(), d = S.dpr || 1, rec = S.track[S.f];
    // điểm đặc trưng gần nhất (chỉ khi vừa theo dõi)
    if (S.lastPts && S.lastPtsF === S.f) for (const [x, y, ok] of S.lastPts) { const [a, b] = toScr(x / S.W, y / S.H); g.fillStyle = ok ? "rgba(111,220,154,.9)" : "rgba(255,138,128,.7)"; g.fillRect(a - 1.5 * d, b - 1.5 * d, 3 * d, 3 * d); }
    if (!P || !P.length) return;
    const lost = rec && rec.lost, col = lost ? "#ff8a80" : rec && rec.conf < 0.45 ? "#f2c94c" : "#00b4f0";
    g.lineWidth = 2 * d; g.strokeStyle = col; g.fillStyle = lost ? "rgba(255,138,128,.12)" : "rgba(0,180,240,.14)";
    g.beginPath(); P.forEach((p, i) => { const [x, y] = toScr(p[0], p[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    if (S.closed) { g.closePath(); g.fill(); } else if (S.mouse && S.tool === "pen") { const [x, y] = toScr(S.mouse[0], S.mouse[1]); g.lineTo(x, y); }
    g.stroke();
    P.forEach((p, i) => { const [x, y] = toScr(p[0], p[1]); g.beginPath(); g.arc(x, y, (i === S.hover || i === S.selPt ? 7 : 5) * d, 0, Math.PI * 2); g.fillStyle = i === 0 && !S.closed ? "#f2c94c" : "#fff"; g.fill(); g.lineWidth = 2 * d; g.strokeStyle = col; g.stroke(); });
    if (S.anchors.has(S.f)) { g.fillStyle = "#fff"; g.font = `${11 * d}px system-ui`; g.fillText("◆ mốc", 8 * d, ov.height - 8 * d); }
  }
  function curPoly() { if (!S.poly.length) return null; if (!S.closed) return S.poly; return polyAt(S.f); }
  function drawBar() {
    const c = $("confBar"), r = c.getBoundingClientRect(), d = window.devicePixelRatio || 1; c.width = Math.max(1, Math.round(r.width * d)); c.height = Math.max(1, Math.round(r.height * d));
    const g = c.getContext("2d"), n = Math.max(1, S.nF), w = c.width / n; g.fillStyle = "#1b262b"; g.fillRect(0, 0, c.width, c.height);
    for (let f = 0; f < S.nF; f++) { const t = S.track[f]; if (!t) continue; g.fillStyle = t.lost ? "#e5604f" : t.conf >= 0.6 ? "#3fbf7f" : t.conf >= 0.3 ? "#e9b949" : "#d9822b"; g.fillRect(Math.floor(f * w), c.height * 0.25, Math.ceil(w), c.height * 0.5); }
    g.fillStyle = "#fff"; for (const f of S.anchors) g.fillRect(Math.floor(f * w + w / 2) - d, 0, 2 * d, c.height * 0.25);
    if (S.closed) { g.fillStyle = "#00b4f0"; g.fillRect(Math.floor(S.refF * w + w / 2) - d, c.height * 0.75, 2 * d, c.height * 0.25); }
    g.fillStyle = "#fff"; g.fillRect(Math.floor(S.f * w + w / 2) - d, 0, 2 * d, c.height);
  }
  function updateHint() {
    if (!S.sess) return hint("");
    if (!S.poly.length) return hint("Bút: bấm từng điểm quanh vật cần theo dõi. Bấm lại điểm đầu (vàng) để khép vùng.");
    if (!S.closed) return hint(S.poly.length < 3 ? "Thêm điểm… (cần ít nhất 3 điểm)" : "Bấm điểm đầu hoặc nhấp đúp để khép vùng. Backspace: xoá điểm vừa thêm.");
    const n = S.track.filter(Boolean).length;
    if (n <= 1) return hint("Vùng đã sẵn sàng. Bấm ▶▶ để theo dõi tới cuối, ◀◀ để theo dõi ngược.");
    if (!polyAt(S.f)) return hint("Khung này chưa theo dõi. Kéo tới khung có màu trên thanh bên dưới, hoặc bấm ▶▶ / ◀◀.");
    hint("Lệch ở đâu thì dừng tại khung đó, kéo điểm về đúng chỗ (thành ◆ mốc) rồi theo dõi tiếp.");
  }

  /* ---------- bút & sửa ---------- */
  function hitPt(P, sx, sy) { const d = S.dpr || 1; let best = -1, bd = 12 * d; P.forEach((p, i) => { const [x, y] = toScr(p[0], p[1]), e = Math.hypot(x - sx, y - sy); if (e < bd) { bd = e; best = i; } }); return best; }
  function hitEdge(P, sx, sy) { const d = S.dpr || 1; let best = -1, bd = 8 * d; for (let i = 0; i < P.length; i++) { const a = toScr(P[i][0], P[i][1]), b = toScr(P[(i + 1) % P.length][0], P[(i + 1) % P.length][1]), dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((sx - a[0]) * dx + (sy - a[1]) * dy) / L)) : 0, e = Math.hypot(a[0] + t * dx - sx, a[1] + t * dy - sy); if (e < bd) { bd = e; best = i; } } return best; }
  /* toạ độ ở khung đang xem → toạ độ ở khung tham chiếu */
  function toRef(p) { const r = S.track[S.f]; if (!r) return p; const Hi = MT.inv(r.H); return Hi ? MT.apply(Hi, p[0], p[1]) : p; }
  function canEditHere() { return !S.closed || !!polyAt(S.f); }
  function onDown(e) {
    if (!S.sess || S.busy) return; const [x, y, sx, sy] = fromEvt(e); if (x < -0.02 || y < -0.02 || x > 1.02 || y > 1.02) return;
    $("cvOv").setPointerCapture(e.pointerId);
    const P = curPoly();
    if (!S.closed) {
      if (P && P.length >= 3 && hitPt([P[0]], sx, sy) === 0) { closePoly(); return; }
      const i = P ? hitPt(P, sx, sy) : -1; if (i >= 0) { S.drag = { kind: "pt", i }; return; }
      S.poly.push([x, y]); S.refF = S.f; drawOv(); updateHint(); return;
    }
    if (!canEditHere()) { hint("Khung này chưa có vùng. Hãy theo dõi tới đây trước.", "bad"); return; }
    const i = hitPt(P, sx, sy);
    if (i >= 0) { S.drag = { kind: "pt", i, start: P.map(p => p.slice()) }; S.selPt = i; drawOv(); return; }
    if (S.tool === "pen") { const k = hitEdge(P, sx, sy); if (k >= 0) { insertPoint(k + 1, [x, y]); return; } }
    if (MT.inPoly(P, x, y)) { S.drag = { kind: "all", from: [x, y], start: P.map(p => p.slice()) }; return; }
  }
  function onMove(e) {
    if (!S.sess) return; const [x, y, sx, sy] = fromEvt(e); S.mouse = [x, y];
    const P = curPoly();
    if (S.drag) {
      if (!S.closed) { S.poly[S.drag.i] = [x, y]; drawOv(); return; }
      let Q; if (S.drag.kind === "pt") { Q = S.drag.start.map(p => p.slice()); Q[S.drag.i] = [x, y]; } else { const dx = x - S.drag.from[0], dy = y - S.drag.from[1]; Q = S.drag.start.map(p => [p[0] + dx, p[1] + dy]); }
      S.drag.now = Q; setPolyHere(Q, true); return;
    }
    const h = P ? hitPt(P, sx, sy) : -1; if (h !== S.hover) { S.hover = h; } $("cvOv").style.cursor = h >= 0 ? "grab" : S.tool === "pen" && !S.closed ? "crosshair" : "default"; drawOv();
  }
  function onUp() { if (S.drag && S.drag.now && S.closed) setPolyHere(S.drag.now, false); S.drag = null; drawBar(); updateHint(); }
  /* sửa vùng tại khung đang xem: thành mốc (khung neo) mới */
  function setPolyHere(Q, live) {
    const hasTrack = S.track.some(Boolean);
    if (!hasTrack) { S.poly = Q.map(p => p.slice()); S.refF = S.f; drawOv(); if (!live) save(); return; }
    const Hn = MT.fitModel(S.poly, Q, model() === "trans" && Q.length < 4 ? "trans" : model());
    S.track[S.f] = { H: Hn, conf: 1, anchor: true }; if (!live) { S.anchors.add(S.f); save(); stat("Đã đặt ◆ mốc ở khung " + (S.f + 1) + ". Theo dõi tiếp từ đây.", "ok"); }
    drawOv();
  }
  function insertPoint(at, p) { S.poly.splice(at, 0, S.closed ? toRef(p) : p); drawOv(); save(); }
  function closePoly() {
    if (S.poly.length < 3) return; S.closed = true; S.refF = S.f; S.track = new Array(S.nF).fill(null); S.track[S.f] = { H: MT.I3(), conf: 1, anchor: true }; S.anchors = new Set([S.f]);
    setTool("edit"); drawOv(); drawBar(); updateHint(); save(); stat("Vùng có " + S.poly.length + " điểm. Bấm ▶▶ để theo dõi.");
  }
  function clearPoly() { S.poly = []; S.closed = false; S.track = new Array(S.nF).fill(null); S.anchors = new Set(); S.lastPts = null; S.selPt = -1; setTool("pen"); drawOv(); drawBar(); updateHint(); save(); stat("Chưa theo dõi."); }
  function setTool(t) { S.tool = t; document.querySelectorAll(".tool[data-tool]").forEach(b => b.classList.toggle("on", b.dataset.tool === t)); }

  /* ---------- theo dõi ---------- */
  async function track(dir, steps) {
    if (!S.sess || S.busy) return; if (!S.closed) { hint("Khoanh và khép vùng trước khi theo dõi.", "bad"); return; }
    const a = S.f, ra = S.track[a]; if (!ra) { hint("Khung này chưa có vùng. Về khung có màu trên thanh (hoặc ◆ mốc) rồi theo dõi tiếp.", "bad"); return; }
    S.busy = true; S.stop = false; uiBusy(true);
    let n = 0, lostN = 0, stopMsg = "";
    try {
      const fa = await frame(a), Hpx = MT.fromNorm(ra.H, S.W, S.H), tr = new MT.Tracker({ model: model(), antiDrift: $("antiDrift").checked, occlusion: $("occl").checked, maxPts: +$("quality").value >= 960 ? 220 : 160 });
      const nf = tr.setAnchor(fa.gray, S.W, S.H, pxPoly(S.poly, ra.H), Hpx);
      if (nf < 6) { stat("Vùng quá ít chi tiết để theo dõi (" + nf + " điểm). Khoanh rộng hơn, chứa nhiều cạnh/hoa văn.", "bad"); return; }
      const lim = steps || S.nF; const t0 = performance.now();
      for (let f = a + dir; f >= 0 && f < S.nF && n < lim; f += dir) {
        if (S.stop) { stopMsg = "Đã dừng."; break; }
        if (n > 0 && S.anchors.has(f)) { stopMsg = "Đã tới ◆ mốc bạn đặt ở khung " + (f + 1) + "."; break; }
        const fr = await frame(f), r = tr.step(fr.gray); n++;
        S.track[f] = { H: MT.toNorm(r.H, S.W, S.H), conf: r.conf, lost: r.lost }; if (r.lost) lostN++;
        S.lastPts = r.pts; S.lastPtsF = f;
        if (n % 2 === 0 || steps) { await show(f, { noSeek: true }); const sp = n / ((performance.now() - t0) / 1000); busy("Đang theo dõi… khung " + (f + 1) + "/" + S.nF + " · " + sp.toFixed(1) + " khung/giây"); await new Promise(r2 => setTimeout(r2, 0)); }
        else S.f = f;
        if (r.stop) { stopMsg = "Mất dấu quá lâu ở khung " + (f + 1) + ". Kéo vùng về đúng chỗ ở khung này rồi theo dõi tiếp."; break; }
      }
    } catch (e) { stopMsg = "Lỗi: " + e.message; }
    finally {
      S.busy = false; uiBusy(false); busy(""); await show(S.f); save();
      const done = S.track.filter(Boolean).length;
      stat((stopMsg ? stopMsg + " " : "") + "Đã theo dõi " + n + " khung" + (lostN ? ", " + lostN + " khung bị che/mất dấu (đỏ)" : "") + ". Tổng " + done + "/" + S.nF + " khung.", stopMsg && /Lỗi|Mất dấu/.test(stopMsg) ? "bad" : "ok");
    }
  }
  function uiBusy(on) { document.querySelectorAll("[data-trk],[data-apply],#pickClip,#model,#quality,#clearPoly").forEach(b => b.disabled = on); $("stopBtn").hidden = !on; }

  /* ---------- áp dụng vào Bravin ---------- */
  function series(fn) { // [{f, v:[…]}] cho mọi khung đã theo dõi, có làm mượt
    const raw = []; for (let f = 0; f < S.nF; f++) { const r = S.track[f]; raw.push(r ? fn(r.H) : null); }
    const sm = MT.smoothSeries(raw, +$("smooth").value); const out = []; sm.forEach((v, f) => { if (v) out.push({ f, v }); }); return out;
  }
  function needTrack() { const n = S.track.filter(Boolean).length; if (!S.closed || n < 2) { hint("Hãy khoanh vùng và theo dõi trước khi áp dụng.", "bad"); return false; } return true; }
  const polySeries = () => series(H => S.poly.flatMap(p => MT.apply(H, p[0], p[1])));
  const maskKeys = () => polySeries().map(({ f, v }) => { const pts = []; for (let i = 0; i < v.length; i += 2) pts.push([v[i], v[i + 1]]); return { t: tOf(f), pts }; });
  function quadRef() {
    let Q = S.poly;
    if (Q.length !== 4) { const b = MT.bbox(S.poly); Q = [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]]; }
    else { // sắp theo thứ tự trên-trái, trên-phải, dưới-phải, dưới-trái (theo góc, đơn vị pixel)
      const cx = Q.reduce((s, p) => s + p[0], 0) / 4, cy = Q.reduce((s, p) => s + p[1], 0) / 4;
      Q = Q.slice().sort((p, q) => Math.atan2((p[1] - cy) * S.H, (p[0] - cx) * S.W) - Math.atan2((q[1] - cy) * S.H, (q[0] - cx) * S.W));
      let k = 0; Q.forEach((p, i) => { if (p[0] + p[1] < Q[k][0] + Q[k][1]) k = i; }); Q = Q.slice(k).concat(Q.slice(0, k));
    }
    return Q;
  }
  async function apply(kind) {
    if (!S.clip || !needTrack() || S.busy) return; S.busy = true; uiBusy(true);
    const bv = S.bv, id = S.clip.id;
    try {
      if (kind === "mask") {
        const st = await load("applied:" + id) || {}; await bv.timeline.checkpoint();
        const r = await bv.timeline.setMask(id, { maskId: st.maskId, name: "Theo dõi chuyển động", keys: maskKeys(), feather: 0.04, inv: $("maskInv").checked, noUndo: true });
        st.maskId = r.maskId; await S.bv.storage.set("applied:" + id, st); toast("Đã tạo mask theo vùng (" + r.keys + " keyframe).");
      } else if (kind === "blur" || kind === "mosaic") {
        await bv.timeline.checkpoint();
        const d = await bv.timeline.duplicateClip(id, { noUndo: true, name: kind === "blur" ? "Làm mờ (tracking)" : "Mosaic (tracking)" });
        await bv.timeline.updateClip(d.id, kind === "blur" ? { blur: +$("blurAmt").value } : { mosaic: +$("mosAmt").value }, { noUndo: true });
        const r = await bv.timeline.setMask(d.id, { name: "Vùng che", keys: maskKeys(), feather: 0.03, expand: 0.004, noUndo: true });
        toast((kind === "blur" ? "Đã làm mờ vùng" : "Đã che mosaic vùng") + " trên track lớp phủ mới (" + r.keys + " keyframe).");
      } else if (kind === "attach") {
        const tid = $("attachTo").value; if (!tid) { hint("Chọn clip chữ / sticker / lớp phủ cần gắn.", "bad"); return; }
        if (!S.track[S.f]) { hint("Đứng ở một khung đã theo dõi (khung bạn đã đặt clip đúng chỗ) rồi bấm Gắn.", "bad"); return; }
        const refPx = pxPoly(S.poly, null), simOf = H => { const s = MT.similarityOf(MT.fromNorm(H, S.W, S.H), refPx); return [s.cx / S.W, s.cy / S.H, s.angle, s.scale]; };
        const ser = series(simOf), samp = ser.map(({ f, v }) => ({ T: S.clip.start + tOf(f), cx: v[0], cy: v[1], rot: v[2], scale: v[3] }));
        const rv = simOf(S.track[S.f].H), ref = { T: S.clip.start + tOf(S.f), cx: rv[0], cy: rv[1], rot: rv[2], scale: rv[3] };
        const r = await bv.timeline.applyTrack(tid, { samples: samp, ref, use: { rotation: $("attRot").checked, scale: $("attScale").checked } });
        toast("Đã gắn clip theo vùng (" + r.keys + " keyframe).");
      } else if (kind === "pin") {
        const tid = $("pinTo").value; if (!tid) { hint("Chọn clip ảnh / video ở track lớp phủ để dán vào vùng.", "bad"); return; }
        const Q = quadRef(), keys = series(H => Q.flatMap(p => MT.apply(H, p[0], p[1]))).map(({ f, v }) => ({ T: S.clip.start + tOf(f), quad: v }));
        const r = await bv.timeline.setPin(tid, { keys }); toast("Đã dán clip vào vùng theo phối cảnh (" + r.keys + " keyframe)." + (S.poly.length !== 4 ? " Mẹo: vẽ vùng đúng 4 điểm ở 4 góc màn hình để khớp nhất." : ""));
      }
      await refreshTargets(); $("peek").hidden = false; hint("Đã áp dụng. Bấm “Thu nhỏ để xem” (hoặc ⤢ trên thanh tiêu đề) để xem kết quả trên Bravin.", "");
    } catch (e) { hint("Không áp dụng được: " + e.message, "bad"); }
    finally { S.busy = false; uiBusy(false); }
  }

  /* ---------- clip & lưu trạng thái ---------- */
  async function refreshTargets() {
    if (!S.bv) return; let tl; try { tl = await S.bv.timeline.get(); } catch (_) { return; }
    S.lastSel = tl.selection; const sel = tl.selection.map(id => tl.clips.find(c => c.id === id)).find(c => c && (c.type === "video"));
    $("pickClip").disabled = S.busy || !sel; $("pickClip").textContent = sel && (!S.clip || sel.id !== S.clip.id) ? "Dùng clip: " + (sel.mediaName || "video") : "Dùng clip đang chọn";
    const fill = (selEl, pred, empty) => { const cur = selEl.value; selEl.innerHTML = ""; const L = tl.clips.filter(pred); if (!L.length) selEl.innerHTML = `<option value="">${empty}</option>`; L.forEach(c => { const o = document.createElement("option"); o.value = c.id; o.textContent = (c.type === "text" ? "Chữ: " + (c.text || "") : c.type === "sticker" ? "Sticker" : "Lớp phủ: " + (c.mediaName || "clip")) + " · " + fmt(c.start); selEl.appendChild(o); }); if (L.some(c => c.id === cur)) selEl.value = cur; };
    const notSelf = c => !S.clip || (c.id !== S.clip.id && c.mediaId !== S.clip.mediaId);
    fill($("attachTo"), c => c.kind === "c" && notSelf(c) && (c.type === "text" || c.type === "sticker" || c.type === "video"), "— chưa có chữ / sticker / lớp phủ —");
    fill($("pinTo"), c => c.kind === "c" && notSelf(c) && c.type === "video", "— thêm ảnh / video vào track lớp phủ —");
  }
  async function useClip(id) {
    if (S.busy) return;
    try {
      const c = await S.bv.timeline.getClip(id); if (c.mediaKind !== "video") { hint("Hãy chọn clip video (không phải ảnh, chữ hay âm thanh).", "bad"); return; }
      if (S.sess) { S.bv.frames.close(S.sess.session).catch(() => {}); }
      busy("Đang mở clip…"); const sess = await S.bv.frames.open(id, { maxWidth: +$("quality").value });
      Object.assign(S, { clip: c, sess, W: sess.width, H: sess.height, fps: sess.fps, nF: Math.max(1, Math.floor(sess.duration * sess.fps + 1e-6)), cache: new Map(), lastPts: null, selPt: -1 });
      $("cvFrame").width = S.W; $("cvFrame").height = S.H; $("seek").max = S.nF - 1; $("empty").hidden = true;
      $("clipName").textContent = sess.mediaName || "Clip video"; $("clipMeta").textContent = fmt(sess.duration) + " · " + S.nF + " khung · bắt đầu " + fmt(sess.start);
      // khôi phục vùng/dữ liệu đã theo dõi
      const st = await load("trk:" + id); S.track = new Array(S.nF).fill(null); S.anchors = new Set(); S.poly = []; S.closed = false; S.refF = 0;
      if (st && st.poly) { S.poly = st.poly; S.closed = !!st.closed; S.refF = st.refF || 0; (st.track || []).forEach(([f, H, conf, lost]) => { if (f < S.nF) S.track[f] = { H, conf, lost: !!lost }; }); (st.anchors || []).forEach(f => S.anchors.add(f)); if (st.model) $("model").value = st.model; }
      setTool(S.closed ? "edit" : "pen"); requestAnimationFrame(() => { layout(); show(S.closed ? S.refF : 0); });
      stat(S.track.some(Boolean) ? "Đã khôi phục dữ liệu theo dõi trước đó." : "Chưa theo dõi."); await refreshTargets();
    } catch (e) { hint("Không mở được clip: " + e.message, "bad"); }
    finally { busy(""); }
  }
  async function load(k) { try { return await S.bv.storage.get(k); } catch (_) { return null; } }
  function save() {
    clearTimeout(S.saveT); S.saveT = setTimeout(() => {
      if (!S.clip) return; const r6 = v => Math.round(v * 1e6) / 1e6, track = [];
      S.track.forEach((t, f) => { if (t) track.push([f, t.H.map(r6), Math.round(t.conf * 100) / 100, t.lost ? 1 : 0]); });
      S.bv.storage.set("trk:" + S.clip.id, { poly: S.poly, closed: S.closed, refF: S.refF, track, anchors: [...S.anchors], model: model() }).catch(() => hint("Dữ liệu theo dõi quá dài để lưu lại (vẫn dùng được trong phiên này).", ""));
    }, 400);
  }

  /* ---------- hướng dẫn lần đầu ---------- */
  const DEMO = `<svg class="demo" viewBox="0 0 320 150" aria-hidden="true"><rect width="320" height="150" fill="#0b1013"/><rect x="92" y="34" width="140" height="86" rx="6" fill="#20343c" transform="rotate(-8 162 77)"/><polygon class="pl" points="96,44 222,26 236,104 108,124"/><g class="pt"><circle cx="96" cy="44" r="5"/><circle cx="222" cy="26" r="5"/><circle cx="236" cy="104" r="5"/><circle cx="108" cy="124" r="5"/></g></svg>`;
  const TOUR = [
    { t: "Chào mừng đến Motion Tracking", b: `<p>Theo dõi một vùng trong video, kể cả khi nó <b>xoay, phóng to, nghiêng phối cảnh</b> hay <b>bị vật khác che</b>, rồi gắn mask, làm mờ, mosaic, chữ hoặc ảnh chạy theo vùng đó.</p>${DEMO}` },
    { el: "#clipBox", t: "1. Chọn clip video", b: "<p>Chọn clip video trên timeline Bravin rồi bấm <b>Dùng clip đang chọn</b>. Hoặc chuột phải vào clip → <i>Motion Tracking: theo dõi clip này</i>.</p>" },
    { el: "#view", t: "2. Khoanh vùng bằng bút", b: "<p>Bấm từng điểm quanh vật cần theo dõi, các điểm tự nối thành vùng. <b>Bấm lại điểm đầu (vàng)</b> hoặc nhấp đúp để khép vùng.</p><p class='mut'>Kéo điểm để chỉnh, kéo bên trong để dời cả vùng, bấm lên cạnh để thêm điểm. Muốn thay màn hình thì vẽ đúng 4 điểm ở 4 góc.</p>" },
    { el: "#trackBox", t: "3. Bấm theo dõi", b: "<p><b>▶▶</b> theo dõi tới cuối clip, <b>◀◀</b> theo dõi ngược về đầu, <b>▶ / ◀</b> từng khung. <kbd>Shift</kbd>+<kbd>→</kbd> / <kbd>←</kbd> cũng được.</p><p class='mut'>Để <i>Phối cảnh</i> cho vật phẳng (màn hình, biển hiệu, mặt bàn). Vật cong như khuôn mặt cũng dùng tốt.</p>" },
    { el: ".scrub", t: "4. Xem độ tin cậy, sửa chỗ lệch", b: "<p>Thanh màu cho biết từng khung: <b style='color:#3fbf7f'>xanh</b> chắc chắn, <b style='color:#e9b949'>vàng</b> tạm được, <b style='color:#e5604f'>đỏ</b> bị che hoặc mất dấu.</p><p>Thấy lệch: dừng ở khung đó, kéo điểm về đúng chỗ (thành ◆ mốc) rồi theo dõi tiếp.</p>" },
    { el: "#applyBox", t: "5. Áp dụng", b: "<p><b>Mask</b> theo vùng · <b>Làm mờ / Mosaic</b> để che mặt, biển số · <b>Gắn clip</b> cho chữ hoặc sticker chạy theo · <b>Thay màn hình</b> dán ảnh hoặc video vào vùng theo phối cảnh.</p><p class='mut'>Hoàn tác bằng Ctrl+Z trong Bravin. Bấm <b>?</b> để xem lại hướng dẫn này.</p>" }
  ];
  let tourI = 0;
  function tour(i) {
    tourI = i; const st = TOUR[i], T = $("tour"); T.hidden = false;
    $("tourStep").textContent = (i + 1) + " / " + TOUR.length; $("tourT").textContent = st.t; $("tourBody").innerHTML = st.b;
    $("tourBack").disabled = i === 0; $("tourNext").textContent = i === TOUR.length - 1 ? "Bắt đầu" : "Tiếp";
    const sp = $("tourSpot"), card = $("tourCard"), el = st.el && document.querySelector(st.el), vw = innerWidth, vh = innerHeight;
    if (el) { const r = el.getBoundingClientRect(), m = 6; Object.assign(sp.style, { left: r.left - m + "px", top: r.top - m + "px", width: r.width + 2 * m + "px", height: r.height + 2 * m + "px", opacity: 1 });
      const cw = card.offsetWidth || 360, ch = card.offsetHeight || 220; let x = r.right + 14, y = r.top;
      if (x + cw > vw - 8) x = r.left - cw - 14; if (x < 8) { x = Math.max(8, Math.min(vw - cw - 8, r.left)); y = r.bottom + 12 > vh - ch - 8 ? Math.max(8, r.top - ch - 12) : r.bottom + 12; }
      card.style.left = x + "px"; card.style.top = Math.max(8, Math.min(vh - ch - 8, y)) + "px"; }
    else { Object.assign(sp.style, { left: vw / 2 + "px", top: vh / 2 + "px", width: "0px", height: "0px", opacity: 1 }); card.style.left = Math.max(8, (vw - (card.offsetWidth || 360)) / 2) + "px"; card.style.top = Math.max(8, (vh - (card.offsetHeight || 300)) / 2) + "px"; }
    setTimeout(() => $("tourNext").focus(), 30);
  }
  function endTour() { $("tour").hidden = true; S.bv.storage.set("tourDone", true).catch(() => {}); }

  /* ---------- gắn sự kiện ---------- */
  function wire() {
    const ov = $("cvOv"); ov.addEventListener("pointerdown", onDown); ov.addEventListener("pointermove", onMove); ov.addEventListener("pointerup", onUp); ov.addEventListener("pointercancel", onUp);
    ov.addEventListener("pointerleave", () => { S.mouse = null; drawOv(); });
    ov.addEventListener("dblclick", () => { if (!S.closed && S.poly.length >= 3) { const last = S.poly[S.poly.length - 1], prev = S.poly[S.poly.length - 2]; if (prev && Math.hypot(last[0] - prev[0], last[1] - prev[1]) < 0.004) S.poly.pop(); closePoly(); } });
    document.querySelectorAll(".tool[data-tool]").forEach(b => b.onclick = () => setTool(b.dataset.tool));
    $("clearPoly").onclick = clearPoly;
    document.querySelectorAll("[data-trk]").forEach(b => b.onclick = () => { const [d, n] = b.dataset.trk.split(",").map(Number); track(d, n); });
    $("stopBtn").onclick = () => { S.stop = true; };
    document.querySelectorAll("[data-apply]").forEach(b => b.onclick = () => apply(b.dataset.apply));
    $("pickClip").onclick = () => { const id = S.lastSel && S.lastSel[0]; if (id) useClip(id); else hint("Chọn một clip video trên timeline trước.", "bad"); };
    $("quality").onchange = () => { if (S.clip) useClip(S.clip.id); };
    $("model").onchange = save;
    $("smooth").oninput = () => { $("smoothV").textContent = $("smooth").value; };
    $("seek").oninput = () => show(+$("seek").value);
    $("prevF").onclick = () => show(S.f - 1); $("nextF").onclick = () => show(S.f + 1);
    $("helpBtn").onclick = () => tour(0);
    $("peek").onclick = () => S.bv.ui.openPanel({ size: "normal" }).catch(() => {});
    $("tourNext").onclick = () => tourI < TOUR.length - 1 ? tour(tourI + 1) : endTour(); $("tourBack").onclick = () => tour(Math.max(0, tourI - 1)); $("tourSkip").onclick = endTour;
    addEventListener("resize", () => { layout(); drawOv(); drawBar(); if (!$("tour").hidden) tour(tourI); });
    new ResizeObserver(() => { layout(); drawOv(); drawBar(); }).observe($("view"));
    addEventListener("keydown", e => {
      if (!$("tour").hidden) { if (e.key === "Escape") endTour(); else if (e.key === "ArrowRight" || e.key === "Enter") $("tourNext").click(); else if (e.key === "ArrowLeft") $("tourBack").click(); return; }
      if (e.target.closest && e.target.closest("select,input")) return;
      if (e.key === "Escape") { if (S.busy) S.stop = true; else if (!S.closed && S.poly.length) { S.poly = []; drawOv(); updateHint(); } }
      else if (e.key === "ArrowRight") { e.preventDefault(); e.shiftKey ? track(1, 0) : show(S.f + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); e.shiftKey ? track(-1, 0) : show(S.f - 1); }
      else if (e.key === "Backspace" || e.key === "Delete") {
        if (!S.closed && S.poly.length) { S.poly.pop(); drawOv(); updateHint(); }
        else if (S.closed && S.selPt >= 0 && S.poly.length > 3) { S.poly.splice(S.selPt, 1); S.selPt = -1; drawOv(); save(); }
      }
      else if (e.key === "p" || e.key === "P") setTool("pen"); else if (e.key === "v" || e.key === "V") setTool("edit");
    });
  }

  /* ---------- khởi động ---------- */
  window.__motionTracking = S; // để kiểm thử / gỡ lỗi trong DevTools
  wire(); uiBusy(false); $("pickClip").disabled = true;
  Bravin.connect().then(async bv => {
    S.bv = bv; hint("");
    bv.on("selection.changed", refreshTargets); bv.on("timeline.changed", refreshTargets);
    bv.on("command", async cmd => { await bv.ui.openPanel({ size: "large" }); const id = cmd.clipId || (cmd.selection || [])[0]; if (id) useClip(id); });
    await refreshTargets();
    if (!(await load("tourDone"))) setTimeout(() => tour(0), 300);
  }).catch(e => { document.body.innerHTML = "<p style='padding:20px'>" + e.message + "</p>"; });
})();
