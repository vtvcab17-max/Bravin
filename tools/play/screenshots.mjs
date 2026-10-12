#!/usr/bin/env node
// Chụp ảnh màn hình cho trang Google Play (điện thoại 1080×1920, máy tính bảng 2560×1600).
// Dùng: node tools/play/screenshots.mjs  → play/graphics/screenshots/
// Phục vụ desktop/app (phông chữ có sẵn, giống APK) và đánh dấu bản "play".
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const OUT = join(ROOT, "play/graphics/screenshots"); mkdirSync(OUT, { recursive: true });
const PORT = 8196;
const srv = spawn(process.execPath, [join(ROOT, "tests/serve_static.js"), join(ROOT, "desktop/app"), String(PORT)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 400));
const browser = await chromium.launch({ args: ["--no-sandbox"] });

async function setup(ctx) {
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await ctx.route("**/index.html", async (r) => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace("<head>", '<head><meta name="bravin-edition" content="play">') }); });
  await ctx.addInitScript(() => { window.VINCutAndroid = { version: () => "1.1", displays: () => '{"displays":[],"external":0}', device: () => '{"manufacturer":"Google","model":"Pixel","samsung":false,"spen":false,"dex":false}', setOrientation: () => {}, persistUrl: () => "" }; try { localStorage.setItem("bravin-sam-intro", "1"); } catch (_) {} });
}
// dự án mẫu: 4 cảnh ảnh tự vẽ + chữ + nhạc nền tổng hợp
async function sample(page, aspect) {
  await page.evaluate(async (aspect) => {
    await newProject(aspect, "Đà Lạt mùa hoa");
    const scenes = [["#ff9a8b", "#ff6a88", "#ffd36e", "Đà Lạt"], ["#5ee7df", "#3a7bd5", "#b490ca", "Hồ Xuân Hương"], ["#f6d365", "#fda085", "#ff6e7f", "Đồi chè"], ["#a1c4fd", "#7b6cf6", "#c2e9fb", "Hoàng hôn"]];
    const [W, H] = aspect === "9:16" ? [1080, 1920] : [1920, 1080];
    for (const [a, b, c, name] of scenes) {
      const cv2 = document.createElement("canvas"); cv2.width = W; cv2.height = H; const g = cv2.getContext("2d");
      const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, a); gr.addColorStop(0.55, b); gr.addColorStop(1, c); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      g.fillStyle = "rgba(255,255,255,.18)"; for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(W * ((i * 37) % 100) / 100, H * (0.15 + ((i * 53) % 70) / 100), W * (0.05 + (i % 4) * 0.03), 0, Math.PI * 2); g.fill(); }
      g.fillStyle = "rgba(20,24,40,.55)"; g.beginPath(); g.moveTo(0, H * 0.78); for (let x = 0; x <= W; x += W / 8) g.lineTo(x, H * (0.7 + 0.08 * Math.sin(x / W * 6))); g.lineTo(W, H); g.lineTo(0, H); g.fill();
      const blob = await new Promise((r) => cv2.toBlob(r, "image/png")); const m = await addMediaFile(blob, name + ".png"); appendMedia(m);
    }
    t = 1.2; addText({ track: tracksOf("text")[0]?.id, start: 0.3, dur: 5, line1: "Đà Lạt mùa hoa", line2: "Bravin" });
    sel = null; renderAll(); drawFrame();
  }, aspect);
  await page.waitForTimeout(800);
}

// ---- điện thoại ----
{
  const ctx = await browser.newContext({ viewport: { width: 412, height: 732 }, deviceScaleFactor: 1080 / 412, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36" });
  await setup(ctx); const p = await ctx.newPage();
  await p.goto(`http://127.0.0.1:${PORT}/index.html`); await p.waitForTimeout(2500);
  await sample(p, "9:16");
  await p.screenshot({ path: join(OUT, "phone-2-dung-video.png") });
  await p.evaluate(() => { openSheet("lib"); if (typeof showAssets === "function") showAssets("fx"); }); await p.waitForTimeout(600);
  await p.screenshot({ path: join(OUT, "phone-3-hieu-ung.png") });
  await p.evaluate(() => closeSheets()); await p.evaluate(() => openPenDraw()); await p.waitForTimeout(300);
  await p.evaluate(() => { const c = document.querySelector(".sdraw canvas"), b = c.getBoundingClientRect(); const ev = (type, x, y, pr) => c.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: b.x + x * b.width, clientY: b.y + y * b.height, pointerId: 3, pointerType: "pen", pressure: pr, buttons: type === "pointerup" ? 0 : 1 }));
    ev("pointerdown", 0.78, 0.45, 0.1); for (let i = 0; i <= 60; i++) { const a = i / 60 * Math.PI * 2; ev("pointermove", 0.5 + 0.28 * Math.cos(a) * (1 - i / 140), 0.45 + 0.16 * Math.sin(a), 0.2 + 0.8 * Math.sin(i / 60 * Math.PI)); } ev("pointerup", 0.5, 0.45, 0); });
  await p.waitForTimeout(200); console.log("nét vẽ (điểm ảnh):", await p.evaluate(() => { const c = document.querySelector(".sdraw canvas"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; }));
  await p.screenshot({ path: join(OUT, "phone-4-ve-tay.png") });
  await p.evaluate(() => document.querySelector(".sdraw-cancel").click()); await p.evaluate(() => document.querySelector(".sdraw-cancel")?.click());
  await p.evaluate(() => openSheet("insp")); await p.waitForTimeout(500);
  await p.evaluate(() => { const c = C.find((x) => x.type === "text"); if (c) { sel = { k: "c", id: c.id }; renderAll(); showTab("insp"); } }); await p.waitForTimeout(500);
  await p.evaluate(() => document.querySelectorAll(".toast").forEach((x) => x.remove()));
  await p.screenshot({ path: join(OUT, "phone-1-keyframe.png") });
  await ctx.close();
}
// ---- máy tính bảng 10" ----
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (Linux; Android 16; Pixel Tablet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36" });
  await setup(ctx); const p = await ctx.newPage();
  await p.goto(`http://127.0.0.1:${PORT}/index.html`); await p.waitForTimeout(2500);
  await sample(p, "16:9");
  await p.screenshot({ path: join(OUT, "tablet-1-dung-video.png") });
  await p.evaluate(() => openPenDraw()); await p.waitForTimeout(300);
  await p.evaluate(() => { const c = document.querySelector(".sdraw canvas"), b = c.getBoundingClientRect(); const ev = (type, x, y, pr) => c.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: b.x + x * b.width, clientY: b.y + y * b.height, pointerId: 4, pointerType: "pen", pressure: pr, buttons: type === "pointerup" ? 0 : 1 }));
    ev("pointerdown", 0.15, 0.3, 0.1); for (let i = 0; i <= 80; i++) ev("pointermove", 0.15 + i * 0.008, 0.3 + 0.12 * Math.sin(i / 8), 0.15 + 0.85 * (i / 80)); ev("pointerup", 0.8, 0.3, 0); });
  await p.screenshot({ path: join(OUT, "tablet-2-ve-tay-s-pen.png") });
  await ctx.close();
}
await browser.close(); srv.kill();
console.log("Đã lưu ảnh vào", OUT);
