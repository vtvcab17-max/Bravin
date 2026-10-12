"use strict";
/* ============================================================================
   Khu PHIM AI: nhúng LocalMiniDrama (MIT © xuanyustudio, bản tiếng Việt) vào Bravin.
   - LocalMiniDrama chạy trên máy (Node + SQLite + ffmpeg, cổng 5679). Bravin mở
     giao diện của nó trong một iframe sống suốt phiên (ẩn khi đóng khu, vẫn đồng bộ).
   - Kiểm tra độ tương thích: máy chủ trả lời, bản có cầu nối Bravin, đọc được tệp
     (CORS), API dự án, giao diện nhúng bắt tay, ffmpeg, ngôn ngữ.
   - Tự đẩy: ảnh / video / âm thanh / video cả tập mà LocalMiniDrama tạo THÀNH CÔNG
     được nhập thẳng vào thư viện của dự án Bravin đang mở (nhóm "Phim AI").
   - Nút "＋ Dự án" trong LocalMiniDrama: tạo dự án Bravin mới cùng tên với phim
     đang làm, mở nó và nhập sẵn mọi tệp đã có.
   Giao thức postMessage: { source: "lmd" | "bravin", type, ... }
   ========================================================================== */
const LMD = {
  frame: null, win: null, open: false, panel: null, place: null,
  base: "", hello: null, health: null, drama: null, poll: 0, busy: false, lastOk: 0,
  autoPush: true, pushedNow: 0, fails: {},
};
const LMD_PREFIX = "Phim AI · ";
const LMD_DEFAULT = "http://localhost:5679";
const lmdIsMedia = m => !!(m && typeof m.name === "string" && m.name.startsWith(LMD_PREFIX));
function lmdLS(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (_) { return null; } }
LMD.base = (lmdLS("bravin-lmd-url") || LMD_DEFAULT).replace(/\/+$/, "");
LMD.autoPush = lmdLS("bravin-lmd-auto") !== "0";

function lmdUrl(p) { // đường dẫn tệp LMD → URL tải được
  if (!p) return ""; const s = String(p).trim(); if (!s) return "";
  if (/^(https?:|data:|blob:)/i.test(s)) return s;
  if (s.startsWith("/static/")) return LMD.base + s;
  return LMD.base + "/static/" + s.replace(/^\/+/, "");
}
async function lmdApi(path, opt) {
  const r = await fetch(LMD.base + "/api/v1" + path, Object.assign({ cache: "no-store" }, opt || {}));
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json(); if (j && j.success === false) throw new Error((j.error && j.error.message) || "API lỗi");
  return j && j.data !== undefined ? j.data : j;
}
function lmdPost(type, extra) { try { LMD.win && LMD.win.postMessage(Object.assign({ source: "bravin", type }, extra || {}), "*"); } catch (_) {} }
function lmdState() { lmdPost("state", { autoPush: LMD.autoPush, project: curProjectId ? projName : "" }); }

/* ---------- kiểm tra độ tương thích ---------- */
async function lmdCheck() {
  const out = []; const add = (ok, name, info, fix, warn) => out.push({ ok, name, info, fix, warn: !!warn });
  let h = null;
  try {
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 5000);
    const r = await fetch(LMD.base + "/health", { cache: "no-store", signal: ctl.signal }); clearTimeout(to);
    h = await r.json();
    add(true, "Máy chủ LocalMiniDrama", `${h.app || "LocalMiniDrama"} đang chạy ở ${LMD.base}`);
  } catch (e) {
    const mixed = location.protocol === "https:" && /^http:/.test(LMD.base) && !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(LMD.base);
    add(false, "Máy chủ LocalMiniDrama", `Không kết nối được ${LMD.base}`,
      mixed ? "Bravin đang chạy qua https nên trình duyệt chặn địa chỉ http trong mạng LAN. Mở Bravin bản Windows, hoặc chạy LocalMiniDrama trên chính máy này và dùng http://localhost:5679."
        : window.VINCutAndroid && /localhost|127\.0\.0\.1/.test(LMD.base)
          ? "Trên điện thoại, LocalMiniDrama chạy ở máy tính: nhập địa chỉ máy tính trong cùng Wi-Fi vào ô bên trên, ví dụ http://192.168.1.5:5679, rồi bấm Kiểm tra."
          : "Phim AI chưa chạy trên máy này. Chưa cài thì tải bộ cài ở trên; đã cài thì bấm «▶ Bật Phim AI» hoặc biểu tượng Phim AI trên Desktop. Đổi cổng thì sửa ô địa chỉ phía trên.");
    LMD.health = null; return out;
  }
  LMD.health = h;
  if (h.bravin_bridge >= 1) add(true, "Cầu nối Bravin", `LocalMiniDrama ${h.lmd_version || ""} · cầu nối v${h.bravin_bridge}`);
  else add(false, "Cầu nối Bravin", "Đây là bản LocalMiniDrama gốc, chưa có cầu nối Bravin (không có nút ＋ Dự án, không tự đẩy).", "Dùng bản LocalMiniDrama-vi đi kèm Bravin 4.10.");
  add(true, "Đọc tệp từ trình duyệt (CORS)", "Bravin đọc được dữ liệu của LocalMiniDrama");
  try { await lmdApi("/dramas?page=1&page_size=1"); add(true, "API dự án", "Đọc được danh sách phim"); }
  catch (e) { add(false, "API dự án", "Gọi /api/v1/dramas lỗi: " + e.message, "Khởi động lại LocalMiniDrama. Nếu vẫn lỗi, xem cửa sổ dòng lệnh của nó."); }
  if (h.ffmpeg === false) add(false, "ffmpeg", "Không thấy ffmpeg: không ghép được video cả tập, không trích khung cuối.", "Windows: chép ffmpeg.exe từ gói LocalMiniDrama gốc (backend-node/tools/ffmpeg/ffmpeg.exe) vào đúng chỗ đó trong LocalMiniDrama-vi, rồi chạy lại. Máy khác: cài ffmpeg vào PATH.", true);
  else if (h.ffmpeg) add(true, "ffmpeg", "Có ffmpeg để ghép video cả tập");
  if (h.language && h.language !== "vi") add(false, "Ngôn ngữ AI", `Đang đặt "${h.language}"`, "Đặt app.language: vi trong backend-node/configs/config.yaml để AI viết kịch bản, thoại bằng tiếng Việt.", true);
  else if (h.language) add(true, "Ngôn ngữ AI", "Tiếng Việt (prompt ảnh/video giữ tiếng Anh)");
  return out;
}

/* ---------- iframe (tạo một lần, sống suốt phiên) ---------- */
function lmdEnsureFrame() {
  if (LMD.frame) return LMD.frame;
  const f = document.createElement("iframe"); f.className = "lmdframe"; f.title = "Phim AI · LocalMiniDrama";
  f.setAttribute("allow", "autoplay; fullscreen; clipboard-write");
  f.src = LMD.base + "/"; document.body.appendChild(f); LMD.frame = f; LMD.win = f.contentWindow;
  f.addEventListener("load", () => { LMD.win = f.contentWindow; lmdPost("ping", { version: document.querySelector('meta[name="bravin-version"]')?.content || "" }); });
  return f;
}
function lmdReloadFrame() { if (LMD.frame) { LMD.frame.remove(); LMD.frame = null; LMD.win = null; LMD.hello = null; LMD.drama = null; } }

window.addEventListener("message", ev => {
  const m = ev.data; if (!m || m.source !== "lmd") return;
  if (LMD.frame && ev.source !== LMD.frame.contentWindow) return;
  switch (m.type) {
    case "hello": LMD.hello = { version: m.version, bridge: m.bridge, features: m.features || [] }; lmdState(); lmdStatus(); break;
    case "context": LMD.drama = m.drama || null; lmdStatus(); if (LMD.drama) lmdSync("auto"); break;
    case "sync-now": if (m.drama) LMD.drama = m.drama; lmdSync("manual"); break;
    case "new-project": if (m.drama) LMD.drama = m.drama; lmdNewProject(m.drama); break;
  }
});

/* ---------- quét tệp đã tạo xong của một phim ---------- */
async function lmdCollect(dramaId) {
  const d = await lmdApi(`/dramas/${dramaId}`);
  const items = []; const add = (path, name, kind) => { const url = lmdUrl(path); if (url) items.push({ key: url.replace(LMD.base, ""), url, name: LMD_PREFIX + name, kind }); };
  let vids = [];
  try { const v = await lmdApi(`/videos?drama_id=${dramaId}&status=completed&page_size=100`); vids = (v && (v.items || v)) || []; } catch (_) {}
  const vidBySb = new Map(); for (const v of vids) if (v.storyboard_id && !vidBySb.has(v.storyboard_id)) vidBySb.set(v.storyboard_id, v); // mới nhất trước
  for (const ep of (d.episodes || []).slice().sort((a, b) => (a.episode_number || 0) - (b.episode_number || 0))) {
    const T = `T${ep.episode_number || "?"}`;
    for (const sb of (ep.storyboards || []).slice().sort((a, b) => (a.storyboard_number || 0) - (b.storyboard_number || 0))) {
      const S = `${T} · C${String(sb.storyboard_number || 0).padStart(2, "0")}`;
      if (sb.local_path || sb.image_url) add(sb.local_path || sb.image_url, `${S} · ảnh`, "image");
      const vg = vidBySb.get(sb.id); const vp = (vg && (vg.local_path || vg.video_url)) || sb.video_local_path || sb.video_url;
      if (vp) add(vp, `${S} · video`, "video");
      if (sb.audio_local_path) add(sb.audio_local_path, `${S} · thoại`, "audio");
      if (sb.narration_audio_local_path) add(sb.narration_audio_local_path, `${S} · thuyết minh`, "audio");
    }
    if (ep.video_url) add(ep.video_url, `${T} · cả tập`, "video");
  }
  try { const ms = await lmdApi(`/video-merges?drama_id=${dramaId}`); const epNo = new Map((d.episodes || []).map(e => [e.id, e.episode_number]));
    for (const mg of (ms || [])) if (mg.status === "completed" && mg.merged_url) add(mg.merged_url, `T${epNo.get(mg.episode_id) || "?"} · cả tập (ghép)`, "video"); } catch (_) {}
  for (const c of d.characters || []) if (c.local_path || c.image_url) add(c.local_path || c.image_url, `Nhân vật · ${c.name || c.id}`, "image");
  for (const s of d.scenes || []) if (s.local_path || s.image_url) add(s.local_path || s.image_url, `Bối cảnh · ${(s.location || "") + (s.time ? " " + s.time : "") || s.id}`, "image");
  for (const p of d.props || []) if (p.local_path || p.image_url) add(p.local_path || p.image_url, `Đạo cụ · ${p.name || p.id}`, "image");
  const seen = new Set(); return { drama: d, items: items.filter(i => !seen.has(i.key) && seen.add(i.key)) };
}

/* ---------- sổ ghi theo dự án Bravin: tệp nào đã nhập / đã thấy ---------- */
function lmdBook(dramaId) {
  const k = `bravin-lmd-seen:${curProjectId}:${dramaId}`; let o = null;
  try { o = JSON.parse(lmdLS(k) || "null"); } catch (_) {}
  o = o || { imported: [], seen: [], first: true };
  return { k, imported: new Set(o.imported), seen: new Set(o.seen), first: !!o.first, save() { lmdLS(k, JSON.stringify({ imported: [...this.imported], seen: [...this.seen], first: false })); } };
}

/* mode: "auto" (chỉ tệp mới xuất hiện), "manual" / "all" (mọi tệp chưa nhập) */
async function lmdSync(mode) {
  const drama = LMD.drama; if (!drama || !drama.id) return 0;
  if (!curProjectId) { lmdStatus("Chưa mở dự án Bravin: bấm ＋ Dự án để tạo dự án cùng tên."); return 0; }
  if (mode === "auto" && !LMD.autoPush) return 0;
  if (LMD.busy) { LMD.again = mode === "auto" ? (LMD.again || "auto") : mode; return 0; }
  LMD.busy = true; let n = 0; const names = [];
  try {
    const { items } = await lmdCollect(drama.id); LMD.lastOk = Date.now();
    const book = lmdBook(drama.id), pid = curProjectId;
    let todo;
    if (mode === "auto" && book.first) { // lần đầu nối phim này với dự án đang mở: không đổ hết tệp cũ vào, chỉ nhận tệp mới từ giờ
      items.forEach(i => book.seen.add(i.key)); book.save();
      const old = items.filter(i => !book.imported.has(i.key)).length;
      if (old) lmdStatus(`Phim «${drama.title}» có sẵn ${old} tệp. Bấm ⇪ Đẩy để nhập, tệp mới sẽ tự vào thư viện.`);
      todo = [];
    } else todo = items.filter(i => mode === "auto" ? !book.seen.has(i.key) && !book.imported.has(i.key) : !book.imported.has(i.key));
    const have = new Set([...media.values()].map(m => m.name));
    for (const it of todo) {
      if (curProjectId !== pid) break; // người dùng đổi dự án giữa chừng
      book.seen.add(it.key);
      try {
        const r = await fetch(it.url, { cache: "no-store" }); if (!r.ok) throw new Error("HTTP " + r.status);
        const blob = await r.blob(); if (!blob.size) throw new Error("tệp rỗng");
        const ext = (it.url.split("?")[0].match(/\.([a-z0-9]{2,4})$/i) || [, it.kind === "video" ? "mp4" : it.kind === "audio" ? "mp3" : "png"])[1].toLowerCase();
        let name = `${it.name}.${ext}`, k = 2; while (have.has(name)) name = `${it.name} (${k++}).${ext}`;
        const typed = blob.type && blob.type !== "application/octet-stream" ? blob : new Blob([blob], { type: it.kind === "video" ? "video/mp4" : it.kind === "audio" ? "audio/mpeg" : "image/png" });
        const m = await addMediaFile(typed, name);
        if (m) { book.imported.add(it.key); have.add(name); n++; names.push(name); }
      } catch (e) { console.warn("Phim AI: không nhập được", it.url, e); const f = (LMD.fails[it.key] || 0) + 1; LMD.fails[it.key] = f; if (mode !== "auto" || f < 3) book.seen.delete(it.key); }
    }
    book.save();
    if (n) { LMD.pushedNow += n; toast(`Phim AI: đã đưa ${n} tệp vào thư viện.`); lmdPost("pushed", { count: n, names: names.slice(0, 20) }); saveCurrent(true); }
    else if (mode === "manual") toast(todo.length ? "Phim AI: chưa nhập được tệp nào (xem lại kết nối)." : "Phim AI: không còn tệp mới để nhập.");
    lmdStatus();
  } catch (e) { lmdStatus("Không đọc được phim: " + e.message); }
  finally { LMD.busy = false; if (LMD.again) { const a = LMD.again; LMD.again = null; setTimeout(() => lmdSync(a), 300); } }
  return n;
}
function lmdStartPoll() { if (LMD.poll) return; LMD.poll = setInterval(() => { if (LMD.drama && LMD.autoPush && !document.hidden) lmdSync("auto"); }, 6000); }

/* ---------- ＋ Dự án: dự án Bravin mới cùng tên với phim LocalMiniDrama ---------- */
const LMD_ASPECT = { "16:9": "16:9", "9:16": "9:16", "1:1": "1:1", "4:3": "16:9", "3:4": "4:5", "4:5": "4:5", "21:9": "16:9" };
async function lmdNewProject(drama) {
  drama = drama || LMD.drama; if (!drama) { toast("Mở một phim trong LocalMiniDrama trước."); return null; }
  const name = String(drama.title || "Phim AI").trim() || "Phim AI";
  await saveCurrent(true);
  const id = await createProjectRecord(name, LMD_ASPECT[drama.aspect_ratio] || "16:9");
  await openProjectById(id);
  if (typeof hideHome === "function" && document.body.classList.contains("athome")) hideHome();
  lmdPost("project-created", { name }); lmdState();
  toast(`Đã tạo dự án Bravin «${name}». Đang nhập tệp của phim…`);
  const b = lmdBook(drama.id); b.first = false; b.save();
  const n = await lmdSync("all");
  lmdStatus(n ? `Dự án «${name}»: đã nhập ${n} tệp.` : `Dự án «${name}» đã tạo. Phim chưa có tệp nào; tệp mới sẽ tự vào thư viện.`);
  return id;
}

/* ---------- khu Phim AI ---------- */
function lmdStatus(msg) {
  const p = LMD.panel; if (!p) return;
  const st = p.querySelector(".lmdst"), chip = p.querySelector(".lmdchip");
  if (msg) st.textContent = msg;
  else if (LMD.drama) st.textContent = `Phim: «${LMD.drama.title}»` + (curProjectId ? ` → dự án Bravin «${projName}»` : " · chưa mở dự án Bravin");
  else st.textContent = LMD.hello ? "Mở một phim để đồng bộ với Bravin." : "";
  chip.className = "lmdchip " + (LMD.hello ? "ok" : LMD.health ? "warn" : "bad");
  chip.textContent = LMD.hello ? `Đã nối · LMD ${LMD.hello.version || ""}` : LMD.health ? "Máy chủ có, chưa bắt tay" : "Chưa nối";
}
const LMD_DL = {
  win: "https://github.com/vtvcab17-max/Bravin/raw/main/downloads/PhimAI_Setup_1.2.8.exe",
  winSize: "63 MB",
  src: "https://bravin.vtvcab17.workers.dev/downloads/LocalMiniDrama-vi_1.2.8.zip",
  guide: "huong-dan/phim-ai.html",
};
const lmdOS = () => window.VINCutAndroid || /Android|iPhone|iPad/i.test(navigator.userAgent) ? "mobile" : /Windows/i.test(navigator.userAgent) ? "win" : "other";
function lmdInstallCard() {
  const os = lmdOS(), g = LMD_DL.guide;
  if (os === "mobile") return `<div class="lmdinst"><h3>Phim AI chạy trên máy tính</h3>
    <ol><li>Cài Phim AI trên máy tính Windows: mở <b>bravin.vtvcab17.workers.dev</b> trên máy tính → Phim AI → Tải bộ cài.</li>
    <li>Máy tính và điện thoại dùng chung Wi-Fi. Trên máy tính gõ <code>ipconfig</code> để xem địa chỉ IPv4, ví dụ 192.168.1.5.</li>
    <li>Nhập <code>http://192.168.1.5:5679</code> vào ô địa chỉ phía trên rồi bấm ra ngoài.</li></ol>
    <p class="lmdnew"><a href="${g}#dien-thoai" target="_blank" rel="noopener">Xem hướng dẫn chi tiết</a></p></div>`;
  const dl = os === "win"
    ? `<a class="lmdbig primary" href="${LMD_DL.win}">⬇ Tải Phim AI cho Windows <small>${LMD_DL.winSize} · có sẵn mọi thứ, không cần cài thêm</small></a>`
    : `<a class="lmdbig primary" href="${LMD_DL.src}">⬇ Tải Phim AI cho macOS / Linux <small>12 MB · cần Node.js 18 trở lên</small></a>`;
  const steps = os === "win"
    ? `<li><b>Tải bộ cài</b> bằng nút bên dưới.</li><li><b>Mở tệp vừa tải</b> → Tiếp → Cài đặt → Xong (để nguyên ô «Bật Phim AI ngay»). Không cần quyền quản trị.</li><li><b>Chờ vài giây</b>: Bravin tự nối và mở Phim AI. Lần sau chỉ cần bấm «▶ Bật Phim AI».</li>`
    : `<li>Cài <a href="https://nodejs.org" target="_blank" rel="noopener">Node.js 18+</a>.</li><li>Tải và giải nén gói bên dưới, mở Terminal trong thư mục đó, chạy <code>bash chay_phim_ai.sh</code>.</li><li>Chờ vài giây: Bravin tự nối và mở Phim AI.</li>`;
  return `<div class="lmdinst"><h3>Cài Phim AI để bắt đầu</h3><ol>${steps}</ol>
    <div class="row wrap">${dl}${os === "win" ? '<a class="lmdbig" href="bravinlmd://start" title="Dành cho máy đã cài Phim AI">▶ Bật Phim AI <small>đã cài rồi thì bấm đây</small></a>' : ""}</div>
    <p class="lmdwait"><span class="lmdspin"></span> Đang chờ Phim AI chạy trên máy này…</p>
    <p class="lmdnew"><a href="${g}" target="_blank" rel="noopener">Hướng dẫn sử dụng</a>${os === "win" ? ` · <a href="${LMD_DL.src}">mã nguồn (macOS/Linux)</a>` : ""}</p></div>`;
}
function lmdWaitServer() {
  clearInterval(LMD.waitT);
  LMD.waitT = setInterval(async () => {
    if (!LMD.panel) { clearInterval(LMD.waitT); return; }
    try { const r = await fetch(LMD.base + "/health", { cache: "no-store" }); if (r.ok) { clearInterval(LMD.waitT); toast("Phim AI đã chạy, đang nối…"); lmdConnect(true); } } catch (_) {}
  }, 3000);
}
function lmdRenderCheck(list) {
  const box = LMD.panel && LMD.panel.querySelector(".lmdcheck"); if (!box) return;
  const bad = list.filter(x => !x.ok && !x.warn);
  const noServer = list[0] && !list[0].ok && list[0].name === "Máy chủ LocalMiniDrama";
  box.innerHTML = (noServer ? lmdInstallCard() : "") + `<h3>${noServer ? "Chi tiết kiểm tra" : "Kiểm tra độ tương thích"}</h3><ul></ul><div class="row"><button type="button" class="${noServer ? "" : "primary"}" data-a="re">Kiểm tra lại</button>${bad.length ? "" : '<button type="button" data-a="go">Mở Phim AI</button>'}</div>${bad.length && !noServer ? `<p class="lmdnew"><a href="${LMD_DL.guide}#su-co" target="_blank" rel="noopener">Xem cách xử lý sự cố</a></p>` : ""}`;
  const ul = box.querySelector("ul");
  for (const x of list) { const li = document.createElement("li"); li.className = x.ok ? "ok" : x.warn ? "warn" : "bad"; li.innerHTML = `<b></b><span></span>${x.fix ? "<small></small>" : ""}`; li.querySelector("b").textContent = (x.ok ? "✓ " : x.warn ? "! " : "✕ ") + x.name; li.querySelector("span").textContent = x.info; if (x.fix) li.querySelector("small").textContent = x.fix; ul.appendChild(li); }
  box.querySelector('[data-a="re"]').onclick = () => lmdConnect(true);
  const go = box.querySelector('[data-a="go"]'); if (go) go.onclick = () => lmdShowFrame();
  if (noServer) lmdWaitServer(); else clearInterval(LMD.waitT);
}
function lmdShowFrame() {
  const p = LMD.panel; if (!p) return; p.querySelector(".lmdcheck").hidden = true;
  const f = lmdEnsureFrame(); f.classList.add("show"); LMD.place && LMD.place(); lmdStartPoll();
  clearTimeout(LMD.helloT); LMD.helloT = setTimeout(() => { if (!LMD.hello && LMD.panel) { lmdStatus("Giao diện LocalMiniDrama chưa bắt tay với Bravin (bản gốc?). Vẫn dùng được, nhưng không có ＋ Dự án và tự đẩy."); } }, 9000);
}
async function lmdConnect(force) {
  const p = LMD.panel; if (!p) return; const box = p.querySelector(".lmdcheck");
  if (LMD.frame && LMD.hello && !force) { lmdShowFrame(); return; }
  if (LMD.frame) LMD.frame.classList.remove("show");
  box.hidden = false; box.innerHTML = "<h3>Kiểm tra độ tương thích</h3><p>Đang kiểm tra LocalMiniDrama…</p>";
  const list = await lmdCheck(); lmdStatus();
  if (LMD.frame && force) lmdReloadFrame();
  if (list.every(x => x.ok || x.warn)) { lmdRenderCheck(list); if (!force || list.every(x => x.ok)) lmdShowFrame(); }
  else lmdRenderCheck(list);
}
function openLMD() {
  if (LMD.open) return; LMD.open = true; if (typeof pause === "function") pause();
  const p = document.createElement("div"); p.className = "jzpanel lmdpanel"; p.setAttribute("role", "dialog"); p.setAttribute("aria-label", "Khu Phim AI");
  p.innerHTML = `<header class="jzbar"><b>PHIM AI</b><span class="jzsub" title="LocalMiniDrama · bản tiếng Việt · MIT © xuanyustudio">LocalMiniDrama</span><span class="lmdchip bad">Chưa nối</span><span class="jzst lmdst" role="status"></span><span class="spacer"></span>
    <input id="lmdUrl" class="lmdurl" spellcheck="false" aria-label="Địa chỉ LocalMiniDrama" title="Địa chỉ máy chủ LocalMiniDrama">
    <label class="chk" title="Tệp LocalMiniDrama tạo xong sẽ tự vào thư viện của dự án đang mở"><input type="checkbox" id="lmdAuto"> Tự đẩy vào thư viện</label>
    <button type="button" id="lmdSync" title="Nhập mọi tệp chưa nhập của phim đang mở">⇪ Đẩy ngay</button>
    <button type="button" class="primary" id="lmdNew" title="Tạo dự án Bravin mới cùng tên với phim đang làm">＋ Dự án</button>
    <a class="lmdhelp" href="huong-dan/phim-ai.html" target="_blank" rel="noopener" title="Hướng dẫn sử dụng Phim AI">Hướng dẫn</a>
    <button type="button" id="lmdDone">Về timeline</button></header>
    <div class="jzhost lmdhost"><div class="lmdcheck"></div></div>`;
  document.body.appendChild(p); document.body.classList.add("jzopen"); LMD.panel = p;
  const u = p.querySelector("#lmdUrl"); u.value = LMD.base;
  u.onchange = () => { const v = u.value.trim().replace(/\/+$/, "") || LMD_DEFAULT; if (!/^https?:\/\//.test(v)) { u.value = LMD.base; toast("Địa chỉ phải bắt đầu bằng http:// hoặc https://"); return; } LMD.base = v; lmdLS("bravin-lmd-url", v); lmdReloadFrame(); lmdConnect(true); };
  const a = p.querySelector("#lmdAuto"); a.checked = LMD.autoPush; a.onchange = () => { LMD.autoPush = a.checked; lmdLS("bravin-lmd-auto", a.checked ? "1" : "0"); lmdState(); if (a.checked) lmdSync("auto"); };
  p.querySelector("#lmdSync").onclick = () => LMD.drama ? lmdSync("manual") : toast("Mở một phim trong LocalMiniDrama trước.");
  p.querySelector("#lmdNew").onclick = () => lmdNewProject();
  p.querySelector("#lmdDone").onclick = closeLMD;
  const place = () => { if (!LMD.frame || !LMD.panel) return; const h = LMD.panel.querySelector(".lmdhost").getBoundingClientRect(); Object.assign(LMD.frame.style, { left: h.left + "px", top: h.top + "px", width: h.width + "px", height: h.height + "px" }); };
  LMD.place = place; window.addEventListener("resize", place);
  try { LMD.ro = new ResizeObserver(place); LMD.ro.observe(p.querySelector(".lmdhost")); } catch (_) {}
  lmdStatus(); lmdConnect(false);
}
function closeLMD() {
  if (!LMD.open) return; LMD.open = false; clearInterval(LMD.waitT); window.removeEventListener("resize", LMD.place || (() => {})); try { LMD.ro && LMD.ro.disconnect(); } catch (_) {}
  if (LMD.frame) { LMD.frame.classList.remove("show"); LMD.frame.removeAttribute("style"); }
  LMD.panel && LMD.panel.remove(); LMD.panel = null; document.body.classList.remove("jzopen");
  if (typeof renderAll === "function") renderAll(); if (typeof drawFrame === "function") drawFrame();
}
window.openLMD = openLMD; window.BravinLMD = { open: openLMD, close: closeLMD, sync: lmdSync, newProject: lmdNewProject, check: lmdCheck, state: LMD, isMedia: lmdIsMedia };

/* ---------- lối vào: thanh trên cùng + Trang chủ ---------- */
(function lmdEntry() {
  const ico = '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M8 5l2 4M14 5l2 4"/><path d="M10.5 12.5v4l3.5-2z"/>';
  const hb = document.createElement("button"); hb.id = "lmdBtn"; hb.type = "button"; hb.title = "Phim AI (LocalMiniDrama): kịch bản → phân cảnh → ảnh → video bằng AI, tệp tạo xong tự vào thư viện";
  hb.innerHTML = `<svg class="i" viewBox="0 0 24 24">${ico}</svg>Phim AI`; hb.onclick = openLMD;
  const ex = $("#exportBtn"); const jz = $("#jzBtn"); const ref = jz || ex; if (ref && ref.parentNode) ref.parentNode.insertBefore(hb, ref);
  if (typeof TOOLS !== "undefined") TOOLS.push(["lmd", "Phim AI", "Làm phim ngắn bằng AI (LocalMiniDrama), tệp tự vào thư viện", ico]);
  if (typeof runTool === "function") { const _rt = runTool; runTool = function (k) { if (k !== "lmd") return _rt(k); openLMD(); }; }
})();
/* đổi dự án → báo LocalMiniDrama tên dự án Bravin mới */
if (typeof openProjectById === "function") { const _op = openProjectById; openProjectById = async function (id, obj) { const r = await _op(id, obj); lmdState(); if (LMD.panel) lmdStatus(); return r; }; }
