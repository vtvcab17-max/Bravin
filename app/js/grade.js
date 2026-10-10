"use strict";
/* ============================================================================
   Colour page in the spirit of DaVinci Resolve (own implementation).
   Serial correction nodes per clip (c.nodes); each node: Lift/Gamma/Gain/
   Offset wheels + master, Contrast/Pivot, Saturation, Hue, Temp/Tint,
   Custom YRGB curves, Hue-vs-Hue/Sat/Lum, Lum-vs-Sat, Sat-vs-Sat,
   Qualifier (HSL key), Power Windows (shared mask engine, trackable),
   Blur/Sharpen, Key gain. Viewer with before/after wipe, scopes, gallery
   stills, copy/paste grade, clip strip.
   ========================================================================== */
const NODE_DEF = () => ({ id: nid("nd"), name: "", on: true, lift: null, gamma: null, gain: null, offs: null, con: 0, piv: 0.435, sat: 1, hue: 0, temp: 0, tint: 0, curves: null, hcur: null, q: null, win: null, blur: 0, sharp: 0, key: 1 });
const nodeActive = n => n && n.on !== false;
const hasNodes = c => !!(c && c.nodes && c.nodes.some(nodeActive)) && !window.__noGrade;

/* ---------- curve tables ---------- */
function periodicTable(pts) { const P = (pts && pts.length ? pts : [[0, 0.5], [1, 0.5]]).slice().sort((a, b) => a[0] - b[0]); const ext = [[P[P.length - 1][0] - 1, P[P.length - 1][1]], ...P, [P[0][0] + 1, P[0][1]]]; return curveTable(ext); }
function flatTable(pts) { return curveTable(pts && pts.length ? pts : [[0, 0.5], [1, 0.5]]); }
const isFlat = p => !p || p.every(q => Math.abs(q[1] - 0.5) < 1e-3);
const _nodeTexCache = new Map();
function nodeCurveTex(n) {
  const cu = n.curves || {}, hc = n.hcur || {}, key = JSON.stringify([cu, hc]); if (_nodeTexCache.has(key)) return _nodeTexCache.get(key);
  const Y = curveTable(cu.y), R = curveTable(cu.r), G = curveTable(cu.g), B = curveTable(cu.b), HH = periodicTable(hc.hh), HS = periodicTable(hc.hs), HL = periodicTable(hc.hl), LS = flatTable(hc.ls), SS = flatTable(hc.ss);
  const d = new Uint8Array(256 * 3 * 4); const put = (row, j, a, b, c2, e) => { const i = (row * 256 + j) * 4; d[i] = a * 255; d[i + 1] = b * 255; d[i + 2] = c2 * 255; d[i + 3] = e * 255; };
  for (let j = 0; j < 256; j++) { put(0, j, R[j], G[j], B[j], Y[j]); put(1, j, HH[j], HS[j], HL[j], LS[j]); put(2, j, SS[j], 0, 0, 1); }
  const o = { key: "nc" + hashStr(key), data: d, curves: !["y", "r", "g", "b"].every(k => isIdentityCurve(cu[k])), hues: !["hh", "hs", "hl", "ls", "ss"].every(k => isFlat(hc[k])) };
  if (_nodeTexCache.size > 60) _nodeTexCache.clear(); _nodeTexCache.set(key, o); return o;
}

/* ---------- grading shader ---------- */
const GRADE = (() => {
  let cnv = null, gl = null, prog = null, tex = null, mtex = null, ctex = null, ctKey = "", U = {}, ok = null;
  const VS = `attribute vec2 p; varying vec2 uv; void main(){ uv = vec2((p.x+1.)*.5, 1.-(p.y+1.)*.5); gl_Position = vec4(p,0.,1.); }`;
  const FS = `precision mediump float; varying vec2 uv; uniform sampler2D T, MK, CV; uniform vec2 res;
  uniform vec4 lift, gam, gain, offs; uniform float con, piv, sat, hue, temp, tint, cvOn, hcOn, mkOn, keyGain, blurR, sharp, show;
  uniform float qOn, qH, qHw, qHs, qS0, qS1, qL0, qL1, qSoft, qInv;
  vec3 hueRot(vec3 col, float a){ const vec3 k = vec3(0.57735); float ca = cos(a); return col*ca + cross(k,col)*sin(a) + k*dot(k,col)*(1.-ca); }
  vec3 rgb2hsv(vec3 c){ vec4 K = vec4(0., -1./3., 2./3., -1.); vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g)); vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r)); float d = q.x - min(q.w, q.y); return vec3(abs(q.z + (q.w - q.y) / (6.*d + 1e-10)), d / (q.x + 1e-10), q.x); }
  vec3 hsv2rgb(vec3 c){ vec3 p = abs(fract(c.xxx + vec3(1., 2./3., 1./3.)) * 6. - 3.); return c.z * mix(vec3(1.), clamp(p - 1., 0., 1.), c.y); }
  vec4 cv(float x, float row){ return texture2D(CV, vec2(clamp(x, 0., 1.) * 255./256. + .5/256., (row + .5) / 3.)); }
  void main(){
    vec4 t0 = texture2D(T, uv); float a = t0.a; vec3 inp = a > 0.001 ? t0.rgb : vec3(0.); vec3 col = inp;
    if (blurR > 0.) { vec3 s = vec3(0.); for (int i = -2; i <= 2; i++) for (int j = -2; j <= 2; j++) s += texture2D(T, uv + vec2(float(i), float(j)) * blurR / res * .5).rgb; col = s / 25.; }
    if (sharp > 0.) { vec2 px = 1.5 / res; vec3 bl = (texture2D(T, uv + vec2(px.x, 0.)).rgb + texture2D(T, uv - vec2(px.x, 0.)).rgb + texture2D(T, uv + vec2(0., px.y)).rgb + texture2D(T, uv - vec2(0., px.y)).rgb) * .25; col += (col - bl) * sharp * 2.5; }
    col += offs.rgb + offs.w;
    vec3 G = 1. + gain.rgb + gain.w, L = lift.rgb + lift.w, Gm = 1. + gam.rgb + gam.w;
    col = col * G; col = col + L * (1. - col); col = sign(col) * pow(abs(col), 1. / max(vec3(.05), Gm));
    col = (col - piv) * (1. + con) + piv;
    col.r += temp * .08; col.b -= temp * .08; col.g -= tint * .06;
    float l0 = dot(col, vec3(.2126, .7152, .0722)); col = mix(vec3(l0), col, sat);
    if (hue != 0.) col = hueRot(col, hue);
    if (cvOn > 0.) { vec3 c2 = clamp(col, 0., 1.); c2 = vec3(cv(c2.r, 0.).a, cv(c2.g, 0.).a, cv(c2.b, 0.).a); col = vec3(cv(c2.r, 0.).r, cv(c2.g, 0.).g, cv(c2.b, 0.).b); }
    if (hcOn > 0.) { vec3 hv = rgb2hsv(clamp(col, 0., 1.)); vec4 hc = cv(hv.x, 1.); float ly = dot(clamp(col, 0., 1.), vec3(.2126, .7152, .0722));
      hv.x = fract(hv.x + (hc.r - .5)); hv.y = clamp(hv.y * hc.g * 2. * cv(ly, 1.).a * 2. * cv(hv.y, 2.).r * 2., 0., 1.); hv.z = clamp(hv.z * (1. + (hc.b - .5) * 2.), 0., 1.); col = hsv2rgb(hv); }
    float m = 1.;
    if (qOn > 0.) { vec3 hv = rgb2hsv(clamp(inp, 0., 1.)); float lu = dot(clamp(inp, 0., 1.), vec3(.2126, .7152, .0722)); float dh = abs(fract(hv.x - qH + .5) - .5);
      float mh = qHw >= .5 ? 1. : 1. - smoothstep(qHw, qHw + qHs + .001, dh); float ms = smoothstep(qS0 - qSoft - .001, qS0, hv.y) * (1. - smoothstep(qS1, qS1 + qSoft + .001, hv.y)); float ml = smoothstep(qL0 - qSoft - .001, qL0, lu) * (1. - smoothstep(qL1, qL1 + qSoft + .001, lu));
      float q = mh * ms * ml; if (qInv > 0.) q = 1. - q; m *= q; }
    if (mkOn > 0.) m *= texture2D(MK, uv).a;
    m = clamp(m * keyGain, 0., 1.);
    vec3 outc = mix(inp, col, m);
    if (show > 0.) outc = mix(vec3(dot(inp, vec3(.2126, .7152, .0722)) * .22 + .05), col, m);
    gl_FragColor = vec4(clamp(outc, 0., 1.) * a, a);
  }`;
  function init() {
    if (ok !== null) return ok;
    try {
      cnv = document.createElement("canvas"); gl = cnv.getContext("webgl", { premultipliedAlpha: true, preserveDrawingBuffer: true, alpha: true }); if (!gl) return ok = false;
      const sh = (ty, src) => { const s = gl.createShader(ty); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog); if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog)); gl.useProgram(prog);
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW); const loc = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      const mk = nearest => { const t2 = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t2); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, nearest ? gl.NEAREST : gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, nearest ? gl.NEAREST : gl.LINEAR); return t2; };
      tex = mk(); mtex = mk(); ctex = mk();
      for (const n of ["T", "MK", "CV", "res", "lift", "gam", "gain", "offs", "con", "piv", "sat", "hue", "temp", "tint", "cvOn", "hcOn", "mkOn", "keyGain", "blurR", "sharp", "show", "qOn", "qH", "qHw", "qHs", "qS0", "qS1", "qL0", "qL1", "qSoft", "qInv"]) U[n] = gl.getUniformLocation(prog, n);
      gl.uniform1i(U.T, 0); gl.uniform1i(U.MK, 1); gl.uniform1i(U.CV, 2); return ok = true;
    } catch (e) { console.warn("grade shader off", e); return ok = false; }
  }
  const W4 = (w, k = 0.25) => { if (!w) return [0, 0, 0, 0]; const x = w.x || 0, y = w.y || 0, am = Math.hypot(x, y), h = Math.atan2(y, x); return [Math.cos(h) * am * k, Math.cos(h - 2.0944) * am * k, Math.cos(h + 2.0944) * am * k, (w.l || 0) * k]; };
  function run(srcCanvas, n, matte, show) {
    if (!init()) return null; const W = srcCanvas.width, H = srcCanvas.height; if (cnv.width !== W || cnv.height !== H) { cnv.width = W; cnv.height = H; } gl.viewport(0, 0, W, H);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, srcCanvas); } catch (e) { return null; }
    gl.uniform2f(U.res, W, H); gl.uniform4fv(U.lift, W4(n.lift, 0.3)); gl.uniform4fv(U.gam, W4(n.gamma, 0.5)); gl.uniform4fv(U.gain, W4(n.gain, 0.6)); gl.uniform4fv(U.offs, W4(n.offs, 0.15));
    gl.uniform1f(U.con, n.con || 0); gl.uniform1f(U.piv, n.piv == null ? 0.435 : n.piv); gl.uniform1f(U.sat, n.sat == null ? 1 : n.sat); gl.uniform1f(U.hue, (n.hue || 0) * Math.PI / 180); gl.uniform1f(U.temp, n.temp || 0); gl.uniform1f(U.tint, n.tint || 0);
    const ct = nodeCurveTex(n); gl.uniform1f(U.cvOn, ct.curves ? 1 : 0); gl.uniform1f(U.hcOn, ct.hues ? 1 : 0);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, ctex); if (ctKey !== ct.key) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 3, 0, gl.RGBA, gl.UNSIGNED_BYTE, ct.data); ctKey = ct.key; }
    const q = n.q && n.q.on ? n.q : null; gl.uniform1f(U.qOn, q ? 1 : 0);
    if (q) { gl.uniform1f(U.qH, (q.h || 0) / 360); gl.uniform1f(U.qHw, (q.hw == null ? 25 : q.hw) / 360); gl.uniform1f(U.qHs, (q.hs == null ? 12 : q.hs) / 360); gl.uniform1f(U.qS0, q.s0 == null ? 0.1 : q.s0); gl.uniform1f(U.qS1, q.s1 == null ? 1 : q.s1); gl.uniform1f(U.qL0, q.l0 == null ? 0 : q.l0); gl.uniform1f(U.qL1, q.l1 == null ? 1 : q.l1); gl.uniform1f(U.qSoft, q.soft == null ? 0.08 : q.soft); gl.uniform1f(U.qInv, q.inv ? 1 : 0); }
    gl.uniform1f(U.mkOn, matte ? 1 : 0); if (matte) { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, mtex); try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, matte); } catch (_) {} }
    gl.uniform1f(U.keyGain, n.key == null ? 1 : n.key); gl.uniform1f(U.blurR, n.blur || 0); gl.uniform1f(U.sharp, n.sharp || 0); gl.uniform1f(U.show, show ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); return cnv;
  }
  return { run, available: () => init() };
})();
function applyNodes(ctx, c, lt, T) {
  if (!c.nodes) return; const W = ctx.canvas.width, H = ctx.canvas.height;
  c.nodes.forEach((n, i) => {
    if (!nodeActive(n)) return; const matte = n.win && n.win.length ? drawMaskSet(n.win, W, H, lt, "nwin") : null;
    const show = cp.open && cp.clip === c && cp.highlight && cp.node === i;
    const out = GRADE.run(ctx.canvas, n, matte, show); if (!out) return;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = "copy"; ctx.globalAlpha = 1; ctx.filter = "none"; ctx.drawImage(out, 0, 0, W, H); ctx.restore();
  });
}

/* ---------- colour page ---------- */
const cp = { open: false, clip: null, node: 0, tab: "wheels", split: false, wipe: 0.5, highlight: false, hc: "hh", cch: "y", el: null };
let gradeClipboard = null;
function cpTarget() { const c = findSel(); if (c && (sel.k === "v" || c.type === "video" || (c.type === "fx" && c.fxType === "filter"))) return c; const a = activeVideo(t); return a ? a.c : null; }
function stillsLoad() { try { return JSON.parse(localStorage.getItem("vincut-stills") || "[]"); } catch (_) { return []; } }
function stillsSave(L) { try { localStorage.setItem("vincut-stills", JSON.stringify(L.slice(-40))); return true; } catch (_) { toast("Không lưu được still (bộ nhớ trình duyệt đầy hoặc bị chặn)."); return false; } }
const freshNodes = L => (L || []).map(n => Object.assign(deep(n), { id: nid("nd"), win: n.win ? deep(n.win).map(m => Object.assign(m, { id: nid("mk") })) : null }));
function openColorPage() {
  const c = cpTarget(); if (!c) { toast("Chọn một clip video (hoặc lớp bộ lọc) để chỉnh màu."); return; }
  if (playing) pause(); cp.open = true; cp.clip = c; if (!c.nodes || !c.nodes.length) { c.nodes = [Object.assign(NODE_DEF(), { name: "Chỉnh sáng" })]; } cp.node = Math.min(cp.node, c.nodes.length - 1);
  const f = clipById(c.id); if (f) sel = { k: f.k, id: c.id };
  let el2 = cp.el; if (!el2) { el2 = cp.el = document.createElement("div"); el2.className = "cpage"; el2.setAttribute("role", "dialog"); el2.setAttribute("aria-label", "Trang chỉnh màu"); document.body.appendChild(el2); }
  el2.hidden = false; document.body.classList.add("cpopen"); scopeOn = true; renderCP(); drawFrame();
}
function closeColorPage() { cp.open = false; cp.highlight = false; if (cp.el) cp.el.hidden = true; document.body.classList.remove("cpopen"); if (maskEdit && maskEdit.kind === "node") maskEdit = null; _scopeCv = null; scopeOn = false; renderAll(); }
function cpNodeOf() { const c = cp.clip; return c && c.nodes && c.nodes[cp.node]; }
function renderCP() {
  const c = cp.clip, root = cp.el; if (!c || !root) return; const nodes = c.nodes || (c.nodes = []); if (!nodes.length) nodes.push(NODE_DEF()); cp.node = clamp(cp.node, 0, nodes.length - 1); const n = nodes[cp.node];
  const m = c.mediaId ? media.get(c.mediaId) : null;
  root.innerHTML = `<div class="cp-head"><b>Chỉnh màu</b><span class="cp-clipname"></span><div class="cp-acts"></div><button class="primary cp-close" type="button">Xong</button></div>
  <div class="cp-main"><div class="cp-side"><div class="cp-sh">Gallery</div><div class="cp-gal"></div></div>
  <div class="cp-view"><div class="cp-vwrap"><canvas class="cp-cv"></canvas><canvas class="cp-ov"></canvas><div class="cp-wipe" hidden><i></i></div></div>
   <div class="cp-trans"><button type="button" data-a="prev" class="icon">◀</button><button type="button" data-a="play" class="icon">▶</button><button type="button" data-a="next" class="icon">▶|</button><span class="cp-tc"></span><label class="chk"><input type="checkbox" class="cp-split"> Trước/sau</label><label class="chk"><input type="checkbox" class="cp-hl"> Hiện vùng chọn</label><label class="chk"><input type="checkbox" class="cp-byp"> Bỏ qua grade</label></div></div>
  <div class="cp-nodesw"><div class="cp-sh">Node</div><div class="cp-nodes"></div></div></div>
  <div class="cp-clips"></div>
  <div class="cp-bottom"><div class="cp-pal"><div class="cp-tabs"></div><div class="cp-panel"></div></div><div class="cp-scope"><div class="lctabs cp-stabs"></div><canvas class="lscope cp-scv" width="384" height="192"></canvas></div></div>`;
  root.querySelector(".cp-clipname").textContent = (m ? m.name : "Lớp bộ lọc") + " · " + fmt(clipStart(c)) + " · dài " + fmt(clipLen(c));
  root.querySelector(".cp-close").onclick = closeColorPage;
  const acts = root.querySelector(".cp-acts");
  for (const [lbl, fn, tip] of [["Chép grade", () => { gradeClipboard = deep(c.nodes); toast("Đã chép grade (" + c.nodes.length + " node)."); }, "Ctrl+C"], ["Dán grade", () => { if (!gradeClipboard) { toast("Chưa chép grade nào."); return; } pushUndo(); c.nodes = freshNodes(gradeClipboard); cp.node = 0; renderCP(); drawFrame(); }, "Ctrl+V"], ["Áp cho mọi cảnh", () => { pushUndo(); for (const x of V) if (x !== c) x.nodes = freshNodes(c.nodes); toast("Đã áp grade cho " + (V.length - 1) + " cảnh khác."); }, ""], ["Đặt lại", () => { pushUndo(); c.nodes = [Object.assign(NODE_DEF(), { name: "Chỉnh sáng" })]; cp.node = 0; renderCP(); drawFrame(); }, ""]]) { const b = el("button", "", lbl); b.type = "button"; if (tip) b.title = tip; b.onclick = fn; acts.appendChild(b); }
  // gallery
  const gal = root.querySelector(".cp-gal"); const grab = el("button", "primary", "＋ Chụp still"); grab.type = "button"; grab.onclick = () => { const L = stillsLoad(); const th = document.createElement("canvas"), k = 120 / Math.max(cv.width, cv.height); th.width = Math.round(cv.width * k); th.height = Math.round(cv.height * k); th.getContext("2d").drawImage(cv, 0, 0, th.width, th.height); L.push({ id: Date.now().toString(36), name: "Still " + (L.length + 1), nodes: deep(c.nodes), thumb: th.toDataURL("image/jpeg", 0.7) }); if (stillsSave(L)) { renderCP(); toast("Đã lưu still. Bấm một still để áp grade đó cho clip đang chỉnh."); } }; gal.appendChild(grab);
  for (const s of stillsLoad().slice().reverse()) { const it = el("div", "cp-still"); const im = el("img"); im.src = s.thumb; im.alt = s.name; const nm = el("span"); nm.textContent = s.name; const x = el("button", "icon", "✕"); x.type = "button"; x.title = "Xoá still"; x.onclick = ev => { ev.stopPropagation(); stillsSave(stillsLoad().filter(q => q.id !== s.id)); renderCP(); }; it.append(im, nm, x); it.onclick = () => { pushUndo(); c.nodes = freshNodes(s.nodes); cp.node = 0; renderCP(); drawFrame(); toast("Đã áp grade từ " + s.name + "."); }; gal.appendChild(it); }
  // node graph (serial)
  const ng = root.querySelector(".cp-nodes"); const src = el("div", "cp-nio", "Nguồn"); ng.appendChild(src);
  nodes.forEach((nd, i) => { const card = el("div", "cp-node" + (i === cp.node ? " on" : "") + (nd.on === false ? " off" : "")); card.tabIndex = 0; card.innerHTML = `<b>${String(i + 1).padStart(2, "0")}</b><span></span><small></small>`; card.querySelector("span").textContent = nd.name || "Node " + (i + 1); card.querySelector("small").textContent = [nd.q && nd.q.on ? "Qualifier" : "", nd.win && nd.win.length ? nd.win.length + " cửa sổ" : "", nd.blur ? "Mờ" : ""].filter(Boolean).join(" · ") || "Chỉnh chung";
    card.onclick = () => { cp.node = i; renderCP(); drawFrame(); }; card.ondblclick = async () => { const v = await prompt2("Tên node", nd.name || ""); if (v != null) { nd.name = v.trim(); renderCP(); } };
    const tg = el("button", "icon cp-ntog", nd.on === false ? "○" : "●"); tg.type = "button"; tg.title = "Bật/tắt node (Ctrl+D)"; tg.onclick = ev => { ev.stopPropagation(); pushUndo(); nd.on = nd.on === false; renderCP(); drawFrame(); }; card.appendChild(tg);
    ng.appendChild(el("i", "cp-link")); ng.appendChild(card); });
  ng.appendChild(el("i", "cp-link")); ng.appendChild(el("div", "cp-nio", "Ra"));
  const nb = el("div", "cp-nbtns"); for (const [lbl, fn, tip] of [["＋ Node nối tiếp", () => { pushUndo(); nodes.splice(cp.node + 1, 0, Object.assign(NODE_DEF(), { name: "" })); cp.node++; renderCP(); }, "Alt+S"], ["Nhân bản", () => { pushUndo(); const d = freshNodes([n])[0]; nodes.splice(cp.node + 1, 0, d); cp.node++; renderCP(); drawFrame(); }, ""], ["Xoá node", () => { if (nodes.length <= 1) { pushUndo(); nodes[0] = NODE_DEF(); } else { pushUndo(); nodes.splice(cp.node, 1); cp.node = Math.max(0, cp.node - 1); } renderCP(); drawFrame(); }, ""], ["↑", () => { if (cp.node > 0) { pushUndo(); [nodes[cp.node - 1], nodes[cp.node]] = [nodes[cp.node], nodes[cp.node - 1]]; cp.node--; renderCP(); drawFrame(); } }, "Đưa node lên trước"], ["↓", () => { if (cp.node < nodes.length - 1) { pushUndo(); [nodes[cp.node + 1], nodes[cp.node]] = [nodes[cp.node], nodes[cp.node + 1]]; cp.node++; renderCP(); drawFrame(); } }, "Đưa node ra sau"]]) { const b = el("button", "", lbl); b.type = "button"; if (tip) b.title = tip; b.onclick = fn; nb.appendChild(b); } root.querySelector(".cp-nodesw").appendChild(nb);
  // clip strip
  const strip = root.querySelector(".cp-clips"); const st = vStarts();
  const items = [...V.map((x, i) => [x, st[i]]), ...C.filter(x => x.type === "video" || (x.type === "fx" && x.fxType === "filter")).map(x => [x, x.start])].sort((a, b) => a[1] - b[1]);
  items.forEach(([x, s], i) => { const md = x.mediaId ? media.get(x.mediaId) : null; const b = el("button", "cp-clip" + (x === c ? " on" : "")); b.type = "button"; b.title = (md ? md.name : "Lớp bộ lọc") + " · " + fmt(s); b.innerHTML = `<span class="cp-ct"></span><small>${String(i + 1).padStart(2, "0")}${x.nodes && x.nodes.some(nodeActive) ? " ◆" : ""}</small>`; const th = b.querySelector(".cp-ct"); if (md && (md.thumb || md.strip)) th.style.backgroundImage = `url(${md.thumb || md.strip})`; else th.textContent = "Bộ lọc";
    b.onclick = () => { const f = clipById(x.id); if (f) sel = { k: f.k, id: x.id }; cp.clip = x; if (!x.nodes || !x.nodes.length) x.nodes = [Object.assign(NODE_DEF(), { name: "Chỉnh sáng" })]; cp.node = 0; seek(s + Math.min(0.5, (f && f.k === "v" ? vlen(x) : clen(x)) / 2)); renderCP(); }; strip.appendChild(b); });
  // palette tabs
  const TABS = [["wheels", "Bánh xe màu"], ["curves", "Đường cong"], ["hcurves", "Hue curves"], ["qual", "Qualifier"], ["win", "Cửa sổ"], ["blur", "Mờ / nét"], ["key", "Key"]];
  const tb = root.querySelector(".cp-tabs"); for (const [k, lbl] of TABS) { const b = el("button", "", lbl); b.type = "button"; b.setAttribute("aria-selected", cp.tab === k); b.onclick = () => { cp.tab = k; renderCP(); }; tb.appendChild(b); }
  const P = root.querySelector(".cp-panel"); cpPanel(P, c, n);
  // scopes
  const stb = root.querySelector(".cp-stabs"); for (const [k, lbl] of [["wave", "Waveform"], ["parade", "Parade"], ["vector", "Vectorscope"], ["hist", "Histogram"]]) { const b = el("button", "", lbl); b.type = "button"; b.setAttribute("aria-pressed", scopeMode === k); b.onclick = () => { scopeMode = k; stb.querySelectorAll("button").forEach(z => z.setAttribute("aria-pressed", z === b)); drawScopes(true); }; stb.appendChild(b); }
  _scopeCv = root.querySelector(".cp-scv"); scopeOn = true;
  // viewer controls
  const sp = root.querySelector(".cp-split"), hl = root.querySelector(".cp-hl"), by = root.querySelector(".cp-byp"); sp.checked = cp.split; hl.checked = cp.highlight; by.checked = !!cp.bypass;
  sp.onchange = () => { cp.split = sp.checked; drawFrame(); }; hl.onchange = () => { cp.highlight = hl.checked; drawFrame(); }; by.onchange = () => { cp.bypass = by.checked; drawFrame(); };
  root.querySelectorAll(".cp-trans [data-a]").forEach(b => b.onclick = () => { const a2 = b.dataset.a; if (a2 === "play") { playing ? pause() : play(); } else seek(clamp(t + (a2 === "prev" ? -1 : 1) / FPS, 0, total())); });
  cpBindViewer(root); cpView();
}
function cpPanel(P, c, n) {
  const re = () => { renderCP(); drawFrame(); };
  if (cp.tab === "wheels") {
    const ww = el("div", "lwheels four"); P.appendChild(ww);
    for (const [k, lbl] of [["lift", "Lift"], ["gamma", "Gamma"], ["gain", "Gain"], ["offs", "Offset"]]) colorWheel(ww, lbl, () => n[k] || { x: 0, y: 0, l: 0 }, v => { n[k] = v; });
    const g2 = el("div", "cp-prim"); P.appendChild(g2);
    const sl = (lbl, key, min, max, step, def, fm) => slider(g2, { label: lbl, min, max, step, get: () => n[key] == null ? def : n[key], set: v => n[key] = v, fmt: fm || (v => (+v).toFixed(2)) });
    sl("Contrast", "con", -1, 1, 0.01, 0); sl("Pivot", "piv", 0, 1, 0.005, 0.435, v => (+v).toFixed(3)); sl("Saturation", "sat", 0, 2, 0.01, 1, v => Math.round(v * 50)); sl("Hue", "hue", -180, 180, 1, 0, v => Math.round(v) + "°"); sl("Temp", "temp", -1, 1, 0.01, 0); sl("Tint", "tint", -1, 1, 0.01, 0);
    btnRow(P, [["Tự cân bằng", () => cpAutoBalance(c, n)], ["Đặt lại bánh xe", () => { pushUndo(); for (const k of ["lift", "gamma", "gain", "offs"]) n[k] = null; Object.assign(n, { con: 0, piv: 0.435, sat: 1, hue: 0, temp: 0, tint: 0 }); re(); }]]);
  } else if (cp.tab === "curves") {
    curveEditor2(P, ["y", "r", "g", "b"], { y: "Y (sáng)", r: "Đỏ", g: "Lục", b: "Lam" }, ch => (n.curves || {})[ch], (ch, v) => { n.curves = Object.assign({}, n.curves, { [ch]: v }); }, { neutral: "diag", get: () => cp.cch, set: v => cp.cch = v });
  } else if (cp.tab === "hcurves") {
    const NAMES = { hh: "Hue vs Hue", hs: "Hue vs Sat", hl: "Hue vs Lum", ls: "Lum vs Sat", ss: "Sat vs Sat" };
    curveEditor2(P, Object.keys(NAMES), NAMES, ch => (n.hcur || {})[ch], (ch, v) => { n.hcur = Object.assign({}, n.hcur, { [ch]: v }); }, { neutral: "flat", get: () => cp.hc, set: v => cp.hc = v, hueBg: ch => ch[0] === "h", eyedrop: true });
  } else if (cp.tab === "qual") {
    const Q = () => n.q || {}, setQ = (k, v) => { n.q = Object.assign({ on: true, h: 20, hw: 25, hs: 12, s0: 0.1, s1: 1, l0: 0, l1: 1, soft: 0.08 }, n.q, { [k]: v }); };
    btnRow(P, [["Hút màu trên khung xem", () => cpPick(rgb => { const [r, g2, b] = rgb, mx = Math.max(r, g2, b), mn = Math.min(r, g2, b), d = mx - mn; let h = 0; if (d > 1e-4) { h = mx === r ? ((g2 - b) / d) % 6 : mx === g2 ? (b - r) / d + 2 : (r - g2) / d + 4; h = (h * 60 + 360) % 360; } const s = mx > 0 ? d / mx : 0, l = 0.2126 * r + 0.7152 * g2 + 0.0722 * b; pushUndo(); n.q = { on: true, h: Math.round(h), hw: 18, hs: 10, s0: clamp(s - 0.25, 0, 1), s1: clamp(s + 0.35, 0, 1), l0: clamp(l - 0.3, 0, 1), l1: clamp(l + 0.3, 0, 1), soft: 0.08 }; cp.highlight = true; re(); toast("Đã chọn vùng màu. Bật/tắt \"Hiện vùng chọn\" để kiểm tra."); }), true], [Q().on ? "Tắt qualifier" : "Bật qualifier", () => { pushUndo(); setQ("on", !Q().on); re(); }]]);
    const hb = el("div", "lhue"); hb.style.setProperty("--h", Q().h || 20); P.appendChild(hb);
    const sl = (lbl, key, min, max, step, def, fm) => slider(P, { label: lbl, min, max, step, get: () => Q()[key] == null ? def : Q()[key], set: v => { setQ(key, v); if (key === "h") hb.style.setProperty("--h", v); }, fmt: fm });
    sl("Hue tâm", "h", 0, 360, 1, 20, v => Math.round(v) + "°"); sl("Hue rộng", "hw", 1, 180, 1, 25, v => Math.round(v) + "°"); sl("Hue mềm", "hs", 0, 90, 1, 12, v => Math.round(v) + "°");
    sl("Sat thấp", "s0", 0, 1, 0.01, 0.1, v => Math.round(v * 100)); sl("Sat cao", "s1", 0, 1, 0.01, 1, v => Math.round(v * 100)); sl("Lum thấp", "l0", 0, 1, 0.01, 0, v => Math.round(v * 100)); sl("Lum cao", "l1", 0, 1, 0.01, 1, v => Math.round(v * 100)); sl("Làm mềm", "soft", 0, 0.4, 0.005, 0.08, v => Math.round(v * 100));
    toggle(P, "Đảo vùng chọn", () => !!Q().inv, v => setQ("inv", v), "keep");
    note(P, "Qualifier chọn vùng theo màu (như chọn da, bầu trời). Chỉnh màu của node này chỉ áp lên vùng được chọn. Bật \"Hiện vùng chọn\" ở dưới khung xem để thấy vùng.");
  } else if (cp.tab === "win") {
    maskListUI(P, n, () => n.win, v => { n.win = v && v.length ? v : null; }, { kind: "node", key: "node:" + n.id, title: "Cửa sổ (Power Window)", lt: () => curLt(c), start: () => clipStart(c), after: soft => { drawFrame(); if (!soft) renderCP(); }, rerender: () => renderCP(), trackClip: () => (media.get(c.mediaId) || {}).kind === "video" ? c : null });
    note(P, "Cửa sổ giới hạn chỉnh màu của node vào một vùng: kéo điểm trên khung xem lớn ở trên. Kết hợp với Qualifier để chọn chính xác hơn.");
  } else if (cp.tab === "blur") {
    slider(P, { label: "Làm mờ", min: 0, max: 30, step: 0.5, get: () => n.blur || 0, set: v => n.blur = v, fmt: v => (+v).toFixed(1) });
    slider(P, { label: "Làm nét", min: 0, max: 1, step: 0.01, get: () => n.sharp || 0, set: v => n.sharp = v, fmt: v => Math.round(v * 100) });
    note(P, "Kết hợp với Cửa sổ hoặc Qualifier để làm mịn da, làm mờ hậu cảnh, làm nét mắt…");
  } else if (cp.tab === "key") {
    slider(P, { label: "Độ hoà node (Key gain)", min: 0, max: 1, step: 0.01, get: () => n.key == null ? 1 : n.key, set: v => n.key = v, fmt: v => Math.round(v * 100) + "%" });
    toggle(P, "Đảo vùng (qualifier)", () => !!(n.q && n.q.inv), v => { n.q = Object.assign({ on: true }, n.q, { inv: v }); }, "keep");
    note(P, "Key gain giảm mức ảnh hưởng của cả node (như Key Output Gain trong DaVinci).");
  }
}
function curveEditor2(box, chans, names, getPts, setPts, o) {
  const wrap = el("div", "lcurve"), tabs = el("div", "lctabs"); let ch = chans.includes(o.get()) ? o.get() : chans[0];
  const col = { y: "#e7e7ec", r: "#ff6b6b", g: "#4cd98a", b: "#5aa7ff" }; const cnv = el("canvas"); cnv.width = 520; cnv.height = 300; cnv.style.touchAction = "none";
  const neutral = () => o.neutral === "flat" ? [[0, 0.5], [1, 0.5]] : [[0, 0], [1, 1]];
  const pts = () => { let p = getPts(ch); if (!p) { p = neutral(); setPts(ch, p); p = getPts(ch); } return p; };
  const table = c2 => o.neutral === "flat" ? (c2[0] === "h" ? periodicTable(getPts(c2)) : flatTable(getPts(c2))) : curveTable(getPts(c2));
  const draw = () => { const x = cnv.getContext("2d"), W = cnv.width, H = cnv.height; x.clearRect(0, 0, W, H);
    if (o.hueBg && o.hueBg(ch)) { const gr = x.createLinearGradient(0, 0, W, 0); for (let i = 0; i <= 6; i++) gr.addColorStop(i / 6, `hsl(${i * 60},70%,40%)`); x.fillStyle = gr; x.fillRect(0, 0, W, H); x.fillStyle = "rgba(14,15,18,.55)"; x.fillRect(0, 0, W, H); }
    else { x.fillStyle = "#17181c"; x.fillRect(0, 0, W, H); if (ch === "ls" || ch === "ss") { const gr = x.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, ch === "ls" ? "#000" : "#777"); gr.addColorStop(1, ch === "ls" ? "#fff" : "#f33"); x.globalAlpha = 0.25; x.fillStyle = gr; x.fillRect(0, H - 12, W, 12); x.globalAlpha = 1; } }
    x.strokeStyle = "rgba(255,255,255,.08)"; for (let i = 1; i < 4; i++) { x.beginPath(); x.moveTo(W * i / 4, 0); x.lineTo(W * i / 4, H); x.moveTo(0, H * i / 4); x.lineTo(W, H * i / 4); x.stroke(); }
    x.strokeStyle = "rgba(255,255,255,.2)"; x.beginPath(); if (o.neutral === "flat") { x.moveTo(0, H / 2); x.lineTo(W, H / 2); } else { x.moveTo(0, H); x.lineTo(W, 0); } x.stroke();
    if (o.neutral !== "flat") for (const k of chans) { if (k === ch || isIdentityCurve(getPts(k))) continue; const T2 = table(k); x.strokeStyle = col[k] || "#fff"; x.globalAlpha = 0.35; x.beginPath(); for (let j = 0; j < 256; j++) { const px = j / 255 * W, py = H - T2[j] * H; j ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke(); x.globalAlpha = 1; }
    pts(); const T2 = table(ch); x.strokeStyle = col[ch] || "#fff"; x.lineWidth = 2.5; x.beginPath(); for (let j = 0; j < 256; j++) { const px = j / 255 * W, py = H - T2[j] * H; j ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke(); x.lineWidth = 1;
    for (const p of pts()) { x.fillStyle = "#fff"; x.strokeStyle = col[ch] || "#f2c14e"; x.lineWidth = 2.5; x.beginPath(); x.arc(p[0] * W, H - p[1] * H, 7, 0, 7); x.fill(); x.stroke(); }
  };
  for (const k of chans) { const b = el("button", "", names[k]); b.type = "button"; b.setAttribute("aria-pressed", k === ch); if (col[k] && k !== "y") b.style.color = col[k]; b.onclick = () => { ch = k; o.set(k); tabs.querySelectorAll("button").forEach(z => z.setAttribute("aria-pressed", z === b)); draw(); }; tabs.appendChild(b); }
  const rs = el("button", "", "↺"); rs.type = "button"; rs.title = "Đặt lại đường đang chọn"; rs.onclick = () => { pushUndo(); setPts(ch, null); draw(); drawFrame(); }; tabs.appendChild(rs);
  if (o.eyedrop) { const ed = el("button", "", "Hút màu"); ed.type = "button"; ed.title = "Bấm trên khung xem để thêm 3 điểm quanh hue của màu đó"; ed.onclick = () => cpPick(rgb => { const [r, g2, b] = rgb, mx = Math.max(r, g2, b), mn = Math.min(r, g2, b), d = mx - mn; let h = 0; if (d > 1e-4) { h = mx === r ? ((g2 - b) / d) % 6 : mx === g2 ? (b - r) / d + 2 : (r - g2) / d + 4; h = ((h * 60 + 360) % 360) / 360; } pushUndo(); const P2 = pts().slice(); for (const x2 of [h - 0.06, h, h + 0.06]) P2.push([((x2 % 1) + 1) % 1, 0.5]); P2.sort((a, b2) => a[0] - b2[0]); setPts(ch, P2); draw(); toast("Đã thêm điểm tại màu vừa chọn: kéo điểm giữa lên/xuống."); }); tabs.appendChild(ed); }
  const toP = e => { const r = cnv.getBoundingClientRect(); return [clamp((e.clientX - r.left) / r.width, 0, 1), clamp(1 - (e.clientY - r.top) / r.height, 0, 1)]; };
  cnv.addEventListener("pointerdown", e => { e.preventDefault(); pushUndo(); const P2 = pts().slice().map(p => p.slice()), q = toP(e), r = cnv.getBoundingClientRect(); let i = P2.findIndex(p => Math.hypot((p[0] - q[0]) * r.width, (p[1] - q[1]) * r.height) < 14);
    if (i < 0) { P2.push([q[0], q[1]]); P2.sort((a, b) => a[0] - b[0]); i = P2.findIndex(p => p[0] === q[0] && p[1] === q[1]); }
    setPts(ch, P2); const end = o.neutral !== "flat" && (i === 0 || i === P2.length - 1); try { cnv.setPointerCapture(e.pointerId); } catch (_) {}
    const mv = ev => { const z = toP(ev), P3 = pts(); const lo = i > 0 ? P3[i - 1][0] + 0.005 : 0, hi = i < P3.length - 1 ? P3[i + 1][0] - 0.005 : 1; P3[i][0] = end ? (i === 0 ? clamp(z[0], 0, hi) : clamp(z[0], lo, 1)) : clamp(z[0], lo, hi); P3[i][1] = z[1]; draw(); drawFrame(); };
    const up = () => { cnv.removeEventListener("pointermove", mv); cnv.removeEventListener("pointerup", up); }; cnv.addEventListener("pointermove", mv); cnv.addEventListener("pointerup", up); draw(); drawFrame(); });
  cnv.addEventListener("dblclick", e => { const P2 = pts(), q = toP(e), r = cnv.getBoundingClientRect(); const i = P2.findIndex(p => Math.hypot((p[0] - q[0]) * r.width, (p[1] - q[1]) * r.height) < 14); if (i >= 0 && (o.neutral === "flat" ? P2.length > 2 : i > 0 && i < P2.length - 1)) { pushUndo(); P2.splice(i, 1); draw(); drawFrame(); } });
  wrap.append(tabs, cnv); box.appendChild(wrap); draw(); requestAnimationFrame(() => { const r = cnv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1; if (r.width > 10 && r.height > 10) { cnv.width = Math.round(r.width * dpr); cnv.height = Math.round(r.height * dpr); draw(); } }); note(box, "Chạm lên đường để thêm điểm, kéo để uốn, chạm đúp để xoá điểm.");
}
function cpAutoBalance(c, n) {
  const d = clipPixels(c); if (!d) { toast("Chưa có khung hình để phân tích."); return; }
  let r = 0, g2 = 0, b = 0, cnt = 0; const L = []; for (let i = 0; i < d.length; i += 4) { const l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255; L.push(l); if (l > 0.15 && l < 0.9) { r += d[i]; g2 += d[i + 1]; b += d[i + 2]; cnt++; } }
  L.sort((a, b2) => a - b2); const p2 = L[Math.floor(L.length * 0.02)], p98 = L[Math.floor(L.length * 0.98)]; pushUndo();
  if (cnt) { r /= cnt; g2 /= cnt; b /= cnt; const m = (r + g2 + b) / 3; n.temp = clamp((b - r) / 255 * 2.2, -1, 1); n.tint = clamp((g2 - m) / 255 * 3, -1, 1); }
  n.lift = { x: 0, y: 0, l: clamp(-p2 * 2, -1, 1) }; n.gain = { x: 0, y: 0, l: clamp((0.95 - p98) / 0.6, -1, 1) };
  renderCP(); drawFrame(); toast("Đã tự cân bằng điểm đen, điểm trắng và cân bằng trắng.");
}
let cpPickCb = null;
function cpPick(cb) { cpPickCb = cb; cp.el && cp.el.classList.add("picking"); toast("Bấm vào màu trên khung xem lớn."); }
function cpBindViewer(root) {
  const ov = root.querySelector(".cp-ov"), wipe = root.querySelector(".cp-wipe");
  const toF = e => { const r = ov.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * cv.width, (e.clientY - r.top) / r.height * cv.height]; };
  ov.addEventListener("pointerdown", e => {
    e.preventDefault(); const p = toF(e);
    if (cpPickCb) { const cb = cpPickCb; cpPickCb = null; root.classList.remove("picking"); const keep = window.__noGrade; window.__noGrade = cp.tab === "qual" || cp.tab === "hcurves" ? false : keep; drawFrame(); const px = g.getImageData(clamp(Math.round(p[0]), 0, cv.width - 1), clamp(Math.round(p[1]), 0, cv.height - 1), 1, 1).data; window.__noGrade = keep; drawFrame(); cb([px[0] / 255, px[1] / 255, px[2] / 255]); return; }
    if (cp.split && Math.abs(p[0] / cv.width - cp.wipe) < 0.03) { const mv = ev => { cp.wipe = clamp(toF(ev)[0] / cv.width, 0, 1); cpView(); }, up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); }; window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up); return; }
    if (cp.tab === "win" && maskEdit && maskEdit.kind === "node") { const k = ov.width / cv.width; let mv = null, en = null; if (maskPointerDown(p, cv.width, cv.height, k, f => mv = f, f => en = f, e)) { try { ov.setPointerCapture(e.pointerId); } catch (_) {} const move = ev => { if (mv) mv(toF(ev)); }, up = () => { ov.removeEventListener("pointermove", move); ov.removeEventListener("pointerup", up); if (en) en(); }; ov.addEventListener("pointermove", move); ov.addEventListener("pointerup", up); } }
  });
}
let _cpRaf = 0;
function cpView() {
  if (!cp.open || !cp.el) return; const root = cp.el, view = root.querySelector(".cp-cv"), ov = root.querySelector(".cp-ov"), wrap = root.querySelector(".cp-vwrap"); if (!view) return;
  const box = wrap.getBoundingClientRect(), ar = cv.width / cv.height; let w = box.width, h = w / ar; if (h > box.height) { h = box.height; w = h * ar; } const dpr = window.devicePixelRatio || 1;
  for (const c2 of [view, ov]) { c2.style.width = w + "px"; c2.style.height = h + "px"; c2.style.left = (box.width - w) / 2 + "px"; c2.style.top = (box.height - h) / 2 + "px"; const W2 = Math.round(w * dpr), H2 = Math.round(h * dpr); if (c2.width !== W2 || c2.height !== H2) { c2.width = W2; c2.height = H2; } }
  const x = view.getContext("2d"); x.drawImage(cv, 0, 0, view.width, view.height);
  if (cp.split && !cp.bypass) { const sx = Math.round(view.width * cp.wipe); x.drawImage(_cpBefore || cv, 0, 0, _cpBefore ? _cpBefore.width * cp.wipe : 0, _cpBefore ? _cpBefore.height : 0, 0, 0, sx, view.height); x.fillStyle = "#f2c14e"; x.fillRect(sx - 1, 0, 2, view.height); x.font = `${12 * dpr}px sans-serif`; x.fillStyle = "rgba(0,0,0,.55)"; x.fillRect(6 * dpr, 6 * dpr, 52 * dpr, 18 * dpr); x.fillStyle = "#fff"; x.fillText("Trước", 12 * dpr, 19 * dpr); }
  const o = ov.getContext("2d"); o.setTransform(1, 0, 0, 1, 0, 0); o.clearRect(0, 0, ov.width, ov.height);
  if (cp.tab === "win" && maskEdit && maskEdit.kind === "node") { const k = ov.width / cv.width; o.setTransform(k, 0, 0, k, 0, 0); drawMaskOverlay(o, k, cv.width, cv.height, maskEdit.list(), maskEdit.idx, maskEdit.lt()); }
  const tc = root.querySelector(".cp-tc"); if (tc) tc.textContent = fmt(t); const pb = root.querySelector('[data-a="play"]'); if (pb) pb.textContent = playing ? "❚❚" : "▶";
  drawScopes(true);
}
let _cpBefore = null, _cpBusy = false;
const _drawFrameG = drawFrame;
drawFrame = function (Tin) {
  if (!cp.open || renderMode !== "preview" || _cpBusy) return _drawFrameG(Tin);
  _cpBusy = true;
  try {
    if (cp.split && !cp.bypass) { window.__noGrade = true; _drawFrameG(Tin); const b = _cpBefore && _cpBefore.width === cv.width && _cpBefore.height === cv.height ? _cpBefore : (_cpBefore = Object.assign(document.createElement("canvas"), { width: cv.width, height: cv.height })); b.getContext("2d").drawImage(cv, 0, 0); window.__noGrade = false; }
    if (cp.bypass) window.__noGrade = true; _drawFrameG(Tin); window.__noGrade = false;
  } finally { _cpBusy = false; }
  cancelAnimationFrame(_cpRaf); _cpRaf = requestAnimationFrame(cpView);
};
window.addEventListener("resize", () => { if (cp.open) cpView(); });
document.addEventListener("keydown", e => {
  if (!cp.open || tmatch(e, "input,select,textarea")) { if (!cp.open && e.shiftKey && e.code === "Digit6" && !tmatch(e, "input,select,textarea")) { e.preventDefault(); openColorPage(); } return; }
  const n = cpNodeOf(), c = cp.clip, take = () => { e.preventDefault(); e.stopImmediatePropagation(); };
  if (e.key === "Escape") { take(); if (cpPickCb) { cpPickCb = null; cp.el.classList.remove("picking"); } else closeColorPage(); }
  else if (e.altKey && e.code === "KeyS") { take(); pushUndo(); c.nodes.splice(cp.node + 1, 0, NODE_DEF()); cp.node++; renderCP(); }
  else if ((e.ctrlKey || e.metaKey) && e.code === "KeyD") { take(); if (n) { pushUndo(); n.on = n.on === false; renderCP(); drawFrame(); } }
  else if ((e.ctrlKey || e.metaKey) && e.code === "KeyC") { take(); gradeClipboard = deep(c.nodes); toast("Đã chép grade."); }
  else if ((e.ctrlKey || e.metaKey) && e.code === "KeyV") { take(); if (gradeClipboard) { pushUndo(); c.nodes = freshNodes(gradeClipboard); cp.node = 0; renderCP(); drawFrame(); } }
  else if (e.key === " ") { take(); playing ? pause() : play(); }
  else if (e.key === "ArrowLeft" || e.key === "ArrowRight") { take(); seek(clamp(t + (e.key === "ArrowLeft" ? -1 : 1) / FPS, 0, total())); }
  else if (e.key === "ArrowUp" || e.key === "ArrowDown") { take(); if (typeof gotoEdit === "function") gotoEdit(e.key === "ArrowUp" ? -1 : 1); const a = activeVideo(t); if (a && a.c !== cp.clip) { cp.clip = a.c; const f = clipById(a.c.id); if (f) sel = { k: f.k, id: a.c.id }; if (!a.c.nodes || !a.c.nodes.length) a.c.nodes = [NODE_DEF()]; cp.node = 0; renderCP(); } }
  else if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ") { take(); e.shiftKey ? redo() : undo(); const f = cp.clip && clipById(cp.clip.id); cp.clip = f ? f.c : cpTarget(); if (cp.clip) renderCP(); else closeColorPage(); }
}, true);
/* the colour page uses the same undo stack: keep its clip reference fresh after restores */
const _restoreG = restore;
restore = function (s) { _restoreG(s); if (cp.open) { const f = cp.clip && clipById(cp.clip.id); cp.clip = f ? f.c : null; if (!cp.clip) closeColorPage(); else renderCP(); } };

/* entry points */
(function cpEntry() {
  const util = $("#utilBtn") || $("#addBtn"); if (!util || $("#cpBtn")) return; const b = document.createElement("button"); b.className = "icon"; b.id = "cpBtn"; b.title = "Trang chỉnh màu kiểu DaVinci (Shift+6)";
  b.innerHTML = '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="8" r="2"/><circle cx="8" cy="14" r="2"/><circle cx="16" cy="14" r="2"/></svg>'; b.onclick = openColorPage; util.after(b);
})();
