"use strict";
/* ============================================================================
   Audio (Essential Sound style, own implementation):
   clip type tags (dialogue / music / sfx / ambience), loudness match (LUFS),
   auto-ducking of music under dialogue, DeNoise (spectral gate, offline),
   3-band EQ, compressor, reverb, de-hum, per-clip pan (keyframeable),
   export loudness normalisation.
   Clip data: c.es ('dia'|'mus'|'sfx'|'amb') · c.afx {eq:{lo,mid,midF,hi}, comp:{thr,ratio,mk},
   rev:{mix,size}, den, hum, duck:{db,sens}} · c.pan (+ kf.pan)
   ========================================================================== */
const ES_TYPES = { dia: "Hội thoại", mus: "Nhạc", sfx: "Hiệu ứng", amb: "Môi trường" };
KF_PROPS.pan = "Cân trái/phải";
if (typeof EC_PROPS !== "undefined") EC_PROPS.pan = { n: "Cân trái/phải", min: -1, max: 1, step: 0.01, def: c => c.pan || 0, set: (c, v) => { if (Math.abs(v) < 0.005) delete c.pan; else c.pan = v; }, f: v => Math.abs(v) < 0.005 ? "Giữa" : (v < 0 ? "T " : "P ") + Math.round(Math.abs(v) * 100), unit: 100, audio: true };
const clipPan = (c, lt) => clamp(kfVal(c, "pan", lt, c.pan || 0), -1, 1);
const esOf = c => c.es || (() => { const tr = trackById(c.track) || {}; const n = (tr.name || "") + " " + (media.get(c.mediaId) || {}).name; if (/voice|giọng|thoại|lồng tiếng|tts|đọc/i.test(n)) return "dia"; if (/nhạc|music|bgm|beat/i.test(n)) return "mus"; if (/sfx|whoosh|hiệu ứng/i.test(n) || /^sfx/.test(c.track)) return "sfx"; return c.type === "video" || V.includes(c) ? "dia" : null; })();

/* ---------- live / offline processing chain ---------- */
function afxSig(c) { const a = c.afx; return a ? JSON.stringify([a.eq, a.comp, a.rev, a.hum]) : ""; }
function audioFxChain(ctx, c, input) {
  const a = c.afx; if (!a) return input; let n = input;
  const bq = (type, f, gain, q) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (gain != null) b.gain.value = gain; if (q) b.Q.value = q; n.connect(b); n = b; return b; };
  if (a.hum) { bq("highpass", 70, null, 0.7); for (const f of [50, 100, 150, 60, 120]) bq("notch", f, null, 30); }
  if (a.eq) { if (a.eq.lo) bq("lowshelf", 160, a.eq.lo); if (a.eq.mid) bq("peaking", a.eq.midF || 1500, a.eq.mid, 0.9); if (a.eq.hi) bq("highshelf", 7000, a.eq.hi); }
  if (a.comp && a.comp.on) { const k = ctx.createDynamicsCompressor(); k.threshold.value = a.comp.thr == null ? -22 : a.comp.thr; k.ratio.value = a.comp.ratio || 4; k.knee.value = 6; k.attack.value = 0.005; k.release.value = 0.15; n.connect(k); n = k; const mk = ctx.createGain(); mk.gain.value = dbToGain(a.comp.mk == null ? 4 : a.comp.mk); n.connect(mk); n = mk; }
  if (a.rev && a.rev.mix > 0) { const dry = ctx.createGain(), wet = ctx.createGain(), mix = ctx.createGain(), cv2 = ctx.createConvolver(); cv2.buffer = impulse(ctx, 0.6 + (a.rev.size == null ? 0.5 : a.rev.size) * 3, 2.4); dry.gain.value = 1 - a.rev.mix * 0.5; wet.gain.value = a.rev.mix; n.connect(dry); n.connect(cv2); cv2.connect(wet); dry.connect(mix); wet.connect(mix); n = mix; }
  return n;
}
/* rebuild the chain on a <video> element when the clip's settings change */
function elFxSync(el, c) {
  if (!actx || !el._gain || !el._pan) return; const sig = c ? afxSig(c) : "";
  if (el._afxSig === sig) return; el._afxSig = sig;
  try { el._gain.disconnect(); } catch (_) {} (el._afxNodes || []).forEach(x => { try { x.disconnect(); } catch (_) {} });
  if (!sig) { el._gain.connect(el._pan); el._afxNodes = []; return; }
  const tail = audioFxChain(actx, c, el._gain); tail.connect(el._pan); el._afxNodes = [tail];
}

/* ---------- DeNoise: STFT spectral gate (offline, cached per media + amount) ---------- */
function fftInPlace(re, im) {
  const n = re.length; for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) { const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang); for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let j = 0; j < len / 2; j++) { const a = i + j, b = a + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr; re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } } }
}
async function denoiseBuffer(buf, amt) {
  const N = 1024, H = 256, win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  const ctxLike = actx || new OfflineAudioContext(1, 1, buf.sampleRate), out = ctxLike.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const x = buf.getChannelData(ch), y = out.getChannelData(ch), norm = new Float32Array(x.length), frames = Math.max(1, Math.floor((x.length - N) / H) + 1);
    // noise profile: 15th percentile magnitude per bin over a sample of frames
    const step = Math.max(1, Math.floor(frames / 400)), mags = []; const re = new Float32Array(N), im = new Float32Array(N);
    for (let f = 0; f < frames; f += step) { for (let i = 0; i < N; i++) { re[i] = (x[f * H + i] || 0) * win[i]; im[i] = 0; } fftInPlace(re, im); const m = new Float32Array(N / 2 + 1); for (let k = 0; k <= N / 2; k++) m[k] = Math.hypot(re[k], im[k]); mags.push(m); }
    const noise = new Float32Array(N / 2 + 1); for (let k = 0; k <= N / 2; k++) { const col = mags.map(m => m[k]).sort((a, b) => a - b); noise[k] = col[Math.floor(col.length * 0.15)] || 0; }
    const over = 1.2 + amt * 2.8, floor = 0.08 + (1 - amt) * 0.25, prevG = new Float32Array(N / 2 + 1).fill(1);
    for (let f = 0; f < frames; f++) {
      const o = f * H; for (let i = 0; i < N; i++) { re[i] = (x[o + i] || 0) * win[i]; im[i] = 0; } fftInPlace(re, im);
      for (let k = 0; k <= N / 2; k++) { const mg = Math.hypot(re[k], im[k]) + 1e-9; let g2 = Math.max(floor, 1 - over * noise[k] / mg); g2 = 0.6 * prevG[k] + 0.4 * g2; prevG[k] = g2; re[k] *= g2; im[k] *= g2; if (k > 0 && k < N / 2) { re[N - k] = re[k]; im[N - k] = -im[k]; } }
      for (let i = 0; i < N; i++) im[i] = -im[i]; fftInPlace(re, im); for (let i = 0; i < N; i++) { const v = re[i] / N; if (o + i < y.length) { y[o + i] += v * win[i]; norm[o + i] += win[i] * win[i]; } }
      if (f % 2000 === 0) await new Promise(r => setTimeout(r, 0));
    }
    for (let i = 0; i < y.length; i++) y[i] = norm[i] > 1e-3 ? y[i] / norm[i] : x[i];
  }
  return out;
}
const _denJobs = new Map();
function denoisedFor(m, amt) { // returns ready buffer or null (and starts the job)
  if (!m || !m.buf || !(amt > 0)) return null; const key = Math.round(amt * 20); m._den = m._den || {}; if (m._den[key]) return m._den[key];
  const jk = m.id + ":" + key; if (!_denJobs.has(jk)) { toast("Đang giảm ồn cho " + m.name + "…"); _denJobs.set(jk, denoiseBuffer(m.buf, key / 20).then(b => { m._den[key] = b; _denJobs.delete(jk); toast("Đã giảm ồn xong."); liveRefresh(); }).catch(() => _denJobs.delete(jk))); }
  return null;
}
async function denoiseCached(buf, amt) { const key = Math.round(amt * 20); buf._den = buf._den || {}; if (!buf._den[key]) buf._den[key] = await denoiseBuffer(buf, key / 20); return buf._den[key]; }
const _voiceBuffer0 = voiceBuffer;
voiceBuffer = function (m, v, c) { const den = c && c.afx && c.afx.den ? denoisedFor(m, c.afx.den) : null; if (den) return PITCH[v] ? _voiceBuffer0({ buf: den, vbuf: den._vb || (den._vb = {}) }, v) : den; return _voiceBuffer0(m, v); };

/* ---------- loudness (approx. BS.1770: K-weighting + gated 400 ms blocks) ---------- */
async function measureLUFS(buf, from = 0, to = null) {
  const sr = buf.sampleRate, a = Math.floor(from * sr), b = Math.min(buf.length, to == null ? buf.length : Math.floor(to * sr)), len = Math.max(1, b - a);
  const oc = new OfflineAudioContext(buf.numberOfChannels, len, sr), src = oc.createBufferSource(), part = oc.createBuffer(buf.numberOfChannels, len, sr);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) part.getChannelData(ch).set(buf.getChannelData(ch).subarray(a, b));
  src.buffer = part; const hs = oc.createBiquadFilter(); hs.type = "highshelf"; hs.frequency.value = 1500; hs.gain.value = 4; const hp = oc.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 38; hp.Q.value = 0.5;
  src.connect(hs); hs.connect(hp); hp.connect(oc.destination); src.start(); const r = await oc.startRendering();
  const blk = Math.round(0.4 * sr), hop = Math.round(0.1 * sr), L = []; const chs = [...Array(r.numberOfChannels)].map((_, i) => r.getChannelData(i));
  for (let s = 0; s + blk <= r.length; s += hop) { let ms = 0; for (const d of chs) { let acc = 0; for (let i = s; i < s + blk; i += 2) acc += d[i] * d[i]; ms += acc / (blk / 2); } L.push(ms); }
  if (!L.length) return -70; const lk = ms => -0.691 + 10 * Math.log10(ms + 1e-12);
  let g = L.filter(ms => lk(ms) > -70); if (!g.length) return -70; const rel = lk(g.reduce((p, q) => p + q, 0) / g.length) - 10; g = g.filter(ms => lk(ms) > rel);
  return lk(g.reduce((p, q) => p + q, 0) / Math.max(1, g.length));
}
const ES_TARGET = { dia: -18, mus: -24, sfx: -20, amb: -30 };
async function matchLoudness(c) {
  let buf = null, a = c.in, b = c.out; const m = media.get(c.mediaId);
  if (c.type === "audio") buf = m && m.buf; else if (m && m.kind === "video" && m.hasAudio) { try { buf = (await extractAudioMedia(m)).buf; } catch (_) {} }
  if (!buf) { toast("Clip này không có âm thanh để đo."); return; }
  const L = await measureLUFS(buf, a, b), tgt = ES_TARGET[esOf(c) || "dia"]; if (L <= -69) { toast("Clip gần như im lặng."); return; }
  pushUndo(); c.vol = clamp(Math.round((tgt - L) * 10) / 10, -30, 24); renderAll(); liveRefresh(); toast(`Độ lớn ${L.toFixed(1)} LUFS → chỉnh ${c.vol > 0 ? "+" : ""}${c.vol} dB (đích ${tgt} LUFS cho ${ES_TYPES[esOf(c) || "dia"].toLowerCase()}).`);
}
async function normalizeMix(buf, target) {
  const L = await measureLUFS(buf); if (L <= -69) return buf; const g0 = Math.pow(10, (target - L) / 20);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < d.length; i++) { let v = d[i] * g0; const av = Math.abs(v); if (av > 0.89) v = Math.sign(v) * (0.89 + (1 - 0.89) * Math.tanh((av - 0.89) / (1 - 0.89))); d[i] = v; } }
  return buf;
}

/* ---------- auto ducking ---------- */
let _duckMap = null, _duckSig = "", _duckAt = 0;
function duckActivity() { // 20 Hz map of dialogue activity across the timeline
  if (_duckMap && performance.now() - _duckAt < 400) return _duckMap; _duckAt = performance.now();
  const dias = [...C.filter(c => c.type === "audio" && !c.muted && !c.disabled && esOf(c) === "dia")]; const st = vStarts();
  const sig = JSON.stringify(dias.map(c => [c.id, c.start, c.in, c.out, c.speed])) + "|" + V.map(c => c.id + c.in + c.out + (c.es || "") + (c.muted ? 1 : 0)).join(",");
  if (sig === _duckSig && _duckMap) return _duckMap; _duckSig = sig;
  const T = total(), n = Math.ceil(T * 20) + 1, map = new Float32Array(n);
  for (const c of dias) { const m = media.get(c.mediaId); if (!m || !m.buf) continue; const d = m.buf.getChannelData(0), sr = m.buf.sampleRate, sp = c.speed || 1;
    for (let i = Math.floor(c.start * 20); i < Math.min(n, Math.ceil(cend(c) * 20)); i++) { const s0 = Math.floor((c.in + (i / 20 - c.start) * sp) * sr), s1 = Math.min(d.length, s0 + Math.floor(sr / 20)); let acc = 0, k = 0; for (let j = Math.max(0, s0); j < s1; j += 8) { acc += d[j] * d[j]; k++; } const rms = Math.sqrt(acc / Math.max(1, k)); if (rms > 0.012) map[i] = 1; } }
  V.forEach((c, i) => { if (c.es === "dia" && !c.muted && !c.audioOut) for (let j = Math.floor(st[i] * 20); j < Math.min(n, Math.ceil((st[i] + vlen(c)) * 20)); j++) map[j] = 1; });
  // hold + smooth: 0.35 s attack lead, 0.6 s release
  const out = new Float32Array(n); for (let i = 0; i < n; i++) { let v = 0; for (let j = Math.max(0, i - 12); j <= Math.min(n - 1, i + 7); j++) if (map[j]) { v = 1; break; } out[i] = v; }
  for (let i = 1; i < n; i++) out[i] = Math.max(out[i], out[i - 1] - 1 / 8); for (let i = n - 2; i >= 0; i--) out[i] = Math.max(out[i], out[i + 1] - 1 / 6);
  return _duckMap = out;
}
const _clipGainAfx = clipGain;
clipGain = function (c, lt, len) {
  let g0 = _clipGainAfx(c, lt, len); const d = c.afx && c.afx.duck; if (!d || !d.on) return g0;
  const map = duckActivity(), T = (V.includes(c) ? vStarts()[V.indexOf(c)] : c.start) + lt, v = map[Math.min(map.length - 1, Math.max(0, Math.round(T * 20)))] || 0;
  return g0 * dbToGain(-(d.db == null ? 12 : d.db) * v);
};

/* ---------- inspector section ---------- */
function audioFxUI(box, c, isVideo) {
  const A = () => c.afx || {}, setA = (k, v) => { c.afx = Object.assign({}, c.afx, { [k]: v }); if (v == null || v === 0 || v === false) delete c.afx[k]; if (!Object.keys(c.afx).length) delete c.afx; liveRefresh(); };
  let b = section(box, "Essential Sound");
  tiles(b, Object.entries(ES_TYPES).map(([k, n]) => [k, n]), c.es || esOf(c) || "", k => { pushUndo(); c.es = k; renderInspector(); }, "estypes");
  const es = c.es || esOf(c);
  btnRow(b, [["Khớp độ lớn (" + ES_TARGET[es || "dia"] + " LUFS)", () => matchLoudness(c), true]]);
  if (es === "dia") {
    slider(b, { label: "Giảm ồn", min: 0, max: 1, step: 0.05, get: () => A().den || 0, set: v => setA("den", v), fmt: v => v ? Math.round(v * 100) + "%" : "Tắt", after: () => { const m = media.get(c.mediaId); if (c.type === "audio") denoisedFor(m, A().den); else if (A().den) toast("Giảm ồn áp khi xuất video; muốn nghe trước, hãy Tách âm thanh ra track riêng."); } });
    toggle(b, "Khử tiếng ù điện (50/60 Hz)", () => !!A().hum, v => setA("hum", v), "keep");
    btnRow(b, [["Làm rõ giọng nói", () => { pushUndo(); setA("eq", { lo: -3, mid: 3, midF: 3200, hi: 2 }); setA("comp", { on: true, thr: -24, ratio: 3, mk: 4 }); renderInspector(); toast("Đã thêm EQ làm rõ giọng và nén tiếng."); }]]);
  }
  if (es === "mus" || es === "amb") {
    toggle(b, "Tự hạ khi có giọng nói (ducking)", () => !!(A().duck && A().duck.on), v => setA("duck", v ? Object.assign({ db: 12 }, A().duck, { on: true }) : null));
    if (A().duck && A().duck.on) slider(b, { label: "Hạ bao nhiêu", min: 3, max: 30, step: 1, get: () => A().duck.db || 12, set: v => setA("duck", Object.assign({}, A().duck, { db: v })), fmt: v => "-" + Math.round(v) + " dB" });
    if (A().duck && A().duck.on) note(b, "Nhạc tự nhỏ lại khi clip được gắn Hội thoại (hoặc track tên Voice/Giọng) đang có tiếng nói.");
  }
  b = section(box, "Hiệu ứng âm thanh", !!(c.afx && (c.afx.eq || c.afx.comp || c.afx.rev)) || !!c.pan);
  const eq = () => A().eq || {}, setEq = (k, v) => setA("eq", Object.assign({ midF: 1500 }, eq(), { [k]: v }));
  b.appendChild(el("p", "lsub", "EQ 3 dải"));
  slider(b, { label: "Trầm (160 Hz)", min: -15, max: 15, step: 0.5, get: () => eq().lo || 0, set: v => setEq("lo", v), fmt: v => (v > 0 ? "+" : "") + (+v).toFixed(1) + " dB" });
  slider(b, { label: "Trung", min: -15, max: 15, step: 0.5, get: () => eq().mid || 0, set: v => setEq("mid", v), fmt: v => (v > 0 ? "+" : "") + (+v).toFixed(1) + " dB" });
  slider(b, { label: "Tần số trung", min: 300, max: 6000, step: 50, get: () => eq().midF || 1500, set: v => setEq("midF", v), fmt: v => v >= 1000 ? (v / 1000).toFixed(1) + " kHz" : Math.round(v) + " Hz" });
  slider(b, { label: "Cao (7 kHz)", min: -15, max: 15, step: 0.5, get: () => eq().hi || 0, set: v => setEq("hi", v), fmt: v => (v > 0 ? "+" : "") + (+v).toFixed(1) + " dB" });
  b.appendChild(el("p", "lsub", "Nén tiếng (compressor)"));
  toggle(b, "Bật nén tiếng", () => !!(A().comp && A().comp.on), v => setA("comp", v ? Object.assign({ thr: -22, ratio: 4, mk: 4 }, A().comp, { on: true }) : null));
  if (A().comp && A().comp.on) { const cp = () => A().comp, setC = (k, v) => setA("comp", Object.assign({}, cp(), { [k]: v }));
    slider(b, { label: "Ngưỡng", min: -50, max: 0, step: 1, get: () => cp().thr == null ? -22 : cp().thr, set: v => setC("thr", v), fmt: v => Math.round(v) + " dB" });
    slider(b, { label: "Tỉ lệ", min: 1, max: 20, step: 0.5, get: () => cp().ratio || 4, set: v => setC("ratio", v), fmt: v => (+v).toFixed(1) + ":1" });
    slider(b, { label: "Bù âm lượng", min: 0, max: 18, step: 0.5, get: () => cp().mk == null ? 4 : cp().mk, set: v => setC("mk", v), fmt: v => "+" + (+v).toFixed(1) + " dB" }); }
  b.appendChild(el("p", "lsub", "Vang (reverb)"));
  const rv = () => A().rev || {}, setR = (k, v) => setA("rev", Object.assign({ size: 0.5 }, rv(), { [k]: v }));
  slider(b, { label: "Độ vang", min: 0, max: 1, step: 0.01, get: () => rv().mix || 0, set: v => setR("mix", v), fmt: v => v ? Math.round(v * 100) + "%" : "Tắt" });
  if (rv().mix) slider(b, { label: "Phòng", min: 0, max: 1, step: 0.01, get: () => rv().size == null ? 0.5 : rv().size, set: v => setR("size", v), fmt: v => v < 0.33 ? "Nhỏ" : v < 0.66 ? "Vừa" : "Lớn" });
  b.appendChild(el("p", "lsub", "Cân trái/phải"));
  slider(b, { label: "Pan", min: -1, max: 1, step: 0.01, get: () => c.pan || 0, set: v => { if (Math.abs(v) < 0.02) delete c.pan; else c.pan = v; }, fmt: v => Math.abs(v) < 0.02 ? "Giữa" : (v < 0 ? "T " : "P ") + Math.round(Math.abs(v) * 100), kf: { c, prop: "pan" }, live: () => liveRefresh() });
  if (c.afx) btnRow(b, [["Bỏ mọi hiệu ứng âm thanh", () => { pushUndo(); delete c.afx; delete c.pan; renderInspector(); liveRefresh(); }]]);
}
