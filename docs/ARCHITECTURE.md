# Bravin: kiến trúc và tính năng

Tài liệu kỹ thuật cho người phát triển tiếp. Tên nội bộ cũ (VINCut) vẫn còn trong mã định danh để tương thích dữ liệu.

## 6. Cấu trúc file dự án (.json)

`{format:"vincut", name, aspect, tracks:[{id,type:video|text|audio,name,off?}], media:[{id,name,kind,duration,file,user}], V:[{id,mediaId,in,out,zoom:none|in|out|punch,vol,muted}], C:[text {id,track,type:"text",style:caption|hook|bgword|tag|cta,start,dur,line1,line2} | audio {id,track,type:"audio",mediaId,start,in,out,vol}]}`

- V là track video nối liền: thời điểm mỗi cảnh bằng tổng độ dài các cảnh trước.
- in/out tính bằng giây trong file gốc. Riêng `m_b13o` cộng thêm offset 165,7s.

## 7. Cài đặt AI và bản chạy trên máy

- **Ô "Dùng" trong tab Trợ lý** có 3 chế độ:
  - Claude Opus 5.5 trên claude.ai: chế độ mặc định, thao tác qua công cụ.
  - Chuỗi AI qua API (Bảng 1).
  - Chuỗi AI local (Bảng 2).
- **Mỗi bảng là một chuỗi AI1 + AI2 + …:**
  - Mỗi AI có loại, địa chỉ, model, key, vai trò (Tự động / Suy nghĩ / Thao tác timeline) và skill riêng.
  - AI sau đọc kết quả của AI trước.
  - AI thao tác trả về JSON `{"reply","ops"}`, app áp dụng bằng con trỏ ảo.
  - Cài đặt lưu trong localStorage `vincut-ai` của trình duyệt.
- **Loại AI hỗ trợ:**
  - Bảng 1: Claude trong claude.ai (qua sample), Anthropic API, OpenAI và các dịch vụ tương thích OpenAI, Google Gemini.
  - Bảng 2: Ollama `/api/chat`, các server tương thích OpenAI chạy local `/chat/completions`.
- **Trên claude.ai:** chỉ loại "Claude trong claude.ai" chạy được, vì trang chặn kết nối ra ngoài.
- **Bản Windows trên máy người dùng:**
  - Nằm ở `C:\Users\Admin\Documents\VINCut`, mở bằng `Mo VINCut.bat`.
  - File bat chạy `serve.ps1`, một server PowerShell có hỗ trợ byte-range tại http://localhost:8765.
  - Ở bản này, Lưu dự án và Xuất video tải file thẳng về máy.

## 8. Công cụ timeline kiểu CapCut (cập nhật 09/10/2026)

- **Thanh trái:** + (thêm track/media), Chọn (A) / Dao cắt (B), Hoàn tác / Làm lại, Tách (S, Ctrl+B), Xoá trái (Q) / phải (W), Xoá, Marker (M), Đứng hình (3 giây), Đảo ngược, Lật, Xoay 90°, Cắt khung, Nhân đôi (D), Trim (T), Thêm chữ.
- **Thanh phải:** Thu âm (chỉ bản chạy trên máy), Nam châm (track chính nối liền / để khoảng trống), Hít, Liên kết (chữ/âm thanh đi theo cảnh), Xem trước khi rê chuột, Thu phóng, Vừa khung.
- **Đầu track:** khoá, ẩn, tắt tiếng, menu "…" (đổi tên, thêm/xoá track), Ảnh bìa trên track chính.
- **Track "Video phủ":** đặt video/ảnh chồng lên (PiP). Thuộc tính trong bảng phải: Biến đổi (x, y, scale, xoay, độ mờ), Cắt khung, Điều chỉnh màu (sáng, tương phản, bão hoà).
- **File dự án v2:** thêm `markers`, `coverT`; cảnh V có thể có `gap, freeze, dur, reverse, flip, rot, scale, x, y, crop, adj, opacity`; C có thêm loại `video` (track overlay).
- **render_project.py** dựng đủ các thuộc tính trên (khoảng trống đen, đứng hình, đảo ngược, lật/xoay, crop, màu, PiP).
- **Nhiều lớp video (như CapCut):** thả clip lên mép trên track video hoặc vào khe giữa hai track video thì tạo track mới đúng chỗ đó. Thả trùng giờ với clip có sẵn trên track phủ thì tự tạo lớp mới bên trên. Kéo clip track chính lên thành lớp phủ, kéo clip phủ xuống để chèn vào track chính. Track phủ tự đánh số Video 2, 3, 4… từ dưới lên (`auto: true`), track rỗng tự xoá sau khi kéo. Lớp trên đè lớp dưới, cả trong app lẫn render_project.py.
- **Chưa có:** AI xoá nền, nâng HD, làm đẹp khuôn mặt (cần model chạy trên server).

## 9. VINCut 3.0: kiến trúc và tính năng (cập nhật 09/10/2026)

**Mã nguồn** nằm trong `vincut_app/` (bản đóng gói) và trong artifact: `index.html` + `css/app.css` + `js/*.js` + `vendor/` (mp4box, mp4-muxer). Các file JS là script thường dùng chung phạm vi toàn cục, nạp theo thứ tự trong `index.html`:

| File | Vai trò |
|---|---|
| core.js | Trạng thái (tracks, V, C, media), độ dài clip theo tốc độ, undo, âm thanh xem trước |
| engine.js | Easing, keyframe, hoạt ảnh vào/ra/lặp, bộ lọc + chỉnh màu + phông xanh (WebGL), mask, hiệu ứng, chuyển cảnh, sticker |
| text.js | Chữ tuỳ chỉnh (font, viền, bóng, nền, gradient, karaoke, gõ chữ) + 5 kiểu chữ thương hiệu cũ |
| audio.js | Hiệu ứng giọng, đổi cao độ, tách âm thanh, dò nhịp, SFX tạo bằng code, chữ thành giọng nói |
| render.js | Bộ ghép khung: track chính (+ chuyển cảnh) → lớp phủ → hiệu ứng → chữ/sticker; dùng chung cho xem trước và xuất |
| timeline.js, interact.js, ops.js | Vẽ timeline, kéo thả nhiều lớp, cắt/trim theo tốc độ, chèn chữ/sticker/hiệu ứng/chuyển cảnh |
| inspector.js | Bảng Thuộc tính theo tab, nút keyframe ◆ cạnh từng thanh trượt |
| stage.js | Chọn và kéo/đổi cỡ/xoay trực tiếp trên khung xem trước, hai ngón, hút màu |
| assets.js | Thư viện theo tab: Media, Âm thanh, Chữ, Sticker, Hiệu ứng, Chuyển cảnh, Bộ lọc |
| project.js, home.js | Lưu dự án trong IndexedDB (cả video người dùng nhập), tự lưu 5 giây/lần, màn hình Dự án |
| export.js | Xuất MP4 bằng WebCodecs (giải mã nguồn bằng mp4box, có xoay theo metadata), trộn âm thanh offline; dự phòng MediaRecorder |
| aimodels.js | AI trên máy: Whisper (transformers.js) cho phụ đề tự động, MediaPipe tách nền người |
| ai.js | Trợ lý + chuỗi AI; có thêm thao tác add_sticker, add_effect, transition, keyframe, set (mọi thuộc tính) |

**File dự án v3** thêm: clip có `speed, kf{x,y,scale,angle,opacity,vol: [{t,v,e}]}, anim{in,out,loop}, filter, filterAmt, adj{…}, mask{…}, blend, chroma{…}, bgRemove, fit, bg, fadeIn, fadeOut, voice, audioOut`; cảnh chính có `tr{type,dur}` (chuyển cảnh sang cảnh sau); clip mới `type: "sticker"` và `type: "fx"` (hiệu ứng hoặc lớp bộ lọc `fxType: "filter"`); chữ `style: "custom"` với `text, font, size, color, grad, stroke, shadow, box, kara, words`.

**Xuất bản chất lượng đầy đủ:** app tự xuất 720p–4K từ video gốc người dùng nhập. `render_project.py` chỉ dựng được các thuộc tính đến bản 2 (không có chuyển cảnh, hiệu ứng, chữ tuỳ chỉnh, keyframe…), nên với dự án v3 hãy xuất trong app.

**AI trên máy:** thư viện tải từ cdn.jsdelivr.net, model Whisper từ huggingface.co (dự phòng: registry.npmmirror.com gói sts-whisper-*), model tách nền từ storage.googleapis.com. Trang trên claude.ai chặn các nguồn này; dùng app Android hoặc bản Windows. Ghi đè nguồn khi thử nghiệm bằng `window.VINCUT_AI = {...}`.

**Android (`android/`):** WebView + máy chủ nội bộ 127.0.0.1:47865 (có Range), cầu nối `VINCutAndroid` (lưu file vào Download/VINCut, ghi file theo vị trí khi xuất MP4, nhớ quyền đọc file đã chọn, chữ thành giọng nói bằng TextToSpeech của máy). Dựng bằng `build.sh` (aapt + javac + dx + zipalign + apksigner từ gói Ubuntu, không cần Gradle). Khoá ký `vincut-release.jks` (mật khẩu đưa vào bằng biến `KS_PASS`, không ghi trong repo) phải giữ nguyên để bản cập nhật cài đè được. APK phải dưới 30 MB để gửi qua chat: bản 3.0 dùng video xem trước 432p cho dự án mẫu.

**Windows (`serve.ps1`):** thêm `/tts` (giọng Windows qua WinRT, dự phòng System.Speech) và kiểu file .mjs/.wasm. Phần `/tts` chưa chạy thử được trên Windows thật.

**Đã kiểm thử (Chromium headless):** dựng khung với chuyển cảnh/mask/keyframe/karaoke/hiệu ứng; kéo thả nhiều lớp; lưu và mở lại dự án kèm video nhập; giao diện điện thoại; phụ đề tự động (Whisper tiny); tách nền (MediaPipe); xuất WebCodecs khớp từng khung với xem trước, đúng tốc độ và chiều xoay; luồng Android qua máy chủ nội bộ. Chưa thử trên thiết bị thật: mã hoá H.264/AAC (headless không có), TextToSpeech Android, giọng Windows.

## 12. Keyframe motion (v3.1)
- engine.js: KF_PROPS = x, y, scale, angle, flipH, flipV, opacity, blur, blend (bậc, chuỗi), speed (speed ramp), vol, amt (hiệu ứng). xform trả thêm fx/fy (lật có thể animate: scaleX = 1−2v), blur. blendAt(). Speed ramp: hasRamp/speedAt/rampTable/rampLen/srcOffset/outAtSrc/rateCurve, SPEED_CURVES + applySpeedCurve. vlen/clen, srcTime, split, audio (setValueCurveAtTime) và renderMix đều theo ramp.
- motion.js (mới): tab "Chuyển động" là tab đầu cho video/ảnh/chữ/sticker/âm thanh/hiệu ứng; dải keyframe tổng + từng thuộc tính (chạm = tua, kéo = dời, chạm đúp = xoá), easing, ◆ Key tại kim, thời lượng (đổi tốc độ), đường cong tốc độ, chuyển động có sẵn (MOTION_PRESETS), danh sách "Hiệu ứng trên clip này".
- Chạm clip trên timeline/khung xem → mở thẳng tab Chuyển động; trên điện thoại mở sheet thuộc tính (~54dvh).
- AI ops mới: motion_preset, speed_curve; keyframe nhận mọi thuộc tính trên.
- v3.2: tab Chuyển động dùng bảng keyframe kiểu Premiere (effectControls trong motion.js): cột trái ⏱/tên/giá trị kéo-để-chỉnh/◀◆▶, cột phải thước thời gian + một dải cho mỗi thuộc tính trên cùng trục, nhóm thu gọn có dải tổng, chọn khung nhiều keyframe, kéo dời bám khung hình, chuột phải/giữ lâu → nội suy, Delete xoá, Ctrl+lăn để zoom. Desktop tự nới cột phải (body.ecwide).

## 13. Bộ tính năng kiểu Premiere Pro (v4, tự viết lại, không dùng tài nguyên Adobe)
Thứ tự script mới: … inspector, motion, lumetri, fxlib, audiofx, ops, interact, export, project, wiring, premiere, ai, assets, aimodels, home, stage, tools, phone, boot.
- lumetri.js: Lumetri Color — Basic (temp/tint, ex, c, hi, sh, wh, bl, s, vib; Tự động; hút điểm trắng), Creative (look + fade/sharp/grain/hue + tint vùng tối/sáng), Curves (m/r/g/b → tex 256×1), Wheels (sh/mid/hi), HSL secondary, Vignette (lumv), LUT 3D (.cube parser, tối đa 33³; 7 LUT tự tạo; LUT người dùng lưu IDB "lut:<id>"), Scopes (waveform/parade/vectorscope/histogram). Shader GLFX mở rộng uniform wh/bl/vib/shT/midT/hiT/CT/hsl*/lv*/LT.
- premiere.js: phím tắt Premiere (J/K/L, I/O, ; ', Ctrl+K, ↑↓, Shift+Del, Shift+E, Ctrl+C/X/V, Ctrl+Alt+V, Ctrl+R, Ctrl+D, Shift+D, E, Alt+←→, +/-/\\, Shift+K keyframe); công cụ ripple/roll/slip/slide/rate (V,C,B,N,Y,U,R); In/Out + lift/extract + xuất đoạn; clip.disabled, clip.label, clip.name; menu chuột phải; hộp thoại tốc độ/thời lượng; track vol/pan/solo (trackGain/trackPan).
- fxlib.js: 35 hiệu ứng (FX2, thông số fx.p, shader FXGL riêng) + 23 chuyển cảnh (TR2) + fade âm thanh constant-power tại chuyển cảnh (bọc clipGain).
- audiofx.js: Essential Sound (c.es), khớp LUFS (measureLUFS BS.1770 gần đúng), DeNoise STFT (denoiseBuffer, cache), EQ/comp/reverb/hum (audioFxChain, elFxSync cho <video>), ducking (duckActivity, bọc clipGain), pan clip (KF pan), chuẩn hoá -14/-16/-23 LUFS khi xuất (exportNorm).
- tools.js: hình khối (sticker c.gfx), Color Matte/Black/White/Bars & Tone (tone gen "tone1000"), SRT nhập/xuất, xuất khung hình (Ctrl+Shift+E), Scene Edit Detection, Lịch sử thao tác (Ctrl+Shift+H), khung an toàn + lưới 1/3 + vùng che TikTok, marker có tên/màu/ghi chú (markerNotes, lưu trong project), nhập Final Cut Pro XML (xmeml) từ Premiere.

## 14. Mask nâng cao + trang chỉnh màu kiểu DaVinci (v4.1)
- masks.js (sau tools.js): c.masks = [{type ellipse|rect|pen|linear|heart|star|mirror, mode add|sub|int|diff, inv, feather, opacity, expand, x,y,w,h,r,round | pts[[x,y,inX,inY,outX,outY]], closed, kf{…, pts:[{t,v}]}}]. drawMaskSet() ghép mọi mask thành matte; migrateMask() đổi c.mask cũ. Sửa trực tiếp trên preview (maskEdit, drawMaskOverlay, maskPointerDown), bút bezier, keyframe đường mask (maskKeyHere/setMaskPts), tracking (trackMask: ElemSource + drawMediaLayer offscreen 240px + SAD).
- grade.js (sau masks.js): c.nodes = node nối tiếp {lift,gamma,gain,offs:{x,y,l}, con,piv,sat,hue,temp,tint, curves{y,r,g,b}, hcur{hh,hs,hl,ls,ss}, q{qualifier}, win[masks], blur, sharp, key}. Shader GRADE (WebGL riêng) chạy trong drawMediaLayer (đường "fancy", không gian khung hình) và cho lớp bộ lọc. Trang màu: openColorPage() (nút bảng màu trên thanh timeline, Shift+6, nút trong tab Màu): viewer + chia trước/sau, node graph, dải clip, Gallery still (localStorage "vincut-stills"), chép/dán grade, scopes. window.__noGrade = bỏ qua grade (dùng cho ảnh "trước").

## 15. Đổi tên thành Bravin (logo phương án 3 · Timeline chữ B)
- Mọi chữ hiển thị "VINCut" → "Bravin" (tiêu đề, header, trang chủ, thông báo, AI). GIỮ nguyên định danh nội bộ để không mất dữ liệu/tương thích: IndexedDB "vincut", localStorage "vincut-*", format project "vincut", cầu nối Android window.VINCutAndroid, package app.vincut.
- Logo: 4 thanh clip timeline ghép chữ B + kim phát vàng (#F2C14E) trên nền iris #7B6CF6. File: brand/icon.svg, brand/mark.svg, brand/icon1024.png, brand/maskable1024.png; app/icons/*; Android mipmap-*/ic_launcher.png đã thay; AndroidManifest label "Bravin"; thư mục lưu Download/Bravin. build_web.sh: tên PWA Bravin, màu #131417.
- APK và bản máy tính CHƯA dựng lại (chờ chốt bản web).

## 16. Workspace (workspace.js, nạp sau grade.js)
- Đổi tên tại chỗ bằng bấm đúp: tên dự án (header + thẻ ở trang chủ), clip (ô nổi .irnfloat vì timeline có thể vẽ lại), media trong thư viện, mask, still; track và node đã có từ trước. Bấm đúp clip track chính: dải trên 22 px = đổi tên, phần còn lại = Trim.
- Chọn nhiều: msel (Set id) + sel; Shift/Ctrl+bấm, kéo khung trên vùng trống của track (chuột), Ctrl+A, Ctrl+Shift+A/Esc bỏ chọn. Nhóm: Delete/Shift+Del, Ctrl+C/X/V (groupClip giữ khoảng cách), Shift+E, Alt+←/→, kéo dời cả nhóm (clip ngoài track chính).
- Menu chuột phải: clip (4 nhóm), nhiều clip, vùng trống, thước, đầu track, khung xem trước, media thư viện, thanh tiêu đề panel. openMenu(anchor, items, at[x,y]) hỗ trợ swatch màu.
- Panel: biến CSS --lw/--rw/--rwe, thanh kéo .vsplit giữa các cột (kéo = đổi rộng, bấm = menu thu gọn/hẹp/vừa/rộng/bố cục), nút .reopen khi thu gọn, #split ngang bấm = menu timeline. Lưu localStorage "bravin-layout".
- Màn hình: tự căn theo độ rộng cửa sổ (autoSizes), toàn màn hình (F), hộp "Màn hình làm việc" (getScreenDetails nếu được phép, screen.isExtended), mở màn xem trước ở cửa sổ riêng/màn phụ (canvas.captureStream).

## 17. Công cụ thay thế plugin (js/fixes.js)
Tự viết, không dùng mã/tài nguyên của bên thứ ba. Tab "Sửa lỗi" trong Thuộc tính của clip video/ảnh.
- Khử nhiễu (kiểu Neat Video): bilateral không gian + trộn thời gian có né chuyển động (c.fix.dn {s,t}).
- Chống nhấp nháy (kiểu GBDeFlicker): phân tích độ sáng từng khung → c.dfl.g, bù qua P.ex trong render.js.
- Ổn định hình (kiểu Mercalli/Warp): block-matching toàn cục → c.stab (smooth/lock, tự zoom giấu viền); render.js áp stabAt().
- Slow-motion mượt (kiểu Twixtor): nội suy luồng quang (FLOWGL) → mp4 mới qua WebCodecs, thay media của clip.
- Đồng bộ âm thanh (kiểu PluralEyes): tương quan chéo đường bao onset (FFT); menu nhiều clip + nút Tiện ích.
- Làm mịn da (kiểu Beauty Box): mask da YCbCr + bilateral + giữ chi tiết (c.fix.beauty).
- Giả lập phim (kiểu FilmConvert): 6 stock, hạt, halation, rung khung, bạc màu (c.fix.film).
- Gói hiệu ứng "Kiểu Sapphire": sglow, sglint, srays, sdefocus, sdamage, sduotone, sedge, sprism.
Kiểm tra: fix1–fix4.js (sync khớp đúng lệch 1,37 s; slow 50% ra clip 1,2 s từ 0,6 s; toàn bộ regression qua).

## 18. Bút (Pen), bảng node màu dạng canvas, Luồng AI
- js/nodegraph.js: bộ canvas node dùng chung (kéo/thả node, kéo dây cổng ra → cổng vào, nhấc dây khỏi cổng vào để nối lại, Shift+kéo chọn vùng, lăn chuột/pinch phóng to, chuột phải menu, Delete, F vừa khung).
- js/colorgraph.js: trang màu DaVinci thành đồ thị node. Mọi thứ nằm trong c.nodes (node chỉnh: gk, gx, gy, inp; bộ trộn kind "par"/"lay"; node ra kind "out"), nên chép/dán grade, still, "áp cho mọi cảnh" mang theo cả đồ thị. Alt+S nối tiếp, Alt+P song song, Alt+L lớp, Alt+O ngoài vùng, N mở rộng bảng node. applyNodes được thay bằng cgEval (topo theo inp, bộ trộn song song = trung bình, bộ trộn lớp = phủ theo chế độ hoà trộn và cửa sổ của node nguồn). Dự án cũ tự chuyển thành chuỗi.
- js/aiflow.js: Cài đặt AI thành canvas "Luồng AI" (AIS.flow trong localStorage vincut-ai). Node: Lệnh người dùng, AI, Thao tác timeline, Trả lời, Điều kiện, Gộp, Lặp lại, Mẫu văn bản, Trạng thái timeline, Ghi chú. 5 mẫu luồng. Kết nối: chỉ dán mã API (nhận theo tiền tố sk-ant-/sk-or-/AIza/gsk_/xai-/pplx-/nvapi-/hf_/fw_, mã không tiền tố thử OpenAI → DeepSeek → Mistral → Together → Qwen → Kimi), tự lấy danh sách và chọn model tốt nhất; AI local dán link hoặc "Dò AI local" (cổng 11434, 1234, 8080, 1337, 8000, 5001, 4891); "Nhúng trong Bravin" chạy Qwen2.5 / Llama 3.2 / Phi-3.5 bằng transformers.js (WebGPU hoặc WASM). Bản trên máy có sẵn vendor/transformers/ (bộ chạy) và models/ (đặt model để chạy không mạng).
- js/pen.js: công cụ Bút (P). Khung xem: bấm = điểm góc, kéo = điểm cong, Shift 45°, bấm điểm đầu/Enter đóng, Esc kết thúc đường hở, Backspace xoá điểm cuối; sửa: kéo điểm/tay cầm (Alt tách cặp tay cầm), bấm lên đường thêm điểm, Alt+bấm đổi góc/cong, Ctrl+bấm xoá điểm. Tạo lớp hình (sticker gfx.kind "path") hoặc mask bút cho clip video đang chọn (menu công cụ chọn chế độ). Timeline: đường key độ mờ/âm lượng trên clip, bấm thêm key, kéo key, Ctrl+bấm xoá, Alt+kéo đường khi chưa có key = đổi mức chung.
Kiểm tra: cg1.js, af1.js, pen1.js, mob1.js + toàn bộ regression.

## 19. Sửa kết nối Google Gemini (10/10/2026)
- aiflow.js: nhận mã Google dạng mới `AQ.…` (cùng `AIza…`) là Google Gemini. MODEL_SKIP bỏ thêm model không dùng để chat (computer-use, robotics, lyria, nano-banana, customtools, omni, gemma…).
- `callWithFallback` (bọc callAI): model báo 404 (đã khoá với người dùng mới, ví dụ gemini-2.5-*), 429 (gói miễn phí hết hạn mức, ví dụ dòng Pro) hoặc 503 → tự thử tối đa 5 model kế tiếp theo `rankModels`, nhớ model chạy được vào node (n.model). Chạy cho cả Luồng AI, nút "Thử kết nối" và chuỗi cũ.
- ai.js: gửi mã Gemini qua header `x-goog-api-key` thay vì `?key=` trên URL. `add_text` nhận `color, size, font, x, y, upper` (tự chuyển sang chữ tuỳ chỉnh); hướng dẫn cho AI yêu cầu dùng các trường này khi người dùng nói màu/cỡ/vị trí.
- Đã thử với mã thật (gói miễn phí): gemini-3.8-flash, 3.5-flash, flash-latest chạy; dòng Pro báo 429; 2.5 báo 404.

## 20. Nhập file nhanh và hết đen màn hình khi cắt/ghép (10/10/2026)
- media.js: `addMediaFile` cho clip vào thư viện ngay sau khi đọc thông tin file; `makeStrip` chạy nền (tối đa 24 ảnh, ảnh bìa có sau khung đầu, dải hiện dần, `m._stripJob`). Đo với video 60 s 1080×1920: 4 s → 0,03 s.
- media.js: `releaseIdleVideos` không giải phóng trình phát của clip đang nằm dưới kim (`liveVideoEls`); trước đây khi dừng 10–12 s app xoá trình phát đang hiển thị nên lần cắt sau bị đen. Trình phát mới dùng `preload="auto"`.
- render.js: giữ khung (`holdSnap`/`holdFrame`): khi trình phát đang tua hoặc vừa tạo (sau cắt, ghép, đổi clip, chạy qua điểm cắt) thì vẽ trình phát khác cùng file ở gần thời điểm, hoặc ảnh chụp khung gần nhất (≤720 px), hoặc ảnh bìa, thay vì nền đen. Không ảnh hưởng xuất video (đường frameProvider). Đo: 5–29 khung đen mỗi lần cắt → 0; phát qua điểm cắt 10 → 0.
- project.js: lưu dải ảnh + ảnh bìa của video người dùng trong dự án, mở lại dự án không phải vẽ lại.
- text.js: mẫu "Kêu gọi cuối" đổi thành câu trung tính.

## 21. Sửa nút Gửi của Trợ lý và bôi đen trên timeline (10/10/2026)
- ai.js: khi chế độ đã lưu là "flow" (Luồng AI), `renderChainLine` gọi `chainText(AIS.flow)` (là object) → lỗi `list.filter is not a function` ngay lúc tải, phần sau của ai.js không chạy, form #aiForm không có bộ xử lý nên bấm Gửi thì trình duyệt tải lại trang. Đã chặn: chainText chỉ nhận mảng, renderChainLine bỏ qua "flow" (aiflow.js tự vẽ).
- index.html (app + desktop): `#aiForm` có `action="#" onsubmit="return false"` để dù JS lỗi cũng không bao giờ tải lại trang.
- app.css: `.tl` và canvas xem trước `user-select:none` (ô nhập trong timeline vẫn chọn chữ được) → kéo chuột không bôi đen thước giờ.

## 22. Dải ảnh trên timeline không còn vỡ/méo (10/10/2026)
- Trước: cả dải N khung (cao 64 px) bị kéo giãn theo `duration × pps` → mỗi khung rộng hàng trăm px, méo và nhoè.
- Nay (timeline.js `paintStrips`): clip video có `m.stripN` được vẽ thành các ô `.tiles i` rộng = chiều cao clip × tỉ lệ khung (`m.stripAR`), mỗi ô lấy khung gần nhất với thời điểm nguồn ở giữa ô (`srcTime`, nên đúng cả khi đổi tốc độ/đảo ngược). Phóng to = thêm ô, không giãn ảnh; tối đa 240 ô/clip. `layoutClips` vẽ lại ô khi kéo/trim.
- media.js: dải ảnh cao 112 px, 6–40 khung (khoảng 0,8 s/khung), lưu `stripN, stripAR` (project.js, home.js). Video trong dự án cũ (chưa có `stripN`) tự vẽ lại dải ảnh ở chế độ nền khi mở dự án.

## 23. Kiểm thử toàn bộ bằng TVC mẫu "Mây Coffee" (10/10/2026)
- Bộ dựng TVC tự động (28 hạng mục: 4 cảnh + cắt/ghép + đứng hình, speed ramp, 4 chuyển cảnh, keyframe scale/góc/blur/x/lật 3D/âm lượng/blend, Ken Burns, Lumetri + LUT + HSL, node màu nối tiếp/song song/ngoài vùng, giả lập phim/làm mịn da/khử nhiễu, phông xanh có keyframe + mask elip động, PiP mask sao + mask bút có keyframe đường + blend Screen, logo PNG preset + vòng lặp, chữ tuỳ chỉnh/karaoke/kiểu cũ, sticker, hình khối, hình vẽ Bút, 8 hiệu ứng, lớp bộ lọc, nhạc + giọng + ducking/EQ/nén/reverb/khử ồn, SFX, LUFS, marker, In/Out, thao tác AI): 28/28 đạt.
- Dựng 112 khung toàn TVC: 0 khung đen, 0 lỗi. 40 bảng giao diện, lưu → tải lại trang → mở dự án: giữ nguyên 7 cảnh, 25 clip, 61 keyframe, 3 mask, 5 node. SRT đúng. Xuất WebCodecs ra MP4 hợp lệ.
- Sửa thêm: `tmatch()` (core.js) thay 14 chỗ `e.target.matches` (lỗi khi nơi nhận phím là document); `bitrateFor` mặc định 0,1 bpp; lệnh AI `transition` nhận `index: 0`; dự án mẫu (không phải file người dùng) có ảnh PNG giờ tải ảnh; không lưu ảnh xem trước dạng `blob:` cho ảnh người dùng.

## 24. Rà soát chỗ chưa hợp lý (10/10/2026)
- Trợ lý trên web (không phải claude.ai): không còn chào "Mình là Claude Opus 5.5" rồi báo "chỉ chạy trên claude.ai"; chào chung và hướng dẫn Cài đặt AI. Luồng AI mặc định là mẫu "Một AI thao tác" chờ dán mã (trước đây là node Ollama, phần lớn người dùng web không có).
- Câu ví dụ: bỏ "dịch vụ nâng mũi" (trang chủ), "Tư vấn miễn phí" (Luồng AI), 4 nút gợi ý của dự án mẫu cũ (giây 30, SFX whoosh…) → gợi ý dùng được với mọi dự án. Ô mã API nhắc cả dạng AQ.…
- Mở dự án: tự cuộn timeline để track video chính luôn hiện (nhiều track phủ/chữ/hiệu ứng từng đẩy nó khuất dưới đáy trên màn hình 768 px).
- Tab Thuộc tính (8 tab) xuống dòng thay vì bị khuất bên phải cột hẹp.
- Clip thấp (chữ, sticker, hiệu ứng) không hiện dòng thời lượng và nhãn phụ chồng lên tên clip.
- (rà soát tính năng) Ô "Bạn muốn dựng gì" ở trang chủ không gửi lệnh ngay vào dự án trống nữa: tạo dự án, đặt sẵn lệnh vào ô, nhắc nhập tư liệu và (nếu chưa có) kết nối AI. `storeMediaBlob` xin `navigator.storage.persist()` một lần để trình duyệt không tự xoá video đã nhập. Chú thích nút công cụ đúng phím thật (V chọn, C dao cắt; B là Ripple theo bố cục Premiere).

## 25. Bỏ chế độ "Claude Opus 5.5" tích hợp: trợ lý chạy bằng mã API của người dùng (10/10/2026)
- Bravin không có model AI tích hợp sẵn. ai.js: `ON_CLAUDE = false` (chế độ builtin/sample không còn), `IN_CLAUDE_PAGE` chỉ dùng để giải thích khi trang mở trong claude.ai (trang chặn kết nối ra ngoài, tải model, micro). Ô chọn chế độ ẩn; nguồn "Claude trong claude.ai" bị bỏ khỏi node AI.
- aiflow.js: `aiConnected()`, `aiWelcome()`, `aiConnectCard()`: khung Trợ lý hiện thẻ "Hãy đưa mã API model AI của bạn" có ô dán mã + Kết nối. Bấm Kết nối: `resolveConn` nhận nhà cung cấp → `connectNode` lấy danh sách và chọn model → gọi thử thật ("OK", có tự đổi model khi 404/429) → gán cho mọi node AI dán mã trong Luồng AI → lưu. Gửi lệnh khi chưa kết nối thì hiện lại thẻ (lệnh giữ trong ô). Mã sai báo rõ "Mã <nhà cung cấp> không hợp lệ…". Nhãn góc phải: "Chưa kết nối" hoặc tên nhà cung cấp.

## 26. Video lời bài hát (js/lyrics.js, Bravin tự viết) (10/10/2026)
Tự viết lại trong Bravin (ý tưởng tính năng tham khảo JIZURA, không dùng mã của JIZURA). Nạp sau input.js, trước phone.js.
- Mở: trang chủ → "Video lời bài hát", tab Chữ → "Video lời bài hát", lệnh AI `lyrics`.
- Cú pháp: mỗi dòng một câu · `a / b` cắt cảnh · `*từ*` nhấn mạnh (text.js: `c.hl` chỉ số từ + `c.hlc` màu) · `!` cuối dòng = điểm nhấn (hiệu ứng flash/rung… trên track "Lời · nhấn" + nảy chữ) · `lời|chú thích` · `[interlude 8]` · `[mm:ss.xx]` mốc LRC · `#` ghi chú. Nhập/lưu .lrc.
- Thời gian (`lyrTiming`): mốc LRC hoặc bắt nhịp (Space khi phát, Backspace lùi, tự xong khi đủ dòng) là điểm neo; phần còn lại chia theo độ dài chữ giữa hai điểm neo trong khoảng của bài nhạc (clip âm thanh dài nhất), rồi khớp vào nhịp gần nhất (`detectBeats`). Câu ≥7 từ tự tách 2 cảnh.
- 6 chủ đề (`LYR_THEMES`: Lyric video, Kinetic, Pop, Ballad, Kinh dị, Tối giản), mỗi chủ đề có bộ phông (thêm Google Fonts có dấu: Be Vietnam Pro, Anton, Oswald, Lobster, Pacifico, Dancing Script), bảng màu, bố cục (center, stack, left, words, scatter, huge, echo, diag, band, bandTop/Bottom, split), hoạt ảnh vào/ra, chuyển động giữ (drift, punch, shake, wiggle, breathe, float), trang trí (gạch chân, vòng, nổ, sao, tim, lấp lánh, đường kẻ trượt) và hiệu ứng nhấn.
- Seed + `LYR.sub` (bố cục / chuyển động / màu / trang trí): "Tạo biến thể" (R), Trước/Sau theo lịch sử, "Đổi một phần". "Câu lặp lại giữ cùng kiểu" dùng hash nội dung câu làm khoá ngẫu nhiên. "Chừa giữa khung" đặt chữ ở dải trên/dưới.
- Nền: tự động tạo ảnh chuyển màu theo bảng màu + Ken Burns lên track chính nếu chưa có video (tuỳ chọn Luôn/Không).
- Kết quả là clip Bravin thường (`c.lyr = {li, ci}`) trên các track "Lời", "Lời · trang trí", "Lời · nhấn"; dựng lại thì thay đúng các clip này. Lưu trong dự án: `o.lyrics`.
- Kiểm thử: 6 chủ đề, biến thể/trước/sau/đổi một phần, chừa giữa, LRC, bắt nhịp có lùi, lệnh AI, lưu → mở lại: đạt, không lỗi trang.

## 27. Khu JIZURA: gắn nguyên bản JIZURA, đồng bộ với timeline (10/10/2026)
- `app/jizura/index.html` = JIZURA v0.10.1 bản tiếng Việt, KHÔNG sửa (MIT © 2026 hakoniwa, kèm `LICENSE.txt`, `THIRD_PARTY_NOTICES.txt`, `README_BRAVIN.txt`). Cập nhật JIZURA = chép lại `vi/index.html` của bản mới. (Người dùng chọn gắn nguyên bản cho phần này; giữ ghi công MIT.)
- `js/jizura_bridge.js` (nạp sau lyrics.js): một iframe JIZURA sống suốt phiên (ẩn ngoài màn hình khi không mở). Chỉ dùng cổng nhúng công khai của JIZURA: `J.ui` (project, plan, audio, t), `J.uiApi` (loadAudioFile, seek, pause, replan, syncUI, flushSave), `J.Renderer`.
- Lối vào: nút "JIZURA" trên thanh đầu (cạnh Xuất video), nút "Khu JIZURA" ở tab Chữ, ô "JIZURA (lời bài hát)" ở trang chủ, nút trong Thuộc tính của lớp.
- Khu JIZURA (toàn màn hình): "Lấy nhạc từ timeline" (đưa clip âm thanh dài nhất sang JIZURA, khung hình theo dự án), "Đưa lên timeline / Cập nhật lớp", "Giữ nền JIZURA" (mặc định nền trong suốt để chồng lên video), "Về timeline". Kim JIZURA → kim timeline khi khu mở; mở khu thì JIZURA tua tới kim hiện tại.
- Clip lớp: `{type:"jz", track:"JIZURA", start, in, out, jz:{project, bg, title}}`; in/out là giây trong bài nhạc (= thời gian JIZURA), nên cắt/trim/kéo như clip media. Bravin vẽ bằng `J.Renderer.frame(canvas của iframe, plan, in + (T − start), {scale, transparent})` rồi chép lên khung (phông nằm ở tài liệu iframe) — dùng chung cho xem trước và xuất video. Bảng Thuộc tính riêng (mở khu, giữ nền, độ mờ).
- Mở lại dự án: `jzRestore` nạp lại `c.jz.project` vào JIZURA + bài nhạc; nút Xuất video chờ lớp JIZURA sẵn sàng trước khi xuất.
- Kiểm thử (Playwright): mở khu, lấy nhạc (khung 9:16), đưa lên timeline (start 1 s, in 2 s), kim JIZURA 7,5 s → timeline 6,5 s, lớp vẽ chồng lên video, lưu → tải lại → mở lại tự khôi phục, xuất MP4 có lớp JIZURA: đạt, không lỗi.

## Phông chữ (js/fonts.js + js/fonts_catalog.js)
Không đóng gói sẵn phông. `fonts_catalog.js` là danh mục 1.908 họ phông Google (chỉ metadata, 114 KB). Người dùng bấm "Cài" → tải từ Google Fonts CSS2 (dự phòng jsDelivr/Fontsource), lưu blob vào IndexedDB `bravin-fonts`, đăng ký bằng FontFace; sau đó dùng offline. Có nhập .ttf/.otf/.woff/.woff2 từ máy (đọc bảng name/OS2/fvar). Dự án dùng phông chưa cài sẽ hiện hộp thoại gợi ý cài; xuất video tự đảm bảo phông đã nạp.

## Tải về từ link (js/linkdl.js)
Nút 🔗 trong Thư viện (và nút "Dán link" ở vùng thả file) mở hộp thoại: dán link → nút "Tải về" hiện ra → tải có tiến độ, có nút Dừng → lưu vào Thư viện (addMediaFile). Thử `fetch` trực tiếp; nếu bị CORS chặn thì gọi `/dl?url=…` (kèm header `X-Bravin`) – máy chủ nội bộ tải hộ: `LocalServer.java` (Android), `bravin.ps1` (Windows). Bản web thuần không có /dl nên chỉ tải được link cho phép CORS. Link trang web: quét og:video / <video src> / *.mp4. Chưa hỗ trợ HLS/DASH và các trang YouTube, TikTok, Facebook… (báo lỗi rõ ràng).

## Nhóm clip & Compound clip (js/compound.js)
- Nhóm: `c.grp` chung → bấm 1 clip chọn cả nhóm (workspace.js), kéo dời cả nhóm lớp phủ; chỉnh ở bảng Thuộc tính được sao sang các clip cùng loại trong nhóm / đang chọn nhiều (`grpMirror`, so sánh với ảnh chụp `grpSnap`; bỏ qua id, start, dur, text, kf…). Ctrl+G nhóm, Ctrl+Shift+G bỏ nhóm.
- Compound: clip `type:"compound"` (isDur) giữ `sub = {tracks, V, C}` với thời gian cục bộ (0 = đầu compound; `off` = lệch khi cắt/tỉa đầu). Vẽ: `frameFor` → `cmpFrame` đổi tạm `cv/g/V/C/tracks/t` (`inScope`) rồi `drawScene` vào canvas trong suốt, sau đó đi qua `drawMediaLayer` như 1 lớp video (màu, mask, hiệu ứng, chuyển động áp 1 lần). `slotBase` (+40 mỗi tầng) tách trình phát video của clip con. Âm thanh: `withSubClips(C)` trải phẳng clip con thành bản sao có thời gian tuyệt đối (core.js scheduleAudio, export.js). Xuất hình: `layersAt` đi sâu vào compound. Ctrl+Alt+G tạo, chuột phải → Tách compound.

## Nhập từ Antifact (js/antifact.js)
Antifact 1.1 → Xuất → "Gửi sang Bravin" tạo `.bravin.json` (`format:"bravin-project"`: canvas, timeline, tracks[].clips[0] = ảnh PNG data-url + position/opacity/blendMode). Bravin nhận file này ở 2 chỗ: nút Mở dự án / Nhập ở Trang chủ (tạo dự án mới, khung hình tự chọn gần nhất 9:16·16:9·1:1·4:5) và nút nhập Thư viện (thêm vào dự án đang mở, tại kim). Mỗi layer = 1 track "video phủ" cùng tên, đúng vị trí (quy đổi px → x,y,scale), độ mờ, hòa trộn; layer ẩn → track tắt; màu nền canvas → track "Nền". Thứ tự: layer trên cùng của Antifact là track trên cùng. File `.antifact.json` (project gốc) chưa đọc được: báo hướng dẫn xuất lại.

## Plugin & cầu nối extension (js/plugins.js, sdk/bravin-sdk.js)
- Plugin = iframe `sandbox="allow-scripts"` + `srcdoc` do host dựng (CSP meta, theme, SDK được chèn). RPC `postMessage` có `id`; host nhận diện plugin bằng `event.source === iframe.contentWindow`; thiếu quyền → `permission_denied`.
- Kho plugin: IndexedDB `bravin-plugins`; dữ liệu plugin: `localStorage` `bravin-pl:<id>:<key>` (≤1 MB). Gói `.bravinplugin.json` = `{format:"bravin-plugin", manifest, files}`; cài từ URL thì tải entry mỗi lần chạy (cache dự phòng offline).
- Sự kiện: `renderAll` / `placePlayhead` / `hideHome` được bọc để phát `timeline.changed` (debounce 120 ms, so snapshot), `selection.changed`, `playhead` (throttle), `project.loaded`. Chỉ gửi cho plugin đã đăng ký.
- Lệnh plugin chèn vào `clipMenuItems`/`multiMenuItems` (mục “Tiện ích”) và màn quản lý.
- Cầu nối extension: `window.postMessage({bravin:"bridge"})` ⇄ `bravin-res`; mỗi extension phải được người dùng cho phép (`localStorage bravin-bridge-ok`). Tham số khởi động `#import=<url>` mở hộp tải link, `#plugin=<manifest url>` mở hộp cài plugin.
- Tài liệu cho đội ngũ: `docs/PLUGIN_SDK.md`; mẫu: `examples/plugins/*`, `examples/extension-chrome/`; đóng gói: `tools/pack_plugin.py`.

## Motion Tracking & SDK API v2 (4.9)
- `js/cornerpin.js`: `pinAt(c, lt)` nội suy `c.pin.keys` (4 góc chuẩn hoá). `drawPinned` vẽ phối cảnh đúng bằng WebGL (ma trận nghịch đảo hình vuông → tứ giác, khử răng cưa 4 mẫu), không có WebGL thì dùng affine. `drawMediaLayer` dùng pin thay cho vị trí/cỡ/xoay khi có. `splitParts` chia `pin` khi cắt clip.
- `c.mosaic` (keyframe được, mục Độ mờ và hoà trộn): thu nhỏ ảnh nguồn rồi phóng lại không làm mịn.
- `plugins.js`: quyền `video.frames`. Phiên `frames.*` dùng `ElemSource` + `drawMediaLayer` của bản sao "sạch" (không mask, blur, pin, mosaic) vào canvas `plugFrames`, trả ArrayBuffer (transfer). Các lệnh `getClip`, `duplicateClip`, `setMask`, `setPin`, `setKeyframes`, `applyTrack`, `checkpoint`. Manifest `apiVersion` lớn hơn `API_VERSION` thì bị từ chối. Bảng plugin có chế độ lớn (`panel.size: "large"`, nút ⤢).
- Plugin mẫu `examples/plugins/motion-tracking/`: `tracker.js` (Shi-Tomasi, LK kim tự tháp + kiểm tra xuôi/ngược, RANSAC T/S/H, chống trôi bằng warp về khung neo, che một phần thì rơi về bước tương tự, mất dấu thì dự đoán vận tốc giảm dần) và `app.js` (bút, mốc sửa, thanh tin cậy, áp dụng, hướng dẫn lần đầu).

## bravin-project schema 2 (4.9.1)
- `js/antifact.js`: đọc schema 1 + 2: nhiều clip mỗi track, ảnh / video / âm thanh, keyframe (x, y, width, height, scale, rotation, opacity + easing → `c.kf`), hiệu ứng vào/ra (→ `c.anim`), camera 2D được "nướng" thành keyframe của từng lớp (15 mẫu/giây + thời điểm khoá), `parallax`. Báo cáo sau khi nhập liệt kê phần bỏ qua.
- Thả file vào bất kỳ đâu: ở Trang chủ thì `.bravin.json` mở thành dự án mới; trong trình dựng thì `importFiles`. Thư viện và hộp phông chữ giữ trình xử lý riêng (`defaultPrevented`).
- Đặc tả cho ứng dụng xuất file: `docs/BRAVIN_PROJECT_FORMAT.md`; file mẫu: `samples/bravin-project/`.


## Bravin cho Samsung (4.11)
APK thứ hai `app.bravin.samsung` dựng bằng `FLAVOR=samsung` (Air actions, cửa sổ DeX, biểu tượng riêng). `js/samsung.js`: vẽ tay S Pen theo lực nhấn thành lớp PNG trên track phủ, Air View, nhận DeX qua `VINCutAndroid.device()` + sự kiện `bravin-config`. `plugins.js`: trên mọi APK, Tiện ích/cài plugin hiện hộp thoại "Cần Bravin trên máy tính". Chi tiết: `docs/SAMSUNG.md`.
