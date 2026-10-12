Unicode true
Name "Phim AI"
OutFile "payload\PhimAI.exe"
Icon "payload\phimai.ico"
SilentInstall silent
RequestExecutionLevel user
VIProductVersion "1.2.8.0"
VIAddVersionKey "ProductName" "Phim AI"
VIAddVersionKey "FileDescription" "Phim AI - LocalMiniDrama tiếng Việt"
VIAddVersionKey "FileVersion" "1.2.8"
VIAddVersionKey "ProductVersion" "1.2.8"
VIAddVersionKey "LegalCopyright" "MIT xuanyustudio; ban tieng Viet: Bravin"
!include "FileFunc.nsh"
Section
  ${GetParameters} $0
  ExecShell "" "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$EXEDIR\phimai.ps1" -Url "$0"' SW_HIDE
SectionEnd
