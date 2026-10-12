Unicode true
!include "MUI2.nsh"
!include "FileFunc.nsh"
!define APP "Phim AI"
!define VER "1.2.8"
!define UNKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\PhimAI"
Name "${APP} ${VER}"
OutFile "PhimAI_Setup_${VER}.exe"
InstallDir "$LOCALAPPDATA\Programs\PhimAI"
InstallDirRegKey HKCU "Software\PhimAI" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
BrandingText "Phim AI ${VER} · LocalMiniDrama tiếng Việt"
VIProductVersion "1.2.8.0"
VIAddVersionKey "ProductName" "Phim AI"
VIAddVersionKey "FileDescription" "Cài đặt Phim AI (LocalMiniDrama tiếng Việt)"
VIAddVersionKey "FileVersion" "${VER}"
VIAddVersionKey "ProductVersion" "${VER}"
VIAddVersionKey "LegalCopyright" "MIT xuanyustudio; ban tieng Viet: Bravin"
!define MUI_ICON "payload\phimai.ico"
!define MUI_UNICON "payload\phimai.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Cài đặt Phim AI ${VER}"
!define MUI_WELCOMEPAGE_TEXT "Phim AI là LocalMiniDrama bản tiếng Việt: AI viết kịch bản, tách phân cảnh, tạo ảnh và video. Dùng một mình hoặc trong khu Phim AI của Bravin.$\r$\n$\r$\nBộ cài có sẵn mọi thứ cần thiết (Node.js, ffmpeg), không cần cài thêm, không cần quyền quản trị.$\r$\n$\r$\nBấm Tiếp để bắt đầu."
!define MUI_FINISHPAGE_RUN "$INSTDIR\PhimAI.exe"
!define MUI_FINISHPAGE_RUN_PARAMETERS "start"
!define MUI_FINISHPAGE_RUN_TEXT "Bật Phim AI ngay (để Bravin nối được)"
!define MUI_FINISHPAGE_SHOWREADME "$INSTDIR\HUONG_DAN.txt"
!define MUI_FINISHPAGE_SHOWREADME_TEXT "Xem hướng dẫn"
!define MUI_FINISHPAGE_SHOWREADME_NOTCHECKED
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Vietnamese"

!macro StopServer
  IfFileExists "$INSTDIR\phimai.ps1" 0 +3
  nsExec::Exec '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\phimai.ps1" -Stop'
  Pop $0
!macroend

Section "Phim AI" SecMain
  SectionIn RO
  !insertmacro StopServer
  SetOutPath "$INSTDIR"
  RMDir /r "$INSTDIR\app\frontweb\dist"
  RMDir /r "$INSTDIR\app\backend-node\src"
  RMDir /r "$INSTDIR\app\backend-node\node_modules"
  File /r "payload\*.*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateShortcut "$DESKTOP\Phim AI.lnk" "$INSTDIR\PhimAI.exe" "" "$INSTDIR\phimai.ico" 0
  CreateDirectory "$SMPROGRAMS\Phim AI"
  CreateShortcut "$SMPROGRAMS\Phim AI\Phim AI.lnk" "$INSTDIR\PhimAI.exe" "" "$INSTDIR\phimai.ico" 0
  CreateShortcut "$SMPROGRAMS\Phim AI\Tắt Phim AI.lnk" "$INSTDIR\PhimAI.exe" "stop" "$INSTDIR\phimai.ico" 0
  CreateShortcut "$SMPROGRAMS\Phim AI\Gỡ cài đặt Phim AI.lnk" "$INSTDIR\Uninstall.exe" "" "$INSTDIR\phimai.ico" 0
  ; liên kết bravinlmd://start để Bravin bật Phim AI bằng một cú bấm
  WriteRegStr HKCU "Software\Classes\bravinlmd" "" "URL:Phim AI"
  WriteRegStr HKCU "Software\Classes\bravinlmd" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\bravinlmd\DefaultIcon" "" "$INSTDIR\phimai.ico"
  WriteRegStr HKCU "Software\Classes\bravinlmd\shell\open\command" "" '"$INSTDIR\PhimAI.exe" "%1"'
  WriteRegStr HKCU "Software\PhimAI" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNKEY}" "DisplayName" "Phim AI (LocalMiniDrama tiếng Việt)"
  WriteRegStr HKCU "${UNKEY}" "DisplayVersion" "${VER}"
  WriteRegStr HKCU "${UNKEY}" "Publisher" "Bravin"
  WriteRegStr HKCU "${UNKEY}" "DisplayIcon" "$INSTDIR\phimai.ico"
  WriteRegStr HKCU "${UNKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNKEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "${UNKEY}" "QuietUninstallString" '"$INSTDIR\Uninstall.exe" /S'
  WriteRegDWORD HKCU "${UNKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNKEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  WriteRegDWORD HKCU "${UNKEY}" "EstimatedSize" $0
SectionEnd

Section "Uninstall"
  !insertmacro StopServer
  Delete "$DESKTOP\Phim AI.lnk"
  RMDir /r "$SMPROGRAMS\Phim AI"
  DeleteRegKey HKCU "Software\Classes\bravinlmd"
  DeleteRegKey HKCU "${UNKEY}"
  DeleteRegKey HKCU "Software\PhimAI"
  IfSilent keep
  MessageBox MB_YESNO|MB_ICONQUESTION "Xoá luôn các phim, ảnh, video đã tạo và cấu hình AI?$\r$\n$\r$\nChọn Không để giữ lại thư mục dữ liệu (cài lại sẽ thấy lại)." IDNO keep
  RMDir /r "$INSTDIR"
  Goto done
  keep:
  RMDir /r "$INSTDIR\node"
  RMDir /r "$INSTDIR\app\frontweb"
  RMDir /r "$INSTDIR\app\backend-node\node_modules"
  RMDir /r "$INSTDIR\app\backend-node\src"
  Delete "$INSTDIR\PhimAI.exe"
  Delete "$INSTDIR\phimai.ps1"
  Delete "$INSTDIR\Uninstall.exe"
  done:
SectionEnd
