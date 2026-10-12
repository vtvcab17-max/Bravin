# Nhật ký tiến độ Bravin (progress.md)

## Current State

**Last Updated:** 2026-10-12 14:30 (UTC+7)
**Phiên bản:** 4.11 trên web (https://bravin.vtvcab17.workers.dev). versionCode gần nhất: **18** cho cả `app.vincut`, `app.bravin.samsung` và `com.bravinall.bravin` (Play; lần nộp sau phải ≥ 19)
**Active Feature:** không có. Chờ người dùng: feat-007 (Windows), feat-012 (Galaxy), feat-014 (Android 15/16 / Play)

## Status

### What's Done
- [x] 4.8 SDK plugin + chợ Micron; 4.9 Motion Tracking; 4.9.1 nhập bravin-project schema 2.
- [x] 4.10 khu Phim AI (LocalMiniDrama tiếng Việt), trang hướng dẫn `app/huong-dan/phim-ai.html`.
- [x] Bộ cài Windows Phim AI một chạm `downloads/PhimAI_Setup_1.2.8.exe` + thẻ cài đặt trong Bravin.
- [x] Harness: AGENTS.md, init.sh, tests/verify/, CI verify.yml thay pages.yml (luôn đỏ vì repo không bật GitHub Pages; web chạy trên Cloudflare).
- [x] Xoá mật khẩu keystore khỏi docs/ARCHITECTURE.md; init.sh chặn tái phạm.

- [x] 4.11 Bravin cho Samsung (feat-011): APK `app.bravin.samsung`, vẽ tay S Pen theo lực nhấn, Air View, Air actions, DeX; plugin trên mọi APK yêu cầu bản PC; trang `app/huong-dan/samsung.html`.

- [x] 4.11 bản Google Play (feat-013): AAB `com.bravinall.bravin` targetSdk 36, hồ sơ `play/`, chính sách quyền riêng tư; sửa thanh trên tràn ngang trên điện thoại 360–412 dp.

### What's In Progress
- [ ] feat-006/007: bộ cài Phim AI chưa được cài thử trên Windows thật.

### What's Next
1. Người dùng nộp `Bravin_Play_4.11.aab` lên kênh thử nghiệm nội bộ theo `play/README.md`; tài khoản cá nhân mới cần thử nghiệm kín 12 người × 14 ngày trước khi phát hành chính thức (feat-014).
1. Người dùng cài `downloads/Bravin_Samsung_4.11.apk` trên Galaxy có S Pen, thử Air actions + DeX (feat-012).
1. Người dùng cài thử PhimAI_Setup_1.2.8.exe trên Windows (feat-007), gửi `server-error.log` nếu lỗi.
2. Đổi mật khẩu keystore (feat-008) ở máy giữ khoá.
3. Ký số bộ cài (feat-009) nếu có chứng chỉ.

## Blockers / Risks
- [ ] Bản Samsung chưa thử trên Galaxy thật (Air actions, đầu tẩy, DeX reflection) – feat-012.
- [ ] Windows thật: agent không chạy được .exe; chỉ kiểm tra được PE x64 + ABI better-sqlite3 v127 khớp Node 22.
- [ ] Mật khẩu keystore cũ còn trong lịch sử git công khai (khoá .jks không có trong repo nên rủi ro thấp).
- [ ] Bộ cài chưa ký số: Windows SmartScreen cảnh báo, người dùng phải bấm More info → Run anyway.

## Decisions Made
- **Gói Play `com.bravinall.bravin`** (người dùng chọn): cài song song bản APK; upload key = `vincut-release.jks`; Google Play App Signing giữ khoá phát hành.
- **Chỉ bản Play targetSdk 36**; APK tự phát hành vẫn 34. Mã Java chung đã xử lý tràn viền và predictive back nên nâng APK lên 36 sau này không cần sửa thêm.
- **Bản Samsung là gói riêng `app.bravin.samsung`** (cài song song, dữ liệu riêng) thay vì chỉ một cờ trong APK thường: Air actions và cửa sổ DeX khai báo trong manifest, biểu tượng riêng để phân biệt.
- **Plugin bị chặn trên mọi APK** (kể cả DeX) theo yêu cầu người dùng; bản web/Windows giữ nguyên.
- **APK Samsung để ở `downloads/`** (28 MB > giới hạn 25 MiB của Cloudflare); `.gitignore` mở ngoại lệ `!downloads/*.apk`.
- **Bộ cài Phim AI để ở `downloads/` (ngoài `app/`)**: Cloudflare giới hạn 25 MiB/tệp; phiên Claude bị chặn tạo GitHub Releases. Tải qua raw.githubusercontent.
- **Bỏ `.github/workflows/pages.yml`**: chưa từng chạy thành công; deploy thật là Cloudflare Workers. Thay bằng `verify.yml`.
- **desktop/app là sản phẩm dựng** từ app/ bằng `tools/make_desktop_app.py`, không sửa tay.

## Files Modified This Session
- 4.11 Samsung: `app/js/samsung.js` (mới), `app/js/plugins.js`, `app/js/input.js`, `app/css/app.css`, `app/index.html`, `app/huong-dan/samsung.html` (mới), `app/downloads/Bravin_Setup_Windows.exe`, `android/build.sh`, `android/res-samsung/` (mới), `android/src/app/vincut/MainActivity.java`, `desktop/installer/setup.nsi`, `downloads/Bravin_Samsung_4.11.apk`, `docs/SAMSUNG.md`, `tests/verify/smoke.mjs`

### Phiên trước (harness)
- `AGENTS.md`, `CLAUDE.md`, `init.sh`, `package.json`, `feature_list.json`, `progress.md`, `session-handoff.md`
- `tests/verify/static.mjs`, `tests/verify/smoke.mjs`, `tests/serve_static.js` (thêm kiểu MIME svg/woff2/ttf…)
- `.github/workflows/verify.yml` (mới), `.github/workflows/pages.yml` (xoá)
- `docs/ARCHITECTURE.md` (xoá mật khẩu keystore)

## Evidence of Completion
- [x] Kiểm tra tĩnh: `node tests/verify/static.mjs` → đạt (sau khi sửa ARCHITECTURE.md; trước đó bắt được lộ mật khẩu).
- [x] Kiểm thử khói: `node tests/verify/smoke.mjs app` và `desktop/app` → 9/9 đạt mỗi bản.
- [x] Harness: `validate-harness.mjs` 20/100 → 100/100 (điểm cấu trúc). Cổng bắt được lỗi cú pháp cố ý trong lmd.js và desktop/app lệch.

## Notes for Next Session
- Khởi động: đọc AGENTS.md → progress.md → feature_list.json → `./init.sh`.
- LocalMiniDrama-vi (mã nguồn) không nằm trong repo này; gói zip ở `app/downloads/`, bộ cài ở `downloads/`.
