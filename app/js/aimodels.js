"use strict";
/* ============================================================================
   On-device AI (runs in the browser / Android WebView, no API key):
   - Auto captions: Whisper via transformers.js (word timings → karaoke)
   - Person background removal: MediaPipe image segmenter
   Libraries and models download on first use and are cached by the browser.
   ========================================================================== */
const AI_CDN = Object.assign({
  transformers: "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js",
  vision: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0",
  segFast: "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite",
  segFine: "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite",
  modelHosts: ["https://huggingface.co/", "https://registry.npmmirror.com/sts-whisper-{size}/1.0.0/files/models/"]
}, window.VINCUT_AI || {});
const WHISPER = { tiny: ["onnx-community/whisper-tiny", "Xenova/whisper-tiny", "Nhanh · ~40 MB"], base: ["onnx-community/whisper-base", "Xenova/whisper-base", "Cân bằng · ~80 MB"], small: ["onnx-community/whisper-small", "Xenova/whisper-small", "Chính xác hơn · ~250 MB"] };
let _tf = null, _asr = { key: "", pipe: null };
async function loadTF() { if (_tf) return _tf; _tf = await import(AI_CDN.transformers); return _tf; }
async function getASR(size, onProgress) {
  const tf = await loadTF(); const key = size; if (_asr.key === key && _asr.pipe) return _asr.pipe;
  const [hfId, mirrorId] = WHISPER[size] || WHISPER.base; const dev = navigator.gpu ? "webgpu" : "wasm";
  try { tf.env.backends.onnx.wasm.proxy = dev === "wasm"; if (AI_CDN.wasmPaths) tf.env.backends.onnx.wasm.wasmPaths = AI_CDN.wasmPaths; } catch (_) {}
  let lastErr = null;
  for (const host of AI_CDN.modelHosts) {
    try {
      tf.env.allowLocalModels = false; tf.env.remoteHost = host.replace("{size}", size);
      const mirror = !host.includes("huggingface.co"); tf.env.remotePathTemplate = mirror ? "{model}/" : "{model}/resolve/{revision}/";
      const pipe = await tf.pipeline("automatic-speech-recognition", mirror ? mirrorId : hfId, { device: mirror ? "wasm" : dev, dtype: mirror ? "q8" : (dev === "webgpu" ? { encoder_model: "fp32", decoder_model_merged: "q4" } : "q8"), progress_callback: onProgress });
      _asr = { key, pipe }; return pipe;
    } catch (e) { lastErr = e; console.warn("ASR host failed", host, e); }
  }
  throw lastErr || new Error("Không tải được model");
}
/* mono 16 kHz audio of the chosen source, positioned on the timeline */
async function renderSpeech(source, from, to) {
  const sr = 16000, dur = Math.max(0.5, to - from), oc = new OfflineAudioContext(1, Math.ceil(sr * dur), sr);
  const add = (buf, start, inn, len, sp, vol) => { if (!buf) return; const s = oc.createBufferSource(); s.buffer = buf; s.playbackRate.value = sp || 1; const gn = oc.createGain(); gn.gain.value = dbToGain(vol || 0) || 1; s.connect(gn); gn.connect(oc.destination); const at = start - from, skip = Math.max(0, -at); if (len - skip <= 0.01) return; s.start(Math.max(0, at), inn + skip * (sp || 1), (len - skip) * (sp || 1)); };
  if (source === "main") { const st = vStarts(); for (let i = 0; i < V.length; i++) { const c = V[i], m = media.get(c.mediaId); if (!m || m.kind !== "video" || c.muted || c.freeze || c.reverse) continue; let am = null; try { am = await extractAudioMedia(m); } catch (_) { continue; } add(am.buf, st[i], c.in, vlen(c), c.speed, 0); } }
  else if (source.startsWith("clip:")) { const f = clipById(source.slice(5)); if (f) { const c = f.c, m = media.get(c.mediaId); let buf = m && m.buf; if (m && m.kind === "video") { try { buf = (await extractAudioMedia(m)).buf; } catch (_) {} } add(buf, f.k === "v" ? vStarts()[V.indexOf(c)] : c.start, c.in, f.k === "v" ? vlen(c) : clen(c), c.speed, 0); } }
  else { for (const c of C) if (c.type === "audio" && c.track === source && !c.muted) { const m = media.get(c.mediaId); add(m && m.buf, c.start, c.in, clen(c), c.speed, 0); } }
  return (await oc.startRendering()).getChannelData(0);
}
/* speech regions from a 16 kHz signal: [[start, end], …] in seconds */
function vadRegions(a, sr) {
  const hop = Math.round(sr * 0.02), n = Math.floor(a.length / hop), e = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let j = i * hop; j < (i + 1) * hop; j++) s += a[j] * a[j]; e[i] = Math.sqrt(s / hop); }
  const sorted = Array.from(e).sort((x, y) => x - y), floor = sorted[Math.floor(n * 0.2)] || 0, th = Math.max(0.006, floor * 3);
  const regs = []; let st = -1, quiet = 0;
  for (let i = 0; i < n; i++) { if (e[i] > th) { if (st < 0) st = i; quiet = 0; } else if (st >= 0 && ++quiet > 15) { regs.push([st, i - quiet]); st = -1; quiet = 0; } }
  if (st >= 0) regs.push([st, n - 1]);
  const out = [];
  for (const [s0, e0] of regs) {
    let a0 = Math.max(0, s0 * 0.02 - 0.12), b0 = Math.min(a.length / sr, (e0 + 1) * 0.02 + 0.12); if (b0 - a0 < 0.3) continue;
    while (b0 - a0 > 12) { // split long regions at the quietest point around 8-12 s
      let best = -1, bv = 1e9; for (let i = Math.floor((a0 + 6) / 0.02); i < Math.min(n, Math.floor((a0 + 12) / 0.02)); i++) if (e[i] < bv) { bv = e[i]; best = i; }
      const cut = best > 0 ? best * 0.02 : a0 + 10; out.push([a0, cut]); a0 = cut;
    }
    out.push([a0, b0]);
  }
  return out;
}
function cleanAsr(txt, dur) { // drop typical Whisper hallucinations on silence / music
  let s = txt.replace(/\[[^\]]*\]|\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
  if (!s || /subscribe|đăng ký kênh|like and share|cảm ơn các bạn đã xem|hẹn gặp lại các bạn/i.test(s) && dur < 6) return "";
  const w = s.split(" "); if (w.length > 6) { const u = new Set(w.map(x => x.toLowerCase())); if (u.size / w.length < 0.3) return ""; }
  if (s.length > dur * 28) s = s.slice(0, Math.round(dur * 28));
  return s;
}
/* words [[t0,t1,text]] → caption groups */
function groupWords(words, maxChars, maxDur) {
  const out = []; let cur = null;
  const flush = () => { if (cur && cur.words.length) out.push(cur); cur = null; };
  for (const w of words) {
    const txt = w[2].trim(); if (!txt) continue;
    if (cur) { const len = cur.words.map(x => x[2]).join(" ").length + 1 + txt.length, gap = w[0] - cur.words[cur.words.length - 1][1]; if (len > maxChars || gap > 0.6 || w[1] - cur.start > maxDur) flush(); }
    if (!cur) cur = { start: w[0], words: [] }; cur.words.push([w[0], w[1], txt]); cur.end = w[1];
    if (/[.!?…]$/.test(txt)) flush();
  }
  flush(); return out;
}
function chunksToWords(res, offset) {
  const words = [];
  for (const ch of res.chunks || []) {
    const [a, b] = ch.timestamp || [0, 0]; const s = (a || 0) + offset, e = (b == null ? (a || 0) + 1 : b) + offset; const parts = String(ch.text || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length <= 1) { if (parts[0]) words.push([s, e, parts[0]]); continue; }
    const total = parts.reduce((x, p) => x + p.length, 0) || 1; let acc = s; for (const p of parts) { const d = (e - s) * p.length / total; words.push([acc, acc + d, p]); acc += d; }
  }
  return words;
}
function openAutoCaptions() {
  if (typeof IN_CLAUDE_PAGE !== "undefined" && IN_CLAUDE_PAGE) { toast("Phụ đề tự động và tách nền chạy bằng model AI tải từ internet; trang trên claude.ai chặn việc tải này. Dùng hai tính năng này ở app Android Bravin."); return; }
  const audTracks = tracksOf("audio").filter(tr => C.some(c => c.track === tr.id && c.type === "audio"));
  const selC = findSel();
  const srcOpts = [["main", "Âm thanh của video trên track chính"], ...audTracks.map(tr => [tr.id, "Track " + tr.name]), ...(selC && (selC.type === "audio" || selC.type === "video" || sel.k === "v") ? [["clip:" + selC.id, "Clip đang chọn"]] : [])];
  const voiceTr = audTracks.find(tr => /voice|giọng/i.test(tr.name));
  const ov = document.createElement("div"); ov.className = "overlay";
  ov.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="acT" style="max-width:520px"><h2 id="acT">Phụ đề tự động</h2>
    <p class="note">Nhận giọng nói ngay trên thiết bị bằng Whisper. Lần đầu cần mạng để tải model; các lần sau dùng bản đã lưu.</p>
    <div class="field"><label for="acSrc">Nguồn giọng nói</label><select id="acSrc"></select></div>
    <div class="row"><div class="field"><label for="acLang">Ngôn ngữ</label><select id="acLang"><option value="vietnamese">Tiếng Việt</option><option value="english">Tiếng Anh</option><option value="">Tự nhận</option></select></div>
    <div class="field"><label for="acModel">Model</label><select id="acModel"></select></div></div>
    <div class="row"><div class="field"><label for="acStyle">Kiểu phụ đề</label><select id="acStyle"><option value="kara">Karaoke vàng (sáng theo lời)</option><option value="white">Trắng viền xanh</option><option value="caption">Phụ đề trắng · vàng (kiểu cũ)</option><option value="tiktok">Viền đen TikTok</option></select></div>
    <div class="field"><label for="acMax">Ký tự mỗi câu</label><select id="acMax"><option value="18">Ngắn (18)</option><option value="26" selected>Vừa (26)</option><option value="40">Dài (40)</option></select></div></div>
    <label class="tc" style="display:flex;gap:8px;align-items:center;font-family:var(--ui)"><input type="checkbox" id="acRange"> Chỉ đoạn từ kim đến hết</label>
    <div class="acprog" id="acProg" hidden><div class="bar"><i id="acBar"></i></div><span id="acMsg" class="tc"></span></div>
    <div class="row" style="justify-content:flex-end"><button id="acNo" class="no">Huỷ</button><button class="primary" id="acGo">Tạo phụ đề</button></div></div>`;
  document.body.appendChild(ov);
  const S = ov.querySelector("#acSrc"); for (const [v, n] of srcOpts) { const o = document.createElement("option"); o.value = v; o.textContent = n; S.appendChild(o); } if (voiceTr) S.value = voiceTr.id;
  const M = ov.querySelector("#acModel"); for (const k in WHISPER) { const o = document.createElement("option"); o.value = k; o.textContent = k[0].toUpperCase() + k.slice(1) + " · " + WHISPER[k][2]; M.appendChild(o); } M.value = document.body.classList.contains("phone") ? "base" : "small";
  let ctl = { stop: false };
  ov.querySelector("#acNo").onclick = () => { ctl.stop = true; ov.remove(); };
  ov.querySelector("#acGo").onclick = async () => {
    const go = ov.querySelector("#acGo"); go.disabled = true; ov.querySelector("#acProg").hidden = false;
    const msg = s => ov.querySelector("#acMsg").textContent = s, bar = p => ov.querySelector("#acBar").style.width = Math.round(p * 100) + "%";
    try {
      const files = {}; msg("Đang tải thư viện AI…"); bar(0.02);
      const pipe = await getASR(M.value, p => { if (p.status === "progress" && p.file) { files[p.file] = [p.loaded || 0, p.total || 0]; const L = Object.values(files).reduce((a, x) => a + x[0], 0), T = Object.values(files).reduce((a, x) => a + x[1], 0) || 1; bar(0.05 + 0.55 * L / T); msg(`Đang tải model ${(L / 1048576).toFixed(0)} / ${(T / 1048576).toFixed(0)} MB…`); } });
      if (ctl.stop) return;
      const from = ov.querySelector("#acRange").checked ? t : 0, to = total();
      msg("Đang chuẩn bị âm thanh…"); bar(0.62);
      const audio = await renderSpeech(S.value, from, to);
      const regs = vadRegions(audio, 16000); if (!regs.length) { msg("Không thấy đoạn có tiếng nói."); go.disabled = false; return; }
      const opt = { task: "transcribe", return_timestamps: false }; if (ov.querySelector("#acLang").value) opt.language = ov.querySelector("#acLang").value;
      const words = [];
      for (let i = 0; i < regs.length; i++) {
        if (ctl.stop) return; const [a, b] = regs[i]; msg(`Đang nhận giọng nói ${i + 1}/${regs.length}…`); bar(0.7 + 0.25 * i / regs.length);
        const res = await pipe(audio.subarray(Math.floor(a * 16000), Math.ceil(b * 16000)), opt);
        const txt = cleanAsr(String(res.text || ""), b - a); if (!txt) continue;
        const parts = txt.split(/\s+/).filter(Boolean), tot = parts.reduce((x, w) => x + w.length + 1, 0); let acc = 0;
        for (const w of parts) { const w0 = from + a + (b - a) * acc / tot; acc += w.length + 1; words.push([w0, from + a + (b - a) * acc / tot, w]); }
      }
      if (ctl.stop) return; bar(0.95);
      const groups = groupWords(words, +ov.querySelector("#acMax").value, 3.5);
      if (!groups.length) { msg("Không nhận ra lời nói nào."); go.disabled = false; return; }
      pushUndo(); const tr = addTrack("text"); tr.name = "Phụ đề tự động"; const style = ov.querySelector("#acStyle").value;
      for (const gq of groups) {
        const st = gq.start, dur = Math.max(0.4, gq.end - gq.start + 0.12), text = gq.words.map(w => w[2]).join(" ");
        let c;
        if (style === "caption") c = { id: nid("c"), track: tr.id, type: "text", style: "caption", start: st, dur, line1: text, line2: "" };
        else { c = newTextClip(style === "kara" ? TEXT_PRESETS[13] : style === "tiktok" ? TEXT_PRESETS[10] : TEXT_PRESETS[5], st, dur, tr.id); c.text = text; c.y = 0.24; c.size = 64; }
        c.words = gq.words.map(w => [Math.round((w[0] - st) * 1000) / 1000, Math.round((w[1] - st) * 1000) / 1000, w[2]]);
        C.push(c);
      }
      renderAll(); ov.remove(); toast(`Đã tạo ${groups.length} câu phụ đề trên track "Phụ đề tự động". Kiểm tra lại chính tả trước khi xuất.`);
    } catch (e) { console.error(e); msg(location.hostname.endsWith("claude.ai") || location.hostname.endsWith("claudeusercontent.com") ? "Trang trên claude.ai chặn tải model AI. Dùng app Android hoặc Bravin trên máy tính." : "Không chạy được: " + (e && e.message || e) + ". Kiểm tra kết nối mạng ở lần chạy đầu."); go.disabled = false; }
  };
}

/* ---------- person segmentation (background removal) ---------- */
const SEG = (() => {
  let seg = null, state = "off", err = "", tsc = 0; const cache = new Map();
  async function ensure() {
    if (typeof IN_CLAUDE_PAGE !== "undefined" && IN_CLAUDE_PAGE) { state = "error"; err = "claude.ai chặn tải model"; status2(); return; }
    if (seg || state === "loading") return; state = "loading"; status2();
    try {
      const vis = await import(AI_CDN.vision + "/vision_bundle.mjs");
      const fs = await vis.FilesetResolver.forVisionTasks(AI_CDN.vision + "/wasm");
      const mk = delegate => vis.ImageSegmenter.createFromOptions(fs, { baseOptions: { modelAssetPath: AI_CDN.segFast, delegate }, runningMode: "VIDEO", outputConfidenceMasks: true, outputCategoryMask: false });
      try { seg = await mk("GPU"); } catch (e) { seg = await mk("CPU"); }
      state = "ready"; status2(); drawFrame();
    } catch (e) { state = "error"; err = String(e && e.message || e); status2(); console.warn("segmenter", e); }
  }
  function status() { return state === "ready" ? "Model tách nền đã sẵn sàng." : state === "loading" ? "Đang tải model tách nền…" : state === "error" ? "Không tải được model tách nền (" + err.slice(0, 80) + "). Cần mạng ở lần đầu; trên claude.ai tính năng này bị chặn." : "Chưa tải model."; }
  function status2() { document.querySelectorAll(".segstat").forEach(p => p.textContent = status()); }
  function mask(c, S, T) {
    if (!seg) { ensure(); return null; }
    const key = c.id + "@" + (S.img.currentTime != null ? S.img.currentTime.toFixed(3) : T.toFixed(3)) + ":" + S.w;
    if (cache.has(key)) return cache.get(key);
    try {
      tsc = Math.max(tsc + 1, Math.round(performance.now()));
      const res = seg.segmentForVideo(S.img, tsc); const mk = res.confidenceMasks && res.confidenceMasks[0]; if (!mk) return null;
      const w = mk.width, h = mk.height, f = mk.getAsFloat32Array(), cnv = document.createElement("canvas"); cnv.width = w; cnv.height = h;
      const id = new ImageData(w, h); const person = res.confidenceMasks.length > 1 ? 0 : 1; // 1 channel = person; multiclass: [0] = background
      for (let i = 0; i < w * h; i++) { const v = Math.round(255 * (person ? f[i] : 1 - f[i])); id.data[i * 4] = v; id.data[i * 4 + 1] = v; id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; }
      cnv.getContext("2d").putImageData(id, 0, 0); res.close && res.close();
      // crop like the layer
      const cr = c.crop || {}; let out = cnv;
      if (cr.l || cr.r || cr.t || cr.b) { const cw = Math.max(2, Math.round(w * (1 - (cr.l || 0) - (cr.r || 0)))), ch = Math.max(2, Math.round(h * (1 - (cr.t || 0) - (cr.b || 0)))); out = document.createElement("canvas"); out.width = cw; out.height = ch; out.getContext("2d").drawImage(cnv, (cr.l || 0) * w, (cr.t || 0) * h, cw, ch, 0, 0, cw, ch); }
      if (out.width > 320 || out.height > 320) { const k = 320 / Math.max(out.width, out.height), sm = document.createElement("canvas"); sm.width = Math.round(out.width * k); sm.height = Math.round(out.height * k); sm.getContext("2d").drawImage(out, 0, 0, sm.width, sm.height); out = sm; }
      if (cache.size > 6) cache.delete(cache.keys().next().value); cache.set(key, out); return out;
    } catch (e) { console.warn("seg frame", e); return null; }
  }
  return { ensure, mask, status, ready: () => state === "ready" };
})();
window.SEG = SEG;
