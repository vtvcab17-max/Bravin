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

  await step("Trang hướng dẫn Phim AI tải đủ ảnh", async () => {
    const g = await ctx.newPage(); const errs = [];
    g.on("pageerror", (e) => errs.push(e.message));
    const resp = await g.goto(`${BASE}/huong-dan/phim-ai.html`, { waitUntil: "load" });
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

  await step("Không có lỗi JavaScript trong cả phiên", async () => { assert(!pageErrors.length, pageErrors.join(" | ")); });
} finally {
  await browser.close(); server.kill();
}
console.log(`Kiểm thử khói: ${process.argv[2] || "app"}`);
console.log(results.join("\n"));
console.log(failed ? `\nKIỂM THỬ KHÓI: ${failed} lỗi` : "\nKIỂM THỬ KHÓI: đạt");
process.exit(failed ? 1 : 0);
