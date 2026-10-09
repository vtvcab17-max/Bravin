"use strict";
/* ============================================================================
   Node-graph canvas (shared by the colour page and the AI workflow).
   Pan (drag empty space / middle button / one finger), zoom (wheel / pinch),
   drag nodes, drag wires from an output port onto an input port, pick a wire
   up from its input to re-route it, Shift+drag marquee, right-click menus,
   Delete / Ctrl+D, fit-to-view. The graph object is plain JSON:
     { nodes: [{ id, type, x, y, ... }], links: [{ id, from: [nodeId, port], to: [nodeId, port] }], view: { x, y, k } }
   Each node type describes its ports and optional body via `types`.
   ========================================================================== */
function NodeGraph(host, o) {
  const G = o.graph; G.nodes = G.nodes || []; G.links = G.links || []; G.view = G.view || { x: 40, y: 40, k: 1 };
  host.classList.add("ng"); host.innerHTML = "";
  host.tabIndex = 0;
  const world = document.createElement("div"); world.className = "ng-world";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.classList.add("ng-wires"); svg.setAttribute("width", "1"); svg.setAttribute("height", "1");
  const marq = document.createElement("div"); marq.className = "ng-marq"; marq.hidden = true;
  const tools = document.createElement("div"); tools.className = "ng-tools";
  host.append(world, marq, tools); world.appendChild(svg);
  const nodeEls = new Map(); let selN = new Set(), selL = null, tmp = null;
  const api = { el: host, graph: G, selected: () => [...selN], render, fit, select, setThumb, setStatus, centerOn, redrawWires: drawWires, destroy: () => { host.innerHTML = ""; } };
  const T = n => o.types[n.type] || { title: () => n.type, inputs: () => [], outputs: () => [] };
  const ins = n => (T(n).inputs ? T(n).inputs(n) : []), outs = n => (T(n).outputs ? T(n).outputs(n) : []);
  const change = (kind, extra) => { if (o.onChange) o.onChange(kind, extra); };
  const applyView = () => { world.style.transform = `translate(${G.view.x}px,${G.view.y}px) scale(${G.view.k})`; host.style.setProperty("--ngk", G.view.k); host.style.backgroundPosition = `${G.view.x}px ${G.view.y}px`; host.style.backgroundSize = `${24 * G.view.k}px ${24 * G.view.k}px`; };
  const toWorld = (cx, cy) => { const r = host.getBoundingClientRect(); return [(cx - r.left - G.view.x) / G.view.k, (cy - r.top - G.view.y) / G.view.k]; };
  const nid2 = p => p + "_" + Math.random().toString(36).slice(2, 8);

  // toolbar (zoom, fit, add)
  for (const [lbl, tip, fn] of [["＋ Node", "Thêm node (chuột phải vào chỗ trống cũng được)", e => addMenu(e, null)], ["⤢", "Vừa khung (F)", () => fit()], ["−", "Thu nhỏ", () => zoomAt(1 / 1.2)], ["+", "Phóng to", () => zoomAt(1.2)]]) {
    const b = document.createElement("button"); b.type = "button"; b.className = "icon" + (lbl.length > 2 ? " wide" : ""); b.textContent = lbl; b.title = tip; b.onclick = e => { e.stopPropagation(); fn(e); }; tools.appendChild(b);
  }
  if (o.toolbar) o.toolbar(tools);

  function render() {
    world.querySelectorAll(".ng-node").forEach(x => x.remove()); nodeEls.clear();
    for (const n of G.nodes) {
      const d = document.createElement("div"), t2 = T(n); d.className = "ng-node" + (selN.has(n.id) ? " sel" : "") + (n.on === false ? " off" : "") + (t2.cls ? " " + t2.cls(n) : "");
      d.dataset.id = n.id; d.style.left = n.x + "px"; d.style.top = n.y + "px"; if (t2.w) d.style.width = (typeof t2.w === "function" ? t2.w(n) : t2.w) + "px";
      if (t2.color) d.style.setProperty("--nc", typeof t2.color === "function" ? t2.color(n) : t2.color);
      const h = document.createElement("div"); h.className = "ng-head"; const ti = document.createElement("span"); ti.className = "ng-title"; ti.textContent = t2.title(n); h.appendChild(ti);
      if (t2.badge) { const bg = document.createElement("small"); bg.className = "ng-badge"; bg.textContent = t2.badge(n) || ""; h.appendChild(bg); }
      d.appendChild(h);
      const ports = document.createElement("div"); ports.className = "ng-ports";
      const li = document.createElement("div"), lo = document.createElement("div"); li.className = "ng-in"; lo.className = "ng-out";
      ins(n).forEach((p, i) => { const r = document.createElement("div"); r.className = "ng-prow"; const dot = document.createElement("i"); dot.className = "ng-port in k-" + (p.kind || "any"); dot.dataset.node = n.id; dot.dataset.port = i; dot.dataset.dir = "in"; dot.title = p.name; const s = document.createElement("span"); s.textContent = p.name; r.append(dot, s); li.appendChild(r); });
      outs(n).forEach((p, i) => { const r = document.createElement("div"); r.className = "ng-prow"; const s = document.createElement("span"); s.textContent = p.name; const dot = document.createElement("i"); dot.className = "ng-port out k-" + (p.kind || "any"); dot.dataset.node = n.id; dot.dataset.port = i; dot.dataset.dir = "out"; dot.title = p.name; r.append(s, dot); lo.appendChild(r); });
      ports.append(li, lo); d.appendChild(ports);
      if (t2.body) { const b = document.createElement("div"); b.className = "ng-body"; t2.body(n, b, api); if (b.childNodes.length) d.appendChild(b); }
      const st = document.createElement("div"); st.className = "ng-status"; d.appendChild(st);
      world.appendChild(d); nodeEls.set(n.id, d);
    }
    applyView(); requestAnimationFrame(drawWires); drawWires();
  }
  function portXY(nodeId, dir, i) {
    const d = nodeEls.get(nodeId), n = G.nodes.find(q => q.id === nodeId); if (!d || !n) return null;
    const dot = d.querySelector(`.ng-port.${dir}[data-port="${i}"]`); if (!dot) return [n.x + (dir === "out" ? d.offsetWidth : 0), n.y + 20];
    let x = dot.offsetLeft + dot.offsetWidth / 2, y = dot.offsetTop + dot.offsetHeight / 2, p = dot.offsetParent;
    while (p && p !== d) { x += p.offsetLeft; y += p.offsetTop; p = p.offsetParent; }
    return [n.x + x, n.y + y];
  }
  const curve = (a, b) => { const dx = Math.max(40, Math.abs(b[0] - a[0]) * 0.5); return `M${a[0]},${a[1]} C${a[0] + dx},${a[1]} ${b[0] - dx},${b[1]} ${b[0]},${b[1]}`; };
  function kindOf(nodeId, dir, i) { const n = G.nodes.find(q => q.id === nodeId); if (!n) return "any"; const L = dir === "out" ? outs(n) : ins(n); return (L[i] && L[i].kind) || "any"; }
  function drawWires() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    for (const L of G.links) {
      const a = portXY(L.from[0], "out", L.from[1]), b = portXY(L.to[0], "in", L.to[1]); if (!a || !b) continue;
      const hit = document.createElementNS(svg.namespaceURI, "path"); hit.setAttribute("d", curve(a, b)); hit.setAttribute("class", "ng-whit"); hit.dataset.link = L.id;
      const p = document.createElementNS(svg.namespaceURI, "path"); p.setAttribute("d", curve(a, b)); p.setAttribute("class", "ng-wire k-" + kindOf(L.from[0], "out", L.from[1]) + (selL === L.id ? " sel" : "") + (L.active ? " flow" : "")); p.dataset.link = L.id;
      svg.append(p, hit);
    }
    if (tmp) { const p = document.createElementNS(svg.namespaceURI, "path"); p.setAttribute("d", tmp.dir === "out" ? curve(tmp.a, tmp.b) : curve(tmp.b, tmp.a)); p.setAttribute("class", "ng-wire tmp k-" + tmp.kind); svg.appendChild(p); }
  }
  function select(ids, add) { if (!add) selN.clear(); (Array.isArray(ids) ? ids : ids ? [ids] : []).forEach(id => selN.add(id)); selL = null; nodeEls.forEach((d, id) => d.classList.toggle("sel", selN.has(id))); drawWires(); if (o.onSelect) o.onSelect([...selN]); }
  function setThumb(id, cvs) { const d = nodeEls.get(id); if (!d) return; let th = d.querySelector(".ng-thumb"); if (!th) { th = document.createElement("canvas"); th.className = "ng-thumb"; const h = d.querySelector(".ng-head"); h.after(th); } const k = 120 / Math.max(cvs.width, cvs.height); th.width = Math.max(1, Math.round(cvs.width * k)); th.height = Math.max(1, Math.round(cvs.height * k)); th.getContext("2d").drawImage(cvs, 0, 0, th.width, th.height); }
  function setStatus(id, text, cls) { const d = nodeEls.get(id); if (!d) return; const s = d.querySelector(".ng-status"); s.textContent = text || ""; s.className = "ng-status" + (cls ? " " + cls : ""); d.classList.toggle("running", cls === "run"); }
  function zoomAt(f, cx, cy) { const r = host.getBoundingClientRect(); if (cx == null) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; } const k2 = clamp(G.view.k * f, 0.25, 2.5), [wx, wy] = toWorld(cx, cy); G.view.k = k2; G.view.x = cx - r.left - wx * k2; G.view.y = cy - r.top - wy * k2; applyView(); change("view"); }
  function fit() {
    if (!G.nodes.length) return; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of G.nodes) { const d = nodeEls.get(n.id), w = d ? d.offsetWidth : 160, h = d ? d.offsetHeight : 80; x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x + w); y1 = Math.max(y1, n.y + h); }
    const r = host.getBoundingClientRect(); if (!r.width) return; const k = clamp(Math.min((r.width - 60) / (x1 - x0 || 1), (r.height - 60) / (y1 - y0 || 1)), 0.3, 1.2);
    G.view.k = k; G.view.x = (r.width - (x1 - x0) * k) / 2 - x0 * k; G.view.y = (r.height - (y1 - y0) * k) / 2 - y0 * k; applyView(); change("view");
  }
  function centerOn(id) { const n = G.nodes.find(q => q.id === id); if (!n) return; const r = host.getBoundingClientRect(); G.view.x = r.width / 2 - (n.x + 80) * G.view.k; G.view.y = r.height / 2 - (n.y + 40) * G.view.k; applyView(); }
  const canDel = n => !(T(n).fixed);
  function deleteSel() {
    if (selL) { G.links = G.links.filter(L => L.id !== selL); selL = null; change("links"); render(); return true; }
    const ids = [...selN].filter(id => { const n = G.nodes.find(q => q.id === id); return n && canDel(n); }); if (!ids.length) return false;
    if (o.beforeDelete) o.beforeDelete(ids);
    G.nodes = G.nodes.filter(n => !ids.includes(n.id)); G.links = G.links.filter(L => !ids.includes(L.from[0]) && !ids.includes(L.to[0])); selN.clear(); change("nodes", { removed: ids }); render(); return true;
  }
  api.deleteSel = deleteSel;
  api.connect = (from, to) => { const tn = G.nodes.find(q => q.id === to[0]); const P = tn && ins(tn)[to[1]]; if (!P) return null; if (!P.multi) G.links = G.links.filter(L => !(L.to[0] === to[0] && L.to[1] === to[1])); if (G.links.some(L => L.from[0] === from[0] && L.from[1] === from[1] && L.to[0] === to[0] && L.to[1] === to[1])) return null; if (o.canConnect && !o.canConnect(from, to)) return null; const L = { id: nid2("lk"), from, to }; G.links.push(L); return L; };
  api.addNode = (n) => { n.id = n.id || nid2("n"); G.nodes.push(n); return n; };
  function addMenu(e, at) { const pos = at || (() => { const r = host.getBoundingClientRect(); return toWorld(r.left + r.width / 2 - 70, r.top + r.height / 2 - 30); })(); const items = o.addItems ? o.addItems(pos) : []; openMenu(e.currentTarget || host, items, e.clientX != null ? [e.clientX, e.clientY] : null); }

  // ---------- pointer handling ----------
  const ptrs = new Map(); let drag = null;
  host.addEventListener("pointerdown", e => {
    if (e.target.closest(".ng-tools") || e.target.closest(".ng-body input,.ng-body select,.ng-body textarea,.ng-body button,.ng-body label")) return;
    host.focus({ preventScroll: true });
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; drag = { mode: "pinch", d0: Math.hypot(a[0] - b[0], a[1] - b[1]), k0: G.view.k, c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }; return; }
    if (e.button === 2) return;
    const port = e.target.closest(".ng-port");
    try { host.setPointerCapture(e.pointerId); } catch (_) {}
    if (port && e.button === 0) {
      const nodeId = port.dataset.node, i = +port.dataset.port, dir = port.dataset.dir;
      if (dir === "in") { const ex = G.links.find(L => L.to[0] === nodeId && L.to[1] === i); if (ex) { G.links = G.links.filter(L => L !== ex); tmp = { dir: "out", from: ex.from, a: portXY(ex.from[0], "out", ex.from[1]), b: toWorld(e.clientX, e.clientY), kind: kindOf(ex.from[0], "out", ex.from[1]), picked: ex }; drag = { mode: "wire" }; drawWires(); return; } }
      tmp = { dir, from: [nodeId, i], a: portXY(nodeId, dir, i), b: toWorld(e.clientX, e.clientY), kind: kindOf(nodeId, dir, i) }; drag = { mode: "wire" }; drawWires(); return;
    }
    const wire = e.target.closest(".ng-whit");
    if (wire) { selL = wire.dataset.link; selN.clear(); nodeEls.forEach(d => d.classList.remove("sel")); drawWires(); drag = null; return; }
    const nd = e.target.closest(".ng-node");
    if (nd && e.button === 0) {
      const id = nd.dataset.id; if (e.shiftKey || e.ctrlKey || e.metaKey) { if (selN.has(id)) selN.delete(id); else selN.add(id); select([...selN]); } else if (!selN.has(id)) select(id); else if (o.onSelect) o.onSelect([...selN]);
      drag = { mode: "move", start: [e.clientX, e.clientY], orig: [...selN].map(id2 => { const n = G.nodes.find(q => q.id === id2); return [n, n.x, n.y]; }), moved: false }; return;
    }
    if (e.shiftKey && e.button === 0) { const r = host.getBoundingClientRect(); drag = { mode: "marq", a: [e.clientX - r.left, e.clientY - r.top] }; marq.hidden = false; Object.assign(marq.style, { left: drag.a[0] + "px", top: drag.a[1] + "px", width: "0px", height: "0px" }); return; }
    drag = { mode: "pan", start: [e.clientX, e.clientY], v: [G.view.x, G.view.y], moved: false };
  });
  host.addEventListener("pointermove", e => {
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (!drag) return;
    if (drag.mode === "pinch" && ptrs.size >= 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); zoomAt(clamp(drag.k0 * d / drag.d0, 0.25, 2.5) / G.view.k, drag.c[0], drag.c[1]); return; }
    if (drag.mode === "pan") { const dx = e.clientX - drag.start[0], dy = e.clientY - drag.start[1]; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true; G.view.x = drag.v[0] + dx; G.view.y = drag.v[1] + dy; applyView(); }
    else if (drag.mode === "move") { const dx = (e.clientX - drag.start[0]) / G.view.k, dy = (e.clientY - drag.start[1]) / G.view.k; if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true; if (!drag.moved) return; for (const [n, x, y] of drag.orig) { n.x = Math.round((x + dx) / 4) * 4; n.y = Math.round((y + dy) / 4) * 4; const d = nodeEls.get(n.id); if (d) { d.style.left = n.x + "px"; d.style.top = n.y + "px"; } } drawWires(); }
    else if (drag.mode === "wire") { tmp.b = toWorld(e.clientX, e.clientY); const over = document.elementFromPoint(e.clientX, e.clientY); host.querySelectorAll(".ng-port.hot").forEach(x => x.classList.remove("hot")); const pt = over && over.closest && over.closest(".ng-port"); if (pt && pt.dataset.dir !== tmp.dir && pt.dataset.node !== tmp.from[0]) pt.classList.add("hot"); drawWires(); }
    else if (drag.mode === "marq") { const r = host.getBoundingClientRect(), b = [e.clientX - r.left, e.clientY - r.top]; Object.assign(marq.style, { left: Math.min(drag.a[0], b[0]) + "px", top: Math.min(drag.a[1], b[1]) + "px", width: Math.abs(b[0] - drag.a[0]) + "px", height: Math.abs(b[1] - drag.a[1]) + "px" }); drag.b = b; }
  });
  const up = e => {
    ptrs.delete(e.pointerId); if (!drag) return; const D = drag; if (D.mode === "pinch" && ptrs.size) return; drag = null;
    if (D.mode === "pan") { if (!D.moved && e.button === 0 && !e.target.closest(".ng-node")) { select([]); } else change("view"); }
    else if (D.mode === "move") { if (D.moved) change("move"); }
    else if (D.mode === "wire") {
      host.querySelectorAll(".ng-port.hot").forEach(x => x.classList.remove("hot"));
      const over = document.elementFromPoint(e.clientX, e.clientY), pt = over && over.closest && over.closest(".ng-port"); const t0 = tmp; tmp = null;
      if (pt && pt.dataset.dir !== t0.dir && pt.dataset.node !== t0.from[0]) { const other = [pt.dataset.node, +pt.dataset.port]; const from = t0.dir === "out" ? t0.from : other, to = t0.dir === "out" ? other : t0.from; if (o.beforeChange) o.beforeChange(); api.connect(from, to); change("links"); }
      else if (t0.picked) { if (o.beforeChange) o.beforeChange(); change("links"); }
      else if (o.dropWire && !pt) { o.dropWire(t0, toWorld(e.clientX, e.clientY), [e.clientX, e.clientY]); }
      drawWires();
    } else if (D.mode === "marq") { marq.hidden = true; if (D.b) { const r = host.getBoundingClientRect(); const [x0, y0] = toWorld(Math.min(D.a[0], D.b[0]) + r.left, Math.min(D.a[1], D.b[1]) + r.top), [x1, y1] = toWorld(Math.max(D.a[0], D.b[0]) + r.left, Math.max(D.a[1], D.b[1]) + r.top); select(G.nodes.filter(n => { const d = nodeEls.get(n.id), w = d ? d.offsetWidth : 160, h = d ? d.offsetHeight : 60; return n.x < x1 && n.x + w > x0 && n.y < y1 && n.y + h > y0; }).map(n => n.id), e.shiftKey); } }
  };
  host.addEventListener("pointerup", up); host.addEventListener("pointercancel", up);
  host.addEventListener("wheel", e => { if (e.target.closest(".ng-body textarea") && !e.ctrlKey) return; e.preventDefault(); zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX, e.clientY); }, { passive: false });
  host.addEventListener("dblclick", e => { if (e.target.closest(".ng-node,.ng-tools")) { const nd = e.target.closest(".ng-node"); if (nd && o.onOpen && !e.target.closest(".ng-body")) o.onOpen(nd.dataset.id); return; } addMenu(e, toWorld(e.clientX, e.clientY)); });
  host.addEventListener("contextmenu", e => {
    e.preventDefault(); e.stopPropagation(); const at = [e.clientX, e.clientY];
    const wire = e.target.closest(".ng-whit"), nd = e.target.closest(".ng-node");
    if (wire) { const id = wire.dataset.link; selL = id; drawWires(); openMenu(host, [{ h: "Dây nối" }, { label: "Xoá dây", kbd: "Del", run: () => { if (o.beforeChange) o.beforeChange(); G.links = G.links.filter(L => L.id !== id); selL = null; change("links"); drawWires(); } }, ...(o.wireItems ? o.wireItems(G.links.find(L => L.id === id), toWorld(...at)) : [])], at); return; }
    if (nd) { const id = nd.dataset.id; if (!selN.has(id)) select(id); const n = G.nodes.find(q => q.id === id); openMenu(host, [...(o.nodeItems ? o.nodeItems(n, [...selN]) : []), ...(canDel(n) ? [{ label: "Xoá node", kbd: "Del", run: () => { if (o.beforeChange) o.beforeChange(); deleteSel(); } }] : [])], at); return; }
    addMenu({ currentTarget: host, clientX: at[0], clientY: at[1] }, toWorld(...at));
  });
  host.addEventListener("keydown", e => {
    if (e.target.matches("input,select,textarea")) return;
    if (e.key === "Delete" || e.key === "Backspace") { if (o.beforeChange) o.beforeChange(); if (deleteSel()) { e.preventDefault(); e.stopPropagation(); } }
    else if (e.key === "f" || e.key === "F") { e.preventDefault(); e.stopPropagation(); fit(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") { e.preventDefault(); e.stopPropagation(); select(G.nodes.map(n => n.id)); }
    else if (o.onKey && o.onKey(e, [...selN])) { e.preventDefault(); e.stopPropagation(); }
  });
  new ResizeObserver(() => drawWires()).observe(host);
  render();
  return api;
}
/* topological order of nodes reachable from roots following links; returns null on cycles */
function ngTopo(G) {
  const indeg = new Map(G.nodes.map(n => [n.id, 0])); for (const L of G.links) if (indeg.has(L.to[0]) && indeg.has(L.from[0])) indeg.set(L.to[0], indeg.get(L.to[0]) + 1);
  const q = G.nodes.filter(n => !indeg.get(n.id)).map(n => n.id), out = [];
  while (q.length) { const id = q.shift(); out.push(id); for (const L of G.links) if (L.from[0] === id && indeg.has(L.to[0])) { indeg.set(L.to[0], indeg.get(L.to[0]) - 1); if (!indeg.get(L.to[0])) q.push(L.to[0]); } }
  return out.length === G.nodes.length ? out : null;
}
