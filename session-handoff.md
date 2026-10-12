# Session Handoff

## Current Objective
- Goal: Bravin 4.11 – bản riêng cho Samsung (S Pen, DeX, Air actions) + plugin trên APK yêu cầu bản PC (feat-011).
- Current status: xong, đã kiểm chứng bằng giả lập; chờ thử trên Galaxy thật (feat-012).
- Phiên trước: harness engineering (xong).
- Branch / commit: main (xem `git log --oneline -3`).

## Completed This Session
- [x] AGENTS.md + CLAUDE.md (startup, quy tắc, definition of done, deploy, gotchas, end of session)
- [x] init.sh + tests/verify (tĩnh + khói Chromium cho app/ và desktop/app/)
- [x] CI verify.yml thay pages.yml
- [x] feature_list.json, progress.md
- [x] Xoá mật khẩu keystore khỏi tài liệu

## Verification Evidence

| Check | Command | Result | Notes |
|---|---|---|---|
| Tĩnh | `node tests/verify/static.mjs` | đạt | 54 JS, 6 JSON, phiên bản 4.10 khớp |
| Khói app | `node tests/verify/smoke.mjs app` | 9/9 | Chromium headless |
| Khói Windows | `node tests/verify/smoke.mjs desktop/app` | 9/9 | |
| Harness | `validate-harness.mjs --target .` | 100/100 | trước: 20/100 (điểm cấu trúc, chưa phải đo hiệu quả thật) |

## Files Changed
- Xem mục "Files Modified This Session" trong progress.md.

## Decisions Made
- Xem progress.md → Decisions Made.

## Blockers / Risks
- Bộ cài Phim AI chưa cài thử trên Windows thật.
- Mật khẩu keystore cũ còn trong lịch sử git.

## Next Session Startup
1. Read `AGENTS.md`.
2. Read `feature_list.json` and `progress.md`.
3. Review this handoff.
4. Run `./init.sh` before editing.

## Recommended Next Step
- Hỏi người dùng kết quả thử Bravin Samsung trên Galaxy (feat-012) và PhimAI_Setup trên Windows (feat-007).
- Khi dựng lại bản Samsung: xem `docs/SAMSUNG.md`, nhớ chép APK vào `downloads/` và bộ cài Windows vào `app/downloads/Bravin_Setup_Windows.exe`.
