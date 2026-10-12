# Trả lời mục "An toàn dữ liệu" (Data safety) trên Play Console

Căn cứ: Bravin không có máy chủ riêng, không tài khoản, không quảng cáo, không thống kê hay báo lỗi tự động (đã kiểm tra mã: không có SDK phân tích; các địa chỉ mạng duy nhất là Google Fonts/jsDelivr, nhà cung cấp AI do người dùng tự nhập khoá, Hugging Face cho mô hình chạy trên máy, link do người dùng dán, Phim AI trên máy tính của người dùng).

## Câu hỏi tổng quát
| Câu hỏi | Trả lời |
|---|---|
| Ứng dụng có thu thập hoặc chia sẻ loại dữ liệu người dùng bắt buộc nào không? | **Có** (vì tính năng AI gửi nội dung tới nhà cung cấp AI khi người dùng dùng nó) |
| Mọi dữ liệu thu thập được mã hoá khi truyền? | **Có** (HTTPS tới các nhà cung cấp AI) |
| Người dùng có thể yêu cầu xoá dữ liệu? | Chọn **"Không"** kèm giải thích: nhà phát triển không lưu dữ liệu; dữ liệu trên máy xoá bằng gỡ ứng dụng/xoá dữ liệu ứng dụng; dữ liệu gửi nhà cung cấp AI theo chính sách của họ |

## Loại dữ liệu khai báo
| Loại | Thu thập? | Chia sẻ? | Tuỳ chọn? | Mục đích |
|---|---|---|---|---|
| Hoạt động ứng dụng → **Nội dung khác do người dùng tạo** (câu lệnh AI, văn bản/khung hình gửi cho trợ lý AI) | Có | Không (người dùng chủ động gửi tới dịch vụ họ chọn, thuộc ngoại lệ "do người dùng khởi tạo") | **Tuỳ chọn** (chỉ khi người dùng bật AI bằng khoá của họ) | Chức năng ứng dụng |

Không khai báo:
- **Âm thanh / ghi âm**: ghi âm và nhận giọng nói chạy trên máy, không gửi đi.
- **Ảnh và video**: không rời máy (trừ khi người dùng gửi khung hình cho trợ lý AI → đã tính ở mục trên).
- **Vị trí, danh bạ, mã thiết bị, thông tin cá nhân, tài chính, sức khoẻ, tin nhắn, lịch sử duyệt web**: không thu thập.
- **Nhật ký sự cố, chẩn đoán**: không có.

Nếu sau này thêm tài khoản, đồng bộ đám mây, quảng cáo hay thống kê thì phải sửa lại mục này và trang chính sách quyền riêng tư.

Đây là gợi ý dựa trên cách mã hoạt động, không phải tư vấn pháp lý; người nộp chịu trách nhiệm câu trả lời cuối cùng.
