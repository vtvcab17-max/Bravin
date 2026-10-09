"use strict";
/* ============================================================================
   Graphics & utilities (Premiere-style, own implementation):
   shapes (Essential Graphics), synthetic media (color matte, black video,
   bars & tone), SRT caption import/export, frame export, scene edit
   detection, history panel, safe margins / guides, named markers,
   Final Cut Pro XML import (what Premiere exports via File → Export → XML).
   ========================================================================== */

/* ---------- shapes ---------- */
const GFX_KINDS = { rect: "Hình chữ nhật", round: "Chữ nhật bo góc", ellipse: "Hình elip", line: "Đường kẻ", tri: "Tam giác" };
function addShape(kind) {
  pushUndo(); const st = t, dur = 4, tr = freeTrack("text", st, dur);
  const c = { id: nid("c"), track: tr.id, type: "sticker", start: st, dur, x: 0, y: 0, gfx: { kind, w: kind === "line" ? 0.7 : 0.6, h: kind === "line" ? 0.006 : 0.18, fill: kind === "line" ? "#ffffff" : "#7b6cf6", stroke: "#ffffff", sw: 0, r: kind === "round" ? 0.3 : 0, grad: null } };
  C.push(c); sel = { k: "c", id: c.id }; inspTabs.sticker = "st"; renderAll(); if (typeof openSheet === "function") openSheet("insp"); else showTab("insp"); return c;
}
const _drawSticker0 = drawSticker;
drawSticker = function (ctx, c, lt, len) {
  if (!c.gfx) return _drawSticker0(ctx, c, lt, len);
  const W = ctx.canvas.width, H = ctx.canvas.height, X = xform(c, lt, len); if (X.opacity <= 0.001) return null; const G = c.gfx;
  const w = G.w * W, h = G.kind === "line" ? Math.max(1, G.h * H) : G.h * H, cx = W / 2 + X.x * W, cy = H / 2 + X.y * H;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(X.angle * Math.PI / 180); ctx.scale(X.scale * X.sx * X.fx, X.scale * X.fy); ctx.globalAlpha *= X.opacity; if (X.blur > 0.3) ctx.filter = `blur(${X.blur * W / 1080}px)`;
  ctx.beginPath();
  if (G.kind === "ellipse") ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
  else if (G.kind === "tri") { ctx.moveTo(0, -h / 2); ctx.lineTo(w / 2, h / 2); ctx.lineTo(-w / 2, h / 2); ctx.closePath(); }
  else if ((G.kind === "round" || G.r) && ctx.roundRect) ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(w, h) / 2 * (G.r || 0));
  else ctx.rect(-w / 2, -h / 2, w, h);
  if (G.shadow) { ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = 24 * W / 1080; ctx.shadowOffsetY = 8 * W / 1080; }
  if (G.fill && G.fill !== "none") { if (G.grad) { const gr = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2); gr.addColorStop(0, G.fill); gr.addColorStop(1, G.grad); ctx.fillStyle = gr; } else ctx.fillStyle = G.fill; ctx.globalAlpha *= G.fo == null ? 1 : G.fo; ctx.fill(); ctx.globalAlpha /= G.fo == null ? 1 : (G.fo || 1); }
  ctx.shadowColor = "transparent"; if (G.sw > 0) { ctx.lineWidth = G.sw * W / 1080; ctx.strokeStyle = G.stroke || "#fff"; ctx.stroke(); }
  ctx.restore();
  return { cx, cy, w: w * X.scale, h: Math.max(h, 12) * X.scale, angle: X.angle };
};
function shapeUI(box, c) {
  const G = c.gfx, b = section(box, "Hình khối");
  select(b, "Kiểu", GFX_KINDS, () => G.kind, v => G.kind = v);
  slider(b, { label: "Rộng", min: 0.01, max: 1.5, step: 0.005, get: () => G.w, set: v => G.w = v, fmt: v => Math.round(v * 100) + "%" });
  slider(b, { label: "Cao", min: 0.002, max: 1.5, step: 0.002, get: () => G.h, set: v => G.h = v, fmt: v => Math.round(v * 1000) / 10 + "%" });
  if (G.kind === "rect" || G.kind === "round") slider(b, { label: "Bo góc", min: 0, max: 1, step: 0.01, get: () => G.r || 0, set: v => G.r = v });
  colorIn(b, "Màu tô", () => G.fill === "none" ? "#000000" : G.fill, v => G.fill = v);
  slider(b, { label: "Độ đục màu tô", min: 0, max: 1, step: 0.01, get: () => G.fo == null ? 1 : G.fo, set: v => G.fo = v, fmt: v => Math.round(v * 100) + "%" });
  toggle(b, "Chuyển màu", () => !!G.grad, v => G.grad = v ? "#ff6b9a" : null); if (G.grad) colorIn(b, "Màu thứ hai", () => G.grad, v => G.grad = v);
  slider(b, { label: "Viền", min: 0, max: 40, step: 0.5, get: () => G.sw || 0, set: v => G.sw = v, fmt: v => (+v).toFixed(1) }); if (G.sw > 0) colorIn(b, "Màu viền", () => G.stroke || "#ffffff", v => G.stroke = v);
  toggle(b, "Bóng đổ", () => !!G.shadow, v => G.shadow = v, "keep");
}

/* ---------- synthetic media ---------- */
async function addSynthetic(kind) {
  const W = cv.width, H = cv.height, cnv = document.createElement("canvas"); cnv.width = W; cnv.height = H; const x = cnv.getContext("2d"); let name = "";
  if (kind === "matte") { const col = await prompt2("Màu nền (mã hex)", "#7b6cf6"); if (col == null) return; x.fillStyle = /^#?[0-9a-f]{3,6}$/i.test(col.trim()) ? (col.trim()[0] === "#" ? col.trim() : "#" + col.trim()) : "#7b6cf6"; x.fillRect(0, 0, W, H); name = "Nền màu " + x.fillStyle; }
  else if (kind === "black") { x.fillStyle = "#000"; x.fillRect(0, 0, W, H); name = "Màn đen"; }
  else if (kind === "white") { x.fillStyle = "#fff"; x.fillRect(0, 0, W, H); name = "Màn trắng"; }
  else if (kind === "bars") { const cols = ["#c0c0c0", "#c0c000", "#00c0c0", "#00c000", "#c000c0", "#c00000", "#0000c0"], bw = W / 7; cols.forEach((c2, i) => { x.fillStyle = c2; x.fillRect(i * bw, 0, bw + 1, H * 0.67); }); ["#0000c0", "#131313", "#c000c0", "#131313", "#00c0c0", "#131313", "#c0c0c0"].forEach((c2, i) => { x.fillStyle = c2; x.fillRect(i * bw, H * 0.67, bw + 1, H * 0.08); }); const q = W / 6; [["#00214c", 0], ["#ffffff", 1], ["#32006a", 2], ["#131313", 3]].forEach(([c2, i]) => { x.fillStyle = c2; x.fillRect(i * q * 1.25, H * 0.75, q * 1.25 + 1, H * 0.25); }); x.fillStyle = "#131313"; x.fillRect(q * 5, H * 0.75, q, H * 0.25); name = "Bars & Tone"; }
  const blob = await new Promise(r => cnv.toBlob(r, "image/png")); const m = await addMediaFile(blob, name + ".png"); if (!m) return;
  appendMedia(m); if (kind === "bars") await addTone(1000, 0, 3); toast("Đã thêm " + name + ".");
}
const _genSfx0 = genSfx;
genSfx = async function (key) { const mt = /^tone(\d+)$/.exec(key || ""); if (!mt) return _genSfx0(key); const f = +mt[1], sr = 48000, b = (actx || new OfflineAudioContext(1, 1, sr)).createBuffer(2, sr * 10, sr); for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] = Math.sin(2 * Math.PI * f * i / sr) * 0.1; } return b; };
async function addTone(freq, start, dur) {
  const id = nid("m"), key = "tone" + freq, m = { id, name: "Tone " + freq + " Hz", kind: "audio", duration: 10, url: "", gen: key }; media.set(id, m); m.buf = await genSfx(key); try { await makeWave(m); } catch (_) {}
  const tr = freeTrack("audio", start, dur); C.push({ id: nid("c"), track: tr.id, type: "audio", mediaId: id, start, in: 0, out: dur, vol: -6 }); renderBin(); renderAll();
}

/* ---------- SRT ---------- */
const srtTime = s => { const m = /(\d+):(\d+):(\d+)[,.](\d+)/.exec(s); return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / 1000 : 0; };
const toSrtTime = v => { v = Math.max(0, v); const h = Math.floor(v / 3600), m = Math.floor(v % 3600 / 60), s = Math.floor(v % 60), ms = Math.round((v % 1) * 1000); return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms === 1000 ? 999 : ms).padStart(3, "0")}`; };
function importSRT() {
  const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".srt,.vtt,text/plain";
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return; const txt = (await f.text()).replace(/\r/g, ""); const blocks = txt.split(/\n\s*\n/); const items = [];
    for (const b of blocks) { const lines = b.trim().split("\n"); const ti = lines.findIndex(l => /-->/.test(l)); if (ti < 0) continue; const [a, z] = lines[ti].split("-->"); const text = lines.slice(ti + 1).join("\n").replace(/<[^>]+>/g, "").trim(); if (text) items.push([srtTime(a), srtTime(z), text]); }
    if (!items.length) { toast("Không đọc được phụ đề trong file."); return; }
    pushUndo(); const tr = addTrack("text"); tr.name = "Phụ đề SRT"; tr.auto = false; const preset = TEXT_PRESETS.find(p => /phụ đề|caption/i.test(p.n)) || TEXT_PRESETS[5];
    for (const [a, z, text] of items) { const c = newTextClip(preset, a, Math.max(MINLEN, z - a), tr.id); if (c.style === "custom") c.text = text; else { c.line1 = text; c.line2 = ""; } C.push(c); }
    renderAll(); toast(`Đã nhập ${items.length} dòng phụ đề vào track mới.`);
  };
  inp.click();
}
async function exportSRT() {
  const txtTracks = tracksOf("text").filter(tr => C.some(c => c.track === tr.id && c.type === "text")); if (!txtTracks.length) { toast("Chưa có chữ nào trên timeline."); return; }
  const pick = txtTracks.find(tr => /phụ đề|caption|srt/i.test(tr.name)) || txtTracks.sort((a, b) => C.filter(c => c.track === b.id).length - C.filter(c => c.track === a.id).length)[0];
  const items = C.filter(c => c.track === pick.id && c.type === "text").sort((a, b) => a.start - b.start);
  const body = items.map((c, i) => `${i + 1}\n${toSrtTime(c.start)} --> ${toSrtTime(cend(c))}\n${(c.style === "custom" ? c.text : [c.line1, c.line2].filter(Boolean).join(" ")) || ""}\n`).join("\n");
  const s = await getSaver(); if (!s) return; await s.save({ filename: slug(projName) + ".srt", data: new Blob([body], { type: "text/plain" }) }); toast(`Đã xuất ${items.length} dòng phụ đề từ track "${pick.name}".`);
}
async function exportFrame() { const s = await getSaver(); if (!s) return; drawFrame(); cv.toBlob(b => s.save({ filename: slug(projName) + "-" + fmt(t).replace(/[:.]/g, "-") + ".png", data: b }).then(() => toast("Đã lưu khung hình " + fmt(t) + ".")), "image/png"); }

/* ---------- scene edit detection ---------- */
async function sceneDetect() {
  const tv = targetVideo(); if (!tv) { toast("Chọn một clip video để dò điểm chuyển cảnh."); return; }
  const c = tv.c, m = media.get(c.mediaId); if (!m || m.kind !== "video" || !m.url) { toast("Chỉ dò được trên clip video."); return; }
  const el2 = document.createElement("video"); el2.muted = true; el2.preload = "auto"; el2.src = m.url; el2.playsInline = true; await new Promise((r, j) => { el2.onloadeddata = r; el2.onerror = j; setTimeout(r, 4000); });
  const s = scratch("scene", 48, 27), step = 1 / 6, L = c.out - c.in, prev = null, cuts = []; let last = null, lastCut = -9;
  toast("Đang dò điểm chuyển cảnh…");
  for (let x = 0; x <= L; x += step) {
    await new Promise(r => { el2.onseeked = r; el2.currentTime = c.in + x; setTimeout(r, 800); });
    s.ctx.drawImage(el2, 0, 0, 48, 27); const d = s.ctx.getImageData(0, 0, 48, 27).data, h = new Float32Array(48);
    for (let i = 0; i < d.length; i += 4) { h[(d[i] >> 6) * 16 + (d[i + 1] >> 6) * 4 + (d[i + 2] >> 6)] += 1; }
    if (last) { let diff = 0; for (let k = 0; k < 64 && k < h.length; k++) diff += Math.abs(h[k] - (last[k] || 0)); diff /= 48 * 27 * 2; if (diff > 0.42 && x - lastCut > 0.5) { cuts.push(x); lastCut = x; } }
    last = h;
  }
  el2.removeAttribute("src"); el2.load();
  if (!cuts.length) { toast("Không thấy điểm chuyển cảnh rõ ràng trong clip này."); return; }
  const sp = c.speed || 1, start = tv.k === "v" ? vStarts()[V.indexOf(c)] : c.start;
  const ok = await confirm2(`Tìm thấy ${cuts.length} điểm chuyển cảnh. Tách clip tại các điểm này? (Chọn Huỷ để chỉ đặt marker.)`, "Tách clip");
  pushUndo();
  if (ok) { let cur = c; let consumed = 0; for (const x of cuts) { const off = x / sp - consumed; if (tv.k === "v") { cur = splitV(cur, off); } else { cur = splitC(cur, (cur.start) + off); } consumed = x / sp; } toast(`Đã tách thành ${cuts.length + 1} đoạn.`); }
  else { for (const x of cuts) markers.push(Math.round((start + x / sp) * 100) / 100); markers.sort((a, b) => a - b); toast(`Đã đặt ${cuts.length} marker tại các điểm chuyển cảnh.`); }
  renderAll();
}

/* ---------- history panel ---------- */
const histTimes = new Map();
const _pushUndo0 = pushUndo;
pushUndo = function () { _pushUndo0(); const s = undoStack[undoStack.length - 1]; if (s) histTimes.set(s, Date.now()); if (histTimes.size > 200) histTimes.delete(histTimes.keys().next().value); };
function histLabel(a, b) { // describe what changed from snapshot a → b
  try { const A = JSON.parse(a), B = JSON.parse(b); const n1 = A.V.length + A.C.length, n2 = B.V.length + B.C.length;
    if (n2 > n1) return "Thêm " + (n2 - n1) + " clip"; if (n2 < n1) return "Xoá " + (n1 - n2) + " clip"; if (A.tracks.length !== B.tracks.length) return "Đổi track"; if ((A.markers || []).length !== (B.markers || []).length) return "Marker";
    const idsA = new Map([...A.V, ...A.C].map(c => [c.id, c])); for (const c of [...B.V, ...B.C]) { const o = idsA.get(c.id); if (!o) return "Cắt clip"; if (JSON.stringify(o) !== JSON.stringify(c)) { const keys = Object.keys({ ...o, ...c }).filter(k => JSON.stringify(o[k]) !== JSON.stringify(c[k])); const k = keys[0]; const N = { kf: "Keyframe", start: "Dời clip", in: "Cắt mép", out: "Cắt mép", speed: "Tốc độ", adj: "Chỉnh màu", filter: "Bộ lọc", curves: "Đường cong", wheels: "Bánh xe màu", x: "Vị trí", y: "Vị trí", scale: "Kích thước", angle: "Xoay", opacity: "Độ mờ", vol: "Âm lượng", anim: "Hoạt ảnh", text: "Sửa chữ", line1: "Sửa chữ", tr: "Chuyển cảnh", track: "Đổi track", afx: "Hiệu ứng âm thanh", disabled: "Bật/tắt clip", label: "Nhãn màu", mask: "Mask", blend: "Hoà trộn" }; return (N[k] || "Chỉnh " + k) + (keys.length > 1 ? " +" + (keys.length - 1) : ""); } }
    return "Chỉnh sửa"; } catch (_) { return "Chỉnh sửa"; }
}
function openHistory() {
  const ov = document.createElement("div"); ov.className = "overlay";
  ov.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="hiT" style="max-width:440px"><h2 id="hiT">Lịch sử thao tác</h2><p class="note">Bấm một bước để quay về trạng thái ngay sau bước đó. Vẫn làm lại (Ctrl+Shift+Z) được.</p><div class="hist"></div><div class="row dlg-actions"><button class="primary" id="hiOk">Đóng</button></div></div>`;
  document.body.appendChild(ov); ov.querySelector("#hiOk").onclick = () => ov.remove(); const list = ov.querySelector(".hist");
  const states = [...undoStack, snapshot()], rows = [];
  for (let i = 1; i < states.length; i++) rows.push({ i, label: histLabel(states[i - 1], states[i]), tm: histTimes.get(states[i - 1]) });
  if (!rows.length) { list.innerHTML = '<p class="note">Chưa có thao tác nào.</p>'; return; }
  rows.reverse().forEach((r, n) => { const b = el("button", "hirow" + (n === 0 ? " cur" : "")); b.type = "button"; b.innerHTML = `<span></span><small></small>`; b.firstChild.textContent = r.label; b.lastChild.textContent = r.tm ? new Date(r.tm).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
    b.onclick = () => { const steps = states.length - 1 - r.i; for (let k = 0; k < steps; k++) undo(); ov.remove(); toast("Đã quay về: " + r.label); }; list.appendChild(b); });
}

/* ---------- safe margins / guides ---------- */
let guidesOn = false;
const _drawSelection0 = drawSelection;
drawSelection = function () {
  _drawSelection0(); if (!guidesOn || exporting) return; if (playing) placeSelCanvas();
  const W = selCv.width, H = selCv.height; sg.save(); sg.setTransform(1, 0, 0, 1, 0, 0); sg.strokeStyle = "rgba(255,255,255,.55)"; sg.lineWidth = Math.max(1, W / 600); sg.setLineDash([]);
  sg.strokeRect(W * 0.05, H * 0.05, W * 0.9, H * 0.9); sg.setLineDash([6, 4]); sg.strokeRect(W * 0.1, H * 0.1, W * 0.8, H * 0.8); sg.setLineDash([]);
  sg.strokeStyle = "rgba(255,255,255,.22)"; sg.beginPath(); for (const f of [1 / 3, 2 / 3]) { sg.moveTo(W * f, 0); sg.lineTo(W * f, H); sg.moveTo(0, H * f); sg.lineTo(W, H * f); } sg.stroke();
  const c = Math.min(W, H) * 0.03; sg.strokeStyle = "rgba(255,255,255,.6)"; sg.beginPath(); sg.moveTo(W / 2 - c, H / 2); sg.lineTo(W / 2 + c, H / 2); sg.moveTo(W / 2, H / 2 - c); sg.lineTo(W / 2, H / 2 + c); sg.stroke();
  if (H > W) { sg.fillStyle = "rgba(255,80,80,.12)"; sg.fillRect(W * 0.84, H * 0.35, W * 0.16, H * 0.45); sg.fillRect(0, H * 0.82, W, H * 0.18); }
  sg.restore();
};
function toggleGuides() { guidesOn = !guidesOn; drawFrame(); toast(guidesOn ? "Bật khung an toàn: viền ngoài 90% (hành động), viền đứt 80% (chữ), lưới 1/3. Vùng đỏ nhạt là chỗ nút và chú thích của TikTok/Reels che." : "Tắt khung an toàn."); }

/* ---------- named markers ---------- */
let markerNotes = {}; // "12.34" → {name, color, note}
const MK_COLORS = { "": "Mặc định", "#7b6cf6": "Tím", "#ff6b9a": "Hồng", "#ffa24c": "Cam", "#f2d24e": "Vàng", "#4cd9a8": "Xanh lá", "#5aa7ff": "Xanh trời" };
function markerDialog(mt) {
  const key = String(mt), info = markerNotes[key] || {}, ov = document.createElement("div"); ov.className = "overlay";
  ov.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="mkT" style="max-width:420px"><h2 id="mkT">Marker ${fmt(mt)}</h2>
   <div class="field"><label for="mkN">Tên</label><input type="text" id="mkN"></div><div class="field"><label for="mkC">Màu</label><select id="mkC"></select></div><div class="field"><label for="mkD">Ghi chú</label><textarea id="mkD" rows="3"></textarea></div>
   <div class="row dlg-actions"><button class="danger" id="mkDel">Xoá marker</button><button id="mkNo">Huỷ</button><button class="primary" id="mkOk">Lưu</button></div></div>`;
  document.body.appendChild(ov); const sc = ov.querySelector("#mkC"); for (const k in MK_COLORS) { const o = document.createElement("option"); o.value = k; o.textContent = MK_COLORS[k]; sc.appendChild(o); }
  ov.querySelector("#mkN").value = info.name || ""; sc.value = info.color || ""; ov.querySelector("#mkD").value = info.note || ""; ov.querySelector("#mkN").focus();
  ov.querySelector("#mkNo").onclick = () => ov.remove();
  ov.querySelector("#mkDel").onclick = () => { pushUndo(); markers = markers.filter(m => Math.abs(m - mt) > 1e-3); delete markerNotes[key]; ov.remove(); renderTimeline(); };
  ov.querySelector("#mkOk").onclick = () => { const n = ov.querySelector("#mkN").value.trim(), col = sc.value, d = ov.querySelector("#mkD").value.trim(); if (n || col || d) markerNotes[key] = { name: n || undefined, color: col || undefined, note: d || undefined }; else delete markerNotes[key]; ov.remove(); renderTimeline(); };
}
function decorateMarkers() { if (!rulerEl) return; for (const mk of rulerEl.querySelectorAll(".marker")) { const info = markerNotes[String(+mk.dataset.t)]; if (!info) continue; if (info.color) mk.style.setProperty("--mk", info.color); mk.classList.toggle("named", !!info.name); mk.title = (info.name || "Marker") + " · " + fmt(+mk.dataset.t) + (info.note ? "\n" + info.note : "") + "\nBấm để tới, bấm đúp để sửa"; if (info.name) mk.dataset.name = info.name; } }
grid.addEventListener("dblclick", e => { const mk = e.target.closest(".marker"); if (!mk) return; e.stopImmediatePropagation(); markerDialog(+mk.dataset.t); }, true);
const _decorateTimeline0 = decorateTimeline;
decorateTimeline = function () { _decorateTimeline0(); decorateMarkers(); };

/* ---------- Final Cut Pro XML (Premiere: File → Export → Final Cut Pro XML) ---------- */
function importFCPXML() {
  const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".xml,application/xml,text/xml";
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return; let doc; try { doc = new DOMParser().parseFromString(await f.text(), "application/xml"); } catch (_) {}
    const seq = doc && doc.querySelector("sequence"); if (!seq) { toast("File không phải XML dựng phim (xmeml)."); return; }
    const num = (n, s) => { const x = n && n.querySelector(s); return x ? +x.textContent : NaN; };
    const tb = num(seq, ":scope > rate > timebase") || 30, ntsc = (seq.querySelector(":scope > rate > ntsc") || {}).textContent === "TRUE", fps = ntsc ? tb * 1000 / 1001 : tb, sec = v => v / fps;
    const files = {}; doc.querySelectorAll("file[id]").forEach(fe => { const nm = fe.querySelector(":scope > name"); if (nm) files[fe.getAttribute("id")] = nm.textContent; });
    const byName = n => [...media.values()].find(m => m.name === n) || [...media.values()].find(m => m.name.replace(/\.[^.]+$/, "") === String(n).replace(/\.[^.]+$/, ""));
    const missing = new Set(); const vClips = [], aClips = [], ovClips = [];
    const vtracks = [...seq.querySelectorAll(":scope > media > video > track")], atracks = [...seq.querySelectorAll(":scope > media > audio > track")];
    vtracks.forEach((trk, ti) => trk.querySelectorAll(":scope > clipitem").forEach(ci => {
      const st = num(ci, ":scope > start"), en = num(ci, ":scope > end"), inn = num(ci, ":scope > in"), out = num(ci, ":scope > out"); if (!(en > st)) return;
      const fe = ci.querySelector(":scope > file"), fid = fe && fe.getAttribute("id"), name = (fe && fe.querySelector(":scope > name") || {}).textContent || files[fid] || (ci.querySelector(":scope > name") || {}).textContent;
      const m = byName(name); if (!m) { missing.add(name); return; } const spd = (out - inn) / (en - st);
      const item = { m, start: sec(st), inS: sec(inn), outS: sec(out), speed: Math.abs(spd - 1) > 0.01 ? Math.round(spd * 100) / 100 : 1, enabled: (ci.querySelector(":scope > enabled") || {}).textContent !== "FALSE" };
      (ti === 0 ? vClips : ovClips).push([ti, item]);
    }));
    atracks.forEach((trk, ti) => trk.querySelectorAll(":scope > clipitem").forEach(ci => {
      const st = num(ci, ":scope > start"), en = num(ci, ":scope > end"), inn = num(ci, ":scope > in"), out = num(ci, ":scope > out"); if (!(en > st)) return;
      const fe = ci.querySelector(":scope > file"), fid = fe && fe.getAttribute("id"), name = (fe && fe.querySelector(":scope > name") || {}).textContent || files[fid]; const m = byName(name); if (!m) { if (name) missing.add(name); return; }
      if (m.kind === "video") return; // video's own audio follows the video clip
      aClips.push([ti, { m, start: sec(st), inS: sec(inn), outS: sec(out) }]);
    }));
    if (!vClips.length && !ovClips.length && !aClips.length) { toast(missing.size ? `Chưa có file trong dự án: ${[...missing].slice(0, 4).join(", ")}${missing.size > 4 ? "…" : ""}. Nhập các file này vào Thư viện (đúng tên) rồi nhập lại XML.` : "Không thấy clip nào trong XML."); return; }
    pushUndo(); V = []; C = C.filter(c => c.type === "text" || c.type === "sticker" || c.type === "fx"); tracks = tracks.filter(tr => tr.type !== "audio" && tr.type !== "overlay");
    if (!trackById("v")) tracks.push({ id: "v", type: "video", name: "Video" });
    vClips.sort((a, b) => a[1].start - b[1].start); let acc = 0;
    for (const [, it] of vClips) { const gap = Math.max(0, it.start - acc); const c = { id: nid("v"), mediaId: it.m.id, in: it.inS, out: it.outS, vol: 0, zoom: "none" }; if (gap > 0.01) c.gap = Math.round(gap * 1000) / 1000; if (it.speed !== 1) c.speed = it.speed; if (!it.enabled) c.disabled = true; V.push(c); acc = it.start + (it.outS - it.inS) / it.speed; }
    const ovT = {}; for (const [ti, it] of ovClips) { if (!ovT[ti]) ovT[ti] = addTrack("overlay"); C.push({ id: nid("c"), track: ovT[ti].id, type: "video", mediaId: it.m.id, start: it.start, in: it.inS, out: it.outS, speed: it.speed !== 1 ? it.speed : undefined, scale: 1, vol: 0 }); }
    const auT = {}; for (const [ti, it] of aClips) { if (!auT[ti]) { auT[ti] = addTrack("audio"); auT[ti].name = "Âm thanh " + (ti + 1); auT[ti].auto = false; } C.push({ id: nid("c"), track: auT[ti].id, type: "audio", mediaId: it.m.id, start: it.start, in: it.inS, out: it.outS, vol: 0 }); }
    seq.querySelectorAll(":scope > marker").forEach(mk => { const v = num(mk, "in"); if (isFinite(v)) { const tm = Math.round(sec(v) * 100) / 100; markers.push(tm); const nm = (mk.querySelector("name") || {}).textContent; if (nm) markerNotes[String(tm)] = { name: nm }; } });
    sel = null; renderAll(); toast(`Đã nhập XML: ${vClips.length} cảnh chính, ${ovClips.length} lớp phủ, ${aClips.length} clip âm thanh` + (missing.size ? `. Thiếu ${missing.size} file chưa nhập.` : "."));
  };
  inp.click();
}

/* ---------- menus ---------- */
$("#addBtn").onclick = e => openMenu(e.currentTarget, [
  { h: "Media" }, { label: "Nhập video, ảnh, nhạc…", run: () => $("#file").click() }, { label: "Thêm chữ tại kim", run: () => addText({ track: tracksOf("text")[0]?.id }) },
  { h: "Đồ hoạ" }, ...Object.entries(GFX_KINDS).map(([k, n]) => ({ label: n, run: () => addShape(k) })),
  { h: "Media tạo sẵn" }, { label: "Nền màu (Color Matte)…", run: () => addSynthetic("matte") }, { label: "Màn đen (Black Video)", run: () => addSynthetic("black") }, { label: "Màn trắng", run: () => addSynthetic("white") }, { label: "Bars & Tone", run: () => addSynthetic("bars") },
  { h: "Track" }, { label: "Thêm track video phủ", run: () => { pushUndo(); addTrack("overlay"); renderAll(); } }, { label: "Thêm track chữ", run: () => { pushUndo(); addTrack("text"); renderAll(); } }, { label: "Thêm track âm thanh", run: () => { pushUndo(); addTrack("audio"); renderAll(); } }
]);
function utilMenu(anchor) {
  openMenu(anchor, [
    { h: "Phụ đề" }, { label: "Nhập phụ đề .srt", run: importSRT }, { label: "Xuất phụ đề .srt", run: exportSRT },
    { h: "Xuất nhanh" }, { label: "Khung hình tại kim (PNG)", kbd: "Ctrl+Shift+E", run: exportFrame },
    { h: "Công cụ" }, { label: "Tự dò điểm chuyển cảnh (Scene Edit Detection)", run: sceneDetect }, { label: "Lịch sử thao tác", run: openHistory }, { label: "Đồng bộ âm thanh các clip đã chọn (kiểu PluralEyes)", run: () => typeof syncAudio === "function" && syncAudio() }, { label: (guidesOn ? "✓ " : "") + "Khung an toàn và lưới", run: toggleGuides },
    { h: "Từ Premiere" }, { label: "Nhập XML (Final Cut Pro XML)…", run: importFCPXML }
  ]);
}
(function addUtilButton() {
  const add = $("#addBtn"); if (!add || $("#utilBtn")) return; const b = document.createElement("button"); b.className = "icon"; b.id = "utilBtn"; b.title = "Tiện ích: phụ đề SRT, khung an toàn, dò cảnh, lịch sử, nhập XML";
  b.innerHTML = '<svg class="i" viewBox="0 0 24 24"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/></svg>'; b.onclick = e => utilMenu(e.currentTarget); add.after(b);
})();
document.addEventListener("keydown", e => {
  if (e.target.matches("input,select,textarea") || document.querySelector(".overlay")) return;
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === "KeyE") { e.preventDefault(); e.stopImmediatePropagation(); exportFrame(); }
  if ((e.ctrlKey || e.metaKey) && e.code === "KeyH" && e.shiftKey) { e.preventDefault(); e.stopImmediatePropagation(); openHistory(); }
}, true);
