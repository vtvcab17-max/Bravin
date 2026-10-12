#!/usr/bin/env node
// Kiểm thử khói Bravin bằng Chromium không giao diện (Playwright).
// Dùng: node tests/verify/smoke.mjs [thư-mục-app]   (mặc định app/; thử desktop/app để kiểm tra bản Windows)
// Cần gói "playwright" (npm i -D playwright && npx playwright install chromium).
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import net from "node:net";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); }
catch { console.error("✕ Thiếu Playwright: chạy  npm i -D playwright && npx playwright install chromium"); process.exit(2); }

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const APPDIR = join(ROOT, process.argv[2] || "app");
const freePort = () => new Promise((r) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
const port = await freePort();
const server = spawn(process.execPath, [join(ROOT, "tests/serve_static.js"), APPDIR, String(port)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 400));
const BASE = `http://127.0.0.1:${port}`;

const results = []; let failed = 0;
async function step(name, fn) {
  try { const info = await fn(); results.push(`  ✓ ${name}${info ? ` (${info})` : ""}`); }
  catch (e) { failed++; results.push(`  ✕ ${name}: ${String(e && e.message || e).split("\n")[0]}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 BravinSmoke" });
// không gọi mạng ngoài khi kiểm thử (Google Fonts, CDN…)
await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
const page = await ctx.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e.message || e)));

try {
  await step("Mở ứng dụng không lỗi JavaScript", async () => {
    await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
    await page.waitForTimeout(2500);
    assert(!pageErrors.length, pageErrors.join(" | "));
    return await page.evaluate(() => document.querySelector('meta[name="bravin-version"]')?.content);
  });

  await step("Các module chính đã nạp", async () => {
    const need = ["addMediaFile", "renderBin", "createProjectRecord", "openProjectById", "saveCurrent", "projectJSON", "openJizura", "openLMD", "BravinLMD", "BravinPlugins", "afHandleFile"];
    const missing = await page.evaluate((n) => n.filter((k) => typeof window[k] === "undefined" && typeof globalThis[k] === "undefined" && (() => { try { return typeof eval(k) === "undefined"; } catch { return true; } })()), need);
    assert(!missing.length, "thiếu " + missing.join(", "));
    return need.length + " module";
  });

  await step("Tạo dự án và lưu", async () => {
    await page.evaluate(() => newProject("9:16", "Kiểm thử khói"));
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => ({ name: projName, id: curProjectId, aspect: document.querySelector("#aspect").value, json: JSON.parse(projectJSON()).format }));
    assert(r.name === "Kiểm thử khói" && r.id && r.aspect === "9:16" && r.json === "vincut", JSON.stringify(r));
    return `${r.aspect}, ${r.id}`;
  });

  await step("Nhập ảnh vào thư viện, nhóm «Phim AI» tách riêng", async () => {
    const r = await page.evaluate(async () => {
      const mk = (color) => new Promise((res) => { const c = document.createElement("canvas"); c.width = 64; c.height = 36; const g = c.getContext("2d"); g.fillStyle = color; g.fillRect(0, 0, 64, 36); c.toBlob(res, "image/png"); });
      await addMediaFile(await mk("#7b6cf6"), "anh-thu.png");
      await addMediaFile(await mk("#f2c14e"), "Phim AI · T1 · C01 · ảnh.png");
      return { n: media.size, groups: [...document.querySelectorAll("#bin .bingroup")].map((g) => g.textContent) };
    });
    assert(r.n >= 2, "thư viện có " + r.n + " tệp");
    assert(r.groups.includes("Phim AI") && r.groups.includes("Video"), "nhóm: " + r.groups.join(", "));
    return r.groups.join(" / ");
  });

  await step("Đưa ảnh xuống timeline và vẽ khung", async () => {
    const r = await page.evaluate(async () => {
      const m = [...media.values()].find((x) => x.name === "anh-thu.png");
      appendMedia(m); await new Promise((r) => setTimeout(r, 300)); drawFrame();
      return { clips: V.length + C.length, total: total() };
    });
    assert(r.clips >= 1 && r.total > 0, JSON.stringify(r));
    return `${r.clips} clip, ${r.total.toFixed(1)} giây`;
  });

  await step("Khu Phim AI: chưa có máy chủ thì hiện thẻ cài đặt", async () => {
    await page.evaluate(() => { localStorage.setItem("bravin-lmd-url", "http://127.0.0.1:9"); BravinLMD.state.base = "http://127.0.0.1:9"; openLMD(); });
    await page.waitForSelector(".lmdinst", { timeout: 9000 });
    const r = await page.evaluate(() => ({ dl: [...document.querySelectorAll(".lmdbig")].map((a) => a.getAttribute("href")), guide: !!document.querySelector('.lmdhelp[href="huong-dan/phim-ai.html"]') }));
    assert(r.dl.some((h) => /PhimAI_Setup_.*\.exe$/.test(h)), "không có nút tải bộ cài: " + r.dl.join(", "));
    assert(r.dl.includes("bravinlmd://start"), "không có nút Bật Phim AI");
    assert(r.guide, "không có link Hướng dẫn");
    await page.evaluate(() => BravinLMD.close());
    return "tải bộ cài + Bật Phim AI + Hướng dẫn";
  });

  await step("Bản web/PC: Tiện ích mở trình quản lý plugin", async () => {
    await page.evaluate(() => openPlugins()); await page.waitForTimeout(200);
    const r = await page.evaluate(() => ({ mgr: !!document.querySelector(".plugdlg"), pc: !!document.querySelector(".pconly") }));
    await page.evaluate(() => document.querySelector(".plugdlg [data-close]")?.click());
    assert(r.mgr && !r.pc, JSON.stringify(r)); return "không bị chặn";
  });

  for (const guide of ["huong-dan/phim-ai", "huong-dan/samsung", "chinh-sach-rieng-tu"]) await step(`Trang ${guide}.html tải đủ ảnh, không tràn`, async () => {
    const g = await ctx.newPage(); const errs = [];
    g.on("pageerror", (e) => errs.push(e.message));
    const resp = await g.goto(`${BASE}/${guide}.html`, { waitUntil: "load" });
    assert(resp && resp.ok(), "HTTP " + (resp && resp.status()));
    await g.evaluate(async () => { for (const i of document.images) { i.loading = "eager"; } window.scrollTo(0, document.body.scrollHeight); await new Promise((r) => setTimeout(r, 800)); });
    const bad = await g.evaluate(() => [...document.images].filter((i) => !i.complete || !i.naturalWidth).map((i) => i.getAttribute("src")));
    const overflow = await g.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    await g.close();
    assert(!errs.length, errs.join(" | ")); assert(!bad.length, "ảnh lỗi: " + bad.join(", ")); assert(!overflow, "tràn ngang");
    return "không lỗi";
  });

  await step("Giao diện điện thoại (390×844) không lỗi", async () => {
    const m = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const errs = []; m.on("pageerror", (e) => errs.push(e.message));
    await m.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    await m.goto(`${BASE}/index.html`, { waitUntil: "load" }); await m.waitForTimeout(2000);
    await m.close();
    assert(!errs.length, errs.join(" | "));
  });

  for (const w of [360, 412]) await step(`Điện thoại ${w} dp: trình dựng không tràn ngang, Phim AI/JIZURA trong menu ⋯`, async () => {
    const m = await browser.newPage({ viewport: { width: w, height: 760 }, isMobile: true, hasTouch: true });
    await m.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    await m.goto(`${BASE}/index.html`, { waitUntil: "load" }); await m.waitForTimeout(1500);
    await m.evaluate(() => newProject("9:16", "Hẹp")); await m.waitForTimeout(400);
    const r = await m.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
    await m.evaluate(() => document.querySelector("#moreBtn").click()); await m.waitForTimeout(200);
    const items = await m.evaluate(() => [...document.querySelectorAll(".menu button")].map((b) => b.textContent));
    await m.close();
    assert(r.iw <= w + 1 && r.sw <= w + 1, `rộng ${r.sw}px trên màn ${w}px`);
    assert(items.some((t) => t.startsWith("Phim AI")) && items.some((t) => t.startsWith("JIZURA")), "menu ⋯ thiếu Phim AI/JIZURA");
    return "vừa màn hình";
  });

  await step("Không có lỗi JavaScript trong cả phiên", async () => { assert(!pageErrors.length, pageErrors.join(" | ")); });

  // ---- Bản Samsung (APK giả lập: VINCutAndroid + meta bravin-edition) ----
  const sctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, userAgent: "Mozilla/5.0 (Linux; Android 14; SM-X916B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 BravinSmoke" });
  await sctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await sctx.route("**/index.html", async (r) => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace("<head>", '<head><meta name="bravin-edition" content="samsung">') }); });
  await sctx.addInitScript(() => { window.__dev = { manufacturer: "samsung", model: "SM-X916B", samsung: true, spen: true, dex: false }; window.VINCutAndroid = { version: () => "1.1", displays: () => '{"displays":[],"external":0}', device: () => JSON.stringify(window.__dev), setOrientation: () => {}, persistUrl: () => "" }; });
  const sp = await sctx.newPage(); const sErr = []; sp.on("pageerror", (e) => sErr.push(String(e.message || e)));
  await step("Samsung: nhận bản Samsung + S Pen, có nút Vẽ tay", async () => {
    await sp.goto(`${BASE}/index.html`, { waitUntil: "load" }); await sp.waitForTimeout(2500);
    const r = await sp.evaluate(() => ({ ed: BravinSamsung.edition, cls: document.body.className, btn: !!document.querySelector("#samDrawBtn") }));
    assert(r.ed === "samsung" && /\bsamsung\b/.test(r.cls) && /\bspen\b/.test(r.cls) && r.btn, JSON.stringify(r));
    return r.cls.replace(/\s*athome/, "");
  });
  await step("APK: bấm Tiện ích / cài plugin thì yêu cầu bản PC", async () => {
    await sp.evaluate(() => openPlugins()); await sp.waitForTimeout(200);
    const a = await sp.evaluate(() => ({ pc: !!document.querySelector(".pconly"), mgr: !!document.querySelector(".plugdlg"), dl: document.querySelector(".pconly a.btn")?.getAttribute("href") }));
    await sp.evaluate(() => document.querySelector(".pconly .pcclose").click());
    const b = await sp.evaluate(async () => { const r = await BravinPlugins.installFromUrl("https://example.com/manifest.json"); const pc = !!document.querySelector(".pconly"); document.querySelector(".pconly .pcclose")?.click(); return { r, pc }; });
    assert(a.pc && !a.mgr && /Bravin_Setup_Windows\.exe$/.test(a.dl || ""), JSON.stringify(a));
    assert(b.r === null && b.pc, "installFromUrl vẫn cài trên APK");
    return "hộp thoại + link bộ cài Windows";
  });
  await step("Samsung: vẽ tay S Pen theo lực nhấn, bỏ qua lòng bàn tay, đưa vào timeline", async () => {
    await sp.evaluate(() => newProject("16:9", "Thử S Pen")); await sp.waitForTimeout(500);
    await sp.evaluate(() => openPenDraw()); await sp.waitForTimeout(200);
    const r = await sp.evaluate(() => {
      const c = document.querySelector(".sdraw canvas"), box = c.getBoundingClientRect();
      const ev = (type, x, y, o) => c.dispatchEvent(new PointerEvent(type, Object.assign({ bubbles: true, cancelable: true, clientX: box.x + x * box.width, clientY: box.y + y * box.height, pointerId: 7, pointerType: "pen", pressure: 0.5, buttons: 1, button: 0, isPrimary: true }, o)));
      ev("pointerdown", 0.1, 0.7, { pressure: 0.05 });
      for (let i = 1; i <= 40; i++) ev("pointermove", 0.1 + i * 0.02, 0.7, { pressure: i / 40 });
      ev("pointerup", 0.9, 0.7, { pressure: 0, buttons: 0 });
      ev("pointerdown", 0.3, 0.2, { pointerId: 9, pointerType: "touch" }); ev("pointermove", 0.7, 0.2, { pointerId: 9, pointerType: "touch" }); ev("pointerup", 0.7, 0.2, { pointerId: 9, pointerType: "touch", buttons: 0 });
      const g = c.getContext("2d"), W = c.width, H = c.height;
      const col = (fx) => { const x = Math.round(fx * W), d = g.getImageData(x, 0, 1, H).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 20) n++; return n; };
      const top = (() => { const d = g.getImageData(0, 0, W, Math.round(H * 0.4)).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; })();
      return { thin: col(0.15), thick: col(0.85), top };
    });
    assert(r.thick > r.thin * 3, `nét không theo lực nhấn: đầu ${r.thin}px, cuối ${r.thick}px`);
    assert(r.top === 0, "chạm ngón tay vẫn vẽ (không chống lòng bàn tay)");
    await sp.evaluate(() => document.querySelector(".sdraw-done").click()); await sp.waitForTimeout(700);
    const a = await sp.evaluate(() => ({ open: !!document.querySelector(".sdraw"), clip: C.map((c) => media.get(c.mediaId)?.name).find((n) => /^Vẽ tay/.test(n || "")) }));
    assert(!a.open && a.clip, JSON.stringify(a));
    return `nét ${r.thin}px → ${r.thick}px, ${a.clip} trên track phủ`;
  });
  await step("Samsung: Air View hiện chú thích khi rê bút", async () => {
    const t = await sp.evaluate(async () => {
      const el = document.querySelector("#samDrawBtn"), r = el.getBoundingClientRect();
      el.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, pointerType: "pen", buttons: 0 }));
      await new Promise((res) => setTimeout(res, 500)); const tip = document.querySelector(".airview"); return tip && !tip.hidden ? tip.textContent : null;
    });
    assert(t, "không hiện chú thích"); return t;
  });
  await step("Samsung: nhận Samsung DeX khi cấu hình đổi", async () => {
    const d = await sp.evaluate(async () => { window.__dev.dex = true; window.dispatchEvent(new Event("bravin-config")); await new Promise((r) => setTimeout(r, 150)); return document.body.classList.contains("dex"); });
    assert(d, "không bật lớp dex"); return "body.dex";
  });
  await step("Samsung: không lỗi JavaScript", async () => { assert(!sErr.length, sErr.join(" | ")); });
  await sctx.close();
} finally {
  await browser.close(); server.kill();
}
console.log(`Kiểm thử khói: ${process.argv[2] || "app"}`);
console.log(results.join("\n"));
console.log(failed ? `\nKIỂM THỬ KHÓI: ${failed} lỗi` : "\nKIỂM THỬ KHÓI: đạt");
process.exit(failed ? 1 : 0);
