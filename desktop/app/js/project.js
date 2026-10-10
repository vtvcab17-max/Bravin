"use strict";
/* ============================================================================
   Project data: serialise / load, .json export-import, local project store
   (IndexedDB: projects + imported media blobs), autosave.
   ========================================================================== */
let projName = "Bravin", curProjectId = null, lastSavedJSON = "";
function projectJSON() {
  const used = new Set([...V.map(c => c.mediaId), ...C.map(c => c.mediaId)].filter(Boolean));
  const med = [...media.values()].map(m => ({ id: m.id, name: m.name, kind: m.kind, duration: Math.round((m.duration || 0) * 1000) / 1000, file: m.user ? (m.persist || null) : (m.url || null), strip: m.user && (m.kind === "audio" || /^blob:/.test(m.strip || "")) ? undefined : m.strip, thumb: m.user && /^blob:/.test(m.thumb || "") ? undefined : m.thumb, stripN: m.stripN, stripAR: m.stripAR, user: !!m.user, used: used.has(m.id), stored: m.stored || undefined, gen: m.gen, fromVideo: m.fromVideo, hasAudio: m.hasAudio || undefined }));
  return JSON.stringify({ format: "vincut", version: 3, saved: new Date().toISOString(), name: projName, aspect: $("#aspect").value, tracks, media: med, V, C, markers, markerNotes: typeof markerNotes !== "undefined" ? markerNotes : undefined, coverT }, null, 1);
}
$("#saveProj").onclick = async () => {
  const downloads = await getSaver();
  if (!downloads) { toast("Lưu file chỉ chạy khi mở trang này trên claude.ai."); return; }
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  try { await saveCurrent(true); await downloads.save({ filename: `vincut-${slug(projName)}-${stamp}.json`, data: projectJSON() }); toast("Đã xuất file dự án (.json). Gửi file này cho Claude ở chat mới để xuất bản chất lượng đầy đủ."); }
  catch (e) { toast(e && e.code === "declined" ? "Bạn đã huỷ lưu file." : "Không lưu được (" + (e && e.code || "lỗi") + ")."); }
};
const slug = s => String(s || "du-an").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 40) || "du-an";
$("#openProj").onclick = () => $("#projFile").click();
$("#projFile").onchange = async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  let o = null; try { o = JSON.parse(await f.text()); } catch (_) {}
  if (!o || !["vincut"].includes(o.format) || !Array.isArray(o.V)) { toast("File này không phải dự án Bravin."); return; }
  await saveCurrent(true); const id = await createProjectRecord(o.name || f.name.replace(/\.json$/i, ""), o.aspect || "9:16");
  await openProjectById(id, o); if (typeof hideHome === "function") hideHome();
};

/* ---------- reset + load ---------- */
function resetEditor() {
  pause(); for (const m of media.values()) { if (m.url && m.url.startsWith("blob:")) URL.revokeObjectURL(m.url); (m.els || []).forEach(el => { try { el.removeAttribute("src"); el.load(); el.remove(); } catch (_) {} }); }
  media.clear(); tracks = []; V = []; C = []; markers = []; if (typeof markerNotes !== "undefined") markerNotes = {}; coverT = null; undoStack = []; redoStack = []; sel = null; t = 0; hoverT = null;
}
function bumpUid() { let mx = uid; const scan = id => { const m = /_([0-9a-z]+)$/.exec(String(id || "")); if (m) mx = Math.max(mx, parseInt(m[1], 36) + 1); }; tracks.forEach(x => scan(x.id)); V.forEach(x => scan(x.id)); C.forEach(x => scan(x.id)); media.forEach(x => scan(x.id)); uid = mx; }
async function loadProjectObj(o, opts = {}) {
  if (!o || !["vincut"].includes(o.format) || !Array.isArray(o.V)) { toast("File này không phải dự án Bravin."); return false; }
  resetEditor();
  const later = []; let missing = 0;
  for (const e2 of o.media || []) {
    const base = { id: e2.id, name: e2.name, kind: e2.kind, duration: e2.duration, hasAudio: !!e2.hasAudio };
    if (e2.file && !e2.user) { media.set(e2.id, Object.assign(base, { url: e2.file, strip: e2.strip, thumb: e2.thumb, stripN: e2.stripN, stripAR: e2.stripAR })); if (e2.kind === "audio") later.push(() => fetch(e2.file).then(r => r.arrayBuffer()).then(ab => decodeAudio(media.get(e2.id), ab)).then(() => makeWave(media.get(e2.id))).catch(() => {}));
      else if (e2.kind === "image") later.unshift(async () => { const m = media.get(e2.id), img = new Image(); img.src = e2.file; try { await img.decode(); m.img = img; if (!m.thumb) m.thumb = e2.file; if (!m.strip) m.strip = e2.file; } catch (_) {} });
      continue; }
    if (e2.gen) { media.set(e2.id, Object.assign(base, { url: "", gen: e2.gen })); later.push(async () => { const m = media.get(e2.id); m.buf = await genSfx(e2.gen); await makeWave(m); }); continue; }
    if (e2.fromVideo) { media.set(e2.id, Object.assign(base, { url: "", fromVideo: e2.fromVideo, user: true })); later.push(async () => { const vm = media.get(e2.fromVideo), m = media.get(e2.id); if (!vm || !vm.url) return; try { m.buf = await actx.decodeAudioData(await (await fetch(vm.url)).arrayBuffer()); await makeWave(m); } catch (_) {} }); continue; }
    media.set(e2.id, Object.assign(base, { url: "", missing: true, user: true }, e2.kind === "video" && e2.strip ? { strip: e2.strip, thumb: e2.thumb, stripN: e2.stripN, stripAR: e2.stripAR } : {}));
    if (e2.file) later.unshift(async () => { const m = await addMediaFile(null, e2.name, e2.file, e2.id); if (!m) missing++; });
    else if (e2.stored && curProjectId) later.unshift(async () => { const b = await STORE.getBlob(curProjectId + ":" + e2.id).catch(() => null); if (b) { const m = await addMediaFile(b, e2.name, null, e2.id, true); if (!m) missing++; } else if (e2.used) missing++; });
    else if (e2.used) missing++;
  }
  tracks = o.tracks || []; V = o.V; C = o.C || []; markers = o.markers || []; if (typeof markerNotes !== "undefined") markerNotes = o.markerNotes || {}; coverT = o.coverT ?? null; projName = o.name || projName; setAspect(o.aspect || "9:16"); bumpUid();
  $("#projBadge").textContent = projName; renderBin(); renderAll();
  const vfirst = V[0] && media.get(V[0].mediaId); if (vfirst && vfirst.url) { const el = getEl(vfirst, 0); el.addEventListener("loadeddata", () => { if (!playing) drawFrame(); }, { once: true }); }
  if (later.length) { if (!opts.quiet) toast("Đang tải media của dự án…"); for (const f of later.filter((_, i) => i < later.length)) { try { await f(); } catch (_) {} } renderBin(); renderAll(); }
  if (missing) toast(`Còn ${missing} file chưa có trong máy này. Nhập lại đúng tên file để hiện hình.`);
  lastSavedJSON = projectJSON(); return true;
}

/* ---------- IndexedDB store ---------- */
const STORE = (() => {
  let dbp = null, mem = { projects: new Map(), blobs: new Map() }, ok = true;
  const open = () => dbp || (dbp = new Promise((res, rej) => { try { const r = indexedDB.open("vincut", 1); r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains("projects")) d.createObjectStore("projects", { keyPath: "id" }); if (!d.objectStoreNames.contains("blobs")) d.createObjectStore("blobs"); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } }).catch(e => { ok = false; return null; }));
  const tx = async (store, mode, fn) => { const db = await open(); if (!db) return fn(null); return new Promise((res, rej) => { const t2 = db.transaction(store, mode), s = t2.objectStore(store), r = fn(s); t2.oncomplete = () => res(r && "result" in r ? r.result : r); t2.onerror = () => rej(t2.error); t2.onabort = () => rej(t2.error); }); };
  return {
    available: () => ok,
    all: () => tx("projects", "readonly", s => s ? s.getAll() : { result: [...mem.projects.values()] }),
    get: id => tx("projects", "readonly", s => s ? s.get(id) : { result: mem.projects.get(id) }),
    put: rec => tx("projects", "readwrite", s => s ? s.put(rec) : (mem.projects.set(rec.id, rec), {})),
    del: id => tx("projects", "readwrite", s => s ? s.delete(id) : (mem.projects.delete(id), {})),
    putBlob: (k, b) => tx("blobs", "readwrite", s => s ? s.put(b, k) : (mem.blobs.set(k, b), {})),
    getBlob: k => tx("blobs", "readonly", s => s ? s.get(k) : { result: mem.blobs.get(k) }),
    delBlobs: async prefix => { const db = await open(); if (!db) { for (const k of [...mem.blobs.keys()]) if (k.startsWith(prefix)) mem.blobs.delete(k); return; } return new Promise(res => { const t2 = db.transaction("blobs", "readwrite"), s = t2.objectStore("blobs"), r = s.openCursor(); r.onsuccess = () => { const cur = r.result; if (!cur) return; if (String(cur.key).startsWith(prefix)) cur.delete(); cur.continue(); }; t2.oncomplete = () => res(); t2.onerror = () => res(); }); },
    copyBlobs: async (from, to) => { const db = await open(); if (!db) return; const pairs = await new Promise(res => { const out = [], t2 = db.transaction("blobs", "readonly"), r = t2.objectStore("blobs").openCursor(); r.onsuccess = () => { const cur = r.result; if (!cur) return res(out); if (String(cur.key).startsWith(from + ":")) out.push([String(cur.key).slice(from.length + 1), cur.value]); cur.continue(); }; r.onerror = () => res(out); }); for (const [k, v] of pairs) await STORE.putBlob(to + ":" + k, v); }
  };
})();
async function createProjectRecord(name, aspect) {
  const id = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), now = Date.now();
  await STORE.put({ id, name: name || "Dự án mới", aspect: aspect || "9:16", created: now, updated: now, duration: 0, thumb: "", data: "" }); return id;
}
async function openProjectById(id, obj) {
  const rec = await STORE.get(id); if (!rec) { toast("Không tìm thấy dự án."); return false; }
  curProjectId = id; projName = rec.name;
  const o = obj || (rec.data ? JSON.parse(rec.data) : null);
  if (o) { o.name = rec.name; await loadProjectObj(o, {}); setTimeout(() => typeof showMainTrack === "function" && showMainTrack(), 80); }
  else { resetEditor(); tracks = [{ id: "v", type: "video", name: "Video" }, { id: "t1", type: "text", name: "Chữ" }, { id: "a1", type: "audio", name: "Âm thanh" }]; setAspect(rec.aspect || "9:16"); $("#projBadge").textContent = projName; renderBin(); renderAll(); lastSavedJSON = ""; }
  await saveCurrent(true); return true;
}
function thumbNow() { try { const tc = document.createElement("canvas"), k = 240 / Math.max(cv.width, cv.height); tc.width = Math.round(cv.width * k); tc.height = Math.round(cv.height * k); tc.getContext("2d").drawImage(cv, 0, 0, tc.width, tc.height); return tc.toDataURL("image/jpeg", 0.72); } catch (e) { return ""; } }
let saving = false;
async function saveCurrent(force) {
  if (!curProjectId || saving || exporting) return; const j = projectJSON(); const body = j.replace(/"saved": "[^"]*",?/, "");
  if (!force && body === lastSavedJSON.replace(/"saved": "[^"]*",?/, "")) return;
  saving = true;
  try { const rec = (await STORE.get(curProjectId)) || { id: curProjectId, created: Date.now() }; Object.assign(rec, { name: projName, aspect: $("#aspect").value, updated: Date.now(), duration: total(), data: j }); if (V.length || C.length) { const th = thumbNow(); if (th && th.length > 1200) rec.thumb = th; } await STORE.put(rec); lastSavedJSON = j; }
  catch (e) { console.warn("save failed", e); } finally { saving = false; }
}
let _persistAsked = false;
async function storeMediaBlob(m, blob) { if (!curProjectId || !blob) return;
  // xin trình duyệt giữ dữ liệu lâu dài (không tự xoá video đã nhập khi máy thiếu dung lượng)
  if (!_persistAsked && navigator.storage && navigator.storage.persist) { _persistAsked = true; try { if (!(await navigator.storage.persisted())) await navigator.storage.persist(); } catch (_) {} }
  try { await STORE.putBlob(curProjectId + ":" + m.id, blob); m.stored = true; } catch (e) { toast("Bộ nhớ trình duyệt đầy: file " + m.name + " chỉ dùng được trong phiên này."); } }
window.vincutAutosave = () => saveCurrent();
setInterval(() => { if (!playing) saveCurrent(); }, 5000);
document.addEventListener("visibilitychange", () => { if (document.hidden) saveCurrent(); });
window.addEventListener("pagehide", () => saveCurrent());
