# Bravin cho Samsung (4.11)

Bản Android riêng cho máy Galaxy: gói `app.bravin.samsung`, tên "Bravin Samsung", biểu tượng có chữ S xanh. Cài song song với Bravin thường (`app.bravin`, trước 4.11 versionCode 19 là `app.vincut`), dữ liệu riêng. Nộp Galaxy Store: `docs/STORE.md`.

Hướng dẫn cho người dùng: `app/huong-dan/samsung.html` (web: `/huong-dan/samsung.html`). Tải APK: `https://github.com/vtvcab17-max/Bravin/raw/main/downloads/Bravin_Samsung_4.11.apk`.

## Dựng
```bash
cd android
KS_PASS=<mật khẩu> VER=4.11 CODE=19 FLAVOR=samsung bash build.sh <đường dẫn app>   # → build/Bravin_Samsung.apk + .aab
KS_PASS=<mật khẩu> VER=4.11 CODE=19 bash build.sh <đường dẫn app>                   # bản thường app.bravin
```
`FLAVOR=samsung` làm 4 việc:
1. `aapt2 link --rename-manifest-package app.bravin.samsung` (lớp Java vẫn là `app.vincut.*`, không cần R).
2. Thêm `res-samsung/` làm lớp phủ tài nguyên: biểu tượng có chữ S, `xml/remote_actions.xml`, chuỗi nhãn Air actions.
3. Sửa manifest: nhãn "Bravin Samsung"; intent-filter + meta-data `com.samsung.android.support.REMOTE_ACTION`; meta-data `com.samsung.android.dex.launchwidth/launchheight` = 1440×900.
4. Chèn `<meta name="bravin-edition" content="samsung">` vào `www/index.html`.

## Phía Android (MainActivity, dùng cho cả hai bản)
- `VINCutAndroid.device()` → JSON `{manufacturer, model, sdk, samsung, spen, dex, package, multiWindow}`.
  - `spen`: `hasSystemFeature("com.sec.feature.spen_usp")`.
  - `dex`: so `Configuration.SEM_DESKTOP_MODE_ENABLED` với `semDesktopModeEnabled` qua reflection (máy khác trả false).
- `onConfigurationChanged` phát sự kiện `bravin-config` cho trang (bật/tắt DeX, đổi cửa sổ).
- Không bật toàn màn hình (immersive) khi đang DeX hoặc chia màn hình, để giữ thanh tác vụ.

## Phía web (`app/js/samsung.js`, nạp ở mọi bản)
Bật khi là bản Samsung, hoặc máy Samsung (`device().samsung`, user agent `SM-…`), hoặc đã thấy bút.

| Tính năng | Cách làm |
|---|---|
| Vẽ tay S Pen (`openPenDraw`, nút ✎ `#samDrawBtn`, Ctrl+Shift+P, menu Tiện ích) | Canvas cỡ khung dự án đè lên ảnh khung hiện tại. Bề rộng nét = cỡ × (0,15 + 1,7 × pressure), dùng `getCoalescedEvents` cho nét mượt. Đầu tẩy (`button 5` / `buttons & 32`) hoặc nút Tẩy = `destination-out`. "Chỉ nhận bút" bỏ chạm ngón tay khi máy có bút. Xong: PNG trong suốt → `addMediaFile` → `appendMedia(m, null, {overlay:true, start:t})`, dài 3 giây. |
| Air View | Bút rê (pointermove pen, `buttons=0`) trên phần tử có `title`/`aria-label`/`data-tip` 320 ms → bong bóng `.airview`. |
| DeX | Lớp `body.dex`, không khoá xoay, `wantDesktop()` trả false khi DeX (cửa sổ DeX đã rộng, không ép viewport). |
| Air actions | Samsung gửi phím vào WebView, chạy phím tắt sẵn có: Space, S, ←, →, M, K, Ctrl+Z, Ctrl+Y. Bảng tra trong "Cài đặt S Pen và DeX". |
| Cài đặt (`openSamsungSettings`) | Bật/tắt Air View, Chỉ nhận bút; lưu `localStorage bravin-sam-*`. |

`input.js` bỏ qua xử lý bút (giữ lâu = menu) khi bút ở trong `.sdraw`.

## Plugin trên APK (`plugins.js`, mọi bản Android)
Khi có `window.VINCutAndroid`: `openPlugins`, `install`, `installFromUrl`, `installFromFile`, tham số `?plugin=` đều mở hộp thoại **Cần Bravin trên máy tính** (link `downloads/Bravin_Setup_Windows.exe`, chép link bản web). Plugin đã cài không được nạp. Bản web/Windows không đổi.

## Kiểm thử
`tests/verify/smoke.mjs` giả lập APK Samsung (stub `VINCutAndroid`, chèn meta edition) và kiểm tra: nhận bản Samsung + S Pen; plugin yêu cầu bản PC; nét vẽ to dần theo lực nhấn (4 px → 26 px); chạm ngón tay bị bỏ qua; nét vào track phủ; Air View; DeX qua `bravin-config`. Bản web vẫn mở trình quản lý plugin.

Chưa thử trên máy Galaxy thật: Air actions, đầu tẩy, nhận DeX bằng reflection, kích thước cửa sổ DeX (feat-012).
