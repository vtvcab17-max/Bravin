"use strict";
/* ============================================================================
   DaVinci-style node graph for the colour page.
   Everything lives in c.nodes so copy / paste / stills / "apply to all" carry
   the whole graph:
     corrector  { gk, gx, gy, inp: [key|"src"], ...grade params }
     mixer      { kind: "par" | "lay", key, gx, gy, inp: [key…], blend, mix }
     output     { kind: "out", gk: "out", on: false, gx, gy, sx, sy, inp: [key] }  (sx/sy = source node position)
   Old serial lists (no keys) are migrated into a chain on first use.
   ========================================================================== */
const CG_BLENDS = { "source-over": "Thường", screen: "Screen", multiply: "Multiply", overlay: "Overlay", "soft-light": "Soft light", lighter: "Cộng (Add)", difference: "Difference", color: "Color", luminosity: "Luminosity" };
const cgIsCor = n => n && !n.kind;
function cgKeyGen(nodes) { let i = 1; const used = new Set(nodes.map(n => n.gk)); while (used.has("k" + i)) i++; return "k" + i; }
function cgEnsure(c) {
  const L = c.nodes || (c.nodes = []); if (!L.some(cgIsCor)) L.unshift(Object.assign(NODE_DEF(), { name: "Chỉnh sáng" }));
  let out = L.find(n => n.kind === "out");
  if (!out) { // migrate serial list
    let prev = "src", x = 170; L.filter(cgIsCor).forEach(n => { if (!n.gk) n.gk = cgKeyGen(L); n.inp = [prev]; n.gx = x; n.gy = 40; prev = n.gk; x += 190; });
    out = { id: nid("nd"), kind: "out", gk: "out", on: false, inp: [prev], gx: x, gy: 60, sx: 10, sy: 60 }; L.push(out);
  }
  // repair: keys, positions, dangling references
  const keys = new Set(); for (const n of L) { if (!n.gk || keys.has(n.gk)) n.gk = cgKeyGen(L); keys.add(n.gk); if (n.gx == null) { n.gx = 200; n.gy = 200; } if (!Array.isArray(n.inp)) n.inp = []; }
  for (const n of L) n.inp = n.inp.map(k => (k === "src" || (keys.has(k) && k !== n.gk)) ? k : null);
  for (const n of L) if (n.kind === "par" || n.kind === "lay") n.inp = n.inp.filter(Boolean);
  return out;
}
const cgByKey = (c, k) => c.nodes.find(n => n.gk === k);
/* evaluate: returns canvas with the graded picture (or null) */
function cgEval(ctx, c, lt, T, report) {
  const out = cgEnsure(c), W = ctx.canvas.width, H = ctx.canvas.height, bufs = new Map(), busy = new Set();
  const src = scratch("cg_src", W, H); src.ctx.globalCompositeOperation = "copy"; src.ctx.drawImage(ctx.canvas, 0, 0); src.ctx.globalCompositeOperation = "source-over"; bufs.set("src", src.canvas);
  const selIdx = cp.open && cp.clip === c && cp.highlight ? cp.node : -1;
  const evalKey = k => {
    if (k == null) return null; if (bufs.has(k)) return bufs.get(k); if (busy.has(k)) return null; busy.add(k);
    const n = cgByKey(c, k); if (!n) return null; let res = null;
    if (cgIsCor(n)) {
      const inp = evalKey(n.inp[0]); if (!inp) { bufs.set(k, null); return null; }
      if (!nodeActive(n)) res = inp; else {
        const matte = n.win && n.win.length ? drawMaskSet(n.win, W, H, lt, "nwin") : null;
        const o = GRADE.run(inp, n, matte, c.nodes.indexOf(n) === selIdx);
        if (o) { const s = scratch("cg_" + k, W, H); s.ctx.globalCompositeOperation = "copy"; s.ctx.drawImage(o, 0, 0, W, H); s.ctx.globalCompositeOperation = "source-over"; res = s.canvas; } else res = inp;
      }
    } else if (n.kind === "par" || n.kind === "lay") {
      const ins = n.inp.map(evalKey).filter(Boolean);
      if (!ins.length) res = null; else if (ins.length === 1 || n.on === false) res = ins[0]; else {
        const s = scratch("cg_" + k, W, H), x = s.ctx; x.save(); x.globalCompositeOperation = "copy"; x.globalAlpha = 1; x.drawImage(ins[0], 0, 0); x.restore();
        if (n.kind === "par") ins.slice(1).forEach((b, i) => { x.save(); x.globalAlpha = 1 / (i + 2); x.drawImage(b, 0, 0); x.restore(); });
        else ins.slice(1).forEach((b, i) => {
          const srcNode = cgByKey(c, n.inp[i + 1]); let im = b;
          if (srcNode && srcNode.win && srcNode.win.length && srcNode.on !== false) { const m = drawMaskSet(srcNode.win, W, H, lt, "nwin"); if (m) { const t2 = scratch("cg_lm", W, H); t2.ctx.globalCompositeOperation = "copy"; t2.ctx.drawImage(b, 0, 0); t2.ctx.globalCompositeOperation = "destination-in"; t2.ctx.drawImage(m, 0, 0); t2.ctx.globalCompositeOperation = "source-over"; im = t2.canvas; } }
          x.save(); x.globalCompositeOperation = n.blend || "source-over"; x.globalAlpha = n.mix == null ? 1 : n.mix; x.drawImage(im, 0, 0); x.restore();
        });
        res = s.canvas;
      }
    } else if (n.kind === "out") res = evalKey(n.inp[0]);
    busy.delete(k); bufs.set(k, res); return res;
  };
  const final = evalKey("out");
  if (report) report(bufs);
  return final;
}
let _cgThumbT = 0;
applyNodes = function (ctx, c, lt, T) {
  if (!c.nodes || !c.nodes.length) return; const W = ctx.canvas.width, H = ctx.canvas.height;
  const live = cp.open && cp.clip === c && renderMode === "preview" && cgUI.api && performance.now() - _cgThumbT > 280;
  const res = cgEval(ctx, c, lt, T, live ? bufs => { _cgThumbT = performance.now(); const api = cgUI.api; requestAnimationFrame(() => {}); bufs.forEach((cv2, k) => { if (cv2 && api) api.setThumb(k, cv2); }); } : null);
  if (!res || res === ctx.canvas) return;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = "copy"; ctx.globalAlpha = 1; ctx.filter = "none"; ctx.drawImage(res, 0, 0, W, H); ctx.restore();
};

/* ---------- editing helpers ---------- */
function cgRedirect(c, fromKey, toKey, except) { for (const n of c.nodes) if (n !== except) n.inp = n.inp.map(k => k === fromKey ? toKey : k); }
function cgShiftRight(c, x0, dx, y0, y1) { for (const n of c.nodes) { if (n.gx > x0 && (y0 == null || (n.gy > y0 - 60 && n.gy < y1 + 60))) n.gx += dx; } const o = c.nodes.find(n => n.kind === "out"); if (o && o.sx > x0) o.sx += dx; }
function cgSel(c) { const n = c.nodes[cp.node]; return n && n.kind !== "out" ? n : c.nodes.find(cgIsCor); }
function cgAddSerial(c, after) {
  cgEnsure(c); const X = after || cgSel(c); const N = Object.assign(NODE_DEF(), { gk: cgKeyGen(c.nodes), inp: [X ? X.gk : "src"], gx: (X ? X.gx : 10) + 190, gy: X ? X.gy : 40 });
  cgShiftRight(c, X ? X.gx + 1 : 0, 190, X ? X.gy : null, X ? X.gy : null); N.gx = (X ? X.gx : 10) + 190;
  if (X) cgRedirect(c, X.gk, N.gk, N); c.nodes.splice(X ? c.nodes.indexOf(X) + 1 : 0, 0, N); cp.node = c.nodes.indexOf(N); return N;
}
function cgAddBranch(c, kind) { // parallel (par) or layer (lay) node next to the selected corrector
  cgEnsure(c); const X = cgSel(c); if (!X || !cgIsCor(X)) return null;
  const down = c.nodes.filter(n => n.inp.includes(X.gk)), mixer = down.find(n => n.kind === kind);
  const N = Object.assign(NODE_DEF(), { gk: cgKeyGen(c.nodes), inp: X.inp.slice(0, 1), gx: X.gx, gy: X.gy + 150 + (mixer ? (mixer.inp.length - 1) * 150 : 0) });
  c.nodes.splice(c.nodes.indexOf(X) + 1, 0, N);
  if (mixer) mixer.inp.push(N.gk);
  else { const M = { id: nid("nd"), kind, gk: cgKeyGen(c.nodes), on: true, inp: [X.gk, N.gk], gx: X.gx + 190, gy: X.gy + 60, blend: "source-over", mix: 1 }; cgShiftRight(c, X.gx + 1, 190); M.gx = X.gx + 190; cgRedirect(c, X.gk, M.gk, M); c.nodes.splice(c.nodes.indexOf(N) + 1, 0, M); }
  cp.node = c.nodes.indexOf(N); return N;
}
function cgAddOutside(c) { const X = cgSel(c); if (!X || !X.win || !X.win.length) { toast("Node ngoài vùng cần node đang chọn có cửa sổ (window)."); return null; } const N = cgAddSerial(c, X); N.win = deep(X.win).map(m => Object.assign(m, { id: nid("mk"), inv: !m.inv })); N.name = "Ngoài vùng " + (X.name || X.gk); return N; }
function cgDelete(c, keys) {
  for (const k of keys) { const n = cgByKey(c, k); if (!n || n.kind === "out") continue; const up = n.inp[0] || null; cgRedirect(c, k, cgIsCor(n) ? up : (n.inp[0] || null)); c.nodes.splice(c.nodes.indexOf(n), 1); }
  for (const n of c.nodes) if (n.kind === "par" || n.kind === "lay") n.inp = n.inp.filter(Boolean);
  if (!c.nodes.some(cgIsCor)) { const N = Object.assign(NODE_DEF(), { gk: cgKeyGen(c.nodes), inp: ["src"], gx: 170, gy: 40, name: "Chỉnh sáng" }); c.nodes.unshift(N); c.nodes.find(n => n.kind === "out").inp = [N.gk]; }
  cp.node = Math.max(0, c.nodes.findIndex(cgIsCor));
}
function cgAutoLayout(c) {
  const out = cgEnsure(c), depth = new Map(), memo = k => { if (k === "src") return 0; if (depth.has(k)) return depth.get(k); depth.set(k, 0); const n = cgByKey(c, k); const d = n && n.inp.length ? Math.max(...n.inp.map(x => x ? memo(x) : 0)) + 1 : 1; depth.set(k, d); return d; };
  c.nodes.forEach(n => memo(n.gk)); const cols = new Map(); c.nodes.forEach(n => { const d = depth.get(n.gk) || 1; if (!cols.has(d)) cols.set(d, []); cols.get(d).push(n); });
  cols.forEach((list, d) => list.forEach((n, i) => { n.gx = 10 + d * 190; n.gy = 40 + i * 150; })); out.sx = 10; out.sy = 60;
}

/* ---------- UI ---------- */
const cgUI = { api: null, clip: null };
function cgPorts(n) { if (n.kind === "par" || n.kind === "lay") return Array.from({ length: (n.inp || []).length + 1 }, (_, i) => ({ name: (n.kind === "lay" ? "Lớp " : "Vào ") + (i + 1), kind: "rgb" })); return [{ name: "RGB", kind: "rgb" }]; }
function cgTypes(c) {
  const corLabel = n => n.name || ("Node " + n.gk.replace(/^k/, "").padStart(2, "0"));
  return {
    src: { title: () => "Nguồn", fixed: true, color: "#2f6b45", outputs: () => [{ name: "RGB", kind: "rgb" }], w: 110 },
    out: { title: () => "Ra", fixed: true, color: "#2f6b45", inputs: () => [{ name: "RGB", kind: "rgb" }], w: 110 },
    cor: { title: n => corLabel(n.ref), color: n => n.ref.on === false ? "#3a3b45" : "#4a3f8f", badge: n => [n.ref.q && n.ref.q.on ? "Q" : "", n.ref.win && n.ref.win.length ? "W" + n.ref.win.length : "", n.ref.blur ? "B" : ""].filter(Boolean).join(" "), inputs: () => [{ name: "RGB", kind: "rgb" }], outputs: () => [{ name: "RGB", kind: "rgb" }], w: 150 },
    par: { title: () => "Trộn song song", color: "#6b5a2f", inputs: n => cgPorts(n.ref), outputs: () => [{ name: "RGB", kind: "rgb" }], w: 140 },
    lay: { title: () => "Trộn lớp", color: "#6b3f2f", badge: n => n.ref.blend && n.ref.blend !== "source-over" ? CG_BLENDS[n.ref.blend] : "", inputs: n => cgPorts(n.ref), outputs: () => [{ name: "RGB", kind: "rgb" }], w: 140 }
  };
}
function cgBuildGraph(c) {
  const out = cgEnsure(c), nodes = [{ id: "src", type: "src", x: out.sx, y: out.sy }];
  for (const n of c.nodes) nodes.push({ id: n.gk, type: n.kind === "out" ? "out" : n.kind || "cor", x: n.gx, y: n.gy, ref: n, on: n.kind === "out" ? true : n.on });
  const links = []; for (const n of c.nodes) n.inp.forEach((k, i) => { if (k) links.push({ id: n.gk + ":" + i, from: [k, 0], to: [n.gk, i] }); });
  return { nodes, links, view: c.cgView || (c.cgView = { x: 20, y: 20, k: 0.85 }) };
}
function cgSyncBack(c, G) {
  const out = c.nodes.find(n => n.kind === "out");
  for (const gn of G.nodes) { if (gn.id === "src") { out.sx = gn.x; out.sy = gn.y; } else if (gn.ref) { gn.ref.gx = gn.x; gn.ref.gy = gn.y; } }
  for (const n of c.nodes) { const L = G.links.filter(l => l.to[0] === n.gk).sort((a, b) => a.to[1] - b.to[1]); if (n.kind === "par" || n.kind === "lay") n.inp = L.map(l => l.from[0]); else { n.inp = [L[0] ? L[0].from[0] : null]; } }
}
function cgMount(host, c) {
  cgEnsure(c); cgUI.clip = c;
  const G = cgBuildGraph(c); let undone = false; const pre = () => { if (!undone) { pushUndo(); undone = true; setTimeout(() => undone = false, 0); } };
  const rerender = () => { renderCP(); drawFrame(); };
  const api = NodeGraph(host, {
    graph: G, types: cgTypes(c),
    canConnect: (from, to) => { if (to[0] === "src" || from[0] === "out") return false; // prevent cycles
      const reach = (k, seen = new Set()) => { if (k === from[0]) return true; if (seen.has(k)) return false; seen.add(k); return c.nodes.filter(n => n.inp.includes(k)).some(n => reach(n.gk, seen)); }; return !reach(to[0]); },
    beforeChange: pre,
    onChange: kind => { if (kind === "view") { c.cgView = G.view; return; } if (kind === "move") pre(); cgSyncBack(c, G); if (kind === "links" || kind === "nodes") { drawFrame(); if (kind === "nodes") rerender(); else cgUI.api.render(); } },
    beforeDelete: ids => { pre(); cgSyncBack(c, G); cgDelete(c, ids); setTimeout(rerender, 0); },
    onSelect: ids => { const n = ids.length === 1 && cgByKey(c, ids[0]); if (n && n.kind !== "out") { cp.node = c.nodes.indexOf(n); cgPanelOnly(); drawFrame(); } },
    onOpen: id => { const n = cgByKey(c, id); if (n && cgIsCor(n)) prompt2("Tên node", n.name || "").then(v => { if (v != null) { pushUndo(); n.name = v.trim(); rerender(); } }); },
    addItems: pos => [{ h: "Thêm node" },
      { label: "Node chỉnh màu (nối tiếp)", kbd: "Alt+S", run: () => { pushUndo(); const N = cgAddSerial(c); if (pos) { N.gx = Math.round(pos[0]); N.gy = Math.round(pos[1]); } rerender(); } },
      { label: "Node song song", kbd: "Alt+P", run: () => { pushUndo(); cgAddBranch(c, "par"); rerender(); } },
      { label: "Node lớp (layer)", kbd: "Alt+L", run: () => { pushUndo(); cgAddBranch(c, "lay"); rerender(); } },
      { label: "Node ngoài vùng (outside)", kbd: "Alt+O", run: () => { pushUndo(); if (cgAddOutside(c)) rerender(); } },
      { label: "Node chỉnh rời (chưa nối)", run: () => { pushUndo(); const N = Object.assign(NODE_DEF(), { gk: cgKeyGen(c.nodes), inp: [null], gx: Math.round(pos ? pos[0] : 200), gy: Math.round(pos ? pos[1] : 200) }); c.nodes.splice(c.nodes.length - 1, 0, N); cp.node = c.nodes.indexOf(N); rerender(); } },
      { label: "Bộ trộn song song rời", run: () => { pushUndo(); c.nodes.splice(c.nodes.length - 1, 0, { id: nid("nd"), kind: "par", gk: cgKeyGen(c.nodes), on: true, inp: [], gx: Math.round(pos ? pos[0] : 300), gy: Math.round(pos ? pos[1] : 200) }); rerender(); } },
      { label: "Bộ trộn lớp rời", run: () => { pushUndo(); c.nodes.splice(c.nodes.length - 1, 0, { id: nid("nd"), kind: "lay", gk: cgKeyGen(c.nodes), on: true, inp: [], gx: Math.round(pos ? pos[0] : 300), gy: Math.round(pos ? pos[1] : 200), blend: "source-over", mix: 1 }); rerender(); } },
      { h: "Sắp xếp" }, { label: "Tự xếp gọn", run: () => { pushUndo(); cgAutoLayout(c); rerender(); setTimeout(() => cgUI.api && cgUI.api.fit(), 30); } }],
    nodeItems: (gn, ids) => { const n = gn.ref; if (!n || n.kind === "out") return []; const items = [{ h: cgIsCor(n) ? "Node " + n.gk : "Bộ trộn" },
      { label: n.on === false ? "Bật node" : "Tắt node", kbd: "Ctrl+D", run: () => { pushUndo(); n.on = n.on === false; rerender(); } }];
      if (cgIsCor(n)) items.push({ label: "Đổi tên", run: () => prompt2("Tên node", n.name || "").then(v => { if (v != null) { pushUndo(); n.name = v.trim(); rerender(); } }) },
        { label: "Thêm node nối tiếp sau", kbd: "Alt+S", run: () => { pushUndo(); cp.node = c.nodes.indexOf(n); cgAddSerial(c); rerender(); } },
        { label: "Thêm node song song", kbd: "Alt+P", run: () => { pushUndo(); cp.node = c.nodes.indexOf(n); cgAddBranch(c, "par"); rerender(); } },
        { label: "Thêm node lớp", kbd: "Alt+L", run: () => { pushUndo(); cp.node = c.nodes.indexOf(n); cgAddBranch(c, "lay"); rerender(); } },
        { label: "Nhân bản", run: () => { pushUndo(); const d = Object.assign(freshNodes([n])[0], { gk: cgKeyGen(c.nodes), gx: n.gx + 30, gy: n.gy + 150, inp: [null] }); c.nodes.splice(c.nodes.indexOf(n) + 1, 0, d); cp.node = c.nodes.indexOf(d); rerender(); } },
        { label: "Đặt lại grade của node", run: () => { pushUndo(); const keep = { id: n.id, gk: n.gk, gx: n.gx, gy: n.gy, inp: n.inp, name: n.name }; for (const k2 in n) delete n[k2]; Object.assign(n, NODE_DEF(), keep); rerender(); } });
      else if (n.kind === "lay") items.push({ h: "Chế độ hoà trộn" }, ...Object.entries(CG_BLENDS).map(([k, v]) => ({ label: (n.blend || "source-over") === k ? "✓ " + v : v, run: () => { pushUndo(); n.blend = k; rerender(); } })));
      return items; },
    onKey: (e, ids) => { if ((e.ctrlKey || e.metaKey) && e.code === "KeyD" && ids.length) { pushUndo(); ids.forEach(k => { const n = cgByKey(c, k); if (n && n.kind !== "out") n.on = n.on === false; }); rerender(); return true; } return false; },
    toolbar: bar => { const b = document.createElement("button"); b.type = "button"; b.className = "icon wide"; b.textContent = cp.bigGraph ? "Thu bảng node" : "Mở rộng bảng node"; b.title = "Phóng to vùng node (N)"; b.onclick = e => { e.stopPropagation(); cp.bigGraph = !cp.bigGraph; cp.el.classList.toggle("cgbig", cp.bigGraph); b.textContent = cp.bigGraph ? "Thu bảng node" : "Mở rộng bảng node"; setTimeout(() => { cgUI.api && cgUI.api.redrawWires(); cpView(); }, 60); }; bar.prepend(b); }
  });
  cgUI.api = api; const cur = c.nodes[cp.node]; if (cur) api.select(cur.gk);
  if (!c.cgFitted) { c.cgFitted = true; setTimeout(() => api.fit(), 40); }
  return api;
}
/* refresh only the palette (keeps the graph and its view) */
function cgPanelOnly() {
  const root = cp.el, c = cp.clip; if (!root || !c) return; const P = root.querySelector(".cp-panel"); if (!P) return; P.innerHTML = ""; const n = c.nodes[cp.node];
  root.querySelectorAll(".cp-tabs button").forEach(b => b.disabled = !cgIsCor(n));
  if (n && (n.kind === "par" || n.kind === "lay")) { cgMixerPanel(P, c, n); return; }
  cpPanel(P, c, n);
}
function cgMixerPanel(P, c, n) {
  P.appendChild(el("p", "lsub", n.kind === "par" ? "Bộ trộn song song: trung bình các nhánh vào." : "Bộ trộn lớp: nhánh dưới phủ lên nhánh trên (theo cửa sổ của node nguồn nếu có)."));
  if (n.kind === "lay") { select(P, "Chế độ hoà trộn", CG_BLENDS, () => n.blend || "source-over", v => { n.blend = v; drawFrame(); }); slider(P, { label: "Độ phủ", min: 0, max: 1, step: 0.01, get: () => n.mix == null ? 1 : n.mix, set: v => { n.mix = v; }, fmt: v => Math.round(v * 100) + "%" }); }
  note(P, "Số nhánh vào: " + n.inp.length + ". Kéo dây từ cổng ra của một node vào ô trống cuối của bộ trộn để thêm nhánh.");
}
/* mount into the colour page after each render */
const _renderCP_cg = renderCP;
renderCP = function () {
  const c = cp.clip; if (c) { cgEnsure(c); if (!cgIsCor(c.nodes[cp.node]) && !(c.nodes[cp.node] && c.nodes[cp.node].kind)) cp.node = c.nodes.findIndex(cgIsCor); }
  _renderCP_cg();
  const root = cp.el; if (!root || !c) return; root.classList.toggle("cgbig", !!cp.bigGraph);
  const wrap = root.querySelector(".cp-nodesw"); if (!wrap) return; wrap.innerHTML = "";
  const head = el("div", "cp-sh cg-head"); head.innerHTML = '<span>Node</span><small>Kéo dây từ ● ra sang ● vào · chuột phải để thêm · Alt+S / Alt+P / Alt+L</small>'; wrap.appendChild(head);
  const host = el("div", "cg-host"); wrap.appendChild(host); cgMount(host, c);
  const n = c.nodes[cp.node]; if (n && (n.kind === "par" || n.kind === "lay")) cgPanelOnly();
  root.querySelectorAll(".cp-tabs button").forEach(b => b.addEventListener("click", () => setTimeout(() => {}, 0)));
};
window.addEventListener("keydown", e => {
  if (!cp.open || !cp.clip || tmatch(e, "input,select,textarea")) return; const c = cp.clip;
  const act = fn => { e.preventDefault(); e.stopImmediatePropagation(); pushUndo(); const r = fn(); if (r !== false) { renderCP(); drawFrame(); } };
  if (e.altKey && e.code === "KeyS") act(() => cgAddSerial(c));
  else if (e.altKey && e.code === "KeyP") act(() => cgAddBranch(c, "par"));
  else if (e.altKey && e.code === "KeyL") act(() => cgAddBranch(c, "lay"));
  else if (e.altKey && e.code === "KeyO") act(() => !!cgAddOutside(c) || false);
  else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.code === "KeyN" && !e.target.closest(".ng")) { e.preventDefault(); e.stopImmediatePropagation(); cp.bigGraph = !cp.bigGraph; renderCP(); setTimeout(cpView, 60); }
}, true);
