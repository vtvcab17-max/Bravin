# Đưa Bravin lên Google Play và Galaxy Store

## Gói và khoá ký (từ 4.11, versionCode 19)

| Store | Gói | Tệp nộp |
|---|---|---|
| Google Play | `app.bravin` | `Bravin.aab` |
| Galaxy Store | `app.bravin.samsung` (S Pen, Air actions, DeX) | `Bravin_Samsung.apk` |

- Lớp Java vẫn là `app.vincut.*`. `aapt2 --rename-manifest-package` chỉ đổi tên gói cài đặt.
- **Không đổi được tên gói sau lần phát hành đầu.**
- Hai gói `app.vincut` (đến bản 18) và `app.bravin*` là hai app khác nhau. Người đã cài APK cũ phải gỡ ra rồi cài bản mới.
- Cả hai bản ký bằng `bravin-release.jks` (alias `bravin`, RSA 4096, hạn đến năm 2059). Chứng chỉ: `CN=Bravin, O=Bravinall, C=VN`, SHA-256 `c9:97:05:a2:ac:7c:31:95:6e:a4:c2:81:73:db:4d:fb:55:97:30:0c:e0:c3:ec:dd:b7:5e:d2:9a:5d:05:a6:fe`.
- Khoá và mật khẩu chỉ người dùng giữ, không đưa vào repo.
- **Mất khoá thì không cập nhật được bản Galaxy Store.**
- Google Play: bật Play App Signing. Khoá này khi đó chỉ là khoá tải lên (upload key), mất vẫn xin Google cấp lại được.

## Dựng

```bash
cd android
cp <nơi cất>/bravin-release.jks .
KS_PASS=<mật khẩu> VER=4.11 CODE=19 bash build.sh ../app                 # build/Bravin.aab + Bravin.apk
KS_PASS=<mật khẩu> VER=4.11 CODE=19 FLAVOR=samsung bash build.sh ../app  # build/Bravin_Samsung.aab + .apk
rm bravin-release.jks
```

Mỗi bản mới phải tăng `CODE`. Công cụ cần có (đặt biến môi trường nếu để chỗ khác):

| Biến | Công cụ | Lấy ở đâu khi không có Android SDK |
|---|---|---|
| `ANDROID_JAR` | android.jar API 36 | raw.githubusercontent.com/Reginer/aosp-android-jar/main/android-36/android.jar |
| `AAPT2` | aapt2 2.19 trở lên | npm `aaptjs3` (bin/x64/linux/aapt2) |
| `BUNDLETOOL` | bundletool 1.17 | npm `bundletoolheavy` |
| `DX` | dalvik-exchange | `apt install dalvik-exchange` |

## Đã đáp ứng trong mã

| Yêu cầu | Cách làm |
|---|---|
| Target API 36 (Google Play bắt buộc từ 31/8/2026) | `targetSdkVersion 36`, biên dịch với android.jar 36 |
| App Bundle (AAB) | `bundletool build-bundle`, assets không nén để video tua nhanh |
| Tràn viền (Android 15+) | `MainActivity`: WebView nằm trong `FrameLayout`, đệm theo `systemBars + displayCutout + ime` |
| Cử chỉ quay lại dự đoán (target 36) | `enableOnBackInvokedCallback`, `OnBackInvokedCallback` trên Android 13+, `onBackPressed` cho máy cũ |
| Cấu hình mạng tường minh | `res/xml/network_security_config.xml`: cho phép http vì máy chủ nội bộ 127.0.0.1 và Phim AI (LocalMiniDrama trên máy tính trong cùng Wi-Fi, `http://192.168.x.x:5679`) không có https; chỉ tin chứng chỉ hệ thống. Dịch vụ ngoài Bravin tự gọi đều https |
| Không bật gỡ lỗi WebView ở bản phát hành | `setWebContentsDebuggingEnabled` chỉ bật khi app debuggable |
| Ký v2 + v3 | bundletool ký APK; AAB ký bằng jarsigner (SHA-256) |
| Danh mục app | `android:appCategory="video"` |

## Hồ sơ cửa hàng đã soạn sẵn

Thư mục `play/`: tiêu đề và mô tả vi-VN/en-US (`play/listing`), ảnh điện thoại và máy tính bảng, ảnh bìa 1024×500, icon 512 (`play/graphics`), ghi chú phát hành, gợi ý mục An toàn dữ liệu (`play/DATA_SAFETY.md`), các bước trên Play Console (`play/README.md`). Chính sách quyền riêng tư: https://bravin.vtvcab17.workers.dev/chinh-sach-rieng-tu.html. Làm mới ảnh: `node tools/play/screenshots.mjs`.

## Việc phải làm trên store (người dùng)

**Google Play Console**
- Tài khoản nhà phát triển (25 USD). Tài khoản cá nhân mới phải thử kín với 12 người trong 14 ngày.
- Bật Play App Signing, tải `Bravin.aab`.
- Khai chính sách quyền riêng tư (URL) và biểu mẫu An toàn dữ liệu:
  - micro: ghi âm lồng tiếng, xử lý trên máy, không gửi đi;
  - tệp người dùng chọn: chỉ đọc trên máy.
- Điền bảng hỏi IARC, đối tượng người dùng, icon 512×512, ảnh bìa 1024×500, ít nhất 2 ảnh chụp màn hình (nên có ảnh máy tính bảng / máy gập).

**Galaxy Store Seller Portal**
- Cần trạng thái Corporate Commercial Seller (Profile → Request Corporate Commercial Seller). Cá nhân phải đăng ký hộ kinh doanh.
- Từ 08/10/2026 Samsung tạm ngừng xác thực bằng D-U-N-S, phải nộp giấy tờ thay thế.
- Add New App → Android → tải `Bravin_Samsung.apk`. Khai cùng URL chính sách quyền riêng tư, ảnh chụp màn hình Z Fold / DeX.

## Chưa kiểm chứng

- Chưa chạy bản target 36 trên máy thật (feat-013). Cần thử: tràn viền khi thoát toàn màn hình (DeX, đa cửa sổ), bàn phím ảo đẩy khung lên, vuốt quay lại đóng hộp thoại rồi hỏi thoát, ghi âm, xuất MP4, tải link https.
- Có thể dùng Samsung Remote Test Lab (miễn phí) để thử trên Z Fold.
