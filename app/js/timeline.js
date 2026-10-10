"use strict";
/* ---------- timeline rendering ---------- */
const grid = $("#grid"), scroller = $("#scroller");
let rowsEl = {}, contentEl = {}, rulerEl = null, playheadEl = null;
function headW() { return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--headw")) || 96; }
function laneX(e) { const ref = rulerEl || grid; const r = ref.getBoundingClientRect(); return (e.clientX - r.left) / pps; }
const isVidTr = tr => tr.type === "video" || tr.type === "overlay";
function renumberTracks() { let k = 1; for (let i = tracks.length - 1; i >= 0; i--) { const tr = tracks[i]; if (!isVidTr(tr)) continue; if (tr.type === "overlay") { k++; if (tr.auto || /^Video phủ( \d+)?$/.test(tr.name)) { tr.auto = true; tr.name = "Video " + k; } } } }
function renderTimeline() {
  renumberTracks();
  const T = total(), cw = Math.max(scroller.clientWidth - headW(), (T + 6) * pps);
  grid.innerHTML = ""; rowsEl = {}; contentEl = {};
  const rr = document.createElement("div"); rr.className = "trow rulerrow";
  rr.innerHTML = '<div class="thead"><span>Thời gian</span></div>'; rulerEl = document.createElement("div"); rulerEl.className = "tcontent ruler"; rulerEl.style.width = cw + "px"; rr.appendChild(rulerEl); grid.appendChild(rr);
  const majors = [1, 2, 5, 10, 15, 30, 60]; const major = majors.find(s => s * pps >= 70) || 60; const minor = major / 5;
  const frag = document.createDocumentFragment();
  for (let s = 0; s * pps <= cw; s += minor) { const isMajor = Math.abs(s / major - Math.round(s / major)) < 1e-6; const k = document.createElement("div"); k.className = "tick" + (isMajor ? "" : " minor"); k.style.left = s * pps + "px"; if (isMajor) k.textContent = fmt(s).replace(/\.00$/, ""); frag.appendChild(k); }
  rulerEl.appendChild(frag);
  const st = vStarts();
  markers.forEach(mt => { const mk = document.createElement("div"); mk.className = "marker"; mk.style.left = mt * pps + "px"; mk.title = "Marker " + fmt(mt) + " · bấm để tới, bấm đúp để xoá"; mk.dataset.t = mt; rulerEl.appendChild(mk); });
  if (coverT != null) { const cb = document.createElement("div"); cb.className = "coverbadge"; cb.style.left = coverT * pps + "px"; cb.title = "Ảnh bìa " + fmt(coverT); rulerEl.appendChild(cb); }
  for (const tr of tracks) {
    const row = document.createElement("div"); row.className = "trow" + (tr.off ? " off" : "") + (tr.lock ? " locked" : ""); row.dataset.track = tr.id;
    const head = document.createElement("div"); head.className = "thead"; head.title = tr.name;
    const nm = document.createElement("span"); nm.textContent = tr.name; nm.ondblclick = () => renameTrack(tr, nm); head.appendChild(nm);
    const lk = document.createElement("button"); lk.className = "tb"; lk.setAttribute("aria-pressed", !!tr.lock); lk.title = tr.lock ? "Mở khoá track" : "Khoá track";
    lk.innerHTML = tr.lock ? '<svg class="i" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>' : '<svg class="i" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/></svg>';
    lk.onclick = () => { tr.lock = !tr.lock; renderTimeline(); };
    const tg = document.createElement("button"); tg.className = "tb" + (tr.type === "audio" ? " mute" : ""); tg.setAttribute("aria-pressed", !!tr.off);
    tg.title = tr.type === "audio" ? (tr.off ? "Bật tiếng track" : "Tắt tiếng track") : (tr.off ? "Hiện track" : "Ẩn track");
    tg.innerHTML = tr.type === "audio" ? (tr.off ? '<svg class="i" viewBox="0 0 24 24"><path d="M11 5L6 9H3v6h3l5 4zM22 9l-6 6M16 9l6 6"/></svg>' : '<svg class="i" viewBox="0 0 24 24"><path d="M11 5L6 9H3v6h3l5 4zM16 9a5 5 0 0 1 0 6"/></svg>')
      : (tr.off ? '<svg class="i" viewBox="0 0 24 24"><path d="M3 3l18 18M10.6 6.1A10 10 0 0 1 22 12a14 14 0 0 1-3 3.6M6.6 6.6A14 14 0 0 0 2 12s4 7 10 7a9 9 0 0 0 4.4-1.1"/></svg>' : '<svg class="i" viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>');
    tg.onclick = () => { pushUndo(); tr.off = !tr.off; renderAll(); liveRefresh(); };
    const more = document.createElement("button"); more.className = "tb"; more.title = "Tuỳ chọn track"; more.textContent = "⋯"; more.onclick = e => trackMenu(tr, e.currentTarget);
    head.appendChild(lk); head.appendChild(tg); head.appendChild(more);
    if (tr.id === "v") { const cvb = document.createElement("button"); cvb.className = "cover"; cvb.textContent = "Bìa"; cvb.title = "Đặt ảnh bìa bằng khung tại kim"; cvb.onclick = setCover; head.appendChild(cvb); }
    row.appendChild(head);
    const ct = document.createElement("div"); ct.className = "tcontent " + (tr.type === "overlay" ? "ovl" : tr.type); ct.dataset.track = tr.id; ct.style.width = cw + "px"; row.appendChild(ct);
    markers.forEach(mt => { const ml = document.createElement("div"); ml.className = "markline"; ml.style.left = mt * pps + "px"; ct.appendChild(ml); });
    grid.appendChild(row); rowsEl[tr.id] = row; contentEl[tr.id] = ct;
  }
  if (contentEl.v) { const f = document.createDocumentFragment(); V.forEach((c, i) => f.appendChild(clipEl(c, "v", st[i])));
    V.forEach((c, i) => { if (i >= V.length - 1 || (V[i + 1].gap || 0) > 0) return; const b = document.createElement("button"); b.className = "trb" + (c.tr ? " on" : "") + (sel && sel.k === "tr" && sel.id === c.id ? " sel" : ""); b.dataset.i = i; b.style.left = (st[i + 1] * pps - 10) + "px"; b.title = c.tr ? "Chuyển cảnh: " + TRANSITIONS[c.tr.type] + " · bấm để sửa" : "Thêm chuyển cảnh"; b.setAttribute("aria-label", b.title); b.innerHTML = c.tr ? '<svg viewBox="0 0 24 24"><path d="M4 6l8 6-8 6zM20 6l-8 6 8 6z"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M12 7v10M7 12h10"/></svg>'; f.appendChild(b); }); contentEl.v.appendChild(f); if (!V.length) { const e = document.createElement("div"); e.className = "tc"; e.style.cssText = "position:absolute;left:12px;top:50%;transform:translateY(-50%)"; e.textContent = "Kéo clip từ Thư viện xuống đây"; contentEl.v.appendChild(e); } }
  const byT = {}; for (const c of C) (byT[c.track] = byT[c.track] || []).push(c);
  for (const id in byT) { const ct = contentEl[id]; if (!ct) continue; const f = document.createDocumentFragment(); byT[id].forEach(c => f.appendChild(clipEl(c, "c", c.start))); ct.appendChild(f); }
  playheadEl = document.createElement("div"); playheadEl.className = "playhead"; grid.appendChild(playheadEl);
  grid.style.width = (headW() + cw) + "px";
  placePlayhead();
  paintStrips();
  if (typeof decorateTimeline === "function") decorateTimeline();
}
/* nhiều track phủ/chữ/hiệu ứng đẩy track video chính xuống dưới: cuộn để nó luôn nằm trong khung nhìn */
function showMainTrack() {
  const row = grid.querySelector('.trow[data-track="v"]'); if (!row) return;
  const r = row.getBoundingClientRect(), s = scroller.getBoundingClientRect();
  if (r.bottom > s.bottom - 4) scroller.scrollTop += r.bottom - s.bottom + 12; else if (r.top < s.top + 30) scroller.scrollTop -= s.top + 30 - r.top;
}
/* Dải ảnh kiểu CapCut: các ô giữ đúng tỉ lệ khung hình, xếp liền nhau, mỗi ô lấy khung gần thời điểm của nó (không kéo giãn ảnh). */
function paintStrips(only) {
  const st = vStarts(), pos = new Map(); V.forEach((c, i) => pos.set(c.id, c)); C.forEach(c => pos.set(c.id, c));
  (only ? [only] : grid.querySelectorAll(".clip.tiled")).forEach(d => {
    const c = pos.get(d.dataset.id), m = c && c.mediaId ? media.get(c.mediaId) : null; if (!m || !m.strip || !m.stripN) return;
    const H = Math.max(20, d.clientHeight || 60), W = parseFloat(d.style.width) || d.clientWidth, n = m.stripN, ar = m.stripAR || 0.5625;
    let tw = Math.max(16, Math.round(H * ar)), k = Math.ceil(W / tw); if (k > 240) { k = 240; tw = Math.ceil(W / k); }
    const L = d.dataset.k === "v" ? vlen(c) : clen(c), D = Math.max(0.01, m.duration || 1);
    let box = d.querySelector(".tiles"); if (!box) { box = document.createElement("div"); box.className = "tiles"; d.insertBefore(box, d.firstChild); }
    while (box.children.length > k) box.lastChild.remove();
    while (box.children.length < k) box.appendChild(document.createElement("i"));
    const url = `url(${m.strip})`, size = `${n * tw}px ${H}px`;
    for (let j = 0; j < k; j++) {
      const el = box.children[j], lt = Math.min(L, (j + 0.5) * tw / pps), src = typeof srcTime === "function" ? srcTime(c, lt) : (c.in || 0) + lt;
      const idx = Math.max(0, Math.min(n - 1, Math.floor(src / D * n)));
      el.style.cssText = `left:${j * tw}px;width:${tw}px;background-image:${url};background-size:${size};background-position:${-idx * tw}px 0`;
    }
  });
}
function clipEl(c, k, left) {
  const m = c.mediaId ? media.get(c.mediaId) : null; const d = document.createElement("div");
  const isText = k === "c" && (c.type === "text" || c.type === "sticker" || c.type === "jz"), isFx = k === "c" && c.type === "fx", isSfx = k === "c" && c.type === "audio" && (/^sfx/.test(c.track) || (m && (m.gen || /^SFX/.test(m.name)))), isOv = k === "c" && c.type === "video";
  d.className = "clip" + (k === "c" ? (isText ? (c.type === "sticker" ? " t st" : " t") : isFx ? (c.fxType === "filter" ? " fx flt" : " fx") : isSfx ? " sfx" : isOv ? " ov" : (k === "c" && c.type === "compound") ? " ov cmp" : " a") : "") + (sel && sel.id === c.id ? " sel" : "");
  d.dataset.id = c.id; d.dataset.k = k; d.tabIndex = -1;
  const L = k === "v" ? vlen(c) : clen(c);
  d.style.left = left * pps + "px"; d.style.width = Math.max(3, L * pps) + "px";
  if (m && m.strip) {
    if (m.kind === "image") { d.style.backgroundImage = `url(${m.strip})`; d.style.backgroundSize = "auto 100%"; d.style.backgroundRepeat = "repeat-x"; }
    else if (c.freeze) { d.style.backgroundImage = `url(${m.strip})`; d.style.backgroundSize = `${m.duration * pps}px 100%`; d.style.backgroundPosition = `${-c.in * pps}px 0`; d.style.backgroundRepeat = "repeat-x"; }
    else if (m.stripN && m.kind === "video") { d.classList.add("tiled"); }
    else { d.style.backgroundImage = `url(${m.strip})`; d.style.backgroundSize = `${m.duration * pps}px 100%`; d.style.backgroundPosition = `${-c.in * pps}px 0`; }
  }
  const label = k === "c" && c.type === "compound" ? "▣ " + (c.name || "Compound") + " · " + cmpCount(c) + " clip" : isText ? textLabel(c) : isFx ? (c.fxType === "filter" ? "Bộ lọc · " + (FILTERS[c.filter] || FILTERS.none).n : "Hiệu ứng · " + (EFFECTS[c.effect] || "")) : (m ? m.name : "?");
  d.innerHTML = '<div class="h l" data-h="l"></div><div class="h r" data-h="r"></div><span class="cl"></span>' + (L * pps > 70 && !isText ? '<span class="cd"></span>' : "") + (c.muted ? '<span class="mute">Tắt tiếng</span>' : "") + (c.freeze || c.reverse || c.flip || c.rot || (c.speed && c.speed !== 1) || c.anim || (c.filter && c.filter !== "none" && !isFx) || c.bgRemove || c.chroma || c.audioOut ? `<span class="tag2">${[c.speed && c.speed !== 1 ? c.speed + "x" : "", c.freeze ? "Đứng hình" : "", c.reverse ? "Đảo" : "", c.flip ? "Lật" : "", c.rot ? c.rot + "°" : "", c.anim ? "Hoạt ảnh" : "", c.filter && c.filter !== "none" && !isFx ? (FILTERS[c.filter] || {}).n : "", c.bgRemove ? "Tách nền" : "", c.chroma ? "Phông xanh" : "", c.audioOut ? "Đã tách tiếng" : ""].filter(Boolean).join(" · ")}</span>` : "") + (sel && sel.id === c.id && c.kf ? kfTimes(c).map(kt => `<span class="kfd" style="left:${kt * pps - 5}px" title="Keyframe ${fmt(kt)}"></span>`).join("") : "");
  d.querySelector(".cl").textContent = label; const cd = d.querySelector(".cd"); if (cd) cd.textContent = fmt(L);
  d.title = label + " · " + fmt(L);
  return d;
}
function layoutClips() {
  const st = vStarts(), pos = new Map(); V.forEach((c, i) => pos.set(c.id, [c, st[i], vlen(c)])); C.forEach(c => pos.set(c.id, [c, c.start, clen(c)]));
  grid.querySelectorAll(".clip").forEach(d => { const p = pos.get(d.dataset.id); if (!p) return; const [c, s, L] = p, m = c.mediaId ? media.get(c.mediaId) : null;
    d.style.left = s * pps + "px"; d.style.width = Math.max(3, L * pps) + "px";
    if (m && m.strip && m.kind !== "image") { if (d.classList.contains("tiled")) paintStrips(d); else { d.style.backgroundPosition = `${-c.in * pps}px 0`; d.style.backgroundSize = `${m.duration * pps}px 100%`; } }
    const cd = d.querySelector(".cd"); if (cd) cd.textContent = fmt(L); });
  placePlayhead();
}
function placePlayhead() { if (playheadEl) playheadEl.style.left = (headW() + t * pps) + "px"; $("#tc").innerHTML = `<b>${fmt(t)}</b> / ${fmt(total())}`; if (typeof syncInspLive === "function") syncInspLive(); }
function follow() { const x = t * pps, L = scroller.scrollLeft, W = scroller.clientWidth - headW(); if (x > L + W - 60 || x < L) scroller.scrollLeft = Math.max(0, x - 80); }
function markUsed() { const used = new Set([...V.map(c => c.mediaId), ...C.map(c => c.mediaId)]); document.querySelectorAll(".mitem").forEach(d => d.classList.toggle("used", used.has(d.dataset.mid))); }
function renderBin() {
  const bin = $("#bin"); bin.querySelectorAll(".mitem,.bingroup").forEach(e => e.remove());
  const groups = [["Video", m => m.kind !== "audio"], ["Âm thanh", m => m.kind === "audio"]];
  for (const [title, f] of groups) {
    const list = [...media.values()].filter(f); if (!list.length) continue;
    const h = document.createElement("div"); h.className = "bingroup"; h.textContent = title; bin.appendChild(h);
    for (const m of list) {
      const d = document.createElement("div"); d.className = "mitem" + (m.kind === "audio" ? " audio" : ""); d.dataset.mid = m.id; d.title = m.name + " · kéo xuống timeline, hoặc đè lên một đoạn để thay";
      d.innerHTML = (m.kind === "audio" ? '<svg class="i" viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>' : '<img alt="">') + '<span class="mname"></span>' + (m.kind === "image" ? "" : '<span class="mdur"></span>') + '<button class="add" aria-label="Thêm vào timeline">+</button>';
      if (m.kind !== "audio") { const im = d.querySelector("img"); im.src = m.thumb || ""; im.draggable = false; }
      d.querySelector(".mname").textContent = (m.missing ? "Thiếu file · " : "") + m.name; if (m.kind !== "image") d.querySelector(".mdur").textContent = fmt(m.duration);
      d.querySelector(".add").onclick = e => { e.stopPropagation(); appendMedia(m); };
      d.addEventListener("pointerdown", e => binDragStart(e, m, d));
      bin.appendChild(d);
    }
  }
  markUsed();
}

