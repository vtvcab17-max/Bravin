# Đưa Bravin lên Google Play

Hồ sơ trong thư mục này để nộp **Bravin** lên Google Play Console.

| Mục | Giá trị |
|---|---|
| Mã gói | `app.bravin` (không đổi được sau khi đăng) |
| Tệp nộp | `android/build/Bravin.aab` (Android App Bundle) |
| targetSdk / minSdk | 36 (Android 16, Play bắt buộc từ 31/8/2026) / 24 (Android 7) |
| Ký | AAB ký bằng **upload key** `bravin-release.jks` (alias `bravin`); Google Play App Signing giữ khoá phát hành |
| Chính sách quyền riêng tư | https://bravin.vtvcab17.workers.dev/chinh-sach-rieng-tu.html |

## Dựng AAB
Xem `docs/STORE.md` (công cụ: android.jar 36, aapt2, bundletool, dx):
```bash
cd android
cp <nơi cất>/bravin-release.jks .           # không đưa lên git
KS_PASS=<mật khẩu> VER=4.11 CODE=<n> bash build.sh ../app   # → build/Bravin.aab + build/Bravin.apk
rm bravin-release.jks
```
Mỗi lần nộp phải tăng `CODE` (versionCode).

## Các bước trên Play Console
1. **Tạo ứng dụng**: Tên "Bravin", ngôn ngữ mặc định Tiếng Việt, Ứng dụng, Miễn phí.
2. **Thiết lập ứng dụng** (bảng điều khiển):
   - *Quyền truy cập ứng dụng*: tất cả chức năng dùng được không cần đăng nhập. Ghi chú: "Trợ lý AI cần khoá API của chính người dùng; Phim AI cần LocalMiniDrama chạy trên máy tính. Các phần còn lại dùng ngay."
   - *Quảng cáo*: Không.
   - *Phân loại nội dung*: danh mục "Tiện ích, Năng suất, Giao tiếp hoặc Khác"; không bạo lực, không nội dung tình dục, không cờ bạc. Câu hỏi về nội dung do người dùng tạo/chia sẻ giữa người dùng: Không (ứng dụng không có mạng xã hội). Truy cập internet: Có (tải phông, tải video từ link). Dự kiến xếp loại 3+/Mọi người.
   - *Đối tượng mục tiêu*: 13 tuổi trở lên (không nhắm tới trẻ em).
   - *Ứng dụng tin tức, ứng dụng chính phủ, tài chính, sức khoẻ*: Không.
   - *An toàn dữ liệu*: xem `DATA_SAFETY.md`.
   - *Chính sách quyền riêng tư*: dán URL ở bảng trên.
3. **Trang thông tin cửa hàng** (Phát triển → Trang thông tin chính):
   - Tên, mô tả ngắn, mô tả đầy đủ: `listing/vi-VN/*.txt` (thêm bản dịch: `listing/en-US/*.txt`).
   - Biểu tượng: `graphics/icon-512.png`. Ảnh nổi bật: `graphics/feature-graphic-1024x500.png`.
   - Ảnh điện thoại: `graphics/screenshots/phone-*.png` (1080×1919). Máy tính bảng 10 inch: `graphics/screenshots/tablet-*.png` (2560×1600); có thể dùng lại cho 7 inch.
   - Danh mục: Trình phát và chỉnh sửa video. Email liên hệ: vtvcab17@gmail.com.
4. **Ký ứng dụng**: lần đầu tải AAB lên, chọn "Google tạo và quản lý khoá ký" (mặc định). AAB đã ký bằng `bravin-release.jks` nên khoá này trở thành upload key. Mất upload key thì xin đặt lại qua Play Console. Riêng bản Galaxy Store (`Bravin_Samsung.apk`) ký thẳng bằng khoá này: mất là không cập nhật được.
5. **Thử nghiệm**:
   - *Thử nghiệm nội bộ*: tải `Bravin.aab`, thêm email người thử, cài qua link Play.
   - Tài khoản nhà phát triển **cá nhân** tạo sau 13/11/2023 phải chạy **thử nghiệm kín với ít nhất 12 người thử, liên tục 14 ngày** rồi mới được xin quyền phát hành chính thức (Production). Tài khoản tổ chức không bị yêu cầu này.
6. **Phát hành chính thức**: tạo bản phát hành ở kênh Chính thức, dán `release-notes/vi-VN.txt` (và `en-US.txt`), gửi xét duyệt (thường vài giờ đến vài ngày).

## Làm mới ảnh chụp màn hình
```bash
node tools/play/screenshots.mjs   # Playwright, giả lập điện thoại 1080×1919 và máy tính bảng 2560×1600
```

## Trước mỗi lần nộp
- [ ] `./init.sh` xanh
- [ ] Tăng `CODE`, đổi `VER` (khớp `app/index.html`)
- [ ] Cài `android/build/Bravin.apk` trên một máy Android 15/16 thật: mở dự án, nhập video, xuất video, nút quay lại, bàn phím không che ô nhập, xoay màn hình
- [ ] Cập nhật `release-notes/`
