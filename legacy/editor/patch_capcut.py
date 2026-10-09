import re, sys
P = "/home/claude/editor/p/index.html"
p = open(P).read()
def rep(a, b, cnt=1):
    global p
    if a not in p: sys.exit("MISSING: " + a[:120])
    p = p.replace(a, b, cnt)
def rep_fn(start, end_marker, new):
    """replace text from `start` up to (not including) `end_marker`"""
    global p
    i = p.find(start)
    if i < 0: sys.exit("MISSING FN: " + start[:80])
    j = p.find(end_marker, i + len(start))
    if j < 0: sys.exit("MISSING END: " + end_marker[:80])
    p = p[:i] + new + p[j:]

# ================= CSS =================
rep("@media (max-width:900px){", r'''.tlbar{gap:4px}
.tlbar .sep{width:1px;height:22px;background:var(--line);margin:0 4px}
.tlbar button.icon{padding:5px 7px}
.tlbar .grp{display:flex;align-items:center;gap:3px}
.tlbar .right{margin-left:auto;display:flex;align-items:center;gap:4px;flex-wrap:wrap}
.tlbar .toggle[aria-pressed=true]{background:color-mix(in srgb,var(--accent) 18%,transparent)}
.tlbar .zoom{margin-left:0}
.menu{position:fixed;z-index:70;background:var(--panel2);border:1px solid var(--line);border-radius:9px;padding:5px;min-width:200px;box-shadow:0 10px 30px rgba(0,0,0,.5);display:flex;flex-direction:column}
.menu button{border:0;background:transparent;justify-content:flex-start;padding:7px 9px;border-radius:6px;font-size:12.5px;width:100%}
.menu button:hover,.menu button:focus-visible{background:var(--line)}
.menu .mh{font-size:10.5px;color:var(--muted);font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:6px 9px 3px}
.menu kbd{margin-left:auto}
.thead .tb{padding:2px 3px;border-color:transparent;background:transparent}
.thead .tb[aria-pressed=true]{color:var(--gold)}
.thead .tb.mute[aria-pressed=true]{color:var(--danger)}
.thead .cover{font-size:10px;padding:2px 5px;border-color:var(--line);margin-left:2px}
.thead input{width:100%;font-size:11px;padding:2px 4px}
.trow.locked .tcontent{background-image:repeating-linear-gradient(135deg,rgba(255,255,255,.035) 0 6px,transparent 6px 12px)}
.tcontent.overlay{height:60px}
.clip.ov{background-color:#28507a}
.clip .tag2{position:absolute;right:14px;top:3px;font:700 9px var(--ui);background:rgba(0,0,0,.6);color:var(--gold);padding:1px 5px;border-radius:4px;pointer-events:none}
body.blade .clip{cursor:crosshair}
.marker{position:absolute;top:0;width:12px;height:14px;margin-left:-6px;cursor:pointer;z-index:3}
.marker::before{content:"";position:absolute;left:0;top:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:10px solid var(--gold)}
.markline{position:absolute;top:0;bottom:0;width:1px;background:color-mix(in srgb,var(--gold) 45%,transparent);pointer-events:none;z-index:2}
.hoverline{position:absolute;top:0;bottom:0;width:1px;background:#fff;opacity:.5;pointer-events:none;z-index:12}
.coverbadge{position:absolute;top:2px;width:2px;bottom:0;background:#e5604f;pointer-events:none;z-index:3}
#recBtn.rec{background:var(--danger);border-color:var(--danger);color:#fff}
.insp .sect{border-top:1px solid var(--line);padding-top:10px;display:flex;flex-direction:column;gap:8px}
.insp .sect h4{margin:0;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.insp .rng{display:grid;grid-template-columns:72px 1fr 40px;align-items:center;gap:6px;font-size:11.5px}
.insp .rng span:last-child{font:600 11px var(--mono);text-align:right}
@media (max-width:900px){''')

# ================= toolbar HTML =================
I = lambda d: f'<svg class="i" viewBox="0 0 24 24">{d}</svg>'
toolbar = f'''    <div class="tlbar">
      <div class="grp">
        <button class="icon" id="addBtn" title="Thêm media, chữ hoặc track">{I('<path d="M12 5v14M5 12h14"/>')}</button>
        <button class="icon" id="toolBtn" title="Công cụ: Chọn (A) / Dao cắt (B)"><span id="toolIco">{I('<path d="M5 3l14 8-6 2-2 6z"/>')}</span><svg class="i" viewBox="0 0 24 24" style="width:10px"><path d="M6 9l6 6 6-6"/></svg></button>
      </div><span class="sep"></span>
      <div class="grp">
        <button class="icon" id="undoBtn" title="Hoàn tác (Ctrl+Z)">{I('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>')}</button>
        <button class="icon" id="redoBtn" title="Làm lại (Ctrl+Shift+Z)">{I('<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>')}</button>
      </div><span class="sep"></span>
      <div class="grp">
        <button class="icon" id="splitBtn" title="Tách tại kim (Ctrl+B hoặc S)">{I('<path d="M12 3v18M8 7l-4 5 4 5M16 7l4 5-4 5"/>')}</button>
        <button class="icon" id="delLBtn" title="Xoá phần bên trái kim (Q)">{I('<path d="M14 3v18M10 7l-4 5 4 5"/><path d="M4 4l6 6M10 4L4 10" opacity=".7"/>')}</button>
        <button class="icon" id="delRBtn" title="Xoá phần bên phải kim (W)">{I('<path d="M10 3v18M14 7l4 5-4 5"/><path d="M14 4l6 6M20 4l-6 6" opacity=".7"/>')}</button>
        <button class="icon" id="delBtn" title="Xoá clip (Delete)">{I('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>')}</button>
        <button class="icon" id="markBtn" title="Thêm/bỏ marker tại kim (M)">{I('<path d="M6 3h12v14l-6 4-6-4z"/>')}</button>
      </div><span class="sep"></span>
      <div class="grp">
        <button class="icon" id="freezeBtn" title="Đứng hình: chèn khung đứng 3 giây tại kim">{I('<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M10 9v6M14 9v6"/>')}</button>
        <button class="icon" id="revBtn" title="Đảo ngược clip video">{I('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>')}</button>
        <button class="icon" id="flipBtn" title="Lật ngang">{I('<path d="M12 3v18"/><path d="M8 7L3 12l5 5zM16 7l5 5-5 5z"/>')}</button>
        <button class="icon" id="rotBtn" title="Xoay 90°">{I('<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/>')}</button>
        <button class="icon" id="cropBtn" title="Cắt khung / vị trí / màu (mở Thuộc tính)">{I('<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>')}</button>
        <button class="icon" id="dupBtn" title="Nhân bản (D)">{I('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>')}</button>
        <button class="icon" id="trimBtn" title="Chọn đoạn trong source (T)">{I('<path d="M4 7h16M4 17h16M8 4v6M16 14v6"/>')}</button>
        <button class="icon" id="textBtn" title="Thêm chữ tại kim">{I('<path d="M5 6V4h14v2M12 4v16M9 20h6"/>')}</button>
      </div>
      <div class="right">
        <button class="icon" id="recBtn" title="Thu âm giọng nói tại kim">{I('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>')}</button>
        <span class="sep"></span>
        <button class="icon toggle" id="magBtn" aria-pressed="true" title="Nam châm track chính: các cảnh tự nối liền">{I('<path d="M6 3v8a6 6 0 0 0 12 0V3"/><path d="M6 7h4M14 7h4"/>')}</button>
        <button class="icon toggle" id="snapBtn" aria-pressed="true" title="Tự hít vào mép clip, kim và marker">{I('<path d="M4 12h6M14 12h6"/><path d="M10 8v8M14 8v8"/>')}</button>
        <button class="icon toggle" id="linkBtn" aria-pressed="true" title="Liên kết: chữ và SFX đi theo cảnh video khi cảnh dịch chuyển">{I('<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>')}</button>
        <button class="icon toggle" id="hovBtn" aria-pressed="false" title="Xem trước khi rê chuột trên timeline">{I('<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M12 17v4M8 21h8"/>')}</button>
        <span class="sep"></span>
        <button class="icon" id="zoomOut" title="Thu nhỏ">{I('<circle cx="11" cy="11" r="7"/><path d="M8 11h6M21 21l-5-5"/>')}</button>
        <div class="zoom"><input type="range" id="zoom" min="6" max="260" value="40" aria-label="Thu phóng timeline"></div>
        <button class="icon" id="zoomIn" title="Phóng to">{I('<circle cx="11" cy="11" r="7"/><path d="M8 11h6M11 8v6M21 21l-5-5"/>')}</button>
        <button class="icon" id="zoomFit" title="Vừa khung">{I('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>')}</button>
      </div>
    </div>
'''
rep_fn('    <div class="tlbar">', '    <div class="scroller" id="scroller">', toolbar)

# ================= model helpers =================
rep("const vlen = c => c.out - c.in;", "const vlen = c => c.freeze ? c.dur : c.out - c.in;")
rep("function vStarts() { let acc = 0; return V.map(c => { const s = acc; acc += vlen(c); return s; }); }",
    "function vStarts() { let acc = 0; return V.map(c => { acc += (c.gap || 0); const s = acc; acc += vlen(c); return s; }); }")
i = p.find("function vTotal()"); j = p.find("\n", i)
p = p[:i] + "function vTotal() { const st = vStarts(); return V.length ? st[V.length - 1] + vlen(V[V.length - 1]) : 0; }" + p[j:]
rep("function snapshot() { return JSON.stringify({ tracks, V, C }); }",
    "let markers = [], coverT = null, magnetOn = true, linkOn = true, hoverOn = false, tool = \"select\", hoverT = null;\nfunction snapshot() { return JSON.stringify({ tracks, V, C, markers, coverT }); }")
rep("function restore(s) { const o = JSON.parse(s); tracks = o.tracks; V = o.V; C = o.C;",
    "function restore(s) { const o = JSON.parse(s); tracks = o.tracks; V = o.V; C = o.C; markers = o.markers || []; coverT = o.coverT ?? null;")
rep("const trackById = id => tracks.find(x => x.id === id);",
    "const trackById = id => tracks.find(x => x.id === id);\nconst ttype = c => c.type === \"video\" ? \"overlay\" : c.type;\nconst isLocked = id => !!(trackById(id) || {}).lock;\nconst clipTrack = (k, c) => k === \"v\" ? \"v\" : c.track;")

# ================= drawing =================
rep_fn("function activeVideo(time) {", "\n/* ---------- playback ---------- */", r'''function activeVideo(time) { const st = vStarts(); for (let i = 0; i < V.length; i++) if (time >= st[i] && time < st[i] + vlen(V[i])) return { c: V[i], start: st[i], i }; return null; }
function zoomAt(c, lt) { const d = Math.max(0.05, c.type === "video" ? clen(c) : vlen(c)), p = clamp(lt / d, 0, 1); switch (c.zoom) { case "in": return 1 + 0.07 * p; case "out": return 1.07 - 0.07 * p; case "punch": return 1 + 0.13 * Math.exp(-lt * 9) + 0.04 * p; default: return 1; } }
function srcTime(c, lt) { return c.freeze ? c.in : c.reverse ? Math.max(c.in, c.out - lt - 1 / FPS) : c.in + lt; }
function drawLayer(src, sw, sh, c, lt) {
  const W = cv.width, H = cv.height, cr = c.crop || {};
  const cx = (cr.l || 0) * sw, cy = (cr.t || 0) * sh, cw = Math.max(2, sw * (1 - (cr.l || 0) - (cr.r || 0))), ch = Math.max(2, sh * (1 - (cr.t || 0) - (cr.b || 0)));
  const rot = (((c.rot || 0) % 360) + 360) % 360, swp = rot === 90 || rot === 270;
  const base = Math.max(W / (swp ? ch : cw), H / (swp ? cw : ch)), s = base * zoomAt(c, lt) * (c.scale || 1);
  g.save(); g.globalAlpha = c.opacity == null ? 1 : c.opacity;
  const a = c.adj; if (a && (a.b || a.c || a.s)) g.filter = `brightness(${1 + (a.b || 0)}) contrast(${1 + (a.c || 0)}) saturate(${1 + (a.s || 0)})`;
  g.translate(W / 2 + (c.x || 0) * W, H / 2 + (c.y || 0) * H); if (rot) g.rotate(rot * Math.PI / 180); if (c.flip) g.scale(-1, 1);
  g.drawImage(src, cx, cy, cw, ch, -cw * s / 2, -ch * s / 2, cw * s, ch * s); g.restore();
}
function drawClipMedia(c, lt, k) {
  const m = media.get(c.mediaId); if (!m) return;
  if (m.kind === "image") { if (m.img) drawLayer(m.img, m.img.naturalWidth, m.img.naturalHeight, c, lt); return; }
  if (!m.url) return;
  const el = getEl(m, k), want = srcTime(c, lt);
  if ((!playing || c.reverse || c.freeze) && Math.abs(el.currentTime - want) > 1 / FPS / 2 && !el.seeking) { el.currentTime = want; el.onseeked = () => { el.onseeked = null; if (!playing) drawFrame(); }; }
  if (el.readyState >= 2 && el.videoWidth) drawLayer(el, el.videoWidth, el.videoHeight, c, lt);
}
function drawFrame() {
  const T = (hoverT != null && !playing) ? hoverT : t;
  g.fillStyle = "#000"; g.fillRect(0, 0, cv.width, cv.height);
  const vtr = trackById("v"), a = activeVideo(T);
  if (a && !(vtr && vtr.off)) drawClipMedia(a.c, T - a.start, a.i % 2);
  else if (!V.length && !C.some(c => c.type === "video")) { g.fillStyle = "#87a0a7"; g.font = "600 28px Montserrat, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("Thêm clip để bắt đầu", cv.width / 2, cv.height / 2); }
  // overlay (picture-in-picture) tracks: lower rows first so upper rows sit on top
  tracks.map((tr, ti) => [tr, ti]).filter(([tr]) => tr.type === "overlay").reverse().forEach(([tr, ti]) => { if (tr.off) return; for (const c of C) if (c.track === tr.id && T >= c.start && T < cend(c)) drawClipMedia(c, T - c.start, 2 + (ti % 2)); });
  // text layers: lower tracks first so upper tracks sit on top
  const tts = tracksOf("text").slice().reverse();
  for (const tr of tts) { if (tr.off) continue; for (const c of C) if (c.track === tr.id && T >= c.start && T < cend(c)) drawText(c, T - c.start); }
}
''')
rep_fn("function syncVideo() {", "function tick() {", r'''function syncOne(c, lt, k, off) {
  const m = media.get(c.mediaId); if (!m || m.kind !== "video" || !m.url) return null;
  const el = getEl(m, k), want = srcTime(c, lt);
  if (c.reverse || c.freeze) { if (!el.paused) el.pause(); if (Math.abs(el.currentTime - want) > 1 / FPS && !el.seeking) el.currentTime = want; }
  else if (el.paused) { if (Math.abs(el.currentTime - want) > 0.04) el.currentTime = want; el.play().catch(() => {}); }
  else if (Math.abs(el.currentTime - want) > 0.2) el.currentTime = want;
  if (el._gain) el._gain.gain.value = (off || c.muted || c.reverse || c.freeze) ? 0 : dbToGain(c.vol || 0);
  return el;
}
function syncVideo() {
  const act = new Set(), vtr = trackById("v"), a = activeVideo(t);
  if (a) {
    const el = syncOne(a.c, t - a.start, a.i % 2, vtr && vtr.off); if (el) act.add(el);
    const nx = V[a.i + 1];
    if (nx && a.start + vlen(a.c) + (nx.gap || 0) - t < 1.0) { const nm = media.get(nx.mediaId); if (nm && nm.kind === "video" && nm.url) { const ne = getEl(nm, (a.i + 1) % 2), w = srcTime(nx, 0); if (ne !== el && ne.paused && !ne.seeking && Math.abs(ne.currentTime - w) > 0.05) ne.currentTime = w; } }
  }
  tracks.forEach((tr, ti) => { if (tr.type !== "overlay") return; for (const c of C) if (c.track === tr.id && t >= c.start && t < cend(c)) { const el = syncOne(c, t - c.start, 2 + (ti % 2), tr.off); if (el) act.add(el); } });
  for (const m of media.values()) (m.els || []).forEach(el => { if (el && !act.has(el) && !el.paused) { el.pause(); if (el._gain) el._gain.gain.value = 0; } });
}
''')

# ================= timeline rows (heads, markers) =================
rep_fn("  for (const tr of tracks) {\n    const row = document.createElement(\"div\");", "  if (contentEl.v) {", r'''  markers.forEach(mt => { const mk = document.createElement("div"); mk.className = "marker"; mk.style.left = mt * pps + "px"; mk.title = "Marker " + fmt(mt) + " · bấm để tới, bấm đúp để xoá"; mk.dataset.t = mt; rulerEl.appendChild(mk); });
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
    const ct = document.createElement("div"); ct.className = "tcontent " + tr.type; ct.dataset.track = tr.id; ct.style.width = cw + "px"; row.appendChild(ct);
    markers.forEach(mt => { const ml = document.createElement("div"); ml.className = "markline"; ml.style.left = mt * pps + "px"; ct.appendChild(ml); });
    grid.appendChild(row); rowsEl[tr.id] = row; contentEl[tr.id] = ct;
  }
''')
rep("  const byT = {}; for (const c of C) (byT[c.track] = byT[c.track] || []).push(c);",
    "  const byT = {}; for (const c of C) (byT[c.track] = byT[c.track] || []).push(c);")
# clip element badges / overlay colour
rep('''  const isText = k === "c" && c.type === "text", isSfx = k === "c" && c.type === "audio" && /^sfx/.test(c.track);
  d.className = "clip" + (k === "c" ? (isText ? " t" : isSfx ? " sfx" : " a") : "") + (sel && sel.id === c.id ? " sel" : "");''',
'''  const isText = k === "c" && c.type === "text", isSfx = k === "c" && c.type === "audio" && /^sfx/.test(c.track), isOv = k === "c" && c.type === "video";
  d.className = "clip" + (k === "c" ? (isText ? " t" : isSfx ? " sfx" : isOv ? " ov" : " a") : "") + (sel && sel.id === c.id ? " sel" : "");''')
rep('''    else { d.style.backgroundImage = `url(${m.strip})`; d.style.backgroundSize = `${m.duration * pps}px 100%`; d.style.backgroundPosition = `${-c.in * pps}px 0`; }
  }''','''    else if (c.freeze) { d.style.backgroundImage = `url(${m.strip})`; d.style.backgroundSize = `${m.duration * pps}px 100%`; d.style.backgroundPosition = `${-c.in * pps}px 0`; d.style.backgroundRepeat = "repeat-x"; }
    else { d.style.backgroundImage = `url(${m.strip})`; d.style.backgroundSize = `${m.duration * pps}px 100%`; d.style.backgroundPosition = `${-c.in * pps}px 0`; }
  }''')
rep('''+ (c.muted ? '<span class="mute">Tắt tiếng</span>' : "");
  d.querySelector(".cl").textContent = label;''','''+ (c.muted ? '<span class="mute">Tắt tiếng</span>' : "") + (c.freeze || c.reverse || c.flip || c.rot ? `<span class="tag2">${[c.freeze ? "Đứng hình" : "", c.reverse ? "Đảo" : "", c.flip ? "Lật" : "", c.rot ? c.rot + "°" : ""].filter(Boolean).join(" · ")}</span>` : "");
  d.querySelector(".cl").textContent = label;''')
rep("    if (m && m.strip && m.kind !== \"image\") d.style.backgroundPosition = `${-c.in * pps}px 0`;",
    "    if (m && m.strip && m.kind !== \"image\") { d.style.backgroundPosition = `${-c.in * pps}px 0`; d.style.backgroundSize = `${m.duration * pps}px 100%`; }")

# ================= splitting helpers & ops =================
rep_fn("function splitAtPlayhead() {", "function deleteSel() {", r'''function splitV(c, off) { // returns the right half, inserted after c
  const b = { ...c, id: nid("v"), gap: 0 };
  if (c.freeze) { b.dur = c.dur - off; c.dur = off; }
  else if (c.reverse) { const cut = c.out - off; b.out = cut; c.in = cut; }
  else { const cut = c.in + off; b.in = cut; c.out = cut; }
  V.splice(V.indexOf(c) + 1, 0, b); return b;
}
function splitC(c, at) { const off = at - c.start, b = { ...c, id: nid("c"), start: at }; if (c.type === "text") { b.dur = c.dur - off; c.dur = off; } else { b.in = c.in + off; c.out = c.in + off; } C.push(b); return b; }
function vAt(time) { const st = vStarts(); const i = V.findIndex((c, k) => time > st[k] + 0.03 && time < st[k] + vlen(c) - 0.03); return i < 0 ? null : { c: V[i], i, start: st[i] }; }
function splitAtPlayhead() {
  const cur = findSel();
  if (cur && sel.k === "c" && !isLocked(cur.track) && t > cur.start + 0.03 && t < cend(cur) - 0.03) { pushUndo(); const b = splitC(cur, t); sel = { k: "c", id: b.id }; renderAll(); return true; }
  const h = isLocked("v") ? null : vAt(t);
  if (h) { pushUndo(); const b = splitV(h.c, t - h.start); sel = { k: "v", id: b.id }; renderAll(); return true; }
  toast("Đặt kim lên giữa một clip rồi bấm Tách."); return false;
}
function vMap() { const st = vStarts(), m = {}; V.forEach((c, i) => m[c.id] = [st[i], st[i] + vlen(c)]); return m; }
function linkShift(before) { // move short linked items (text, SFX, overlays ≤ 15 s) with the video clip they started on
  if (!linkOn || !before) return; const after = vMap();
  for (const c of C) {
    if (isLocked(c.track) || clen(c) > 15) continue;
    for (const id in before) { const [s0, e0] = before[id]; if (c.start >= s0 - 1e-3 && c.start < e0 - 1e-3) { const n = after[id]; if (n) c.start = Math.max(0, n[0] + (c.start - s0)); break; } }
  }
}
function deleteSide(side) {
  const cur = findSel();
  if (cur && sel.k === "c" && !isLocked(cur.track) && t > cur.start + 0.03 && t < cend(cur) - 0.03) {
    pushUndo(); const off = t - cur.start;
    if (side === "left") { if (cur.type === "text") cur.dur -= off; else cur.in += off; cur.start = t; } else { if (cur.type === "text") cur.dur = off; else cur.out = cur.in + off; }
    renderAll(); return;
  }
  const h = isLocked("v") ? null : vAt(t); if (!h) { toast("Đặt kim lên giữa một clip để xoá một phía."); return; }
  pushUndo(); const before = vMap(), c = h.c, off = t - h.start, L = vlen(c);
  if (side === "left") {
    if (c.freeze) c.dur -= off; else if (c.reverse) c.out -= off; else c.in += off;
    if (!magnetOn) c.gap = (c.gap || 0) + off; else t = h.start;
  } else {
    if (c.freeze) c.dur = off; else if (c.reverse) c.in = c.out - off; else c.out = c.in + off;
    if (!magnetOn && V[h.i + 1]) V[h.i + 1].gap = (V[h.i + 1].gap || 0) + (L - off);
  }
  linkShift(before); renderAll();
}
function toggleMarker() { const k = markers.findIndex(m => Math.abs(m - t) < 0.05); pushUndo(); if (k >= 0) markers.splice(k, 1); else { markers.push(Math.round(t * 100) / 100); markers.sort((a, b) => a - b); } renderTimeline(); }
function targetVideo() { const c = findSel(); if (c && (sel.k === "v" || c.type === "video") && !isLocked(clipTrack(sel.k, c))) return { k: sel.k, c }; const h = isLocked("v") ? null : activeVideo(t); return h ? { k: "v", c: h.c } : null; }
function freezeFrame(dur = 3) {
  const h = isLocked("v") ? null : activeVideo(t); if (!h) { toast("Đặt kim lên một cảnh video để đứng hình."); return; }
  const m = media.get(h.c.mediaId); if (!m || m.kind !== "video") { toast("Đứng hình chỉ dùng cho video."); return; }
  pushUndo(); const before = vMap(); let a = h.c, off = t - h.start; const srcT = srcTime(a, off);
  let right = null; if (off > 0.03 && off < vlen(a) - 0.03) right = splitV(a, off);
  const f = { id: nid("v"), mediaId: a.mediaId, in: srcT, out: srcT + 0.04, freeze: true, dur, vol: 0, muted: true, zoom: "none", gap: 0 };
  const at = off <= 0.03 ? V.indexOf(a) : V.indexOf(a) + 1; V.splice(at, 0, f);
  // linked items after the freeze point move right by its length
  if (linkOn) for (const c of C) if (!isLocked(c.track) && clen(c) <= 15 && c.start >= t - 1e-3) c.start += dur;
  sel = { k: "v", id: f.id }; renderAll(); toast("Đã chèn khung đứng " + dur + " giây.");
}
function setProp(fn, msg) { const tv = targetVideo(); if (!tv) { toast("Chọn một clip video (hoặc đặt kim lên cảnh)."); return; } pushUndo(); fn(tv.c); sel = { k: tv.k, id: tv.c.id }; renderAll(); if (msg) toast(msg(tv.c)); }
async function setCover() {
  coverT = Math.round(t * 100) / 100; renderTimeline(); drawFrame();
  const saver = await getSaver(); if (!saver) { toast("Đã đặt ảnh bìa tại " + fmt(coverT) + "."); return; }
  cv.toBlob(async b => { try { await saver.save({ filename: "vincut-anh-bia.png", data: b }); toast("Đã đặt và lưu ảnh bìa tại " + fmt(coverT) + "."); } catch (e) { toast("Đã đặt ảnh bìa tại " + fmt(coverT) + "."); } }, "image/png");
}
''')
rep("function deleteSel() { const c = findSel(); if (!c) { toast(\"Chọn một clip trên timeline trước.\"); return; } pushUndo(); if (sel.k === \"v\") V = V.filter(x => x !== c); else C = C.filter(x => x !== c); sel = null; t = Math.min(t, total()); renderAll(); }",
    '''function deleteSel() {
  const c = findSel(); if (!c) { toast("Chọn một clip trên timeline trước."); return; }
  if (isLocked(clipTrack(sel.k, c))) { toast("Track đang khoá."); return; }
  pushUndo();
  if (sel.k === "v") { const before = vMap(), i = V.indexOf(c); if (!magnetOn && V[i + 1]) V[i + 1].gap = (V[i + 1].gap || 0) + (c.gap || 0) + vlen(c); V = V.filter(x => x !== c); linkShift(before); }
  else C = C.filter(x => x !== c);
  sel = null; t = Math.min(t, total()); renderAll();
}''')

# appendMedia: overlays + linkage on insert
rep('''  if (m.kind === "audio") {
    const tr = opts.track ? trackById(opts.track) : firstTrack("audio", "Âm thanh");''','''  if (opts.overlay) {
    const tr = trackById(opts.overlay) || addTrack("overlay");
    const c = { id: nid("c"), track: tr.id, type: "video", mediaId: m.id, start: opts.start != null ? opts.start : t, in: 0, out: m.kind === "image" ? 3 : m.duration, vol: 0, muted: false, zoom: "none", scale: 1 };
    C.push(c); sel = { k: "c", id: c.id }; renderAll(); return;
  }
  if (m.kind === "audio") {
    const tr = opts.track ? trackById(opts.track) : firstTrack("audio", "Âm thanh");''')
rep('''    if (index == null) V.push(c); else V.splice(index, 0, c); sel = { k: "v", id: c.id };''','''    const before = vMap(); if (index == null) V.push(c); else V.splice(index, 0, c); linkShift(before); sel = { k: "v", id: c.id };''')

# tracks: add / rename / menu
rep("function firstTrack(type, name) {", r'''const TRACK_NAMES = { overlay: "Video phủ", text: "Chữ", audio: "Âm thanh" };
function addTrack(type, pos) {
  const n = tracks.filter(x => x.type === type).length + 1, tr = { id: nid(type === "overlay" ? "o" : type[0]), type, name: TRACK_NAMES[type] + (n > 1 ? " " + n : "") };
  if (pos != null) tracks.splice(pos, 0, tr);
  else if (type === "overlay" || type === "text") { const vi = tracks.findIndex(x => x.id === "v"); tracks.splice(vi < 0 ? 0 : vi, 0, tr); }
  else tracks.push(tr);
  return tr;
}
function renameTrack(tr, span) { const inp = document.createElement("input"); inp.value = tr.name; span.replaceWith(inp); inp.focus(); inp.select(); const done = ok => { if (ok && inp.value.trim()) tr.name = inp.value.trim(); renderTimeline(); }; inp.onkeydown = e => { if (e.key === "Enter") done(true); if (e.key === "Escape") done(false); e.stopPropagation(); }; inp.onblur = () => done(true); }
let menuEl = null;
function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; document.removeEventListener("pointerdown", menuOutside, true); } }
function menuOutside(e) { if (menuEl && !menuEl.contains(e.target)) closeMenu(); }
function openMenu(anchor, items) {
  closeMenu(); menuEl = document.createElement("div"); menuEl.className = "menu"; menuEl.setAttribute("role", "menu");
  for (const it of items) {
    if (it.h) { const h = document.createElement("div"); h.className = "mh"; h.textContent = it.h; menuEl.appendChild(h); continue; }
    const b = document.createElement("button"); b.setAttribute("role", "menuitem"); b.textContent = it.label; if (it.kbd) { const k = document.createElement("kbd"); k.textContent = it.kbd; b.appendChild(k); } if (it.disabled) b.disabled = true;
    b.onclick = () => { closeMenu(); it.run(); }; menuEl.appendChild(b);
  }
  document.body.appendChild(menuEl); const r = anchor.getBoundingClientRect(), mh = menuEl.offsetHeight, mw = menuEl.offsetWidth;
  menuEl.style.left = Math.min(window.innerWidth - mw - 8, r.left) + "px"; menuEl.style.top = (r.bottom + mh + 6 > window.innerHeight ? Math.max(8, r.top - mh - 6) : r.bottom + 6) + "px";
  setTimeout(() => document.addEventListener("pointerdown", menuOutside, true), 0); menuEl.querySelector("button")?.focus();
}
function trackMenu(tr, anchor) {
  const i = tracks.indexOf(tr), n = tr.id === "v" ? V.length : C.filter(c => c.track === tr.id).length;
  openMenu(anchor, [
    { label: "Đổi tên track", run: () => { const sp = rowsEl[tr.id]?.querySelector(".thead span"); if (sp) renameTrack(tr, sp); } },
    { label: "Thêm track " + (TRACK_NAMES[tr.type === "video" ? "overlay" : tr.type] || "").toLowerCase() + " bên trên", run: () => { pushUndo(); addTrack(tr.type === "video" ? "overlay" : tr.type, i); renderAll(); } },
    { label: "Chuyển track lên", disabled: i === 0, run: () => { pushUndo(); tracks.splice(i, 1); tracks.splice(i - 1, 0, tr); renderAll(); } },
    { label: "Chuyển track xuống", disabled: i === tracks.length - 1, run: () => { pushUndo(); tracks.splice(i, 1); tracks.splice(i + 1, 0, tr); renderAll(); } },
    { label: tr.lock ? "Mở khoá track" : "Khoá track", run: () => { tr.lock = !tr.lock; renderTimeline(); } },
    { label: tr.id === "v" ? "Track chính không xoá được" : `Xoá track${n ? " và " + n + " clip" : ""}`, disabled: tr.id === "v", run: () => { pushUndo(); C = C.filter(c => c.track !== tr.id); tracks.splice(i, 1); sel = null; renderAll(); toast("Đã xoá track. Ctrl+Z để lấy lại."); } }
  ]);
}
function firstTrack(type, name) {''')

# ================= inspector: transform / adjust =================
rep('''      <div class="row"><button id="iSplit">Cắt tại kim</button><button id="iDup">Nhân bản</button><button id="iDel">Xoá</button></div>` + HELP;
    $("#iName").textContent = m ? m.name : "?"; $("#iZoom").value = c.zoom || "none";''','''      ${c.freeze ? `<div class="field"><label for="iFz">Khung đứng (giây)</label><input type="number" id="iFz" step="0.1" min="0.2" value="${c.dur.toFixed(2)}"></div>` : ""}
      ${XFORM_HTML(c, false)}
      <div class="row"><button id="iSplit">Tách tại kim</button><button id="iDup">Nhân bản</button><button id="iDel">Xoá</button></div>` + HELP;
    $("#iName").textContent = m ? m.name : "?"; $("#iZoom").value = c.zoom || "none"; bindXform(c);
    const fz = $("#iFz"); if (fz) fz.onchange = e => { pushUndo(); c.dur = Math.max(0.2, +e.target.value || 3); renderAll(); };''')
rep('''  } else if (c.type === "text") {
    box.innerHTML = `''','''  } else if (c.type === "video") {
    const m = media.get(c.mediaId);
    box.innerHTML = `
      <div class="field"><label>Clip video phủ</label><div class="val" style="font-family:var(--ui)" id="iName"></div></div>
      <div class="row"><div class="field"><label>Bắt đầu</label><div class="val">${fmt(c.start)}</div></div><div class="field"><label>Dài</label><div class="val">${fmt(clen(c))}</div></div></div>
      <div class="field"><label for="iZoom">Chuyển động</label><select id="iZoom"><option value="none">Đứng yên</option><option value="in">Zoom vào chậm</option><option value="out">Zoom ra chậm</option><option value="punch">Zoom giật</option></select></div>
      ${XFORM_HTML(c, true)}
      <div class="field"><label>Track</label><select id="iTrack"></select></div>
      <div class="row"><button id="iSplit">Tách tại kim</button><button id="iDup">Nhân bản</button><button id="iDel">Xoá</button></div>` + HELP;
    $("#iName").textContent = m ? m.name : "?"; $("#iZoom").value = c.zoom || "none"; $("#iZoom").onchange = e => { pushUndo(); c.zoom = e.target.value; drawFrame(); }; bindXform(c);
  } else if (c.type === "text") {
    box.innerHTML = `''')
rep('''  const trs = $("#iTrack"); if (trs) { tracksOf(c.type).forEach(''','''  const trs = $("#iTrack"); if (trs) { tracksOf(ttype(c)).forEach(''')
rep("function layoutLabels(c) {", r'''const XFORM_HTML = (c, ov) => {
  const cr = c.crop || {}, a = c.adj || {}, R = (id, lab, min, max, step, val) => `<div class="rng"><label for="${id}">${lab}</label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}"><span id="${id}V"></span></div>`;
  return `<div class="sect" id="xform"><h4>Biến đổi</h4>
    <div class="row"><button id="xFlip" aria-pressed="${!!c.flip}">${c.flip ? "Bỏ lật" : "Lật ngang"}</button><button id="xRot">Xoay 90° (${c.rot || 0}°)</button>${media.get(c.mediaId)?.kind === "video" && !c.freeze ? `<button id="xRev" aria-pressed="${!!c.reverse}">${c.reverse ? "Bỏ đảo ngược" : "Đảo ngược"}</button>` : ""}</div>
    ${R("xSc", "Phóng to", 0.2, 3, 0.01, c.scale || 1)}${R("xX", "Vị trí X", -1, 1, 0.01, c.x || 0)}${R("xY", "Vị trí Y", -1, 1, 0.01, c.y || 0)}${ov ? R("xOp", "Độ mờ", 0, 1, 0.01, c.opacity == null ? 1 : c.opacity) : ""}
    <button id="xReset">Đặt lại biến đổi</button></div>
    <div class="sect"><h4>Cắt khung</h4>${R("cL", "Trái", 0, 0.45, 0.01, cr.l || 0)}${R("cR", "Phải", 0, 0.45, 0.01, cr.r || 0)}${R("cT", "Trên", 0, 0.45, 0.01, cr.t || 0)}${R("cB", "Dưới", 0, 0.45, 0.01, cr.b || 0)}</div>
    <div class="sect"><h4>Điều chỉnh màu</h4>${R("aB", "Độ sáng", -0.5, 0.5, 0.01, a.b || 0)}${R("aC", "Tương phản", -0.5, 0.5, 0.01, a.c || 0)}${R("aS", "Bão hoà", -1, 1, 0.01, a.s || 0)}</div>`;
};
function bindXform(c) {
  const once = (() => { let done = false; return () => { if (!done) { pushUndo(); done = true; } }; })();
  const bindR = (id, get, set, f = v => (+v).toFixed(2)) => { const el = $("#" + id); if (!el) return; const lab = $("#" + id + "V"); lab.textContent = f(get()); el.onpointerdown = once; el.onkeydown = once; el.oninput = e => { set(+e.target.value); lab.textContent = f(+e.target.value); drawFrame(); }; el.onchange = () => renderTimeline(); };
  bindR("xSc", () => c.scale || 1, v => c.scale = v, v => Math.round(v * 100) + "%"); bindR("xX", () => c.x || 0, v => c.x = v); bindR("xY", () => c.y || 0, v => c.y = v);
  bindR("xOp", () => c.opacity == null ? 1 : c.opacity, v => c.opacity = v, v => Math.round(v * 100) + "%");
  const crop = k => v => { c.crop = Object.assign({}, c.crop, { [k]: v }); }; bindR("cL", () => (c.crop || {}).l || 0, crop("l")); bindR("cR", () => (c.crop || {}).r || 0, crop("r")); bindR("cT", () => (c.crop || {}).t || 0, crop("t")); bindR("cB", () => (c.crop || {}).b || 0, crop("b"));
  const adj = k => v => { c.adj = Object.assign({}, c.adj, { [k]: v }); }; bindR("aB", () => (c.adj || {}).b || 0, adj("b")); bindR("aC", () => (c.adj || {}).c || 0, adj("c")); bindR("aS", () => (c.adj || {}).s || 0, adj("s"));
  $("#xFlip").onclick = () => { pushUndo(); c.flip = !c.flip; renderAll(); };
  $("#xRot").onclick = () => { pushUndo(); c.rot = ((c.rot || 0) + 90) % 360; renderAll(); };
  const rv = $("#xRev"); if (rv) rv.onclick = () => { pushUndo(); c.reverse = !c.reverse; renderAll(); };
  $("#xReset").onclick = () => { pushUndo(); delete c.flip; delete c.rot; delete c.scale; delete c.x; delete c.y; delete c.opacity; delete c.crop; delete c.adj; renderAll(); };
}
function layoutLabels(c) {''')

# ================= pointer interactions =================
rep('''  const k = clipD.dataset.k, id = clipD.dataset.id, list = k === "v" ? V : C, c = list.find(x => x.id === id); if (!c) return;
  const m = c.mediaId ? media.get(c.mediaId) : null;''','''  const k = clipD.dataset.k, id = clipD.dataset.id, list = k === "v" ? V : C, c = list.find(x => x.id === id); if (!c) return;
  const m = c.mediaId ? media.get(c.mediaId) : null;
  if (tool === "blade") { if (isLocked(clipTrack(k, c))) { toast("Track đang khoá."); return; } const x = snapTime(laneX(e), null).v; const st = vStarts(), s0 = k === "v" ? st[V.indexOf(c)] : c.start, L = k === "v" ? vlen(c) : clen(c); if (x > s0 + 0.03 && x < s0 + L - 0.03) { pushUndo(); const b = k === "v" ? splitV(c, x - s0) : splitC(c, x); sel = { k, id: b.id }; t = x; renderAll(); } return; }
  if (isLocked(clipTrack(k, c))) { sel = { k, id }; renderInspector(); syncButtons(); toast("Track đang khoá. Mở khoá ở đầu track để sửa."); return; }''')
rep('''  const handle = e.target.dataset.h, x0 = e.clientX, orig = { ...c }; let moved = false, insEl = null; const before = snapshot();''',
    '''  const handle = e.target.dataset.h, x0 = e.clientX, orig = { ...c }; let moved = false, insEl = null; const before = snapshot(), beforeMap = vMap();
  const vi = V.indexOf(c), nextV = k === "v" ? V[vi + 1] : null, origNextGap = nextV ? (nextV.gap || 0) : 0, origL = k === "v" ? vlen(c) : 0;''')
rep('''    if (k === "v") {
      if (handle === "l") { c.in = clamp(orig.in + dx, 0, orig.out - MINLEN); layoutClips(); }
      else if (handle === "r") { c.out = clamp(orig.out + dx, orig.in + MINLEN, maxD); layoutClips(); }
      else {''','''    if (k === "v") {
      if (handle === "l") {
        if (c.freeze) { const d = clamp(dx, -(orig.gap || 0) * (magnetOn ? 0 : 1) - (magnetOn ? 0 : 0), orig.dur - MINLEN); c.dur = orig.dur - d; if (!magnetOn) c.gap = (orig.gap || 0) + d; }
        else { const lo = magnetOn ? 0 : Math.max(0, orig.in - (orig.gap || 0)); c.in = clamp(orig.in + dx, Math.min(lo, orig.in), orig.out - MINLEN); if (!magnetOn) c.gap = Math.max(0, (orig.gap || 0) + (c.in - orig.in)); }
        layoutClips();
      }
      else if (handle === "r") {
        if (c.freeze) c.dur = Math.max(MINLEN, orig.dur + dx); else c.out = clamp(orig.out + dx, orig.in + MINLEN, magnetOn || !nextV ? maxD : Math.min(maxD, orig.out + origNextGap));
        if (!magnetOn && nextV) nextV.gap = Math.max(0, origNextGap - (vlen(c) - origL));
        layoutClips();
      }
      else if (!magnetOn) {
        const g0 = orig.gap || 0; let ng = Math.max(0, g0 + dx); if (nextV) ng = Math.min(ng, g0 + origNextGap); c.gap = ng; if (nextV) nextV.gap = g0 + origNextGap - ng; layoutClips();
      }
      else {''')
rep('''        const tr = trackAtY(ev.clientY); if (tr && tr.type === c.type && tr.id !== c.track) { c.track = tr.id; contentEl[tr.id].appendChild(clipD); }''',
    '''        const tr = trackAtY(ev.clientY); if (tr && tr.type === ttype(c) && tr.id !== c.track && !tr.lock) { c.track = tr.id; contentEl[tr.id].appendChild(clipD); }''')
rep('''    if (k === "v" && !handle && clipD._idx != null) { const i = V.indexOf(c); V.splice(i, 1); V.splice(clipD._idx, 0, c); }
    undoStack.push(before);''','''    if (k === "v" && !handle && clipD._idx != null) { const i = V.indexOf(c); V.splice(i, 1); V.splice(clipD._idx, 0, c); }
    if (k === "v") linkShift(beforeMap);
    undoStack.push(before);''')
# scrub & markers & hover
rep('''  if (!clipD) { if (e.target.closest(".thead")) return; if (e.target.closest(".tcontent")) scrub(e); return; }''',
    '''  if (!clipD) { if (e.target.closest(".thead")) return; const mk = e.target.closest(".marker"); if (mk) { seek(+mk.dataset.t); return; } if (e.target.closest(".tcontent")) scrub(e); return; }''')
rep('''grid.addEventListener("dblclick", e => {''','''grid.addEventListener("dblclick", e => { const mk = e.target.closest(".marker"); if (mk) { pushUndo(); markers = markers.filter(m => Math.abs(m - +mk.dataset.t) > 1e-3); renderTimeline(); return; } });
let hoverLineEl = null;
grid.addEventListener("pointermove", e => { if (!hoverOn || playing || e.buttons) return; const x = laneX(e); if (x < 0) return; hoverT = clamp(x, 0, total()); if (!hoverLineEl || !hoverLineEl.isConnected) { hoverLineEl = document.createElement("div"); hoverLineEl.className = "hoverline"; grid.appendChild(hoverLineEl); } hoverLineEl.style.left = (headW() + hoverT * pps) + "px"; drawFrame(); });
grid.addEventListener("pointerleave", () => { if (hoverT == null) return; hoverT = null; hoverLineEl && hoverLineEl.remove(); drawFrame(); });
grid.addEventListener("dblclick", e => {''')
# snap to markers
rep("  const cands = [0, t], st = vStarts();", "  const cands = [0, t, ...markers], st = vStarts();")
# insertIndex with gaps uses vlen only; fine when magnet on.

# ================= library drag onto overlay tracks =================
rep('''    } else if (m.kind === "audio" && tr.type === "audio") {''','''    } else if (m.kind !== "audio" && tr.type === "overlay" && !tr.lock) {
      contentEl[tr.id].classList.add("over"); const s = snapTime(Math.max(0, x), null).v;
      insEl = document.createElement("div"); insEl.className = "insert"; insEl.style.left = (s * pps - 1) + "px"; contentEl[tr.id].appendChild(insEl);
      target = { mode: "overlay", track: tr.id, start: s };
    } else if (m.kind === "audio" && tr.type === "audio" && !tr.lock) {''')
rep('''    else { appendMedia(m, null, { track: tg.track, start: tg.start }); toast("Đã thêm " + m.name); }
  };''','''    else if (tg.mode === "overlay") { appendMedia(m, null, { overlay: tg.track, start: tg.start }); toast("Đã thêm " + m.name + " vào track phủ"); }
    else { appendMedia(m, null, { track: tg.track, start: tg.start }); toast("Đã thêm " + m.name); }
  };''')
rep('''    if (m.kind !== "audio" && tr.type === "video") {''','''    if (m.kind !== "audio" && tr.type === "video" && !tr.lock) {''')

# ================= toolbar wiring =================
rep('''$("#splitBtn").onclick = splitAtPlayhead; $("#delBtn").onclick = deleteSel; $("#dupBtn").onclick = duplicateSel;''','''$("#splitBtn").onclick = splitAtPlayhead; $("#delBtn").onclick = deleteSel; $("#dupBtn").onclick = duplicateSel;
$("#delLBtn").onclick = () => deleteSide("left"); $("#delRBtn").onclick = () => deleteSide("right"); $("#markBtn").onclick = toggleMarker;
$("#freezeBtn").onclick = () => freezeFrame(3);
$("#revBtn").onclick = () => setProp(c => { if (media.get(c.mediaId)?.kind !== "video" || c.freeze) return; c.reverse = !c.reverse; }, c => c.reverse ? "Đã đảo ngược clip (xem trước có thể giật, bản xuất mượt)." : "Đã bỏ đảo ngược.");
$("#flipBtn").onclick = () => setProp(c => { c.flip = !c.flip; }, c => c.flip ? "Đã lật ngang." : "Đã bỏ lật.");
$("#rotBtn").onclick = () => setProp(c => { c.rot = ((c.rot || 0) + 90) % 360; }, c => "Xoay " + c.rot + "°");
$("#cropBtn").onclick = () => { const tv = targetVideo(); if (!tv) { toast("Chọn một clip video trước."); return; } sel = { k: tv.k, id: tv.c.id }; renderAll(); showTab("insp"); setTimeout(() => $("#xform")?.scrollIntoView({ block: "start" }), 30); };
function setTool(tl) { tool = tl; document.body.classList.toggle("blade", tl === "blade"); $("#toolIco").innerHTML = tl === "blade" ? '<svg class="i" viewBox="0 0 24 24"><path d="M14 3l7 7-11 11H3v-7z"/><path d="M11 6l7 7"/></svg>' : '<svg class="i" viewBox="0 0 24 24"><path d="M5 3l14 8-6 2-2 6z"/></svg>'; toast(tl === "blade" ? "Chế độ dao cắt: bấm vào clip để tách tại điểm bấm. Phím A để quay lại." : "Chế độ chọn."); }
$("#toolBtn").onclick = e => openMenu(e.currentTarget, [{ label: "Chọn", kbd: "A", run: () => setTool("select") }, { label: "Dao cắt", kbd: "B", run: () => setTool("blade") }]);
$("#addBtn").onclick = e => openMenu(e.currentTarget, [
  { h: "Media" }, { label: "Nhập video, ảnh, nhạc…", run: () => $("#file").click() }, { label: "Thêm chữ tại kim", run: () => addText({ track: tracksOf("text")[0]?.id }) },
  { h: "Track" }, { label: "Thêm track video phủ", run: () => { pushUndo(); addTrack("overlay"); renderAll(); toast("Kéo video hoặc ảnh từ Thư viện vào track phủ."); } },
  { label: "Thêm track chữ", run: () => { pushUndo(); addTrack("text"); renderAll(); } }, { label: "Thêm track âm thanh", run: () => { pushUndo(); addTrack("audio"); renderAll(); } }]);
$("#magBtn").onclick = e => { magnetOn = !magnetOn; e.currentTarget.setAttribute("aria-pressed", magnetOn); if (magnetOn && V.some(c => c.gap)) { pushUndo(); const before = vMap(); V.forEach(c => delete c.gap); linkShift(before); renderAll(); } toast(magnetOn ? "Nam châm bật: các cảnh track chính tự nối liền." : "Nam châm tắt: kéo cảnh track chính để tạo khoảng trống."); };
$("#linkBtn").onclick = e => { linkOn = !linkOn; e.currentTarget.setAttribute("aria-pressed", linkOn); toast(linkOn ? "Liên kết bật: chữ, SFX và video phủ ngắn đi theo cảnh." : "Liên kết tắt."); };
$("#hovBtn").onclick = e => { hoverOn = !hoverOn; e.currentTarget.setAttribute("aria-pressed", hoverOn); if (!hoverOn) { hoverT = null; hoverLineEl && hoverLineEl.remove(); drawFrame(); } };
const setZoom = v => { const center = t; pps = clamp(v, 6, 260); $("#zoom").value = pps; renderTimeline(); scroller.scrollLeft = Math.max(0, center * pps - (scroller.clientWidth - headW()) / 2); };
$("#zoomIn").onclick = () => setZoom(pps * 1.4); $("#zoomOut").onclick = () => setZoom(pps / 1.4); $("#zoomFit").onclick = () => { pps = clamp((scroller.clientWidth - headW() - 30) / Math.max(1, total()), 2, 260); $("#zoom").value = pps; renderTimeline(); scroller.scrollLeft = 0; };
/* voice-over recording */
let recState = null;
$("#recBtn").onclick = async () => {
  if (recState) { recState.rec.stop(); return; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast("Trình duyệt này không thu âm được."); return; }
  let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { toast(ON_CLAUDE ? "Trang trên claude.ai không được dùng micro. Thu âm ở VINCut bản trên máy." : "Không mở được micro. Kiểm tra quyền micro của trình duyệt."); return; }
  const rec = new MediaRecorder(stream), chunks = [], t0 = t; recState = { rec };
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  rec.onstop = async () => { stream.getTracks().forEach(x => x.stop()); pause(); $("#recBtn").classList.remove("rec"); recState = null; const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" }); const n = [...media.values()].filter(m => /^Thu âm/.test(m.name)).length + 1; const m = await addMediaFile(new File([blob], `Thu âm ${n}.webm`, { type: blob.type.startsWith("audio") ? blob.type : "audio/webm" }), `Thu âm ${n}`); if (m) { const tr = tracksOf("audio").find(x => /voice|thu âm/i.test(x.name)) || addTrack("audio"); appendMedia(m, null, { track: tr.id, start: t0 }); toast("Đã thêm bản thu vào " + tr.name); } };
  rec.start(); $("#recBtn").classList.add("rec"); toast("Đang thu âm… bấm nút micro lần nữa để dừng."); if (!playing) play();
};''')
# keyboard shortcuts
rep('''  else if (k === "s" && !e.ctrlKey && !e.metaKey) splitAtPlayhead();''','''  else if ((k === "s" && !e.ctrlKey && !e.metaKey) || (k === "b" && (e.ctrlKey || e.metaKey))) { e.preventDefault(); splitAtPlayhead(); }
  else if (k === "b") setTool("blade");
  else if (k === "a" && !e.ctrlKey && !e.metaKey) setTool("select");
  else if (k === "q") deleteSide("left");
  else if (k === "w") deleteSide("right");
  else if (k === "m") toggleMarker();
  else if (k === "escape") { closeMenu(); if (tool === "blade") setTool("select"); }''')
# syncButtons with new buttons
rep('''function syncButtons() { $("#undoBtn").disabled = !undoStack.length; $("#redoBtn").disabled = !redoStack.length; const c = findSel(); $("#delBtn").disabled = !c; $("#dupBtn").disabled = !c;''',
    '''function syncButtons() { $("#undoBtn").disabled = !undoStack.length; $("#redoBtn").disabled = !redoStack.length; const c = findSel(); $("#delBtn").disabled = !c; $("#dupBtn").disabled = !c; $("#magBtn").setAttribute("aria-pressed", magnetOn);''')
# help text
rep('''<kbd>Space</kbd> phát/dừng · <kbd>S</kbd> cắt · <kbd>T</kbd> chọn đoạn · <kbd>Delete</kbd> xoá · <kbd>D</kbd> nhân bản · <kbd>←</kbd><kbd>→</kbd> từng khung · <kbd>Ctrl</kbd>+<kbd>Z</kbd> hoàn tác</div>`;''',
    '''<kbd>Space</kbd> phát/dừng · <kbd>S</kbd>/<kbd>Ctrl</kbd>+<kbd>B</kbd> tách · <kbd>Q</kbd>/<kbd>W</kbd> xoá trái/phải · <kbd>A</kbd> chọn · <kbd>B</kbd> dao cắt · <kbd>M</kbd> marker · <kbd>T</kbd> chọn đoạn · <kbd>Delete</kbd> xoá · <kbd>D</kbd> nhân bản · <kbd>←</kbd><kbd>→</kbd> từng khung · <kbd>Ctrl</kbd>+<kbd>Z</kbd> hoàn tác</div>`;''')

# ================= project save / load =================
rep('''return JSON.stringify({ format: "vincut", version: 1, saved: new Date().toISOString(), name: projName, aspect: $("#aspect").value, tracks, media: med, V, C }, null, 1);''',
    '''return JSON.stringify({ format: "vincut", version: 2, saved: new Date().toISOString(), name: projName, aspect: $("#aspect").value, tracks, media: med, V, C, markers, coverT }, null, 1);''')
rep('''  tracks = o.tracks; V = o.V; C = o.C; projName = o.name || projName;''','''  tracks = o.tracks; V = o.V; C = o.C; markers = o.markers || []; coverT = o.coverT ?? null; projName = o.name || projName;''')

# ================= assistant: state + ops =================
rep('''    audio_columns: ["id", "track", "media", "start", "end", "in", "out", "volume_db"],''','''    audio_columns: ["id", "track", "media", "start", "end", "in", "out", "volume_db"],
    overlay: C.filter(c => c.type === "video").map(c => [c.id, c.track, c.mediaId, r(c.start), r(cend(c)), r(c.in), r(c.out)]),
    overlay_columns: ["id", "track", "media", "start", "end", "in", "out"],
    video_extra: V.filter(c => c.freeze || c.reverse || c.flip || c.rot || c.scale || c.crop || c.adj || c.gap).map(c => ({ id: c.id, freeze: c.freeze || undefined, reverse: c.reverse || undefined, flip: c.flip || undefined, rot: c.rot || undefined, scale: c.scale, gap: c.gap, crop: c.crop, adj: c.adj })),
    markers, magnet: magnetOn, link: linkOn,''')
rep('''    case "track": {''','''    case "set": {
      const f = need(o.clip), c = f.c, pr = o.props || {}; if (f.k === "c" && c.type !== "video") throw new Error("set chỉ dùng cho clip video hoặc video phủ");
      sel = { k: f.k, id: c.id }; renderTimeline(); await pointAtClip(c.id, "m"); await ghostClick(); showTab("insp"); renderInspector(); await sleep(60);
      const ok = ["flip", "rot", "scale", "x", "y", "opacity", "crop", "adj", "reverse", "zoom"]; for (const k2 of ok) if (pr[k2] !== undefined) c[k2] = pr[k2];
      const xf = $("#xform"); if (xf) { xf.scrollIntoView({ block: "nearest" }); await ghostTo(...centerOf(xf)); await ghostClick(); }
      renderInspector(); renderTimeline(); drawFrame(); await sleep(200); showTab("ai"); return "Cập nhật biến đổi/màu cho " + mediaName(c.mediaId);
    }
    case "freeze": { seek(clamp(+o.time || t, 0, total())); const b = $("#freezeBtn"); await ghostTo(...centerOf(b)); await ghostClick(); freezeFrame(+o.duration || 3); return "Đứng hình tại " + fmt(t); }
    case "delete_left": case "delete_right": { seek(clamp(+o.time, 0, total())); if (o.clip) { const f = need(o.clip); sel = { k: f.k, id: f.c.id }; } const b = $(kind === "delete_left" ? "#delLBtn" : "#delRBtn"); await ghostTo(...centerOf(b)); await ghostClick(); deleteSide(kind === "delete_left" ? "left" : "right"); return (kind === "delete_left" ? "Xoá bên trái " : "Xoá bên phải ") + fmt(t); }
    case "marker": { seek(clamp(+o.time || 0, 0, total())); const b = $("#markBtn"); await ghostTo(...centerOf(b)); await ghostClick(); toggleMarker(); return "Marker tại " + fmt(t); }
    case "add_overlay": {
      const m = media.get(String(o.media)); if (!m || m.kind === "audio") throw new Error("Không có video/ảnh " + o.media);
      let tr = o.track && trackById(o.track)?.type === "overlay" ? trackById(o.track) : tracksOf("overlay")[0]; if (!tr) tr = addTrack("overlay");
      const item = document.querySelector(`.mitem[data-mid="${m.id}"]`); if (item) { item.scrollIntoView({ block: "nearest" }); await ghostTo(...centerOf(item)); await ghostClick(); }
      renderTimeline(); const st0 = Math.max(0, +o.start || 0); const [x, y] = screenAt(st0, tr.id); await ghostTo(x + 6, y, 600);
      const c = { id: nid("c"), track: tr.id, type: "video", mediaId: m.id, start: st0, in: Math.max(0, +o.in || 0), out: 0, vol: 0, muted: false, zoom: "none", scale: o.scale != null ? +o.scale : 1, x: +o.x || 0, y: +o.y || 0 };
      c.out = Math.min(m.kind === "image" ? 600 : m.duration, c.in + (+o.duration || (m.kind === "image" ? 3 : m.duration))); C.push(c); renderTimeline(); return `Thêm ${m.name} vào ${tr.name} từ ${fmt(c.start)}`;
    }
    case "track": {''')
rep('''- seek {time} · aspect {value}`;''','''- set {clip, props:{flip, rot (0/90/180/270), scale, x, y (-1..1), opacity, crop:{l,r,t,b} (0..0.45), adj:{b,c,s} (-0.5..0.5), reverse, zoom}} — biến đổi, cắt khung, chỉnh màu, đảo ngược clip video hoặc video phủ.
- freeze {time, duration} — chèn khung đứng. · delete_left / delete_right {time, clip?} — xoá phần trái/phải kim. · marker {time}
- add_overlay {media, start, in?, duration?, track?, scale?, x?, y?} — thêm video/ảnh vào track video phủ (picture-in-picture).
- seek {time} · aspect {value}`;''')

open(P, "w").write(p)
s = re.search(r'<script>(.*)</script>', p, re.S).group(1); open('/tmp/claude-0/chk.js', 'w').write(s)
print("patched")
