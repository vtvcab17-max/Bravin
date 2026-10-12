# Bravin Plugin & Extension SDK (API v2, Bravin 4.9)

Có **hai cách** để sản phẩm của đội ngũ kết nối với Bravin:

| | Plugin | Cầu nối extension |
|---|---|---|
| Chạy ở đâu | Trong Bravin, iframe cách ly (`sandbox="allow-scripts"`) | Trong trình duyệt (Chrome/Edge MV3…), ngoài Bravin |
| Dùng để | Bảng điều khiển, lệnh menu, tự động hoá timeline | Gửi video/ảnh/link từ web vào Bravin |
| Giao tiếp | `sdk/bravin-sdk.js` (postMessage có quyền) | `window.postMessage({bravin:"bridge"})` |
| Duyệt | Người dùng duyệt quyền khi cài | Người dùng cho phép từng extension |

Mọi thứ hoạt động trên bản web, Android và Windows (Bravin tự ép CSP, không cần build).

---

## 1. Làm một plugin

Một plugin = thư mục có `manifest.json` + `index.html` (+ js/css). Xem mẫu trong `examples/plugins/`.

### manifest.json
```json
{
  "id": "com.doi-ngu.thong-ke",
  "name": "Thống kê timeline",
  "version": "1.0.0",
  "author": "Đội ngũ",
  "description": "Mô tả ngắn",
  "entry": "index.html",
  "permissions": ["timeline.read", "timeline.write", "ui"],
  "network": ["api.example.com", "*.cdn.example.com"],
  "panel":    { "title": "Thống kê", "height": 300 },
  "commands": [ { "id": "outro", "title": "Thêm chữ cuối video", "context": "global" } ]
}
```
- `id`: chữ thường, số, `. _ -`, 3–64 ký tự. Đổi id = plugin khác.
- `panel`: có thì plugin có bảng nổi (nút **Mở bảng** trong Tiện ích, hoặc `ui.openPanel()`). Không có = plugin chạy ngầm.
- `commands[].context`: `global` (chỉ hiện trong màn Tiện ích), `clip` (menu chuột phải của 1 clip), `selection` (menu khi chọn nhiều clip).
- `network`: bắt buộc nếu xin quyền `network`. Chỉ https (hoặc `http://localhost` khi phát triển).

### Quyền
| Quyền | Cho phép |
|---|---|
| `timeline.read` | `timeline.get`, `timeline.select`, sự kiện `timeline.changed` / `selection.changed` / `playhead` |
| `timeline.write` | `addText`, `addMedia`, `updateClip`, `removeClip`, `undo` |
| `media.read` | `media.list` |
| `media.import` | `media.import` (từ link, base64, dataUrl) |
| `project.read` | `project.snapshotFrame` (chụp khung đang xem) |
| `playback` | `timeline.seek`, `playback.play/pause` |
| `ui` | toast, panel, lệnh menu |
| `network` | `net.fetch` tới các địa chỉ trong `network` |
| `video.frames` | `frames.open/get/close`: đọc điểm ảnh từng khung của clip (API v2) |
| *(luôn có)* | `storage.*` (1 MB / plugin) |

Gọi thiếu quyền → lỗi `permission_denied`. Mọi thay đổi timeline đều vào lịch sử, người dùng **Ctrl+Z** được.

### Viết code
```html
<script src="bravin-sdk.js"></script>   <!-- tuỳ chọn: Bravin tự chèn SDK -->
<script>
Bravin.connect().then(async bravin => {
  const tl = await bravin.timeline.get();        // {playhead,duration,tracks,clips,selection}
  await bravin.timeline.addText({ text: "Xin chào", start: tl.playhead, dur: 2 });
  bravin.on("timeline.changed", () => { /* vẽ lại bảng */ });
  bravin.on("command:outro", async cmd => { /* lệnh của bạn */ });
});
</script>
```
CSS có sẵn biến theme: `--bv-bg --bv-panel --bv-line --bv-fg --bv-muted --bv-accent`.

### Toàn bộ API
```
bravin.info / bravin.has(perm)
timeline.get() → { playhead, duration, playing, tracks:[{id,type,name,hidden,locked}],
                   clips:[{id,kind,type,track,start,dur,mediaId,mediaName,text,text2,group}], selection:[id] }
timeline.seek(sec) · addText({text,text2,start,dur,style}) → {id} · addMedia({mediaId,start,overlay})
timeline.updateClip(id, {dur,vol,scale,x,y,opacity,speed,rot,size,line1,line2,label,muted,start*})   (*start chỉ clip ngoài track chính)
timeline.removeClip(id) · select([ids]) · undo()
playback.play() / pause()
media.list() → [{id,name,kind,duration}] · media.import({url|dataUrl|base64,mime,name,addToTimeline,overlay}) → {mediaId,...}
project.snapshotFrame({type:"image/jpeg",quality,maxWidth}) → {dataUrl,width,height}
ui.toast(msg) · openPanel() · closePanel() · setPanelTitle(t) · registerCommand({id,title,context}, handler)
storage.get/set/remove/keys
net.fetch(url, {method,headers,body,as:"text"|"json"|"base64"}) → {ok,status,contentType,text|json|base64}
sự kiện: "timeline.changed" · "selection.changed" · "playhead" · "project.loaded" · "command" · "command:<id>"
```
### API v2 (Bravin 4.9): khung hình, mask, corner pin, theo dõi
Plugin dùng API v2 khai `"apiVersion": 2` trong manifest. Bravin cũ hơn sẽ từ chối cài và báo cần cập nhật.
```
frames.open(clipId, {maxWidth}) → {session, width, height, fps, duration, start, frameW, frameH}
frames.get(session, t) → {t, width, height, data: ArrayBuffer RGBA}  (t = giây tính từ đầu clip; ảnh đúng như clip hiện trong khung hình)
frames.close(session)
timeline.getClip(id) → {…, in, out, speed, mediaKind, x, y, scale, angle, masks, pinned, fps, frameW, frameH}
timeline.checkpoint()                        // 1 bước hoàn tác cho nhiều thao tác sau (truyền {noUndo:true})
timeline.duplicateClip(id, {name}) → {id, track}          // bản sao trên track lớp phủ mới, cùng thời điểm
timeline.setMask(id, {maskId, name, keys:[{t, pts:[[x,y],…]}], feather, expand, inv, mode})  → {maskId}
timeline.setPin(id, {keys:[{T|t, quad:[x0,y0,x1,y1,x2,y2,x3,y3]}]})   // 4 góc TL,TR,BR,BL (0..1 khung hình)
timeline.setKeyframes(id, {x:[{t,v}], y, scale, angle, opacity, blur, mosaic}, {ease})
timeline.applyTrack(id, {samples:[{T,cx,cy,rot,scale}], ref:{T,cx,cy,rot,scale}, use:{rotation,scale}})
timeline.updateClip(id, {blur, mosaic, …}, {noUndo})
ui.openPanel({size:"large"|"normal"})        // manifest: "panel": {"size": "large"} để mở bảng lớn
```
Toạ độ `x,y` là 0..1 theo khung hình; `t` tính từ đầu clip; `T` là thời gian trên timeline. Bravin 4.9 thêm hai thuộc tính clip: `mosaic` (cỡ khối, có keyframe) và `pin` (corner pin phối cảnh, vẽ bằng WebGL).

Plugin mẫu đầy đủ: `examples/plugins/motion-tracking/`. Lõi thuật toán `tracker.js` chạy được cả trong Node để kiểm thử.

Lỗi có `.code`: `permission_denied`, `bad_params`, `not_found`, `unsupported`, `timeout`, `network`, `quota`, `too_large`, `needs_update`.

### Cài plugin
Vào **Tiện ích** (biểu tượng ổ cắm ở Thư viện, hoặc mục “Tiện ích” ở Trang chủ):
- **Gói một file**: `python3 tools/pack_plugin.py thu-muc-plugin` → `ten.bravinplugin.json`, gửi cho đồng đội, bấm **Chọn file…**. Gói chỉ chứa văn bản (ảnh dùng data URI).
- **Từ link**: dán link `manifest.json` (hoặc `.bravinplugin.json`). Máy chủ phải bật CORS (`Access-Control-Allow-Origin: *`). Khi phát triển: `npx http-server --cors -p 5173` rồi dán `http://localhost:5173/manifest.json`; bấm **Tải lại** mỗi khi sửa code.
- **Link chia sẻ**: `https://<bravin>/#plugin=<link manifest>` sẽ mở hộp xin cài.

### An toàn
Plugin chạy origin “null”, không đọc được DOM, localStorage, cookie hay khoá API của Bravin. CSP chặn mọi kết nối mạng trừ các địa chỉ trong `network` (khi được cấp). Không dùng được `eval`. Người dùng thấy quyền trước khi cài, tắt / gỡ bất cứ lúc nào.

---

## 2. Cầu nối cho extension trình duyệt

Trang Bravin đặt `document.documentElement.dataset.bravin = "1"` và phát sự kiện `bravin:ready`. Extension (hoặc userscript) nói chuyện bằng `postMessage` trên cùng cửa sổ:

```js
// gửi
window.postMessage({ bravin: "bridge", v: 1, id: "abc123",
  ext: { id: "com.doi-ngu.ext", name: "Tên extension" },
  method: "hello", params: {} }, location.origin);
// nhận
window.addEventListener("message", e => {
  const m = e.data; if (e.source === window && m.bravin === "bridge-res" && m.id === "abc123")
    console.log(m.ok ? m.result : m.error);   // error = {code,message}
});
```
1. Gọi `hello` trước. Lần đầu Bravin hiện hộp “Cho phép extension kết nối?”; từ chối → `permission_denied` (1 phút không hỏi lại). Chưa hello → `not_connected`.
2. Sau khi được phép, gọi:

| method | params | Việc |
|---|---|---|
| `hello` / `app.info` | – | `{app, version, apiVersion, methods}` |
| `media.import` | `{url \| dataUrl \| base64+mime, name, addToTimeline, overlay}` | Đưa vào Thư viện |
| `openLink` | `{url}` | Mở hộp “Tải về từ link” đã điền sẵn (người dùng bấm Tải) |
| `media.list` | – | Danh sách file |
| `timeline.addMedia` | `{mediaId, overlay}` | Đặt file lên timeline |
| `plugin.install` | `{url}` | Mở hộp cài plugin (luôn hỏi người dùng) |

Người dùng thu hồi quyền extension trong **Tiện ích → Extension đã cho phép**.
`ext.id` do extension tự khai; Bravin hiển thị cho người dùng quyết định, không tự xác minh danh tính.

**Không có Bravin đang mở?** Mở `https://<bravin>/#import=<link-đã-encode>`: Bravin tự bật hộp tải link đã điền sẵn.

Mẫu hoàn chỉnh: `examples/extension-chrome/` (Chrome MV3: chuột phải → *Gửi sang Bravin*). Cách dùng: `chrome://extensions` → Chế độ nhà phát triển → *Tải tiện ích đã giải nén* → mở Tuỳ chọn, nhập địa chỉ Bravin của đội, cấp quyền.

---

## 3. Gỡ lỗi
- Plugin báo “Không phản hồi”: chưa gọi `Bravin.connect()`, hoặc script lỗi cú pháp. Mở DevTools → chọn khung của plugin trong Console.
- “Không tải được …”: máy chủ plugin thiếu CORS.
- `permission_denied`: thêm quyền vào manifest rồi **cài lại** (cập nhật) để người dùng duyệt.
- Có thể kiểm tra nhanh trong Console của Bravin: `BravinPlugins.list()`, `BravinPlugins.commands()`.
