# Bravin

Trình dựng video chạy trên trình duyệt, Android và máy tính (bản web chạy cục bộ), tối ưu cho video dọc TikTok / Reels / Shorts.

## Tính năng chính
- Timeline nhiều track kiểu CapCut / Premiere: ripple, roll, slip, slide, rate stretch, In/Out, chọn nhiều clip, menu chuột phải, bố cục bảng làm việc co giãn, nhiều màn hình.
- Keyframe và Effect Controls kiểu Premiere, speed ramp, công cụ Bút (P) vẽ hình / mask bezier và chấm key độ mờ / âm lượng trên timeline.
- Lumetri Color, LUT .cube, scopes; trang chỉnh màu kiểu DaVinci với bảng node dạng canvas (nối tiếp, song song, lớp, ngoài vùng).
- Mask mạnh (elip, chữ nhật, bút bezier, theo dõi chuyển động), tách nền xanh, tách người.
- Hiệu ứng, chuyển cảnh, gói kiểu Sapphire; khử nhiễu, chống nhấp nháy, ổn định hình, slow-motion mượt, làm mịn da, giả lập phim.
- Âm thanh: LUFS, khử ồn, ducking, đồng bộ âm thanh theo sóng.
- Trợ lý AI: Claude trên claude.ai, hoặc "Luồng AI" dạng canvas (node AI, điều kiện, gộp, lặp…) với API chỉ cần dán mã, AI local qua đường link, hoặc model nhúng chạy ngay trong ứng dụng.
- Xuất MP4 bằng WebCodecs, phụ đề SRT, FCP XML.
- **Phim AI (4.10)**: nhúng LocalMiniDrama tiếng Việt (MIT © xuanyustudio) để AI viết kịch bản → phân cảnh → ảnh → video; tệp tạo xong tự vào thư viện, nút ＋ Dự án tạo dự án cùng tên phim. Hướng dẫn: `app/huong-dan/phim-ai.html` (trên web: `/huong-dan/phim-ai.html`), tải LocalMiniDrama-vi ở `app/downloads/`. Chi tiết kỹ thuật: `docs/PHIM_AI_LOCALMINIDRAMA.md`.

## Cấu trúc thư mục
| Thư mục | Nội dung |
|---|---|
| `app/` | Mã nguồn ứng dụng web hiện tại (HTML/CSS/JS thuần, không cần build). `vendor/transformers/` là bộ chạy AI nhúng. |
| `desktop/` | Bản cài cho Windows: `Cai dat Bravin.bat` (tạo biểu tượng Desktop/Start Menu), `Mo Bravin.bat` (chạy không cần cài). `bravin.ps1` là máy chủ nội bộ, mở Bravin trong cửa sổ riêng của Edge/Chrome; `app/` là bản ứng dụng chạy không cần mạng (phông chữ và bộ chạy AI có sẵn). |
| `android/` | Dự án Android (WebView) + `www/` là ứng dụng. `build.sh` để dựng APK (đặt biến `KS_PASS` là mật khẩu keystore). |
| `tools/` | Script dựng bản web/PWA, logo, `package.json` các thư viện gốc. |
| `docs/` | `ARCHITECTURE.md` (kiến trúc và từng nhóm tính năng), tài sản logo. |
| `legacy/` | Mã nguồn các phiên bản cũ: trình dựng đầu tiên (`editor/`), bản chạy cục bộ VINCut, dự án Android cũ. |
| `tests/` | Kịch bản kiểm thử Playwright (headless Chromium) và máy chủ tĩnh `serve_static.js`. Phần lớn cần một dự án mẫu: đặt `project.json` cùng video của bạn cạnh `index.html`. |

## Chạy thử
```bash
cd app
python3 -m http.server 8080     # hoặc: node ../tests/serve_static.js . 8080
# mở http://localhost:8080
```
Trên Windows: mở `desktop/` và làm theo `HUONG_DAN.txt`. Khi sửa `app/`, dựng lại `desktop/app/` bằng `python3 tools/make_desktop_app.py .` (thay Google Fonts bằng phông chữ cục bộ, bỏ `downloads/`).

## Kiểm thử
```bash
npm i -g playwright
node tests/serve_static.js app 8772 &
node tests/fix4.js    # ví dụ: đồng bộ âm thanh (không cần video mẫu)
```

## Ghi chú
- Mã định danh nội bộ giữ tên cũ để tương thích dữ liệu: IndexedDB `vincut`, localStorage `vincut-*`, định dạng dự án `vincut`, `window.VINCutAndroid`, package `app.vincut`.
- Khoá ký APK (`*.jks`) bị loại khỏi git bằng `.gitignore`; giữ bản sao an toàn riêng.
- Repo không kèm video hay dự án mẫu. Nút "Dự án mẫu" ở màn hình chính chỉ hiện khi có `project.json` cạnh ứng dụng.

## Triển khai bản web lên Cloudflare Workers
`wrangler.jsonc` ở thư mục gốc trỏ tới `./app` (bản web Bravin). Cấu hình build trên Cloudflare: Build command để trống, Deploy command `npx wrangler deploy`, Root directory `/`. Mỗi file tĩnh phải nhỏ hơn 25 MiB (file lớn nhất hiện tại là ort-wasm…wasm ≈ 20,6 MiB).
