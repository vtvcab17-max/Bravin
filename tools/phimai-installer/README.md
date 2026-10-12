# Bộ cài Windows "Phim AI" (LocalMiniDrama tiếng Việt)

Dựng trên Linux (cần `nsis`, `npm`, `curl`). Kết quả: `PhimAI_Setup_1.2.8.exe` (~63 MB), cài cho người dùng hiện tại, có sẵn:
- `node\node.exe` (Node.js 22 cho Windows, lấy từ gói npm `node-win-x64`);
- `app\` = LocalMiniDrama-vi (giao diện đã dựng `frontweb\dist`, `backend-node\node_modules` bản Windows: better-sqlite3 prebuild node-v127-win32-x64, `@img/sharp-win32-x64`), `backend-node\tools\ffmpeg\ffmpeg.exe`;
- `PhimAI.exe` (launcher NSIS, không cửa sổ) gọi `phimai.ps1`: bật máy chủ ngầm ở cổng 5679, chờ `/health`, mở `http://localhost:5679` (tham số `start`: chỉ bật; `stop`: tắt);
- liên kết `bravinlmd://start` (HKCU\Software\Classes\bravinlmd) để nút «▶ Bật Phim AI» trong Bravin bật máy chủ.

## Các bước
```bash
STAGE=stage; mkdir -p $STAGE/node $STAGE/app
npm pack node-win-x64@22.23.3 && tar xzf node-win-x64-22.23.3.tgz && cp package/bin/node.exe $STAGE/node/
# chép LocalMiniDrama-vi (không node_modules, không data) vào $STAGE/app, kèm backend-node/tools/ffmpeg/ffmpeg.exe
cd $STAGE/app/backend-node && npm install --omit=dev --os=win32 --cpu=x64 --ignore-scripts
curl -L https://github.com/WiseLibs/better-sqlite3/releases/download/v11.10.0/better-sqlite3-v11.10.0-node-v127-win32-x64.tar.gz | tar xz -C node_modules/better-sqlite3/
cd -  # về thư mục này
mkdir payload && cp -r $STAGE/* payload/ && cp phimai.ps1 phimai.ico HUONG_DAN.txt payload/
makensis -INPUTCHARSET UTF8 launcher.nsi
LANG=C.UTF-8 LC_ALL=C.UTF-8 makensis -INPUTCHARSET UTF8 setup.nsi   # cần locale UTF-8, nếu không makensis lỗi với tên tệp tiếng Trung
```
`phimai.ps1` phải lưu UTF-8 có BOM (Windows PowerShell 5.1).

Tệp cài được đặt ở `downloads/PhimAI_Setup_1.2.8.exe` trong repo (ngoài `app/` vì Cloudflare giới hạn 25 MiB mỗi tệp), tải qua
`https://github.com/vtvcab17-max/Bravin/raw/main/downloads/PhimAI_Setup_1.2.8.exe`.
