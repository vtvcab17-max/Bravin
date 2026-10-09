"use strict";
/* ============================================================================
   Export: settings dialog → frame-accurate MP4 via WebCodecs (H.264/AAC,
   any resolution, faster than real time on most devices). Source videos are
   decoded with mp4box + VideoDecoder (rotation-aware); falls back to seeking
   <video> elements, and to real-time MediaRecorder when WebCodecs is missing.
   ========================================================================== */
let exporting = false, recorder = null, chunks = [], expOverlay = null, expCancel = false;
async function getSaver() {
  if (window.VINCutAndroid) return { save: async ({ filename, data }) => {
    const blob = data instanceof Blob ? data : new Blob([data], { type: filename.endsWith(".json") ? "application/json" : "application/octet-stream" });
    const id = VINCutAndroid.begin(filename, blob.type || "application/octet-stream"); const CH = 768 * 1024;
    for (let o = 0; o < blob.size; o += CH) { if (!VINCutAndroid.append(id, await blobB64(blob.slice(o, o + CH)))) throw { code: "write" }; }
    const where = VINCutAndroid.finish(id); if (!where) throw { code: "write" }; return { status: "saved", where };
  } };
  const dl = window.claude && window.claude.use ? await window.claude.use("downloads").catch(() => null) : null;
  if (dl) return dl;
  if (ON_CLAUDE) return null;
  return { save: async ({ filename, data }) => { const blob = data instanceof Blob ? data : new Blob([data], { type: filename.endsWith(".json") ? "application/json" : "application/octet-stream" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); return { status: "saved" }; } };
}
const blobB64 = b => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1] || ""); fr.onerror = rej; fr.readAsDataURL(b); });
const u8B64 = u8 => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };

/* ---------- settings dialog ---------- */
const RES = { 720: "720p", 1080: "1080p (khuyên dùng)", 1440: "2K", 2160: "4K" };
function startExport() {
  if (!V.length && !C.some(c => c.type === "video" || c.type === "text" || c.type === "sticker")) { toast("Timeline chưa có gì để xuất."); return; }
  const wc = !!(window.VideoEncoder && window.Mp4Muxer && window.AudioEncoder);
  let pref = {}; try { pref = JSON.parse(localStorage.getItem("vincut-export") || "{}"); } catch (_) {}
  const ov = document.createElement("div"); ov.className = "overlay";
  ov.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="exT" style="max-width:520px"><h2 id="exT">Xuất video</h2>
    <div class="field"><label for="exName">Tên file</label><input type="text" id="exName"></div>
    <div class="row"><div class="field"><label for="exRes">Độ phân giải</label><select id="exRes"></select></div>
    <div class="field"><label for="exFps">Khung hình/giây</label><select id="exFps"><option>24</option><option>25</option><option selected>30</option><option>50</option><option>60</option></select></div></div>
    <div class="row"><div class="field"><label for="exQ">Chất lượng</label><select id="exQ"><option value="0.07">Tiết kiệm dung lượng</option><option value="0.11" selected>Khuyên dùng</option><option value="0.18">Cao</option></select></div>
    <div class="field"><label for="exEng">Cách xuất</label><select id="exEng">${wc ? '<option value="wc">Nhanh, chính xác từng khung (MP4)</option>' : ""}<option value="rt">Ghi thời gian thực</option></select></div></div>
    ${typeof ioRange === "function" && ioRange() ? `<label class="chk"><input type="checkbox" id="exIO" checked> Chỉ xuất đoạn In–Out (${fmt(ioRange()[0])} → ${fmt(ioRange()[1])})</label>` : ""}
    <div class="field"><label for="exNorm">Độ lớn âm thanh khi xuất</label><select id="exNorm"><option value="0">Giữ nguyên</option><option value="-14">Chuẩn -14 LUFS (TikTok, YouTube, Facebook)</option><option value="-16">Chuẩn -16 LUFS (Podcast, Apple)</option><option value="-23">Chuẩn -23 LUFS (Truyền hình)</option></select></div>
    <p class="note" id="exInfo"></p>
    <div class="row dlg-extra"><span class="note">Xuất riêng:</span><button id="exWav">Âm thanh (WAV)</button><button id="exPng">Ảnh bìa (PNG)</button></div>
    <div class="row dlg-actions"><button class="no" id="exNo">Huỷ</button><button class="primary" id="exGo">Xuất video</button></div></div>`;
  document.body.appendChild(ov);
  const R = ov.querySelector("#exRes"); for (const k in RES) { const o = document.createElement("option"); o.value = k; o.textContent = RES[k]; R.appendChild(o); }
  ov.querySelector("#exNorm").value = pref.norm || "-14"; ov.querySelector("#exNorm").onchange = () => { exportNorm = +ov.querySelector("#exNorm").value; }; exportNorm = +ov.querySelector("#exNorm").value;
  R.value = pref.res || "1080"; ov.querySelector("#exFps").value = pref.fps || "30"; ov.querySelector("#exQ").value = pref.q || "0.11"; ov.querySelector("#exName").value = slug(projName) || "vincut";
  const info = () => { const [w, h] = outSize(+R.value), fps = +ov.querySelector("#exFps").value, br = bitrateFor(w, h, fps, +ov.querySelector("#exQ").value); ov.querySelector("#exInfo").textContent = `${w}×${h} · ${fps} fps · ${(br / 1e6).toFixed(1)} Mbps · dài ${fmt(total())} · khoảng ${Math.round(br * total() / 8 / 1048576 + total() * 0.024)} MB` + (ov.querySelector("#exEng").value === "rt" ? " · ghi thời gian thực: giữ màn hình mở" : ""); };
  ov.querySelectorAll("select").forEach(s => s.onchange = info); info();
  ov.querySelector("#exNo").onclick = () => ov.remove();
  ov.querySelector("#exPng").onclick = async () => { const s = await getSaver(); if (!s) return; drawFrame(); cv.toBlob(b => s.save({ filename: ov.querySelector("#exName").value + "-anh-bia.png", data: b }).then(() => toast("Đã lưu ảnh bìa.")), "image/png"); };
  const rangeSel = () => ov.querySelector("#exIO") && ov.querySelector("#exIO").checked ? ioRange() : null;
  ov.querySelector("#exWav").onclick = async () => { const s = await getSaver(); if (!s) return; toast("Đang trộn âm thanh…"); const buf = await renderMix(48000, rangeSel()); await s.save({ filename: ov.querySelector("#exName").value + ".wav", data: wavBlob(buf) }); toast("Đã lưu file WAV."); };
  ov.querySelector("#exGo").onclick = () => {
    const o = { res: R.value, fps: ov.querySelector("#exFps").value, q: ov.querySelector("#exQ").value, norm: ov.querySelector("#exNorm").value }; try { localStorage.setItem("vincut-export", JSON.stringify(o)); } catch (_) {}
    const name = (ov.querySelector("#exName").value || "vincut").replace(/[\\/:*?"<>|]/g, "_"), rg = rangeSel(); ov.remove();
    if (ov.querySelector("#exEng").value === "wc" || rg) exportWebCodecs(+o.res, +o.fps, +o.q, name, rg).catch(e => { console.error(e); closeExportUI(); toast("Xuất nhanh lỗi (" + (e && e.message || e) + "). Đang thử ghi thời gian thực…"); startRealtimeExport(name, bitrateFor(...outSize(+o.res), +o.fps, +o.q)); });
    else startRealtimeExport(name, bitrateFor(...outSize(+o.res), +o.fps, +o.q));
  };
}
function outSize(short) { const k = short / Math.min(cv.width, cv.height); const ev = x => Math.max(2, Math.round(x * k / 2) * 2); return [ev(cv.width), ev(cv.height)]; }
function bitrateFor(w, h, fps, bpp) { return clamp(Math.round(w * h * fps * bpp), 1.5e6, 80e6); }

/* ---------- progress UI ---------- */
function exportUI(title, sub) {
  expOverlay = document.createElement("div"); expOverlay.className = "overlay";
  expOverlay.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="expT"><h2 id="expT"></h2><div class="tc" style="font-family:var(--ui);line-height:1.6" id="expSub"></div><div class="bar"><i id="expBar"></i></div><div class="tc" id="expTxt">0%</div><div class="row" style="justify-content:flex-end"><button id="expCancel" class="no">Huỷ</button></div></div>`;
  expOverlay.querySelector("#expT").textContent = title; expOverlay.querySelector("#expSub").textContent = sub;
  document.body.appendChild(expOverlay);
}
function setExportProgress(p, txt) { const b = $("#expBar"); if (b) b.style.width = (p * 100).toFixed(1) + "%"; const x = $("#expTxt"); if (x) x.textContent = txt; }
function closeExportUI() { exporting = false; expOverlay && expOverlay.remove(); expOverlay = null; }

/* ---------- real-time fallback (MediaRecorder) ---------- */
async function startRealtimeExport(name, bitrate) {
  const downloads = await getSaver(); if (!downloads) { toast("Không lưu được file ở đây."); return; }
  pause(); if (actx && actx.state !== "running") await actx.resume().catch(() => {});
  t = 0; drawFrame();
  const stream = cv.captureStream(FPS); if (exportDest) exportDest.stream.getAudioTracks().forEach(tr => stream.addTrack(tr));
  const types = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  const mime = types.find(x => window.MediaRecorder && MediaRecorder.isTypeSupported(x));
  if (!mime) { toast("Trình duyệt này không hỗ trợ xuất video. Hãy dùng Chrome hoặc Edge."); return; }
  chunks = []; recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: Math.min(bitrate || 6e6, 12e6), audioBitsPerSecond: 192e3 });
  recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
  recorder.onstop = async () => {
    const cancelled = !exporting; closeExportUI();
    if (cancelled) { toast("Đã huỷ xuất video."); return; }
    const ext = mime.startsWith("video/mp4") ? "mp4" : "webm"; const blob = new Blob(chunks, { type: mime.split(";")[0] });
    try { await downloads.save({ filename: name + "." + ext, data: blob }); toast("Đã lưu " + name + "." + ext); }
    catch (err) { toast(err && err.code === "declined" ? "Bạn đã huỷ lưu file." : "Không lưu được file (" + (err && err.code || "lỗi") + ")."); }
  };
  exportUI("Đang xuất video", `Ghi theo thời gian thực nên mất đúng bằng độ dài timeline (${fmt(total())}). Giữ màn hình mở và không chuyển ứng dụng.`);
  $("#expCancel").onclick = () => { exporting = false; pause(); recorder && recorder.state !== "inactive" && recorder.stop(); };
  exporting = true; recorder.start(500); play();
}
function updateExportBar() { const p = clamp(t / total(), 0, 1); setExportProgress(p, Math.round(p * 100) + "% · " + fmt(t) + " / " + fmt(total())); }
function finishExport() { pause(); drawFrame(); setTimeout(() => recorder && recorder.state !== "inactive" && recorder.stop(), 300); }

/* ---------- offline audio mix ---------- */
let exportNorm = 0;
async function renderMix(sr, range) {
  const ra = range ? range[0] : 0, rb = range ? range[1] : total(), dur = Math.max(0.1, rb - ra), oc = new OfflineAudioContext(2, Math.ceil(dur * sr), sr);
  const lim = oc.createDynamicsCompressor(); lim.threshold.value = -1.5; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.12; lim.connect(oc.destination);
  const place = (buf, c, start, len, voice, trId) => {
    if (!buf || len <= 0.01) return; const sp = c.speed || 1, rel = start - ra, skip = Math.max(0, -rel), when = Math.max(0, rel), play = Math.min(len - skip, dur - when); if (play <= 0.01) return;
    const s = oc.createBufferSource(); s.buffer = voiceBuffer({ buf, vbuf: buf._vb || (buf._vb = {}) }, voice) || buf; s.playbackRate.value = hasRamp(c) ? speedAt(c, skip) : sp; if (hasRamp(c)) { try { s.playbackRate.setValueCurveAtTime(rateCurve(c, skip, play), when, play); } catch (_) {} }
    const tg = typeof trackGain === "function" ? trackGain(trId) : 1, gn = oc.createGain(); const n = Math.max(2, Math.ceil(play * 100)), curve = new Float32Array(n); for (let i = 0; i < n; i++) curve[i] = clipGain(c, skip + i / (n - 1) * play, len) * tg;
    gn.gain.setValueAtTime(curve[0], when); try { gn.gain.setValueCurveAtTime(curve, when, play); } catch (_) { gn.gain.value = curve[0]; }
    const ch = voiceChain(oc, voice); s.connect(ch.input); let tail = ch.output; if (typeof audioFxChain === "function") tail = audioFxChain(oc, c, tail); tail.connect(gn);
    let out = gn; const pv = typeof trackPan === "function" ? trackPan(trId) : 0, hasCP = typeof clipPan === "function" && (c.pan || (c.kf && c.kf.pan));
    if (pv || hasCP) { const pn = oc.createStereoPanner(); pn.pan.value = clamp(pv + (hasCP ? clipPan(c, skip) : 0), -1, 1); if (hasCP && c.kf && c.kf.pan) { const n2 = Math.max(2, Math.ceil(play * 30)), cv3 = new Float32Array(n2); for (let i = 0; i < n2; i++) cv3[i] = clamp(pv + clipPan(c, skip + i / (n2 - 1) * play), -1, 1); try { pn.pan.setValueCurveAtTime(cv3, when, play); } catch (_) {} } gn.connect(pn); out = pn; } out.connect(lim);
    const s0 = srcOffset(c, skip); s.start(when, c.in + s0, Math.max(0.01, srcOffset(c, skip + play) - s0) + 0.05);
  };
  const den = async (b, c) => c.afx && c.afx.den && typeof denoiseCached === "function" ? await denoiseCached(b, c.afx.den) : b;
  for (const c of C) { if (c.type !== "audio" || c.muted || c.disabled) continue; const tr = trackById(c.track); if (!tr || tr.off) continue; const m = media.get(c.mediaId); if (m && m.buf) place(await den(m.buf, c), c, c.start, clen(c), c.voice, c.track); }
  const vtr = trackById("v"), st = vStarts();
  const videoAudio = async (c, start, len, off, trId) => { if (off || c.muted || c.disabled || c.audioOut || c.reverse || c.freeze) return; if (start + len < ra || start > rb) return; const m = media.get(c.mediaId); if (!m || m.kind !== "video" || !m.hasAudio) return; try { const am = await extractAudioMedia(m); place(await den(am.buf, c), c, start, len, undefined, trId); } catch (_) {} };
  for (let i = 0; i < V.length; i++) await videoAudio(V[i], st[i], vlen(V[i]), vtr && vtr.off, "v");
  for (const c of C) if (c.type === "video") { const tr = trackById(c.track); await videoAudio(c, c.start, clen(c), !tr || tr.off, c.track); }
  const res = await oc.startRendering();
  if (exportNorm && typeof normalizeMix === "function") await normalizeMix(res, exportNorm);
  return res;
}
function wavBlob(buf) {
  const ch = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate, ab = new ArrayBuffer(44 + n * ch * 2), dv = new DataView(ab);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); dv.setUint32(4, 36 + n * ch * 2, true); w(8, "WAVEfmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, ch, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * ch * 2, true); dv.setUint16(32, ch * 2, true); dv.setUint16(34, 16, true); w(36, "data"); dv.setUint32(40, n * ch * 2, true);
  const data = []; for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c)); let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const v = clamp(data[c][i], -1, 1); dv.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
  return new Blob([ab], { type: "audio/wav" });
}

/* ---------- source frames for export ---------- */
function mediaReader(m) {
  if (m.blob) return { size: m.blob.size, read: async (o, n) => (o >= m.blob.size ? new ArrayBuffer(0) : await m.blob.slice(o, Math.min(m.blob.size, o + n)).arrayBuffer()) };
  let whole = null, size = null;
  return { get size() { return size; }, read: async (o, n) => {
    if (whole) return whole.slice(o, Math.min(whole.byteLength, o + n));
    const r = await fetch(m.url, { headers: { Range: `bytes=${o}-${o + n - 1}` } });
    if (r.status === 416) return new ArrayBuffer(0);
    if (r.status === 200) { whole = await r.arrayBuffer(); size = whole.byteLength; return whole.slice(o, Math.min(whole.byteLength, o + n)); }
    if (r.status !== 206) throw new Error("đọc file lỗi " + r.status);
    const cr = r.headers.get("Content-Range"); if (cr && size == null) { const mm = /\/(\d+)/.exec(cr); if (mm) size = +mm[1]; }
    return r.arrayBuffer();
  } };
}
class DecSource {
  constructor(m) { this.m = m; this.reader = mediaReader(m); this.frames = []; this.samples = []; this.pos = 0; this.eof = false; this.flushed = false; this.lastUs = null; this.err = null; }
  async init() {
    if (!window.MP4Box || !window.VideoDecoder) throw new Error("no webcodecs");
    const f = this.file = MP4Box.createFile(); let info = null; f.onReady = i => { info = i; }; f.onError = e => { this.err = new Error(String(e)); };
    let pos = 0; for (let guard = 0; !info && guard < 4000; guard++) { const ab = await this.reader.read(pos, 1 << 20); if (!ab.byteLength) break; ab.fileStart = pos; const next = f.appendBuffer(ab); pos = typeof next === "number" && next > pos ? next : pos + ab.byteLength; if (this.err) throw this.err; }
    if (!info) throw new Error("not an MP4/MOV");
    const tr = info.videoTracks[0]; if (!tr) throw new Error("no video track"); this.track = tr;
    const trak = f.getTrackById(tr.id); let desc;
    for (const e of trak.mdia.minf.stbl.stsd.entries) { const box = e.avcC || e.hvcC || e.vpcC || e.av1C; if (box) { const s = new DataStream(undefined, 0, DataStream.BIG_ENDIAN); box.write(s); desc = new Uint8Array(s.buffer, 8); break; } }
    this.config = { codec: tr.codec.startsWith("vp08") ? "vp8" : tr.codec, codedWidth: tr.video.width, codedHeight: tr.video.height, description: desc, optimizeForLatency: false };
    const sup = await VideoDecoder.isConfigSupported(this.config); if (!sup.supported) throw new Error("codec " + tr.codec);
    const mx = tr.matrix || [65536, 0, 0, 0, 65536, 0, 0, 0, 1073741824]; this.rot = ((Math.round(Math.atan2(mx[1], mx[0]) * 180 / Math.PI) % 360) + 360) % 360;
    f.onSamples = (id, user, samples) => { for (const s of samples) this.samples.push(s); };
    f.setExtractionOptions(tr.id, null, { nbSamples: 60 }); f.start(); this.pos = pos; this.mkDecoder(); return this;
  }
  mkDecoder() { try { this.dec && this.dec.state !== "closed" && this.dec.close(); } catch (_) {} this.dec = new VideoDecoder({ output: fr => this.frames.push(fr), error: e => { this.err = e; } }); this.dec.configure(this.config); this.flushed = false; }
  reset(T) { this.frames.forEach(f => f.close()); this.frames = []; this.samples = []; this.mkDecoder(); const r = this.file.seek(Math.max(0, T), true); this.pos = r.offset; this.eof = false; }
  async feed() {
    if (this.samples.length) { const s = this.samples.shift(); this.dec.decode(new EncodedVideoChunk({ type: s.is_sync ? "key" : "delta", timestamp: Math.round(1e6 * s.cts / s.timescale), duration: Math.round(1e6 * s.duration / s.timescale), data: s.data })); try { this.file.releaseUsedSamples(this.track.id, s.number); } catch (_) {} return true; }
    if (this.eof) { if (!this.flushed) { this.flushed = true; await this.dec.flush().catch(() => {}); return true; } return false; }
    const ab = await this.reader.read(this.pos, 1 << 20);
    if (!ab.byteLength) { this.eof = true; try { this.file.flush(); } catch (_) {} return true; }
    ab.fileStart = this.pos; const next = this.file.appendBuffer(ab); this.pos = typeof next === "number" && next > this.pos ? next : this.pos + ab.byteLength;
    if (this.reader.size && this.pos >= this.reader.size) { this.eof = true; try { this.file.flush(); } catch (_) {} }
    return true;
  }
  async frameAt(T) {
    const us = Math.round(T * 1e6), half = 12000;
    if (this.lastUs == null || us < this.lastUs - 1000 || us > this.lastUs + 2.5e6) this.reset(T);
    this.lastUs = us;
    for (let guard = 0; guard < 20000; guard++) {
      if (this.err) throw this.err;
      this.frames.sort((a, b) => a.timestamp - b.timestamp);
      while (this.frames.length > 1 && this.frames[1].timestamp <= us + half) this.frames.shift().close();
      if (this.frames.length > 1 || (this.frames.length === 1 && (this.frames[0].timestamp > us + half || (this.eof && this.flushed && this.dec.decodeQueueSize === 0)))) return this.wrap(this.frames[0]);
      if (this.dec.decodeQueueSize > 6) { await new Promise(r => setTimeout(r, 1)); continue; }
      const more = await this.feed();
      if (!more) { await new Promise(r => setTimeout(r, 2)); if (this.dec.decodeQueueSize === 0) return this.frames.length ? this.wrap(this.frames[this.frames.length - 1]) : null; }
      else if (!this.samples.length) await new Promise(r => setTimeout(r, 0));
    }
    throw new Error("decoder stalled");
  }
  wrap(fr) {
    if (!this.rot) return { img: fr, w: fr.displayWidth, h: fr.displayHeight };
    const sw = fr.displayWidth, sh = fr.displayHeight, q = this.rot === 90 || this.rot === 270, cnv = this._rc || (this._rc = document.createElement("canvas")); cnv.width = q ? sh : sw; cnv.height = q ? sw : sh;
    const x = cnv.getContext("2d"); x.setTransform(1, 0, 0, 1, 0, 0); x.translate(cnv.width / 2, cnv.height / 2); x.rotate(this.rot * Math.PI / 180); x.drawImage(fr, -sw / 2, -sh / 2); return { img: cnv, w: cnv.width, h: cnv.height };
  }
  close() { this.frames.forEach(f => f.close()); this.frames = []; try { this.dec && this.dec.close(); } catch (_) {} }
}
class ElemSource {
  constructor(m) { this.el = document.createElement("video"); this.el.muted = true; this.el.playsInline = true; this.el.preload = "auto"; this.el.crossOrigin = "anonymous"; this.el.src = m.url; holder().appendChild(this.el); }
  async init() { await loadMeta(this.el); return this; }
  async frameAt(T, fps) { const el = this.el; T = clamp(T, 0, Math.max(0, el.duration - 0.03)); if (this.last == null || Math.abs(this.last - T) > 0.25 / fps) { await new Promise(res => { let done = false; const fin = () => { if (done) return; done = true; res(); }; el.addEventListener("seeked", () => { if (el.requestVideoFrameCallback) el.requestVideoFrameCallback(() => fin()); setTimeout(fin, 120); }, { once: true }); el.currentTime = T; setTimeout(fin, 3000); }); this.last = T; } return el.videoWidth ? { img: el, w: el.videoWidth, h: el.videoHeight } : null; }
  close() { this.el.removeAttribute("src"); this.el.load(); this.el.remove(); }
}
async function makeSource(m, reverse) {
  if (!reverse && window.VideoDecoder && window.MP4Box && !/\.webm$/i.test(m.name)) { try { return await new DecSource(m).init(); } catch (e) { console.warn("decoder path off for", m.name, e && e.message); } }
  return new ElemSource(m).init();
}
function layersAt(T) {
  const need = []; const vtr = trackById("v");
  if (!(vtr && vtr.off)) { const tw = transitionAt(T); if (tw) need.push([V[tw.i], tw.ltA, tw.i % 2], [V[tw.i + 1], tw.ltB, (tw.i + 1) % 2]); else { const a = activeVideo(T); if (a) need.push([a.c, T - a.start, a.i % 2]); } }
  tracks.forEach((tr, ti) => { if (tr.type !== "overlay" || tr.off) return; for (const c of C) if (c.track === tr.id && T >= c.start && T < cend(c)) need.push([c, T - c.start, 2 + ti]); });
  return need;
}

/* ---------- WebCodecs export ---------- */
async function pickVideoCodec(w, h, fps, br) {
  const cands = [["avc", "avc1.640034"], ["avc", "avc1.640033"], ["avc", "avc1.640028"], ["avc", "avc1.4d0034"], ["avc", "avc1.4d0028"], ["avc", "avc1.42003e"], ["avc", "avc1.42001f"], ["vp9", "vp09.00.51.08"], ["vp9", "vp09.00.41.08"], ["av1", "av01.0.08M.08"]];
  for (const [mux, codec] of cands) { for (const hw of ["prefer-hardware", "no-preference"]) { const cfg = { codec, width: w, height: h, bitrate: br, framerate: fps, hardwareAcceleration: hw, latencyMode: "quality" }; if (codec.startsWith("avc")) cfg.avc = { format: "avc" }; try { const s = await VideoEncoder.isConfigSupported(cfg); if (s.supported) return { mux, cfg: s.config || cfg }; } catch (_) {} } }
  return null;
}
async function pickAudioCodec(sr) { for (const [mux, codec] of [["aac", "mp4a.40.2"], ["opus", "opus"]]) { const cfg = { codec, sampleRate: sr, numberOfChannels: 2, bitrate: 192000 }; try { const s = await AudioEncoder.isConfigSupported(cfg); if (s.supported) return { mux, cfg }; } catch (_) {} } return null; }
async function exportTarget(name) {
  if (window.VINCutAndroid && VINCutAndroid.beginRandom) { const id = VINCutAndroid.beginRandom(name, "video/mp4"); return { target: new Mp4Muxer.StreamTarget({ onData: (data, pos) => { if (!VINCutAndroid.writeAt(id, pos, u8B64(data))) throw new Error("write"); }, chunked: true, chunkSize: 4 << 20 }), fastStart: false, done: async () => VINCutAndroid.finish(id), abort: () => { try { VINCutAndroid.finish(id + ":abort"); } catch (_) {} } }; }
  if (window.showSaveFilePicker && window.top === window && !ON_CLAUDE) { try { const h = await showSaveFilePicker({ suggestedName: name, types: [{ description: "Video MP4", accept: { "video/mp4": [".mp4"] } }] }); const ws = await h.createWritable(); return { target: new Mp4Muxer.FileSystemWritableFileStreamTarget(ws), fastStart: false, done: async () => { await ws.close(); return name; }, abort: () => ws.abort && ws.abort() }; } catch (e) { if (e && e.name === "AbortError") throw new Error("Bạn đã huỷ chọn nơi lưu."); } }
  const target = new Mp4Muxer.ArrayBufferTarget(); return { target, fastStart: "in-memory", done: async () => { const s = await getSaver(); if (!s) throw new Error("không lưu được ở đây"); await s.save({ filename: name, data: new Blob([target.buffer], { type: "video/mp4" }) }); return name; }, abort: () => {} };
}
async function exportWebCodecs(short, fps, bpp, name, range) {
  pause(); await saveCurrent(true);
  const R0 = range ? range[0] : 0, [W, H] = outSize(short), br = bitrateFor(W, H, fps, bpp), dur = range ? range[1] - range[0] : total(), N = Math.max(1, Math.ceil(dur * fps));
  const vc = await pickVideoCodec(W, H, fps, br); if (!vc) throw new Error("thiết bị không có bộ mã hoá video phù hợp");
  const ac = await pickAudioCodec(48000);
  const tgt = await exportTarget(name + ".mp4");
  exporting = true; expCancel = false;
  exportUI("Đang xuất video", `${W}×${H} · ${fps} fps · ${vc.cfg.codec}${ac ? " + " + ac.cfg.codec : ""}. Có thể dùng máy bình thường; giữ app mở.`);
  $("#expCancel").onclick = () => { expCancel = true; };
  const muxer = new Mp4Muxer.Muxer({ target: tgt.target, fastStart: tgt.fastStart, firstTimestampBehavior: "offset", video: { codec: vc.mux, width: W, height: H, frameRate: fps }, audio: ac ? { codec: ac.mux, sampleRate: 48000, numberOfChannels: 2 } : undefined });
  const sources = new Map(); let ok = false;
  const keepCv = cv, keepG = g;
  try {
    // audio first
    if (ac) {
      setExportProgress(0.01, "Đang trộn âm thanh…");
      const mix = await renderMix(48000, range); let aerr = null;
      const enc = new AudioEncoder({ output: (ch, meta) => muxer.addAudioChunk(ch, meta), error: e => { aerr = e; } }); enc.configure(ac.cfg);
      const L = mix.length, B = 4800, L0 = mix.getChannelData(0), R0 = mix.getChannelData(1);
      for (let o = 0; o < L; o += B) { if (expCancel) throw new Error("cancel"); const n = Math.min(B, L - o), d = new Float32Array(n * 2); d.set(L0.subarray(o, o + n), 0); d.set(R0.subarray(o, o + n), n); const ad = new AudioData({ format: "f32-planar", sampleRate: 48000, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(o / 48000 * 1e6), data: d }); enc.encode(ad); ad.close(); if (enc.encodeQueueSize > 20) await new Promise(r => setTimeout(r, 0)); }
      await enc.flush(); enc.close(); if (aerr) throw aerr;
    }
    // video
    let verr = null; const venc = new VideoEncoder({ output: (ch, meta) => muxer.addVideoChunk(ch, meta), error: e => { verr = e; } }); venc.configure(vc.cfg);
    const ecv = document.createElement("canvas"); ecv.width = W; ecv.height = H; const eg = ecv.getContext("2d", { alpha: false, willReadFrequently: false });
    const cache = new Map(); frameProvider = (c, srcT, slot) => cache.get(c.id + "#" + slot) || null;
    cv = ecv; g = eg; renderMode = "export";
    const t0 = performance.now();
    for (let n = 0; n < N; n++) {
      if (expCancel) throw new Error("cancel"); if (verr) throw verr;
      const T = R0 + n / fps; cache.clear();
      for (const [c, lt, slot] of layersAt(T)) {
        const m = media.get(c.mediaId); if (!m || m.kind !== "video" || !(m.url || m.blob)) continue;
        const key = m.id + "#" + slot + (c.reverse ? "r" : ""); let src = sources.get(key); if (!src) { src = await makeSource(m, c.reverse); sources.set(key, src); }
        let fr = null; try { fr = await src.frameAt(srcTime(c, lt), fps); } catch (e) { console.warn("frame", m.name, e); if (src instanceof DecSource) { src.close(); src = await new ElemSource(m).init(); sources.set(key, src); fr = await src.frameAt(srcTime(c, lt), fps); } }
        cache.set(c.id + "#" + slot, fr);
      }
      drawFrame(T);
      const vf = new VideoFrame(ecv, { timestamp: Math.round((T - R0) * 1e6), duration: Math.round(1e6 / fps) });
      venc.encode(vf, { keyFrame: n % (fps * 2) === 0 }); vf.close();
      while (venc.encodeQueueSize > 4) await new Promise(r => setTimeout(r, 1));
      if (n % 5 === 0) { const el = (performance.now() - t0) / 1000, rate = (n + 1) / Math.max(0.001, el), left = (N - n - 1) / rate; setExportProgress(0.03 + 0.95 * n / N, `${Math.round(100 * n / N)}% · khung ${n + 1}/${N} · ${rate.toFixed(1)} khung/giây · còn khoảng ${fmt(left).replace(/\.\d+$/, "")}`); await new Promise(r => setTimeout(r, 0)); }
    }
    await venc.flush(); venc.close(); if (verr) throw verr;
    muxer.finalize(); setExportProgress(0.99, "Đang lưu file…");
    const where = await tgt.done(); ok = true;
    closeExportUI(); toast("Đã xuất " + (where && where !== true ? where : name + ".mp4") + " · " + fmt(dur));
  } catch (e) {
    if (!ok) { try { tgt.abort(); } catch (_) {} }
    if (e && e.message === "cancel") { closeExportUI(); toast("Đã huỷ xuất video."); return; }
    throw e;
  } finally {
    cv = keepCv; g = keepG; renderMode = "preview"; frameProvider = null; exporting = false;
    for (const s of sources.values()) try { s.close(); } catch (_) {}
    releaseScratch();
    setAspect($("#aspect").value); drawFrame();
  }
}
