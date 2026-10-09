import sys
p='p/index.html'; s=open(p,encoding='utf-8').read()
def rep(a,b):
    global s
    n=s.count(a)
    if n!=1: sys.exit(f"count {n}: {a[:80]}")
    s=s.replace(a,b)
A='window.VINCutAndroid'
# addMediaFile accepts a URL (restored phone files served by the app)
rep('async function addMediaFile(blob, name) {\n  const type = blob.type ||',
    'async function addMediaFile(blob, name, srcUrl) {\n  const type = (blob && blob.type) ||')
rep('  const url = URL.createObjectURL(blob);\n  const old = [...media.values()].find(x => x.missing && x.name === name);',
    '  const url = srcUrl || URL.createObjectURL(blob);\n  const old = [...media.values()].find(x => x.missing && x.name === name);')
rep('await decodeAudio(m, await blob.arrayBuffer()); await makeWave(m); }',
    'await decodeAudio(m, await (srcUrl ? (await fetch(srcUrl)).arrayBuffer() : blob.arrayBuffer())); await makeWave(m); }')
rep('toast("Không mở được " + name + ". Thử MP4, MOV, MP3, M4A, JPG hoặc PNG."); URL.revokeObjectURL(url); return null; }\n  media.set(m.id, m); renderBin(); return m;',
    'toast("Không mở được " + name + ". Thử MP4, MOV, MP3, M4A, JPG hoặc PNG."); if (!srcUrl) URL.revokeObjectURL(url); return null; }\n  if (srcUrl) m.persist = srcUrl; else if (window.VINCutAndroid) { try { const pu = VINCutAndroid.persistUrl(name); if (pu) m.persist = pu; } catch (_) {} }\n  media.set(m.id, m); renderBin(); return m;')
# project json keeps phone-file links
rep('file: m.user ? null : m.url,', 'file: m.user ? (m.persist || null) : m.url,')
# saver for Android
rep('async function getSaver() {\n', '''async function getSaver() {
  if (window.VINCutAndroid) return { save: async ({ filename, data }) => {
    const blob = data instanceof Blob ? data : new Blob([data], { type: filename.endsWith(".json") ? "application/json" : "application/octet-stream" });
    const id = VINCutAndroid.begin(filename, blob.type || "application/octet-stream"); const CH = 768 * 1024;
    const b64 = b => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1] || ""); fr.onerror = rej; fr.readAsDataURL(b); });
    for (let o = 0; o < blob.size; o += CH) { if (!VINCutAndroid.append(id, await b64(blob.slice(o, o + CH)))) throw { code: "write" }; }
    const where = VINCutAndroid.finish(id); if (!where) throw { code: "write" }; return { status: "saved", where };
  } };
''')
# refactor project loading into a function, used by "Mở dự án" and autosave restore
rep('''  let o = null; try { o = JSON.parse(await f.text()); } catch (_) {}
  if (!o || !["vincut"].includes(o.format) || !Array.isArray(o.V)) { toast("File này không phải dự án VINCut."); return; }
  pause(); pushUndo();''', '''  let o = null; try { o = JSON.parse(await f.text()); } catch (_) {}
  loadProjectObj(o);
};
function loadProjectObj(o, quiet) {
  if (!o || !["vincut"].includes(o.format) || !Array.isArray(o.V)) { toast("File này không phải dự án VINCut."); return; }
  pause(); pushUndo(); const relink = [];''')
rep('''    else { media.set(e2.id, { id: e2.id, name: e2.name, kind: e2.kind, url: "", duration: e2.duration, missing: true, user: true }); if (e2.used) missing++; }
  }''', '''    else { media.set(e2.id, { id: e2.id, name: e2.name, kind: e2.kind, url: "", duration: e2.duration, missing: true, user: true }); if (e2.file && e2.user) relink.push(e2); else if (e2.used) missing++; }
  }''')
rep('''  toast(missing ? `Đã mở dự án. Còn ${missing} file bạn tự thêm cần nhập lại (đúng tên file) để hiện hình.` : "Đã mở dự án.");
};''', '''  toast(missing ? `Đã mở dự án. Còn ${missing} file bạn tự thêm cần nhập lại (đúng tên file) để hiện hình.` : relink.length ? `Đang nối lại ${relink.length} file trên máy…` : "Đã mở dự án.");
  (async () => { let bad = 0; for (const e2 of relink) { const m = await addMediaFile(null, e2.name, e2.file); if (!m) bad++; } if (relink.length) { renderAll(); toast(bad ? `Còn ${bad} file không mở lại được. Nhập lại đúng tên file.` : "Đã mở dự án."); } })();
}
/* ---------- autosave (an toàn khi Android tắt app chạy nền) ---------- */
const AUTOSAVE_KEY = "vincut-autosave"; let autosaveOn = false, lastAuto = "";
function vincutAutosave() { if (!autosaveOn) return; try { const j = projectJSON(); if (j !== lastAuto) { localStorage.setItem(AUTOSAVE_KEY, j); lastAuto = j; } } catch (_) {} }
window.vincutAutosave = vincutAutosave;
function startAutosave() { autosaveOn = true; setInterval(vincutAutosave, 8000); document.addEventListener("visibilitychange", () => { if (document.hidden) vincutAutosave(); }); window.addEventListener("pagehide", vincutAutosave); }
function offerRestore(currentJSON) {
  let saved = null; try { saved = localStorage.getItem(AUTOSAVE_KEY); } catch (_) {}
  let o = null; try { o = saved && JSON.parse(saved); } catch (_) {}
  if (!o || !Array.isArray(o.V) || saved === currentJSON) { startAutosave(); return; }
  const bar = document.createElement("div"); bar.className = "restorebar"; bar.setAttribute("role", "alert");
  const when = o.saved ? new Date(o.saved).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "";
  bar.innerHTML = '<span></span><button class="primary" id="rsYes">Khôi phục</button><button id="rsNo">Bỏ qua</button>';
  bar.querySelector("span").textContent = `Có phiên làm việc lưu tự động lúc ${when} (${o.V.length} cảnh).`;
  document.body.appendChild(bar);
  bar.querySelector("#rsYes").onclick = () => { bar.remove(); loadProjectObj(o); undoStack = []; redoStack = []; syncButtons(); startAutosave(); };
  bar.querySelector("#rsNo").onclick = () => { bar.remove(); startAutosave(); };
}''')
# boot: offer restore once the default project is in place
rep('''  if (!proj) { tracks = [{ id: "v", type: "video", name: "Video" }, { id: "t1", type: "text", name: "Chữ" }, { id: "a1", type: "audio", name: "Âm thanh" }]; $("#projBadge").textContent = "Dự án mới"; renderAll(); return; }''',
    '''  if (!proj) { tracks = [{ id: "v", type: "video", name: "Video" }, { id: "t1", type: "text", name: "Chữ" }, { id: "a1", type: "audio", name: "Âm thanh" }]; $("#projBadge").textContent = "Dự án mới"; renderAll(); offerRestore(projectJSON()); return; }''')
rep('''  projName = proj.name; $("#projBadge").textContent = proj.name; renderBin(); renderAll();''',
    '''  projName = proj.name; $("#projBadge").textContent = proj.name; renderBin(); renderAll(); offerRestore(projectJSON());''')
# CSS for the bar
rep('.newtrk{', '.restorebar{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:60;display:flex;gap:10px;align-items:center;background:var(--panel);border:1px solid var(--accent);border-radius:10px;padding:10px 12px;box-shadow:0 8px 30px rgba(0,0,0,.5);font-size:13px;max-width:calc(100vw - 32px);flex-wrap:wrap}\n.newtrk{')
open(p,'w',encoding='utf-8').write(s); print('ok')
