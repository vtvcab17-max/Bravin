"use strict";
/* ---------- media ---------- */
let holderEl = null;
function holder() { if (!holderEl) { holderEl = document.createElement("div"); holderEl.setAttribute("aria-hidden", "true"); holderEl.style.cssText = "position:fixed;left:-10px;top:-10px;width:2px;height:2px;overflow:hidden;opacity:0;pointer-events:none"; document.body.appendChild(holderEl); } return holderEl; }
function getEl(m, k) {
  m.els = m.els || [];
  m.used = m.used || []; m.used[k] = performance.now();
  if (!m.els[k]) { const el = document.createElement("video"); el.preload = "metadata"; el.playsInline = true; el.muted = !m.hasAudio; el.crossOrigin = "anonymous"; el.src = m.url; holder().appendChild(el); if (m.hasAudio) wireEl(m, el); m.els[k] = el; }
  return m.els[k];
}
function loadMeta(el) { return new Promise((res, rej) => { if (el.readyState >= 1) return res(); el.onloadedmetadata = () => res(); el.onerror = () => rej(new Error("load")); }); }
function seekTo(el, time) { return new Promise(res => { const done = () => { el.removeEventListener("seeked", done); res(); }; el.addEventListener("seeked", done); el.currentTime = time; setTimeout(done, 1500); }); }
async function decodeAudio(m, ab) { if (!actx) return; try { m.buf = monoIfSame(await actx.decodeAudioData(ab)); if (playing) { reclock(); scheduleAudio(); } } catch (e) { m.buf = null; } }
async function addMediaFile(blob, name, srcUrl, wantId, fromStore) {
  const type = (blob && blob.type) || (/\.(m4a|mp3|wav|aac|ogg)$/i.test(name) ? "audio/mp4" : /\.(png|jpe?g|webp|gif)$/i.test(name) ? "image/png" : "video/mp4");
  const kind = type.startsWith("audio") ? "audio" : type.startsWith("image") ? "image" : "video";
  const url = srcUrl || URL.createObjectURL(blob);
  const old = (wantId && media.get(wantId)) || [...media.values()].find(x => x.missing && x.name === name);
  const m = old || { id: wantId || nid("m"), name, kind, url, duration: 0, user: true }; m.url = url; m.kind = kind; m.els = []; delete m.missing; if (blob) m.blob = blob;
  try {
    if (kind === "image") { const img = new Image(); img.src = url; await img.decode(); m.img = img; m.duration = 600; m.thumb = url; m.strip = url; }
    else if (kind === "audio") { const el = document.createElement("audio"); el.src = url; await loadMeta(el); m.duration = el.duration; await decodeAudio(m, await (srcUrl ? (await fetch(srcUrl)).arrayBuffer() : blob.arrayBuffer())); await makeWave(m); }
    else { m.hasAudio = true; const el = getEl(m, 0); await loadMeta(el); m.duration = el.duration || 0; await makeStrip(m); }
  } catch (e) { toast("Không mở được " + name + ". Thử MP4, MOV, MP3, M4A, JPG hoặc PNG."); if (!srcUrl) URL.revokeObjectURL(url); return null; }
  if (srcUrl) m.persist = srcUrl; else if (window.VINCutAndroid) { try { const pu = VINCutAndroid.persistUrl(name); if (pu) m.persist = pu; } catch (_) {} }
  media.set(m.id, m);
  if (fromStore) m.stored = true; else if (blob && !m.persist && typeof storeMediaBlob === "function") storeMediaBlob(m, blob);
  renderBin(); if (typeof pendingTool === "function") { const f = pendingTool; pendingTool = null; setTimeout(() => f(m), 50); } return m;
}
async function makeStrip(m) {
  const v = document.createElement("video"); v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = m.url; await loadMeta(v);
  const n = clamp(Math.ceil(m.duration / 1.5), 2, 30), h = 64, w = Math.round(h * (v.videoWidth / v.videoHeight || 0.5625));
  const c = document.createElement("canvas"); c.width = w * n; c.height = h; const g = c.getContext("2d");
  const th = document.createElement("canvas"); th.width = 180; th.height = Math.round(180 * (v.videoHeight / v.videoWidth || 1.78));
  for (let i = 0; i < n; i++) { await seekTo(v, Math.min(m.duration - 0.05, (i + 0.5) * m.duration / n)); g.drawImage(v, i * w, 0, w, h); if (i === 0) th.getContext("2d").drawImage(v, 0, 0, th.width, th.height); }
  m.strip = c.toDataURL("image/jpeg", 0.7); m.thumb = th.toDataURL("image/jpeg", 0.75); v.removeAttribute("src"); v.load();
}
async function makeWave(m) {
  if (!m.buf) return; const d = m.buf.getChannelData(0), W = clamp(Math.round(m.duration * 30), 120, 6000), H = 60, step = Math.max(1, Math.floor(d.length / W));
  const c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d"); g.fillStyle = "rgba(191,232,214,.75)";
  for (let x = 0; x < W; x++) { let pk = 0; for (let i = x * step, e = i + step; i < e; i += 16) pk = Math.max(pk, Math.abs(d[i] || 0)); const hh = Math.max(1, pk * H * 0.9); g.fillRect(x, (H - hh) / 2, 1, hh); }
  m.strip = c.toDataURL("image/png");
}
async function importFiles(files) { const list = [...files]; if (!list.length) return; toast("Đang nhập " + list.length + " file…"); for (const f of list) await addMediaFile(f, f.name); }


/* ---------- memory: keep the footprint small ---------- */
function monoIfSame(buf) { // stereo files whose channels are identical (voice recordings) → mono, half the RAM
  if (!buf || buf.numberOfChannels !== 2 || !actx) return buf;
  const a = buf.getChannelData(0), b = buf.getChannelData(1), step = Math.max(1, Math.floor(a.length / 4000));
  for (let i = 0; i < a.length; i += step) if (Math.abs(a[i] - b[i]) > 1e-3) return buf;
  const m = actx.createBuffer(1, buf.length, buf.sampleRate); m.copyToChannel(a, 0); return m;
}
function releaseIdleVideos(maxIdleMs = 12000) { // drop decoders that are not on screen any more
  const now = performance.now();
  for (const m of media.values()) (m.els || []).forEach((el, k) => {
    if (!el || !el.paused || now - ((m.used || [])[k] || 0) < maxIdleMs) return;
    try { el.removeAttribute("src"); el.load(); el.remove(); } catch (_) {} m.els[k] = undefined;
  });
}
setInterval(() => { if (!playing && !exporting) releaseIdleVideos(); }, 10000);
document.addEventListener("visibilitychange", () => { if (document.hidden && !exporting) { if (playing) pause(); releaseIdleVideos(0); } });
function releaseScratch() { for (const k in _scratch) { _scratch[k].canvas.width = 1; _scratch[k].canvas.height = 1; } }
