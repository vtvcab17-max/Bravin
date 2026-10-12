# Khu Phim AI: LocalMiniDrama trong Bravin (4.10)

LocalMiniDrama (MIT © xuanyustudio) là công cụ làm phim ngắn bằng AI: kịch bản → nhân vật/bối cảnh/đạo cụ → phân cảnh → ảnh → video → ghép tập. Bravin 4.10 nhúng **bản tiếng Việt** của nó (thư mục `LocalMiniDrama-vi`) thành khu **Phim AI**. Mã nằm ở `app/js/lmd.js`.

## Cách chạy
1. Chạy LocalMiniDrama trên máy: `CHAY_PHIM_AI.bat` (Windows) hoặc `bash chay_phim_ai.sh`. Cần Node.js 18 trở lên. Máy chủ nghe ở cổng 5679 và phục vụ luôn giao diện.
2. Trong Bravin bấm **Phim AI** (thanh trên cùng) hoặc ô **Phim AI** ở Trang chủ.

## Kiểm tra độ tương thích
Mỗi lần mở khu, Bravin kiểm tra và hiện từng mục kèm cách sửa:

| Mục | Kiểm tra | Bắt buộc |
|---|---|---|
| Máy chủ LocalMiniDrama | `GET /health` trả lời trong 5 giây | có |
| Cầu nối Bravin | `/health` có `bravin_bridge ≥ 1` (bản gốc không có) | có |
| Đọc tệp (CORS) | trình duyệt đọc được dữ liệu từ Bravin | có |
| API dự án | `GET /api/v1/dramas` | có |
| ffmpeg | `/health.ffmpeg` (cần để ghép video cả tập) | cảnh báo |
| Ngôn ngữ AI | `/health.language` là `vi` | cảnh báo |
| Bắt tay giao diện | iframe gửi `hello` trong 9 giây | cảnh báo |

Đạt các mục bắt buộc thì giao diện LocalMiniDrama mở trong khu. Iframe sống suốt phiên, đóng khu vẫn tiếp tục đồng bộ.

## Đẩy tệp vào thư viện
- Bravin đọc phim đang mở trong LocalMiniDrama mỗi 6 giây (`GET /dramas/:id`, `/videos?status=completed`, `/video-merges`).
- Tệp **đã tạo thành công** được tải về (`/static/...`) và nhập vào thư viện của dự án đang mở, nhóm **Phim AI**:
  - ảnh phân cảnh, video phân cảnh (bản hoàn tất mới nhất), lồng tiếng thoại, thuyết minh;
  - ảnh nhân vật, bối cảnh, đạo cụ;
  - video cả tập và video ghép.
- Tên tệp: `Phim AI · T{tập} · C{cảnh} · ảnh|video|thoại|thuyết minh`, `Phim AI · Nhân vật · {tên}`…
- Sổ ghi mỗi cặp (dự án Bravin, phim) nằm ở `localStorage["bravin-lmd-seen:<dự án>:<phim>"]` nên không nhập trùng. Tạo lại một cảnh thì ra tệp mới, nhập thành bản mới.
- Lần đầu nối một phim với một dự án: tệp cũ không tự đổ vào, bấm **⇪ Đẩy** để nhập.
- Tệp lỗi khi tải được thử lại tối đa 3 lần.
- Tắt/bật bằng ô **Tự đẩy vào thư viện** (lưu ở `bravin-lmd-auto`).

## ＋ Dự án
Nút trong LocalMiniDrama (góc dưới phải) hoặc trên thanh khu Phim AI:
1. lưu dự án đang mở;
2. tạo dự án Bravin mới **cùng tên với phim** LocalMiniDrama, khung hình theo tỉ lệ của phim (16:9, 9:16, 1:1; 4:3 → 16:9, 3:4 → 4:5);
3. mở dự án đó và nhập sẵn mọi tệp đã có.

## Giao thức postMessage
Tin nhắn có dạng `{ source: "lmd" | "bravin", type, ... }`.

| Hướng | type | Nội dung |
|---|---|---|
| LMD → Bravin | `hello` | `version`, `bridge`, `features` |
| LMD → Bravin | `context` | `drama: { id, title, aspect_ratio } \| null` (đổi trang) |
| LMD → Bravin | `sync-now` | nhập mọi tệp chưa nhập |
| LMD → Bravin | `new-project` | tạo dự án cùng tên |
| Bravin → LMD | `ping` | `version` của Bravin |
| Bravin → LMD | `state` | `autoPush`, `project` (tên dự án Bravin đang mở) |
| Bravin → LMD | `pushed` | `count`, `names` |
| Bravin → LMD | `project-created` | `name` |

Phía LocalMiniDrama: `frontweb/src/utils/bravinBridge.js` và `frontweb/src/components/BravinDock.vue`.

## Thay đổi phía máy chủ LocalMiniDrama
- CORS mở cho mọi origin (máy chủ chỉ chạy trên máy). Đặt `server.cors_open: false` để quay về danh sách `cors_origins`.
- Trả `Access-Control-Allow-Private-Network: true` để Chrome cho trang https (Bravin web) gọi `localhost`.
- `/health` có thêm `bravin_bridge`, `lmd_version`, `language`, `ffmpeg`.
- Ngôn ngữ `vi`: dùng mẫu prompt tiếng Anh, cộng quy tắc xuất văn bản tiếng Việt (`promptI18n.applyOutputLanguageRule`) gắn vào mọi lời gọi mô hình văn bản. Prompt ảnh/video giữ tiếng Anh, `@图片N` giữ nguyên.

## Giới hạn
- Bravin web (https) chỉ nối được LocalMiniDrama trên chính máy đó (`localhost`). Địa chỉ LAN (`http://192.168…`) cần Bravin bản Windows hoặc Android.
- Trên Android, LocalMiniDrama chạy ở máy tính: nhập địa chỉ máy tính trong cùng Wi-Fi.
- Video H.264 cần trình duyệt có bộ giải mã H.264 (Chrome, Edge, WebView Android đều có).

## Đã kiểm thử (Bravin 4.10)
Kiểm thử bằng Chromium tự động, máy chủ LocalMiniDrama thật, Bravin chạy ở origin khác (cổng 8090) để thử đúng CORS:
- cả 6 mục kiểm tra đều đạt, bắt tay `hello` thành công;
- mở phim 1 → nhận `context`, lần đầu không đổ tệp cũ; **⇪ Đẩy** nhập ảnh, video, thoại;
- thêm một phân cảnh "tạo xong" vào cơ sở dữ liệu → trong 9 giây tự vào thư viện;
- **＋ Dự án** → dự án Bravin «Cô gái thiết kế» (16:9) với đủ 5 tệp, nhóm «Phim AI» trong thư viện, dock trong LocalMiniDrama hiện tên dự án mới.
