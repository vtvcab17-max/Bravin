# Go Bravin khoi may. Du an da luu nam trong %LOCALAPPDATA%\Bravin\Profile (hoi truoc khi xoa).
$dst = Join-Path $env:LOCALAPPDATA 'Programs\Bravin'
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*Bravin\bravin.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
foreach ($l in @((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Bravin.lnk'), (Join-Path ([Environment]::GetFolderPath('Programs')) 'Bravin.lnk'), (Join-Path ([Environment]::GetFolderPath('Programs')) 'Go cai dat Bravin.lnk'))) { Remove-Item -LiteralPath $l -Force -ErrorAction SilentlyContinue }
Add-Type -AssemblyName System.Windows.Forms
$keep = [System.Windows.Forms.MessageBox]::Show('Giu lai cac du an da luu cua Bravin?' + [Environment]::NewLine + 'Chon No de xoa het du an va cai dat.', 'Go cai dat Bravin', 'YesNo')
if ($keep -eq 'No') { Remove-Item -LiteralPath (Join-Path $env:LOCALAPPDATA 'Bravin') -Recurse -Force -ErrorAction SilentlyContinue }
Start-Process -FilePath cmd.exe -ArgumentList '/c', "timeout /t 2 >nul & rmdir /s /q `"$dst`"" -WindowStyle Hidden
[System.Windows.Forms.MessageBox]::Show('Da go Bravin.', 'Bravin') | Out-Null
