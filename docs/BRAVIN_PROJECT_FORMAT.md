# Định dạng `bravin-project` (schema 2): Antifact → Bravin

Đây là định dạng **Bravin đọc được** khi người dùng thả file vào Bravin. Ứng dụng nào trong hệ sinh thái (Antifact, Micron…) muốn gửi sang Bravin thì xuất đúng định dạng này. Mã đọc nằm ở `app/js/antifact.js`, có từ Bravin 4.9.1. Schema 1 vẫn đọc được.

## Cách người dùng đưa file vào Bravin
- **Thả file vào Trang chủ:** Bravin mở thành một **dự án mới**, khung hình tự chọn theo tỉ lệ canvas (9:16, 16:9, 1:1 hoặc 4:5).
- **Thả file vào trình dựng** (hoặc Thư viện, hoặc nút ＋): Bravin **thêm vào dự án đang mở**, bắt đầu từ vị trí kim.
- **Nút Mở dự án** ở Trang chủ: mở như một dự án mới.

Sau khi nhập, Bravin hiện **báo cáo**: số track, clip, keyframe, hiệu ứng, camera, và các phần bị bỏ qua kèm lý do. Muốn kiểm tra file Antifact xuất ra thì cứ thả vào Bravin rồi đọc báo cáo này.

Tên file nên là `ten-du-an.bravin.json`. Bravin nhận theo nội dung (`"format": "bravin-project"`), không theo đuôi file.

## Cấu trúc
```json
{
  "format": "bravin-project",
  "schema": 2,
  "generator": { "name": "Antifact", "version": "1.2" },
  "canvas": { "width": 1080, "height": 1920, "background": "#0c0d12" },
  "timeline": { "fps": 30, "duration": 12, "trackOrder": "bottom-to-top" },
  "camera": { "keyframes": [
    { "time": 0, "x": 540, "y": 960, "zoom": 1,   "rotation": 0, "easing": "ease-in-out" },
    { "time": 4, "x": 600, "y": 900, "zoom": 1.4, "rotation": 5 }
  ] },
  "tracks": [
    { "id": "t1", "name": "Ảnh nền", "index": 0, "enabled": true, "locked": false, "parallax": 0.6,
      "clips": [ {
        "id": "c1", "name": "Slide 1", "start": 0, "duration": 4,
        "position": { "x": 0, "y": 0, "width": 1080, "height": 1920 },
        "rotation": 0, "scale": 1, "opacity": 1, "blendMode": "normal",
        "media": { "type": "image", "encoding": "data-url", "data": "data:image/png;base64,…" },
        "keyframes": [
          { "time": 0, "x": 0, "y": 0, "scale": 1,   "easing": "ease-in-out" },
          { "time": 4, "x": -40, "y": -60, "scale": 1.1 }
        ],
        "transitionIn":  { "type": "fade", "duration": 0.5 },
        "transitionOut": { "type": "slide-to-left", "duration": 0.5 }
      } ] }
  ]
}
```

## Quy ước (quan trọng)
| Mục | Quy ước |
|---|---|
| Đơn vị toạ độ | **pixel của canvas**, gốc ở góc **trên-trái**, trục y hướng xuống |
| `position` | hộp chứa layer **trước khi xoay / scale**: `x, y` là góc trên-trái, `width, height` là cỡ hộp. Ảnh được vẽ vừa theo `width`, giữ tỉ lệ của ảnh |
| `rotation` | độ, **cùng chiều kim đồng hồ** trên màn hình, xoay quanh **tâm hộp** |
| `scale` | hệ số nhân thêm (1 = đúng cỡ hộp), quanh tâm hộp |
| `opacity` | 0..1 |
| Thời gian | giây. `clip.start` tính trên timeline. `keyframes[].time` tính **từ đầu clip**. `camera.keyframes[].time` tính **trên timeline** |
| `index` | thứ tự lớp: **0 = dưới cùng**. Track có index lớn hơn nằm trên |
| `enabled: false` | track bị tắt (vẫn nhập, ẩn đi) |

### Media (mỗi clip bắt buộc có)
| `media.type` | Nhập thành |
|---|---|
| `image` | lớp phủ ảnh |
| `video` | lớp phủ video. Cắt đoạn bằng `media.trim.in` (giây trong file nguồn). `volume` 0..1, `muted` |
| `audio` | clip âm thanh trên track âm thanh (`volume`, `media.trim.in`) |

`encoding: "data-url"` cùng `data: "data:<mime>;base64,…"` là cách **khuyên dùng**: chạy offline và chắc chắn đọc được. `url` (https) cũng được, nhưng máy chủ phải cho phép CORS.

**Lớp chữ:** hãy **xuất thành ảnh PNG** (`media.type: "image"`). Clip chỉ có trường `text` mà không có media thì bị bỏ qua, và báo cáo sẽ nói rõ.

### Keyframes (chuyển động)
Mỗi khoá có `time` và bất kỳ trường nào trong `x, y, width, height, scale, rotation, opacity`. Trường nào không có ở một khoá thì lấy theo các khoá khác của cùng trường, và trước khoá đầu thì giữ giá trị khoá đầu.

`easing` của một khoá là cách đi **từ khoá đó tới khoá kế tiếp**:

| `easing` | Ý nghĩa |
|---|---|
| `linear` | đều |
| `ease-in` | chậm lúc đầu |
| `ease-out` | chậm lúc cuối |
| `ease-in-out` (hoặc `ease`) | mượt hai đầu |
| `hold` | giữ nguyên rồi nhảy |
| `back` / `bounce` / `elastic` | bật lố / nảy / đàn hồi |

### Hiệu ứng vào / ra (chuyển cảnh)
`transitionIn` / `transitionOut`: `{ "type": "...", "duration": giây }`.

| Vào | Ra |
|---|---|
| `fade` | `fade` |
| `zoom-in`, `zoom-out` | `zoom-in`, `zoom-out` |
| `slide-from-left`, `slide-from-right`, `slide-from-top`, `slide-from-bottom` | `slide-to-left`, `slide-to-right`, `slide-to-top`, `slide-to-bottom` |
| `pop`, `rotate`, `flip`, `blur`, `drop`, `swing` | `pop`, `rotate`, `flip`, `blur` |

Chuyển cảnh giữa hai slide: `transitionOut` của slide trước và `transitionIn` của slide sau, cho hai clip chồng lên nhau đúng bằng thời lượng chuyển.

### Camera
- Camera **2D**: tại mỗi khoá, `x, y` là **điểm của canvas nằm giữa màn hình**, `zoom` 1 = thấy cả canvas (2 = phóng to gấp đôi), `rotation` là độ xoay camera, có `easing`.
- Bravin chưa có camera riêng, nên lúc nhập sẽ **chuyển camera thành chuyển động của từng lớp**: lấy mẫu 15 lần mỗi giây, cộng thêm đúng các thời điểm khoá. Hình nhìn thấy giống hệt, sửa được từng lớp trong Bravin.
- **2.5D:** đặt `parallax` cho track hoặc clip. 1 = theo camera hoàn toàn (mặc định), 0.5 = lớp xa hơn đi chậm hơn, 0 = đứng yên trên màn hình (logo, phụ đề, HUD).
- Trường 3D (`z`, `tiltX`, `tiltY`, `fov`, `depth`) **chưa hỗ trợ**: bị bỏ qua và báo cáo sẽ nhắc. Muốn có chiều sâu thì quy ra `parallax`.

### Hoà trộn
`blendMode` nhận một trong các giá trị: `normal`, `multiply`, `screen`, `overlay`, `soft-light`, `hard-light`, `darken`, `lighten`, `color-dodge`, `color-burn`, `difference`, `exclusion`, `hue`, `saturation`, `color`, `luminosity`.

### Giới hạn
- Tối đa 300 track.
- `canvas.background` là mã màu `#rrggbb`, Bravin tạo thành một lớp nền.
- Schema lớn hơn 2 vẫn được đọc, phần mới bị bỏ qua và có cảnh báo.

## Đã kiểm thử (Bravin 4.9.1)
Hai file mẫu `samples/bravin-project/plain.bravin.json` và `camera.bravin.json` có đủ thành phần:
- ảnh nền, logo có keyframe + easing + hiệu ứng vào/ra;
- video có cắt đoạn và âm lượng;
- lớp HUD `parallax: 0`;
- lớp chữ thiếu ảnh;
- nhạc;
- camera có pan, zoom, xoay, kèm `z`.

Đã kiểm tra trên khung hình Bravin dựng ra: vị trí từng lớp, chuyển động theo keyframe, camera, lớp parallax 0 đứng yên, thứ tự lớp, âm lượng, và báo cáo cảnh báo đúng hai chỗ (lớp chữ, camera 3D).
