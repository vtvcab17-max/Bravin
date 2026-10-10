"use strict";
/* ---------- wiring ---------- */
$("#playBtn").onclick = () => playing ? pause() : play();
$("#toStart").onclick = () => { seek(0); scroller.scrollLeft = 0; };
$("#stepBack").onclick = () => { if (playing) pause(); seek(t - 1 / FPS); };
$("#stepFwd").onclick = () => { if (playing) pause(); seek(t + 1 / FPS); };
$("#splitBtn").onclick = splitAtPlayhead; $("#delBtn").onclick = deleteSel; $("#dupBtn").onclick = duplicateSel;
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
  let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { toast(IN_CLAUDE_PAGE ? "Trang trên claude.ai không được dùng micro. Thu âm ở Bravin bản trên máy." : "Không mở được micro. Kiểm tra quyền micro của trình duyệt."); return; }
  const rec = new MediaRecorder(stream), chunks = [], t0 = t; recState = { rec };
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  rec.onstop = async () => { stream.getTracks().forEach(x => x.stop()); pause(); $("#recBtn").classList.remove("rec"); recState = null; const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" }); const n = [...media.values()].filter(m => /^Thu âm/.test(m.name)).length + 1; const m = await addMediaFile(new File([blob], `Thu âm ${n}.webm`, { type: blob.type.startsWith("audio") ? blob.type : "audio/webm" }), `Thu âm ${n}`); if (m) { const tr = tracksOf("audio").find(x => /voice|thu âm/i.test(x.name)) || addTrack("audio"); appendMedia(m, null, { track: tr.id, start: t0 }); toast("Đã thêm bản thu vào " + tr.name); } };
  rec.start(); $("#recBtn").classList.add("rec"); toast("Đang thu âm… bấm nút micro lần nữa để dừng."); if (!playing) play();
};
$("#trimBtn").onclick = () => { const c = findSel(); if (c && sel.k === "v") openTrim(c); };
$("#textBtn").onclick = () => addTextPreset(TEXT_PRESETS[5]);
$("#undoBtn").onclick = undo; $("#redoBtn").onclick = redo;
$("#snapBtn").onclick = e => { snapOn = !snapOn; e.currentTarget.setAttribute("aria-pressed", snapOn); };
$("#zoom").oninput = e => { const center = t; pps = +e.target.value; renderTimeline(); scroller.scrollLeft = Math.max(0, center * pps - (scroller.clientWidth - headW()) / 2); };
scroller.addEventListener("wheel", e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); pps = clamp(pps * (e.deltaY < 0 ? 1.12 : 0.89), 6, 260); $("#zoom").value = pps; renderTimeline(); } }, { passive: false });
function setAspect(v) { const [a, b] = v.split(":").map(Number); const base = 720; if (a < b) { cv.width = base; cv.height = Math.round(base * b / a); } else if (a > b) { cv.height = base; cv.width = Math.round(base * a / b); } else { cv.width = cv.height = 1080; } $("#aspect").value = v; drawFrame(); }
$("#aspect").onchange = e => setAspect(e.target.value);
$("#exportBtn").onclick = startExport;
$("#newProj").onclick = () => { pushUndo(); pause(); V = []; C = []; tracks = [{ id: "v", type: "video", name: "Video" }, { id: "t1", type: "text", name: "Chữ" }, { id: "a1", type: "audio", name: "Âm thanh" }]; sel = null; t = 0; $("#projBadge").textContent = "Dự án mới"; renderAll(); toast("Đã xoá timeline. Bấm Hoàn tác để lấy lại bản dựng."); };
$("#importBtn").onclick = () => $("#file").click(); $("#drop").onclick = () => $("#file").click();
$("#file").onchange = e => { importFiles(e.target.files); e.target.value = ""; };
const binEl = $("#bin");
binEl.addEventListener("dragover", e => { if ([...e.dataTransfer.types].includes("Files")) { e.preventDefault(); binEl.classList.add("over"); } });
binEl.addEventListener("dragleave", e => { if (!binEl.contains(e.relatedTarget)) binEl.classList.remove("over"); });
binEl.addEventListener("drop", e => { e.preventDefault(); binEl.classList.remove("over"); importFiles(e.dataTransfer.files); });
document.addEventListener("keydown", e => {
  if (trimOpen || tmatch(e, "input,select,textarea")) return;
  const k = e.key.toLowerCase();
  if (k === " ") { e.preventDefault(); playing ? pause() : play(); }
  else if ((k === "s" && !e.ctrlKey && !e.metaKey) || (k === "b" && (e.ctrlKey || e.metaKey))) { e.preventDefault(); splitAtPlayhead(); }
  else if (k === "b") setTool("blade");
  else if (k === "a" && !e.ctrlKey && !e.metaKey) setTool("select");
  else if (k === "q") deleteSide("left");
  else if (k === "w") deleteSide("right");
  else if (k === "m") toggleMarker();
  else if (k === "k" && !e.ctrlKey && !e.metaKey) quickKeyframe();
  else if (k === "escape") { closeMenu(); if (tool === "blade") setTool("select"); }
  else if (k === "t" && !e.ctrlKey && !e.metaKey) $("#trimBtn").click();
  else if (k === "delete" || k === "backspace") { e.preventDefault(); deleteSel(); }
  else if (k === "d" && !e.ctrlKey && !e.metaKey) duplicateSel();
  else if (k === "arrowleft") $("#stepBack").click();
  else if (k === "arrowright") $("#stepFwd").click();
  else if (k === "home") $("#toStart").click();
  else if ((e.ctrlKey || e.metaKey) && k === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if ((e.ctrlKey || e.metaKey) && k === "y") { e.preventDefault(); redo(); }
});
window.addEventListener("resize", () => renderTimeline());
(function () {
  const sp = $("#split"), root = document.documentElement;
  try { const h = localStorage.getItem("iqcut-tlh2"); if (h) root.style.setProperty("--tlh", h); } catch (_) {}
  const set = px => { const v = clamp(px, 240, window.innerHeight * 0.78) + "px"; root.style.setProperty("--tlh", v); renderTimeline(); try { localStorage.setItem("iqcut-tlh2", v); } catch (_) {} };
  sp.addEventListener("pointerdown", e => { e.preventDefault(); sp.classList.add("on"); const y0 = e.clientY, h0 = $(".tl").getBoundingClientRect().height; const mv = ev => set(h0 - (ev.clientY - y0)); const upf = () => { sp.classList.remove("on"); window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", upf); }; window.addEventListener("pointermove", mv); window.addEventListener("pointerup", upf); });
  sp.addEventListener("keydown", e => { const h = $(".tl").getBoundingClientRect().height; if (e.key === "ArrowUp") { e.preventDefault(); set(h + 30); } if (e.key === "ArrowDown") { e.preventDefault(); set(h - 30); } });
})();

