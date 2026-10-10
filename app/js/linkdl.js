"use strict";
/* ---------- Dán link để tải video / nhạc / ảnh về Thư viện ---------- */
const DL_SITES = /(^|\.)(youtube\.com|youtu\.be|tiktok\.com|facebook\.com|fb\.watch|instagram\.com|twitter\.com|x\.com|netflix\.com|vimeo\.com|bilibili\.com|douyin\.com|zalo\.me|spotify\.com|soundcloud\.com)$/i;
const DL_EXT = { mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm", mkv: "video/x-matroska", mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", wav: "audio/wav", ogg: "audio/ogg", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };
const DL_MIME_EXT = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac", "audio/wav": "wav", "audio/ogg": "ogg", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
function dlErr(code, msg) { const e = new Error(msg); e.code = code; return e; }
function dlParse(s) { s = (s || "").trim(); if (!s) return null; if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s) && /^[^\s/]+\.[a-z]{2,}(\/|$)/i.test(s)) s = "https://" + s; try { const u = new URL(s); return /^https?:$/.test(u.protocol) ? u : null; } catch (_) { return null; } }
function dlHasProxy() { return /^(localhost|127\.0\.0\.1)$/.test(location.hostname); }
function dlHttpMsg(st) { return st === 401 || st === 403 ? "Máy chủ từ chối tải (link cần đăng nhập, đã hết hạn hoặc bị chặn)." : st === 404 || st === 410 ? "Link không còn tồn tại hoặc đã hết hạn." : st === 429 ? "Máy chủ đang giới hạn lượt tải. Thử lại sau ít phút." : "Máy chủ báo lỗi (mã " + st + ")."; }
/* mở link: thử tải thẳng; bị CORS chặn thì nhờ máy chủ nội bộ (Android/Windows) tải hộ */
async function dlOpen(url, signal) {
  let direct = null;
  try { const r = await fetch(url, { signal, redirect: "follow" }); if (!r.ok) throw dlErr("http", dlHttpMsg(r.status)); return { r, finalUrl: r.url || url, cd: r.headers.get("content-disposition") }; }
  catch (e) { if (e.name === "AbortError" || e.code === "http") throw e; direct = e; }
  if (!dlHasProxy()) throw dlErr("cors", navigator.onLine === false ? "Không có kết nối mạng." : "Trang này không cho tải trực tiếp trên bản web. Hãy dùng app Android hoặc bản Windows của Bravin để tải link này.");
  let r; try { r = await fetch("/dl?url=" + encodeURIComponent(url), { signal, headers: { "X-Bravin": "1" } }); } catch (e) { if (e.name === "AbortError") throw e; throw dlErr("net", "Không kết nối được tới máy chủ của link. Kiểm tra mạng rồi thử lại."); }
  if (!r.ok) { const st = +r.headers.get("x-dl-status") || 0; throw dlErr("http", st ? dlHttpMsg(st) : r.status === 504 ? "Không kết nối được tới máy chủ của link. Kiểm tra mạng rồi thử lại." : "Không tải được link này."); }
  const dec = h => { try { return decodeURIComponent(r.headers.get(h) || ""); } catch (_) { return ""; } };
  return { r, finalUrl: dec("x-dl-url") || url, cd: dec("x-dl-disposition") || null };
}
function dlName(finalUrl, cd, ct) {
  let n = "";
  if (cd) { const m = /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i.exec(cd); if (m) { try { n = decodeURIComponent(m[1].trim().replace(/^"|"$/g, "")); } catch (_) {} } if (!n) { const m2 = /filename\s*=\s*"?([^";]+)"?/i.exec(cd); if (m2) n = m2[1].trim(); } }
  if (!n) { try { n = decodeURIComponent(new URL(finalUrl).pathname.split("/").filter(Boolean).pop() || ""); } catch (_) {} }
  n = n.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 80) || "video-tai-ve";
  if (!/\.[a-z0-9]{2,4}$/i.test(n) && DL_MIME_EXT[ct]) n += "." + DL_MIME_EXT[ct];
  return n;
}
/* trang web (html): tìm địa chỉ file video thật trong mã nguồn trang */
function dlScanPage(html, base) {
  const un = s => s.replace(/\\u0026/g, "&").replace(/\\\//g, "/").replace(/&amp;/g, "&");
  const pats = [/<meta[^>]+property=["']og:(?:video|video:url|video:secure_url)["'][^>]+content=["']([^"']+)["']/gi, /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:video(?::url|:secure_url)?["']/gi, /<(?:video|source)[^>]+src=["']([^"']+)["']/gi, /"contentUrl"\s*:\s*"([^"]+)"/gi, /https?:(?:\\?\/){2}[^"'\s<>\\]+?\.(?:mp4|webm|m4v|mov|mp3|m4a)(?:\?[^"'\s<>\\]*)?/gi];
  const seen = new Set(), out = [];
  for (const re of pats) { let m; while ((m = re.exec(html)) && out.length < 8) { try { const u = new URL(un(m[1] || m[0]), base).href; if (/^https?:/.test(u) && !/\.m3u8|\.mpd/i.test(u) && !seen.has(u)) { seen.add(u); out.push(u); } } catch (_) {} } }
  return out;
}
/* tải về → Blob. onProg(đã nhận, tổng|0). Trả { blob, name } hoặc ném lỗi có thông báo tiếng Việt */
async function dlFetch(url0, onProg, signal, depth = 0) {
  const u = dlParse(url0); if (!u) throw dlErr("bad", "Link không hợp lệ.");
  if (DL_SITES.test(u.hostname)) throw dlErr("site", "Trang " + u.hostname.replace(/^www\./, "") + " không cho tải video trực tiếp bằng link. Hãy dán link tới file video/nhạc/ảnh (đuôi .mp4, .mp3, .jpg…) hoặc dùng video bạn đã lưu trong máy.");
  if (/\.(m3u8|mpd)(\?|#|$)/i.test(u.pathname + u.search)) throw dlErr("hls", "Đây là luồng phát trực tuyến chia nhiều đoạn (.m3u8/.mpd), Bravin chưa hỗ trợ tải loại này.");
  const { r, finalUrl, cd } = await dlOpen(u.href, signal);
  let ct = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (/mpegurl|dash\+xml/.test(ct)) throw dlErr("hls", "Đây là luồng phát trực tuyến chia nhiều đoạn (.m3u8/.mpd), Bravin chưa hỗ trợ tải loại này.");
  if (ct === "text/html" || ct === "application/xhtml+xml") {
    if (depth > 0) throw dlErr("page", "Không tìm thấy file video trong trang này.");
    const html = (await r.text()).slice(0, 2500000), found = dlScanPage(html, finalUrl);
    for (const f of found) { try { return await dlFetch(f, onProg, signal, depth + 1); } catch (e) { if (e.name === "AbortError") throw e; } }
    throw dlErr("page", "Link này là một trang web và Bravin không tìm thấy file video trong đó. Hãy dán link tới chính file video (đuôi .mp4, .webm, .mp3…).");
  }
  const total = +r.headers.get("content-length") || 0;
  const chunks = []; let got = 0;
  try {
    if (r.body && r.body.getReader) { const rd = r.body.getReader(); for (;;) { const { done, value } = await rd.read(); if (done) break; chunks.push(value); got += value.length; onProg && onProg(got, total); } }
    else { const b = await r.blob(); chunks.push(b); got = b.size; onProg && onProg(got, total); }
  } catch (e) { if (e.name === "AbortError") throw e; throw dlErr("net", "Đang tải thì bị ngắt kết nối. Kiểm tra mạng rồi thử lại."); }
  if (!got) throw dlErr("empty", "Link không trả về dữ liệu nào.");
  const ext = ((finalUrl.split(/[?#]/)[0].match(/\.([a-z0-9]{2,4})$/i) || [])[1] || "").toLowerCase();
  if (!/^(video|audio|image)\//.test(ct)) ct = DL_EXT[ext] || "";
  if (!ct) throw dlErr("type", "File tải về không phải video, âm thanh hoặc ảnh mà Bravin mở được.");
  return { blob: new Blob(chunks, { type: ct }), name: dlName(finalUrl, cd, ct) };
}
function dlSize(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; }
function openLinkDl(prefill) {
  if (document.querySelector(".dldlg")) return;
  const ov = document.createElement("div"); ov.className = "overlay";
  ov.innerHTML = `<div class="dialog dldlg" role="dialog" aria-modal="true" aria-labelledby="dlT">
    <div class="fmhead"><h2 id="dlT">Tải về từ link</h2><button type="button" class="fmx" data-close aria-label="Đóng">✕</button></div>
    <input type="text" class="dlin" inputmode="url" autocomplete="off" spellcheck="false" placeholder="Dán link video, nhạc hoặc ảnh (https://…)" aria-label="Link cần tải">
    <div class="dlbar" hidden><i></i></div>
    <p class="dlst" role="status" aria-live="polite">Dán link vào ô trên, nút Tải về sẽ hiện ra.</p>
    <div class="dlact"><button type="button" class="primary dlgo" hidden>Tải về</button><button type="button" class="dlcancel" hidden>Dừng</button></div>
    <p class="note">Chỉ tải nội dung của bạn hoặc nội dung bạn được phép dùng. Tải xong, file nằm trong Thư viện, dùng được khi không có mạng.</p></div>`;
  document.body.appendChild(ov);
  const $q = s => ov.querySelector(s), inp = $q(".dlin"), go = $q(".dlgo"), stop = $q(".dlcancel"), st = $q(".dlst"), bar = $q(".dlbar"), fill = bar.firstElementChild;
  let ctl = null, busy = false;
  const say = (t, bad) => { st.textContent = t; st.classList.toggle("bad", !!bad); };
  const close = () => { if (ctl) ctl.abort(); ov.remove(); };
  $q("[data-close]").onclick = close; ov.addEventListener("pointerdown", e => { if (e.target === ov && !busy) close(); });
  const sync = () => { const ok = !!dlParse(inp.value); go.hidden = !ok || busy; if (!busy) { if (ok) say("Sẵn sàng. Bấm Tải về."); else if (inp.value.trim()) say("Link chưa hợp lệ. Link phải bắt đầu bằng http:// hoặc https://", true); else say("Dán link vào ô trên, nút Tải về sẽ hiện ra."); } };
  inp.addEventListener("input", sync); inp.addEventListener("paste", () => setTimeout(sync, 0));
  inp.addEventListener("keydown", e => { if (e.key === "Enter" && !go.hidden) go.click(); if (e.key === "Escape" && !busy) close(); });
  stop.onclick = () => { if (ctl) ctl.abort(); };
  go.onclick = async () => {
    if (busy) return; busy = true; ctl = new AbortController(); go.hidden = true; stop.hidden = false; inp.disabled = true; bar.hidden = false; fill.style.width = "0%"; fill.classList.add("ind"); say("Đang kết nối…");
    try {
      const { blob, name } = await dlFetch(inp.value, (g, tot) => { if (tot) { fill.classList.remove("ind"); fill.style.width = Math.min(100, g / tot * 100).toFixed(1) + "%"; say("Đang tải… " + dlSize(g) + " / " + dlSize(tot) + " (" + Math.floor(g / tot * 100) + "%)"); } else say("Đang tải… " + dlSize(g)); }, ctl.signal);
      say("Đang đưa vào Thư viện…"); fill.classList.remove("ind"); fill.style.width = "100%";
      const m = await addMediaFile(blob, name);
      if (!m) throw dlErr("open", "Tải xong nhưng Bravin không mở được file này. Thử link tới file MP4, MP3 hoặc JPG.");
      toast("Đã tải xong và lưu vào Thư viện: " + name); say("✓ Đã lưu vào Thư viện: " + name + ". Dán link khác để tải tiếp."); inp.value = "";
      if (window.openSheet) try { openSheet("lib"); } catch (_) {}
    } catch (e) {
      const msg = e.name === "AbortError" ? "Đã dừng tải." : e.message && e.code ? e.message : "Không tải được link này. Kiểm tra link và kết nối mạng rồi thử lại.";
      say(msg, e.name !== "AbortError"); toast(e.name === "AbortError" ? "Đã dừng tải." : "Tải về không thành công. " + msg);
    } finally { busy = false; ctl = null; inp.disabled = false; stop.hidden = true; bar.hidden = true; if (!st.classList.contains("bad") && !/^✓|dừng/.test(st.textContent)) sync(); go.hidden = !dlParse(inp.value); inp.focus(); }
  };
  if (prefill) inp.value = prefill;
  sync(); setTimeout(() => inp.focus(), 50);
}
window.openLinkDl = openLinkDl;
