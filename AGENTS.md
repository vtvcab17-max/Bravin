# AGENTS.md: hướng dẫn cho agent viết code (Claude, Codex…) làm việc trên Bravin

Bravin là trình dựng video của Phạm Việt Hà, chạy trên web (https://bravin.vtvcab17.workers.dev), Android (WebView) và Windows (bộ cài NSIS). Ứng dụng là HTML/CSS/JS thuần trong `app/`, không có bước build. Thuộc hệ sinh thái Bravinall (Antifact thiết kế, Micron AI canvas + chợ plugin, website ở repo `vtvcab17-max/Bravinall`).

**Người dùng nói tiếng Việt: trả lời, giao diện, thông báo, tài liệu đều bằng tiếng Việt.**

## Startup Workflow (bắt đầu phiên)

Before writing code (trước khi sửa bất cứ gì):

1. `pwd` để chắc đang ở gốc repo.
2. Đọc hết tệp này.
3. Đọc `progress.md` (trạng thái hiện tại) và `feature_list.json` (nguồn sự thật về tính năng).
4. Chạy `./init.sh` (hoặc `./init.sh --quick` nếu chỉ đọc). Nền đang đỏ thì **sửa nền trước**, chưa thêm việc mới.
5. `git log --oneline -5` để biết thay đổi gần nhất.
6. Cần hiểu sâu một phần nào thì đọc tài liệu tương ứng (bảng dưới), đừng đọc hết.

| Cần biết | Đọc |
|---|---|
| Kiến trúc, từng nhóm tính năng, Android/Windows | `docs/ARCHITECTURE.md` |
| SDK plugin, chợ Micron | `docs/PLUGIN_SDK.md` |
| Định dạng `bravin-project` (Antifact → Bravin) | `docs/BRAVIN_PROJECT_FORMAT.md` |
| Khu Phim AI (LocalMiniDrama) | `docs/PHIM_AI_LOCALMINIDRAMA.md`, `tools/phimai-installer/README.md` |
| Bản Samsung (S Pen, DeX, Air actions), plugin trên APK | `docs/SAMSUNG.md` |
| Bản Google Play (AAB, targetSdk 36, hồ sơ cửa hàng) | `play/README.md`, `play/DATA_SAFETY.md` |

## Working Rules (quy tắc làm việc)

- **One feature at a time**: chọn đúng MỘT mục chưa `done` trong `feature_list.json`, đặt `in-progress`, làm xong mới sang mục khác.
- **Stay in scope**: chỉ sửa tệp liên quan tới tính năng đang làm. Thấy lỗi khác thì ghi vào `feature_list.json` (mục mới, `not-started`), không tiện tay sửa.
- **Sửa `app/` trước**, rồi dựng lại bản Windows: `python3 tools/make_desktop_app.py .` (thay Google Fonts bằng phông cục bộ, bỏ `downloads/`). Không sửa tay `desktop/app/`.
- **Không có bước build**: thêm tệp JS mới thì thêm thẻ `<script>` vào `app/index.html` đúng thứ tự phụ thuộc.
- **Phiên bản**: đổi đồng thời `<meta name="bravin-version">` trong `app/index.html`, `!define VER` + `VIProductVersion` trong `desktop/installer/setup.nsi`, và tăng `CODE` khi dựng APK (xem `progress.md` để biết versionCode gần nhất). `init.sh` báo lỗi nếu lệch.
- **Tệp ≥ 25 MiB không được nằm trong `app/`** (Cloudflare từ chối deploy). Bộ cài lớn để ở `downloads/`, tải qua `https://github.com/vtvcab17-max/Bravin/raw/main/downloads/<tên>`.
- **Bên thứ ba**: JIZURA (MIT, `app/jizura/`) và LocalMiniDrama (MIT) giữ nguyên ghi công và giấy phép. Không chép tài nguyên của Adobe, CapCut, DaVinci hay sản phẩm thương mại khác.

## Không bao giờ

- Đưa khoá ký Android (`*.jks`) hay mật khẩu của nó (`KS_PASS`) vào repo, tài liệu hoặc log. `init.sh` quét và chặn.
- Đẩy lên repo `IQUEEN-MEDIA`.
- Báo "xong" khi `./init.sh` chưa xanh.
- Xoá dữ liệu người dùng trong script cài/gỡ mà không hỏi.

## Definition of Done (khi nào được báo xong)

Một tính năng chỉ done only when TẤT CẢ đều đúng:

- [ ] Hành vi mới chạy được và đã thử như người dùng (Playwright hoặc ảnh chụp màn hình), không chỉ đọc mã.
- [ ] `./init.sh` đạt (kiểm tra tĩnh + kiểm thử khói `app/` và `desktop/app/`). Tính năng mới quan trọng thì thêm bước vào `tests/verify/smoke.mjs`.
- [ ] Bằng chứng (lệnh đã chạy + kết quả) ghi vào trường `evidence` của `feature_list.json` và vào `progress.md`.
- [ ] Tài liệu liên quan trong `docs/` đã cập nhật; giao diện và chữ bằng tiếng Việt.
- [ ] Repo restartable: phiên sau chạy `./init.sh` được ngay.

## Verification Commands (lệnh kiểm chứng)

```bash
./init.sh            # đầy đủ: kiểm tra tĩnh + test khói Chromium cho app/ và desktop/app/
./init.sh --quick    # chỉ kiểm tra tĩnh (vài giây)
npm run lint         # = node tests/verify/static.mjs
npm test             # = kiểm thử khói
npm run serve        # chạy thử ở http://localhost:8080
```

CI (`.github/workflows/verify.yml`) chạy `init.sh` cho mỗi lần đẩy và PR.

Dựng sản phẩm (chỉ khi người dùng cần tệp cài):
- APK: `cd android && KS_PASS=<mật khẩu> VER=<x.y> CODE=<n> [FLAVOR=samsung] bash build.sh <đường dẫn app>` (khoá `vincut-release.jks` không có trong repo: chép vào `android/` lúc dựng rồi xoá). Bản Samsung công khai ở `downloads/Bravin_Samsung_<ver>.apk`.
- Google Play: `FLAVOR=play` → `android/build/Bravin_Play.aab` (gói `com.bravinall.bravin`, targetSdk 36, qua `android/build_play.sh`). Mỗi lần nộp tăng `CODE`. Ảnh cửa hàng: `node tools/play/screenshots.mjs`.
- Windows: theo `desktop/installer/README.txt` (payload lấy từ `desktop/app`). Dựng xong chép bộ cài vào `app/downloads/Bravin_Setup_Windows.exe` (link trong hộp thoại "Cần Bravin trên máy tính" của APK).
- Bộ cài Phim AI: `tools/phimai-installer/README.md`.

## Deploy

Đẩy lên nhánh `main` của `vtvcab17-max/Bravin` thì Cloudflare Workers (`wrangler.jsonc`, thư mục `app/`) tự đưa lên web sau khoảng 1 phút. Kiểm tra bằng cách tải `https://bravin.vtvcab17.workers.dev/<tệp>?v=<commit>` (thêm tham số để tránh bộ đệm). Người dùng đang mở web cần Ctrl+F5. Phiên Claude không tạo được GitHub Releases.

## Bẫy đã gặp (gotchas)

- Trong shell của agent, `pkill -f "<mẫu>"` hay `pgrep -f` có thể khớp chính lệnh đang chạy và giết shell. Ghi PID ra tệp rồi `kill $(cat pid)`.
- Chromium của Playwright không giải mã H.264: video kiểm thử dùng VP9/WebM.
- `makensis` gặp tên tệp không phải ASCII thì cần `LANG=C.UTF-8 LC_ALL=C.UTF-8`, nếu không sẽ segfault.
- Tệp `.ps1` có tiếng Việt phải lưu UTF-8 có BOM (Windows PowerShell 5.1).
- Bản Windows chạy không cần mạng: không dùng CDN hay Google Fonts trong `desktop/app`.
- `*.apk` bị `.gitignore` chặn, trừ `downloads/*.apk`.
- Mã Java chung cho cả 3 bản APK/AAB: thay đổi `MainActivity` phải chạy được với targetSdk 34 (APK) và 36 (Play): tràn viền, quay lại bằng OnBackInvokedCallback.
- Điện thoại 360–412 dp: thanh trên không được tràn ngang (kiểm thử khói đo). Nút mới trên thanh trên phải ẩn ở `body.phone` và vào menu ⋯ (`phone.js`).
- Dựng Android với `android-23.jar`: API mới hơn (vd. `isInMultiWindowMode`) phải gọi qua reflection, thuộc tính manifest API 24+ làm aapt lỗi.

## End of Session (trước khi kết thúc)

Before ending a session:

1. Chạy `./init.sh`, đảm bảo xanh (hoặc ghi rõ chỗ còn đỏ và lý do).
2. Cập nhật `feature_list.json` (`status`, `evidence`).
3. Cập nhật `progress.md` (Current State, việc tiếp theo, rủi ro) và `session-handoff.md` nếu phiên dài.
4. Commit với thông điệp mô tả rõ, chỉ khi repo ở trạng thái an toàn (clean). Đẩy `main` chỉ khi người dùng muốn đưa lên web.

## Escalation (khi nào hỏi người dùng)

- Quyết định không đảo ngược được (xoá dữ liệu, đổi khoá ký, đổi tên miền).
- Cần chạy trên thiết bị thật (Windows, Android) mà agent không có: ghi vào `feature_list.json` trạng thái `blocked` kèm hướng dẫn thử.
- Kiểm chứng đỏ lặp lại sau 2–3 lần sửa: dừng, ghi vào `progress.md`, báo người dùng.
