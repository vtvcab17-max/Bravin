Unicode true
Name "Bravin"
OutFile "payload\Bravin.exe"
Icon "payload\bravin.ico"
SilentInstall silent
RequestExecutionLevel user
VIProductVersion "4.5.0.0"
VIAddVersionKey "ProductName" "Bravin"
VIAddVersionKey "FileDescription" "Bravin - dựng video"
VIAddVersionKey "FileVersion" "4.5"
VIAddVersionKey "ProductVersion" "4.5"
VIAddVersionKey "LegalCopyright" "Bravin"
Section
  ExecShell "" "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$EXEDIR\bravin.ps1"' SW_HIDE
SectionEnd
