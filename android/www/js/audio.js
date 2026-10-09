"use strict";
/* ============================================================================
   Audio tools: voice effects, pitch shift, extract audio from video,
   beat detection, generated sound effects, text-to-speech hooks.
   ========================================================================== */
const VOICES = { none: "Gốc", chipmunk: "Giọng sóc (cao)", deep: "Giọng trầm", robot: "Rô-bốt", radio: "Radio", phone: "Điện thoại", megaphone: "Loa phóng thanh", echo: "Tiếng vọng", hall: "Hội trường", underwater: "Dưới nước" };
const PITCH = { chipmunk: 1.45, deep: 0.78 };

function voiceChain(ctx, v) {
  const inp = ctx.createGain(); let out = inp;
  const bq = (type, f, q) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q) b.Q.value = q; return b; };
  const dist = amt => { const w = ctx.createWaveShaper(), n = 1024, cur = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; cur[i] = (1 + amt) * x / (1 + amt * Math.abs(x)); } w.curve = cur; return w; };
  const link = (...nodes) => { let a = inp; for (const n of nodes) { a.connect(n); a = n; } return a; };
  switch (v) {
    case "robot": { const gm = ctx.createGain(); gm.gain.value = 0; const osc = ctx.createOscillator(); osc.frequency.value = 55; osc.connect(gm.gain); osc.start(); inp.connect(gm); const mix = ctx.createGain(); gm.connect(mix); const dry = ctx.createGain(); dry.gain.value = 0.25; inp.connect(dry); dry.connect(mix); out = mix; break; }
    case "radio": out = link(bq("highpass", 500), bq("lowpass", 3200), dist(3)); break;
    case "phone": out = link(bq("highpass", 380, 0.9), bq("lowpass", 3000, 0.9), dist(1.5)); break;
    case "megaphone": out = link(bq("bandpass", 1600, 0.8), dist(18), bq("lowpass", 4200)); break;
    case "underwater": out = link(bq("lowpass", 520, 1.4)); break;
    case "echo": { const d = ctx.createDelay(1.5); d.delayTime.value = 0.28; const fb = ctx.createGain(); fb.gain.value = 0.38; d.connect(fb); fb.connect(d); const mix = ctx.createGain(); inp.connect(mix); inp.connect(d); d.connect(mix); out = mix; break; }
    case "hall": { const conv = ctx.createConvolver(); conv.buffer = impulse(ctx, 2.4, 2.6); const wet = ctx.createGain(); wet.gain.value = 0.45; const mix = ctx.createGain(); inp.connect(mix); inp.connect(conv); conv.connect(wet); wet.connect(mix); out = mix; break; }
  }
  return { input: inp, output: out };
}
function impulse(ctx, secs, decay) { const n = Math.round(ctx.sampleRate * secs), b = ctx.createBuffer(2, n, ctx.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); } return b; }

/* granular pitch shift (same length, new pitch) */
function pitchShift(buf, ratio) {
  const ctxLike = actx || new OfflineAudioContext(1, 1, buf.sampleRate);
  const out = ctxLike.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
  const N = Math.round(buf.sampleRate * 0.05), hop = Math.round(N / 4), win = new Float32Array(N);
  for (let j = 0; j < N; j++) win[j] = 0.5 - 0.5 * Math.cos(2 * Math.PI * j / (N - 1));
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const x = buf.getChannelData(ch), y = out.getChannelData(ch), norm = new Float32Array(buf.length);
    for (let a = 0; a < x.length; a += hop) {
      for (let j = 0; j < N && a + j < y.length; j++) { const pos = a + j * ratio - (ratio - 1) * N / 2, i0 = Math.floor(pos); if (i0 < 0 || i0 + 1 >= x.length) continue; const f = pos - i0, s = x[i0] * (1 - f) + x[i0 + 1] * f; y[a + j] += s * win[j]; norm[a + j] += win[j]; }
    }
    for (let i = 0; i < y.length; i++) if (norm[i] > 1e-3) y[i] /= norm[i];
  }
  return out;
}
function voiceBuffer(m, v) { if (!m || !m.buf || !PITCH[v]) return null; m.vbuf = m.vbuf || {}; if (!m.vbuf[v]) m.vbuf[v] = pitchShift(m.buf, PITCH[v]); return m.vbuf[v]; }

/* ---------- extract audio from a video into its own audio media ---------- */
async function extractAudioMedia(vm) {
  const ex = [...media.values()].find(x => x.fromVideo === vm.id && x.buf); if (ex) return ex;
  if (!actx) throw new Error("no audio");
  const ab = await (await fetch(vm.url)).arrayBuffer();
  const buf = monoIfSame(await actx.decodeAudioData(ab));
  const m = { id: nid("m"), name: "Âm thanh · " + vm.name, kind: "audio", url: "", duration: buf.duration, buf, fromVideo: vm.id, user: true };
  await makeWave(m); media.set(m.id, m); renderBin(); return m;
}
async function extractAudioFromClip(c, k) {
  const vm = media.get(c.mediaId); if (!vm || vm.kind !== "video") { toast("Chỉ tách được âm thanh từ clip video."); return; }
  toast("Đang tách âm thanh…");
  let am; try { am = await extractAudioMedia(vm); } catch (e) { toast("Video này không có âm thanh hoặc không đọc được."); return; }
  pushUndo();
  const st = k === "v" ? vStarts()[V.indexOf(c)] : c.start;
  let tr = tracksOf("audio").find(tr => !C.some(x => x.track === tr.id && x.start < st + vlen(c) && cend(x) > st)); if (!tr) tr = addTrack("audio");
  const a = { id: nid("c"), track: tr.id, type: "audio", mediaId: am.id, start: st, in: c.in, out: c.out, speed: c.speed || 1, vol: c.vol || 0 };
  C.push(a); c.audioOut = true; sel = { k: "c", id: a.id }; renderAll(); toast("Đã tách âm thanh ra track " + tr.name + ". Âm thanh trong clip video đã tắt.");
}

/* ---------- beat detection ---------- */
function detectBeats(buf, from = 0, to = Infinity) {
  const sr = buf.sampleRate, d = buf.getChannelData(0), hop = 512, a = Math.floor(from * sr), b = Math.min(d.length, Math.floor(Math.min(to, buf.duration) * sr));
  const env = []; let lp = 0;
  for (let i = a; i < b; i += hop) { let e = 0; for (let j = i; j < i + hop && j < b; j++) { lp += 0.08 * (d[j] - lp); e += lp * lp; } env.push(Math.sqrt(e / hop)); }
  const flux = env.map((v, i) => Math.max(0, v - (env[i - 1] || 0)));
  const beats = [], W = 43; let last = -1;
  for (let i = 1; i < flux.length - 1; i++) {
    let m = 0, n = 0; for (let k = Math.max(0, i - W); k < Math.min(flux.length, i + W); k++) { m += flux[k]; n++; } m /= n;
    const tt = from + i * hop / sr;
    if (flux[i] > m * 1.8 && flux[i] >= flux[i - 1] && flux[i] >= flux[i + 1] && flux[i] > 0.002 && tt - last > 0.28) { beats.push(tt); last = tt; }
  }
  return beats;
}
function markBeats(c) {
  const m = media.get(c.mediaId); if (!m || !m.buf) { toast("Chọn một clip nhạc đã tải xong."); return; }
  const sp = c.speed || 1, bs = detectBeats(m.buf, c.in, c.out).map(b => c.start + (b - c.in) / sp);
  if (!bs.length) { toast("Không tìm thấy nhịp rõ ràng."); return; }
  pushUndo(); const set = new Set(markers.map(x => x.toFixed(2))); for (const b of bs) if (!set.has(b.toFixed(2))) markers.push(Math.round(b * 1000) / 1000); markers.sort((x, y) => x - y);
  renderTimeline(); toast(`Đã đánh dấu ${bs.length} nhịp. Bật Hít để clip bám vào nhịp.`);
}

/* ---------- generated sound effects ---------- */
const SFX_GEN = { click: "Tách", pop2: "Bụp", swoosh: "Vút", riser: "Dâng lên", boom: "Bùm", shutter: "Chụp ảnh", bell: "Chuông", typing: "Gõ phím", coin: "Đồng xu", heart: "Nhịp tim" };
async function genSfx(key) {
  const sr = 44100, dur = { riser: 2.2, typing: 1.2, bell: 1.6, boom: 1.4, heart: 1.2 }[key] || 0.7;
  const oc = new OfflineAudioContext(2, Math.round(sr * dur), sr), T0 = 0;
  const noise = () => { const b = oc.createBuffer(1, Math.round(sr * dur), sr), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = oc.createBufferSource(); s.buffer = b; return s; };
  const env = (node, a, peak, rel, at = 0) => { const gn = oc.createGain(); gn.gain.setValueAtTime(0, at); gn.gain.linearRampToValueAtTime(peak, at + a); gn.gain.exponentialRampToValueAtTime(0.0001, at + a + rel); node.connect(gn); gn.connect(oc.destination); return gn; };
  const osc = (type, f) => { const o = oc.createOscillator(); o.type = type; o.frequency.value = f; return o; };
  switch (key) {
    case "click": { const n = noise(); const f = oc.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 2500; n.connect(f); env(f, 0.001, 0.8, 0.03); n.start(); break; }
    case "pop2": { const o = osc("sine", 520); o.frequency.exponentialRampToValueAtTime(120, 0.12); env(o, 0.002, 0.9, 0.14); o.start(); break; }
    case "swoosh": { const n = noise(); const f = oc.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 1.2; f.frequency.setValueAtTime(400, 0); f.frequency.exponentialRampToValueAtTime(5000, 0.35); f.frequency.exponentialRampToValueAtTime(900, 0.6); n.connect(f); env(f, 0.18, 0.7, 0.45); n.start(); break; }
    case "riser": { const n = noise(); const f = oc.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 3; f.frequency.setValueAtTime(200, 0); f.frequency.exponentialRampToValueAtTime(8000, 2.0); n.connect(f); const gn = oc.createGain(); gn.gain.setValueAtTime(0.0001, 0); gn.gain.exponentialRampToValueAtTime(0.8, 2.0); gn.gain.linearRampToValueAtTime(0, 2.2); f.connect(gn); gn.connect(oc.destination); n.start(); const o = osc("sawtooth", 110); o.frequency.exponentialRampToValueAtTime(880, 2.0); const og = oc.createGain(); og.gain.setValueAtTime(0.0001, 0); og.gain.exponentialRampToValueAtTime(0.12, 2.0); og.gain.linearRampToValueAtTime(0, 2.2); o.connect(og); og.connect(oc.destination); o.start(); break; }
    case "boom": { const o = osc("sine", 120); o.frequency.exponentialRampToValueAtTime(35, 1.0); env(o, 0.005, 1, 1.2); o.start(); const n = noise(); const f = oc.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 900; n.connect(f); env(f, 0.002, 0.5, 0.5); n.start(); break; }
    case "shutter": { for (const at of [0, 0.09]) { const n = noise(); const f = oc.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 3200; n.connect(f); env(f, 0.001, 0.9, 0.05, at); n.start(at); } break; }
    case "bell": { [880, 1760, 2637].forEach((fq, i) => { const o = osc("sine", fq); env(o, 0.003, [0.5, 0.25, 0.12][i], 1.4); o.start(); }); break; }
    case "typing": { for (let i = 0; i < 9; i++) { const at = i * 0.12 + Math.random() * 0.04, n = noise(); const f = oc.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1800 + Math.random() * 1500; n.connect(f); env(f, 0.001, 0.6, 0.035, at); n.start(at); } break; }
    case "coin": { const o = osc("square", 988); o.frequency.setValueAtTime(1319, 0.08); const gn = env(o, 0.002, 0.25, 0.5); o.start(); break; }
    case "heart": { for (const at of [0, 0.22, 0.75, 0.97]) { const o = osc("sine", 70); env(o, 0.01, 0.9, 0.16, at); o.start(at); } break; }
  }
  return oc.startRendering();
}
async function addGeneratedSfx(key) {
  let m = [...media.values()].find(x => x.gen === key);
  if (!m) { const buf = await genSfx(key); m = { id: nid("m"), name: "SFX · " + SFX_GEN[key], kind: "audio", url: "", duration: buf.duration, buf, gen: key }; await makeWave(m); media.set(m.id, m); renderBin(); }
  return m;
}

/* ---------- text to speech (Android: native voices; Windows app: system voices) ---------- */
function ttsAvailable() { return !!(window.VINCutAndroid && VINCutAndroid.tts) || /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && !window.VINCutAndroid; }
async function ttsToMedia(text, lang, rate) {
  let url = "";
  if (window.VINCutAndroid && VINCutAndroid.tts) url = VINCutAndroid.tts(text, lang || "vi-VN", rate || 1);
  else url = "/tts?lang=" + encodeURIComponent(lang || "vi-VN") + "&rate=" + (rate || 1) + "&text=" + encodeURIComponent(text);
  if (!url) throw new Error("tts");
  const r = await fetch(url); if (!r.ok) throw new Error("tts " + r.status);
  const blob = new Blob([await r.arrayBuffer()], { type: "audio/wav" });
  const m = await addMediaFile(blob, "Giọng đọc · " + text.slice(0, 24).replace(/[\\/:*?"<>|]/g, "") + ".wav"); if (!m) throw new Error("decode"); return m;
}
