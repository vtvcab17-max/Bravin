#!/usr/bin/env node
// Kiểm tra tĩnh cho Bravin: chạy nhanh (< 5 giây), không cần trình duyệt.
// Dùng: node tests/verify/static.mjs   (thoát mã 1 nếu có lỗi)
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const errors = [], warns = [], oks = [];
const err = (m) => errors.push(m), warn = (m) => warns.push(m), ok = (m) => oks.push(m);
const read = (p) => readFileSync(join(ROOT, p), "utf8");
function walk(dir, out = []) {
  for (const n of readdirSync(join(ROOT, dir))) {
    if (n === "node_modules" || n === ".git") continue;
    const p = join(dir, n), s = statSync(join(ROOT, p));
    s.isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}

// 1. Cú pháp JavaScript (app, sdk, ví dụ plugin, extension)
const jsFiles = ["app/js", "app/sdk", "examples", "tests/verify"].flatMap((d) => existsSync(join(ROOT, d)) ? walk(d) : []).filter((f) => /\.(m?js)$/.test(f));
let jsBad = 0;
for (const f of jsFiles) {
  try { execFileSync(process.execPath, ["--check", join(ROOT, f)], { stdio: "pipe" }); }
  catch (e) { jsBad++; err(`Lỗi cú pháp JS: ${f}\n${String(e.stderr || e.message).split("\n").slice(0, 4).join("\n")}`); }
}
if (!jsBad) ok(`Cú pháp JS: ${jsFiles.length} tệp`);

// 2. JSON hợp lệ (manifest plugin, mẫu dự án, feature_list)
const jsonFiles = [...["app", "examples", "samples"].flatMap((d) => existsSync(join(ROOT, d)) ? walk(d) : []).filter((f) => f.endsWith(".json")), "feature_list.json"].filter((f) => existsSync(join(ROOT, f)));
let jsonBad = 0;
for (const f of jsonFiles) { try { JSON.parse(read(f)); } catch (e) { jsonBad++; err(`JSON hỏng: ${f}: ${e.message}`); } }
if (!jsonBad) ok(`JSON hợp lệ: ${jsonFiles.length} tệp`);

// 3. Mọi <script src> / <link href> cục bộ trong index.html phải tồn tại
for (const idx of ["app/index.html", "desktop/app/index.html"]) {
  if (!existsSync(join(ROOT, idx))) { err(`Thiếu ${idx}`); continue; }
  const html = read(idx), base = idx.replace(/index\.html$/, "");
  const refs = [...html.matchAll(/<(?:script[^>]+src|link[^>]+href)="([^"#?]+)"/g)].map((m) => m[1]).filter((u) => !/^(https?:|data:|\/\/)/.test(u));
  const missing = refs.filter((u) => !existsSync(join(ROOT, base, u)));
  missing.length ? err(`${idx} trỏ tới tệp không có: ${missing.join(", ")}`) : ok(`${idx}: ${refs.length} tham chiếu cục bộ đều có`);
}

// 4. Phiên bản khớp nhau: app, desktop/app, bộ cài Windows
const ver = (s) => (s.match(/name="bravin-version" content="([^"]+)"/) || [])[1];
const vApp = ver(read("app/index.html")), vDesk = existsSync(join(ROOT, "desktop/app/index.html")) ? ver(read("desktop/app/index.html")) : null;
const vNsi = existsSync(join(ROOT, "desktop/installer/setup.nsi")) ? (read("desktop/installer/setup.nsi").match(/!define VER "([^"]+)"/) || [])[1] : null;
if (!vApp) err("app/index.html thiếu <meta name=\"bravin-version\">");
else if ((vDesk && vDesk !== vApp) || (vNsi && vNsi !== vApp)) err(`Lệch phiên bản: app ${vApp}, desktop/app ${vDesk}, setup.nsi ${vNsi}`);
else ok(`Phiên bản ${vApp} khớp ở app, desktop/app, setup.nsi`);

// 5. desktop/app phải là bản dựng của app/ (tools/make_desktop_app.py)
if (existsSync(join(ROOT, "desktop/app"))) {
  const appFiles = walk("app").filter((f) => !f.startsWith("app/downloads/"));
  const drift = [];
  for (const f of appFiles) {
    const d = "desktop/" + f;
    if (!existsSync(join(ROOT, d))) { drift.push(`thiếu ${d}`); continue; }
    if (f === "app/index.html") continue; // khác phần phông chữ cục bộ
    if (!readFileSync(join(ROOT, f)).equals(readFileSync(join(ROOT, d)))) drift.push(`khác ${d}`);
  }
  if (existsSync(join(ROOT, "desktop/app/downloads"))) drift.push("desktop/app/downloads không được có (làm nặng bộ cài)");
  const dIdx = read("desktop/app/index.html");
  if (/fonts\.googleapis\.com/.test(dIdx)) drift.push("desktop/app/index.html còn dùng Google Fonts (bản Windows phải chạy không cần mạng)");
  const strip = (s) => s.replace(/<link rel="preconnect"[^>]*>\s*/g, "").replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>\s*/g, "").replace(/<style>\s*@font-face[\s\S]*?<\/style>\s*/, "");
  if (strip(read("app/index.html")) !== strip(dIdx)) drift.push("desktop/app/index.html khác app/index.html ngoài phần phông chữ");
  drift.length ? err(`desktop/app lệch với app/ (chạy: python3 tools/make_desktop_app.py .):\n  ${drift.slice(0, 12).join("\n  ")}${drift.length > 12 ? `\n  … và ${drift.length - 12} mục nữa` : ""}`) : ok("desktop/app đồng bộ với app/");
}

// 6. Giới hạn Cloudflare Workers: mỗi tệp trong app/ < 25 MiB
const big = walk("app").filter((f) => statSync(join(ROOT, f)).size >= 25 * 1024 * 1024);
big.length ? err(`Tệp ≥ 25 MiB trong app/ (Cloudflare từ chối deploy): ${big.join(", ")}. Đặt ở downloads/ ngoài app/.`) : ok("Không tệp nào trong app/ vượt 25 MiB");

// 7. Bí mật không được lên GitHub
const tracked = (() => { try { return execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean); } catch { return walk("."); } })();
const keyFiles = tracked.filter((f) => /\.(jks|keystore|p12|pem)$/i.test(f) || /(^|\/)\.env$/.test(f));
keyFiles.length ? err(`Tệp khoá/bí mật đang được git theo dõi: ${keyFiles.join(", ")}`) : ok("Không có tệp khoá ký trong git");
const textExt = new Set([".md", ".txt", ".js", ".mjs", ".sh", ".html", ".json", ".ps1", ".nsi", ".yml", ".yaml"]);
const leaks = [];
for (const f of tracked) {
  if (!textExt.has(extname(f)) || f.startsWith("tests/verify/") || !existsSync(join(ROOT, f))) continue;
  const s = read(f);
  if (/KS_PASS=(?!\$|"\$|<|\.\.\.|x\b)\S+/.test(s) || /storepass\s+(?!["']?\$)[^\s"']{6,}/.test(s) || /mật khẩu mặc định `[^`]+`/.test(s)) leaks.push(f);
  if (/sk-(ant-)?[A-Za-z0-9_-]{24,}|AIza[0-9A-Za-z_-]{30,}|ghp_[A-Za-z0-9]{30,}/.test(s)) leaks.push(f + " (API key?)");
}
leaks.length ? err(`Có thể lộ mật khẩu/khoá trong: ${[...new Set(leaks)].join(", ")}`) : ok("Không thấy mật khẩu keystore hay API key trong mã");

// 8. Trang hướng dẫn: ảnh và liên kết nội bộ phải tồn tại
for (const g of walk("app").filter((f) => f.startsWith("app/huong-dan/") && f.endsWith(".html"))) {
  const html = read(g), dir = g.replace(/[^/]+$/, "");
  const refs = [...html.matchAll(/(?:src|href)="([^"#?]+)/g)].map((m) => m[1]).filter((u) => !/^(https?:|mailto:|data:|bravinlmd:)/.test(u) && u !== "../");
  const miss = refs.filter((u) => !existsSync(join(ROOT, dir, u)));
  miss.length ? err(`${g}: liên kết hỏng ${miss.join(", ")}`) : ok(`${g}: ${refs.length} liên kết nội bộ đều có`);
}

// Kết quả
for (const m of oks) console.log("  ✓ " + m);
for (const m of warns) console.log("  ! " + m);
for (const m of errors) console.log("  ✕ " + m);
console.log(errors.length ? `\nKIỂM TRA TĨNH: ${errors.length} lỗi` : "\nKIỂM TRA TĨNH: đạt");
process.exit(errors.length ? 1 : 0);
