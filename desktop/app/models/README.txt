Thư mục model AI nhúng cho Bravin (chạy không cần mạng).
Đặt model ONNX theo cấu trúc Hugging Face, ví dụ:
  models/onnx-community/Qwen2.5-0.5B-Instruct/config.json, tokenizer.json, onnx/model_q4f16.onnx …
Rồi mở Bravin với window.VINCUT_AI = { localModels: true } (thêm vào index.html trước các script),
Bravin sẽ đọc model ở đây trước, không tải từ Internet.
Bộ chạy transformers.js đã có sẵn trong vendor/transformers/.
