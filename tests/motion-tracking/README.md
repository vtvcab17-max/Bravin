# Kiểm thử độ chính xác Motion Tracking

    python3 gen.py /tmp/syn            # 90 khung 720p, vùng xoay + phóng to + phối cảnh, vật che đi ngang
    node bench.js ../../examples/plugins/motion-tracking/tracker.js /tmp/syn
    python3 gen_hard.py /tmp/hard      # chuyển động nhanh gấp đôi, che gần kín 13 khung, nhoè
    node bench_h.js ../../examples/plugins/motion-tracking/tracker.js /tmp/hard

Kết quả lần chạy 11/10/2026 (sai số góc, pixel ở 720p):

| | syn: trung bình / khung cuối | hard: sau khi hết che / khung cuối |
|---|---|---|
| Phối cảnh + chống trôi | 0,48 / 0,92 | 0,84 / 1,42 |
| Phối cảnh, không chống trôi | 0,59 / 1,24 | 16,9 / 16,9 |
| Vị trí + xoay + tỉ lệ | 10,9 / 25,6 | 19,2 / 23,9 |
| Chỉ vị trí | 48,6 / 97,4 | 92,7 / 106,2 |
