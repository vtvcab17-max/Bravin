#!/usr/bin/env bash
# Bravin – khởi động phiên & cổng kiểm chứng (verification gate).
#   ./init.sh          kiểm tra tĩnh + kiểm thử khói (app/ và desktop/app/)
#   ./init.sh --quick  chỉ kiểm tra tĩnh (vài giây)
# Thoát mã khác 0 nếu có lỗi. Chưa đạt thì KHÔNG được báo "xong".
set -euo pipefail
cd "$(dirname "$0")"

echo "=== Bravin: khởi động phiên ==="
echo "Thư mục: $(pwd)"
echo "Phiên bản: $(grep -o 'bravin-version" content="[^"]*' app/index.html | cut -d'"' -f3)"
command -v git >/dev/null && git log --oneline -3 2>/dev/null || true
node -e 'process.exit(+process.versions.node.split(".")[0] >= 18 ? 0 : 1)' || { echo "Cần Node.js 18+"; exit 1; }

echo
echo "=== 1/2 Kiểm tra tĩnh (cú pháp JS, JSON, tham chiếu, phiên bản, desktop/app, giới hạn 25 MiB, bí mật) ==="
node tests/verify/static.mjs

if [ "${1:-}" = "--quick" ]; then
  echo; echo "Bỏ qua kiểm thử khói (--quick). Trước khi báo xong phải chạy ./init.sh đầy đủ."
else
  echo
  echo "=== 2/2 Kiểm thử khói trong Chromium (test: app/ rồi desktop/app/) ==="
  if ! node -e 'require("playwright")' 2>/dev/null; then
    if [ -f package.json ]; then npm install --no-audit --no-fund >/dev/null; fi
  fi
  node tests/verify/smoke.mjs app
  node tests/verify/smoke.mjs desktop/app
fi

echo
echo "=== Kiểm chứng xong: mọi kiểm tra đạt ==="
echo "Next steps:"
echo "1. Đọc feature_list.json, chọn MỘT tính năng chưa xong (status khác \"done\")."
echo "2. Chỉ làm tính năng đó; sửa app/ rồi chạy: python3 tools/make_desktop_app.py ."
echo "3. Chạy lại ./init.sh, ghi bằng chứng vào feature_list.json và progress.md trước khi báo xong."
