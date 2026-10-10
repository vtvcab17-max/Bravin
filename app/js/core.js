"use strict";
/* nơi nhận sự kiện có thể là document/window (không có .matches) */
const tmatch = (e, sel) => !!(e && e.target && typeof e.target.matches === "function" && e.target.matches(sel));
const $ = s => document.querySelector(s);
const FPS = 30, MINLEN = 0.2;
const BLUE = "#027fa5", BLUE2 = "#0097cc", GOLD = "#F2C14E";

const media = new Map();
let tracks = [], V = [], C = [];
let sel = null;                 // {k:'v'|'c', id}
let t = 0, playing = false, pps = 40, snapOn = true;
let undoStack = [], redoStack = [];
let uid = 1; const nid = p => p + "_" + (uid++).toString(36);

/* ---------- helpers ---------- */
const fmt = s => { s = Math.max(0, s); const m = Math.floor(s / 60), r = s - m * 60; return String(m).padStart(2, "0") + ":" + r.toFixed(2).padStart(5, "0"); };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const isDur = c => c.type === "text" || c.type === "sticker" || c.type === "fx" || c.type === "compound";
const vlen = c => c.freeze ? c.dur : (c.kf && c.kf.speed && c.kf.speed.length) ? rampLen(c) : (c.out - c.in) / (c.speed || 1);
const clen = c => isDur(c) ? c.dur : (c.kf && c.kf.speed && c.kf.speed.length) ? rampLen(c) : (c.out - c.in) / (c.speed || 1);
const cend = c => c.start + clen(c);
const trackById = id => tracks.find(x => x.id === id);
const ttype = c => c.type === "video" || c.type === "compound" ? "overlay" : c.type === "sticker" ? "text" : c.type;
const isLocked = id => !!(trackById(id) || {}).lock;
const clipTrack = (k, c) => k === "v" ? "v" : c.track;
const tracksOf = type => tracks.filter(x => x.type === type);
function vStarts() { let acc = 0; return V.map(c => { acc += (c.gap || 0); const s = acc; acc += vlen(c); return s; }); }
function vTotal() { const st = vStarts(); return V.length ? st[V.length - 1] + vlen(V[V.length - 1]) : 0; }
function total() { let m = vTotal(); for (const c of C) m = Math.max(m, cend(c)); return m; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
function toast(msg) { document.querySelectorAll(".toast").forEach(x => x.remove()); const d = document.createElement("div"); d.className = "toast"; d.setAttribute("role", "status"); d.textContent = msg; document.body.appendChild(d); setTimeout(() => d.remove(), 2800); }
let markers = [], coverT = null, magnetOn = true, linkOn = true, hoverOn = false, tool = "select", hoverT = null;
function snapshot() { return JSON.stringify({ tracks, V, C, markers, coverT }); }
function pushUndo() { undoStack.push(snapshot()); if (undoStack.length > 60) undoStack.shift(); redoStack = []; syncButtons(); }
function restore(s) { const o = JSON.parse(s); tracks = o.tracks; V = o.V; C = o.C; markers = o.markers || []; coverT = o.coverT ?? null; if (sel && !findSel()) sel = null; renderAll(); }
function undo() { if (!undoStack.length) return; redoStack.push(snapshot()); restore(undoStack.pop()); syncButtons(); }
function redo() { if (!redoStack.length) return; undoStack.push(snapshot()); restore(redoStack.pop()); syncButtons(); }
function findSel() { if (!sel) return null; return (sel.k === "v" ? V : C).find(c => c.id === sel.id) || null; }
function clipById(id) { id = String(id || ""); const v = V.find(c => c.id === id); if (v) return { k: "v", c: v }; const c = C.find(c => c.id === id); return c ? { k: "c", c } : null; }
function mediaName(id) { return media.get(id)?.name || "?"; }
function wrap2(s, limit) { if (!s || s.length <= limit) return [s || ""]; const w = s.split(" "); let best = null; for (let i = 1; i < w.length; i++) { const a = w.slice(0, i).join(" "), b = w.slice(i).join(" "); const sc = Math.max(a.length, b.length); if (!best || sc < best[0]) best = [sc, [a, b]]; } return best ? best[1] : [s]; }

/* ---------- audio engine ---------- */
let actx = null, master = null, exportDest = null;
try { actx = new (window.AudioContext || window.webkitAudioContext)(); master = actx.createGain(); master.connect(actx.destination); exportDest = actx.createMediaStreamDestination(); master.connect(exportDest); } catch (e) { actx = null; }
const dbToGain = db => db <= -40 ? 0 : Math.pow(10, db / 20);
let liveSources = [];
function stopAudio() { for (const s of liveSources) { try { s.stop(); } catch (_) {} } liveSources = []; }
let clock = { ac: 0, perf: 0, t0: 0 };
function reclock() { clock = { ac: actx ? actx.currentTime : 0, perf: performance.now(), t0: t }; }
function nowT() { if (actx && actx.state === "running") return clock.t0 + (actx.currentTime - clock.ac); return clock.t0 + (performance.now() - clock.perf) / 1000; }
function fadeGain(c, lt, len) { let k = 1; if (c.fadeIn > 0) k *= clamp(lt / c.fadeIn, 0, 1); if (c.fadeOut > 0) k *= clamp((len - lt) / c.fadeOut, 0, 1); return k; }
function scheduleAudio() {
  stopAudio(); if (!actx) return;
  for (const c of (typeof withSubClips === "function" ? withSubClips(C) : C)) {
    if (c.type !== "audio") continue; const tr = trackById(c.track); if (!tr || tr.off || c.muted || c.disabled) continue;
    const m = media.get(c.mediaId); if (!m || !m.buf) continue;
    const e = cend(c); if (e <= t) continue;
    const sp = c.speed || 1, buf = voiceBuffer(m, c.voice, c) || m.buf;
    const delay = Math.max(0, c.start - t), skip = Math.max(0, t - c.start), dur = clen(c) - skip; if (dur <= 0.01) continue;
    const src = actx.createBufferSource(); src.buffer = buf; src.playbackRate.value = hasRamp(c) ? speedAt(c, skip) : sp;
    if (hasRamp(c)) { try { src.playbackRate.setValueCurveAtTime(rateCurve(c, skip, dur), clock.ac + delay, dur); } catch (_) {} }
    const gn = actx.createGain(); gn.gain.value = clipGain(c, skip, clen(c)) * trackGainOf(c.track);
    const chain = voiceChain(actx, c.voice); src.connect(chain.input); (typeof audioFxChain === "function" ? audioFxChain(actx, c, chain.output) : chain.output).connect(gn); let outN = gn, pnN = null; try { pnN = actx.createStereoPanner(); pnN.pan.value = clamp(trackPanOf(c.track) + (typeof clipPan === "function" ? clipPan(c, skip) : 0), -1, 1); gn.connect(pnN); outN = pnN; } catch (_) {} outN.connect(master); src._pn = pnN;
    src.start(clock.ac + delay, c.in + srcOffset(c, skip), Math.max(0.01, srcOffset(c, skip + dur) - srcOffset(c, skip)) + 0.05); liveSources.push(src); src._c = c; src._g = gn;
  }
}
const trackGainOf = id => typeof trackGain === "function" ? trackGain(id) : 1, trackPanOf = id => typeof trackPan === "function" ? trackPan(id) : 0;
function updateAudioGains() { for (const s of liveSources) if (s._c && s._g) { const c = s._c, lt = t - c.start; if (lt >= 0) { s._g.gain.value = clipGain(c, lt, clen(c)) * trackGainOf(c.track); if (s._pn && typeof clipPan === "function") s._pn.pan.value = clamp(trackPanOf(c.track) + clipPan(c, lt), -1, 1); } } }
function wireEl(m, el) {
  if (!actx || el._gain) return;
  try { const src = actx.createMediaElementSource(el); el._gain = actx.createGain(); el._gain.gain.value = 0; src.connect(el._gain); try { el._pan = actx.createStereoPanner(); el._gain.connect(el._pan); el._pan.connect(master); } catch (_) { el._gain.connect(master); } } catch (e) {}
}

