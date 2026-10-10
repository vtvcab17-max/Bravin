Unicode true
!include "MUI2.nsh"
!include "FileFunc.nsh"
!define APP "Bravin"
!define VER "4.5"
!define UNKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\Bravin"
Name "${APP} ${VER}"
OutFile "Bravin_Setup_${VER}.exe"
InstallDir "$LOCALAPPDATA\Programs\Bravin"
InstallDirRegKey HKCU "Software\Bravin" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
BrandingText "Bravin ${VER}"
VIProductVersion "4.5.0.0"
VIAddVersionKey "ProductName" "Bravin"
VIAddVersionKey "FileDescription" "Cài đặt Bravin"
VIAddVersionKey "FileVersion" "${VER}"
VIAddVersionKey "ProductVersion" "${VER}"
VIAddVersionKey "LegalCopyright" "Bravin"
!define MUI_ICON "payload\bravin.ico"
!define MUI_UNICON "payload\bravin.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Cài đặt Bravin ${VER}"
!define MUI_WELCOMEPAGE_TEXT "Bravin là phần mềm dựng video: timeline nhiều lớp, keyframe, mask, chỉnh màu kiểu node, trợ lý AI.$\r$\n$\r$\nBravin cài cho tài khoản Windows này, không cần quyền quản trị.$\r$\n$\r$\nBấm Tiếp để bắt đầu."
!define MUI_FINISHPAGE_RUN "$INSTDIR\Bravin.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Mở Bravin ngay"
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

!macro StopBravin
  nsExec::Exec '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \"Name=''powershell.exe''\" | Where-Object { $$_.CommandLine -like ''*bravin.ps1*'' } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force }"'
  Pop $0
!macroend

Section "Bravin" SecMain
  SectionIn RO
  !insertmacro StopBravin
  SetOutPath "$INSTDIR"
  RMDir /r "$INSTDIR\app\js"
  RMDir /r "$INSTDIR\app\css"
  File /r "payload\*.*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateShortcut "$DESKTOP\Bravin.lnk" "$INSTDIR\Bravin.exe" "" "$INSTDIR\bravin.ico" 0
  CreateDirectory "$SMPROGRAMS\Bravin"
  CreateShortcut "$SMPROGRAMS\Bravin\Bravin.lnk" "$INSTDIR\Bravin.exe" "" "$INSTDIR\bravin.ico" 0
  CreateShortcut "$SMPROGRAMS\Bravin\Gỡ cài đặt Bravin.lnk" "$INSTDIR\Uninstall.exe" "" "$INSTDIR\bravin.ico" 0
  WriteRegStr HKCU "Software\Bravin" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNKEY}" "DisplayName" "Bravin"
  WriteRegStr HKCU "${UNKEY}" "DisplayVersion" "${VER}"
  WriteRegStr HKCU "${UNKEY}" "Publisher" "Bravin"
  WriteRegStr HKCU "${UNKEY}" "DisplayIcon" "$INSTDIR\bravin.ico"
  WriteRegStr HKCU "${UNKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNKEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "${UNKEY}" "QuietUninstallString" '"$INSTDIR\Uninstall.exe" /S'
  WriteRegDWORD HKCU "${UNKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNKEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  WriteRegDWORD HKCU "${UNKEY}" "EstimatedSize" $0
SectionEnd

Section "Uninstall"
  !insertmacro StopBravin
  Delete "$DESKTOP\Bravin.lnk"
  RMDir /r "$SMPROGRAMS\Bravin"
  RMDir /r "$INSTDIR\app"
  Delete "$INSTDIR\Bravin.exe"
  Delete "$INSTDIR\bravin.ps1"
  Delete "$INSTDIR\bravin.ico"
  Delete "$INSTDIR\HUONG_DAN.txt"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "${UNKEY}"
  DeleteRegKey HKCU "Software\Bravin"
  IfSilent done
  MessageBox MB_YESNO|MB_ICONQUESTION "Xoá luôn các dự án và cài đặt đã lưu của Bravin?$\r$\n$\r$\nChọn Không để giữ lại (cài lại Bravin sẽ thấy lại dự án)." IDNO done
  RMDir /r "$LOCALAPPDATA\Bravin"
  done:
SectionEnd
