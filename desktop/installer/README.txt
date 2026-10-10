Dựng bộ cài Windows (Bravin_Setup_x.y.exe) bằng NSIS (chạy được trên Linux: apt install nsis).
1. Tạo thư mục payload/ cạnh 2 file .nsi, chép vào: app/, bravin.ps1, bravin.ico, HUONG_DAN.txt (từ thư mục desktop/).
2. makensis -INPUTCHARSET UTF8 launcher.nsi   -> payload/Bravin.exe (trình mở Bravin không hiện cửa sổ PowerShell)
3. makensis -INPUTCHARSET UTF8 setup.nsi   -> Bravin_Setup_x.y.exe (cài cho người dùng hiện tại, không cần quyền quản trị)
