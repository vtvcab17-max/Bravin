# Nhật ký tiến độ Bravin (progress.md)

## Current State

**Last Updated:** 2026-10-12 10:45 (UTC+7)
**Phiên bản:** 4.10 trên web (https://bravin.vtvcab17.workers.dev), APK versionCode gần nhất: **17**
**Active Feature:** feat-007 Cài thử PhimAI_Setup trên Windows thật (đang chờ người dùng)

## Status

### What's Done
- [x] 4.8 SDK plugin + chợ Micron; 4.9 Motion Tracking; 4.9.1 nhập bravin-project schema 2.
- [x] 4.10 khu Phim AI (LocalMiniDrama tiếng Việt), trang hướng dẫn `app/huong-dan/phim-ai.html`.
- [x] Bộ cài Windows Phim AI một chạm `downloads/PhimAI_Setup_1.2.8.exe` + thẻ cài đặt trong Bravin.
- [x] Harness: AGENTS.md, init.sh, tests/verify/, CI verify.yml thay pages.yml (luôn đỏ vì repo không bật GitHub Pages; web chạy trên Cloudflare).
- [x] Xoá mật khẩu keystore khỏi docs/ARCHITECTURE.md; init.sh chặn tái phạm.

### What's In Progress
- [ ] feat-006/007: bộ cài Phim AI chưa được cài thử trên Windows thật.

### What's Next
1. Người dùng cài thử PhimAI_Setup_1.2.8.exe trên Windows (feat-007), gửi `server-error.log` nếu lỗi.
2. Đổi mật khẩu keystore (feat-008) ở máy giữ khoá.
3. Ký số bộ cài (feat-009) nếu có chứng chỉ.

## Blockers / Risks
- [ ] Windows thật: agent không chạy được .exe; chỉ kiểm tra được PE x64 + ABI better-sqlite3 v127 khớp Node 22.
- [ ] Mật khẩu keystore cũ còn trong lịch sử git công khai (khoá .jks không có trong repo nên rủi ro thấp).
- [ ] Bộ cài chưa ký số: Windows SmartScreen cảnh báo, người dùng phải bấm More info → Run anyway.

## Decisions Made
- **Bộ cài Phim AI để ở `downloads/` (ngoài `app/`)**: Cloudflare giới hạn 25 MiB/tệp; phiên Claude bị chặn tạo GitHub Releases. Tải qua raw.githubusercontent.
- **Bỏ `.github/workflows/pages.yml`**: chưa từng chạy thành công; deploy thật là Cloudflare Workers. Thay bằng `verify.yml`.
- **desktop/app là sản phẩm dựng** từ app/ bằng `tools/make_desktop_app.py`, không sửa tay.

## Files Modified This Session
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
