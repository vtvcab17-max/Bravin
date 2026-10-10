# Cai Bravin vao may: chep vao %LOCALAPPDATA%\Programs\Bravin, tao loi tat o Desktop va Start Menu.
$ErrorActionPreference = 'Stop'
$src = Split-Path -Parent $MyInvocation.MyCommand.Path
$dst = Join-Path $env:LOCALAPPDATA 'Programs\Bravin'
Write-Host ''
Write-Host '  Dang cai Bravin...'
New-Item -ItemType Directory -Force -Path $dst | Out-Null
Get-ChildItem -LiteralPath $src | Where-Object { $_.Name -notlike 'Cai dat*' } | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $dst -Recurse -Force }
Get-ChildItem -LiteralPath $dst -Recurse -File | Unblock-File -ErrorAction SilentlyContinue
$ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$ws = New-Object -ComObject WScript.Shell
$links = @((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Bravin.lnk'), (Join-Path ([Environment]::GetFolderPath('Programs')) 'Bravin.lnk'))
foreach ($lnk in $links) {
  $s = $ws.CreateShortcut($lnk)
  $s.TargetPath = $ps
  $s.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$dst\bravin.ps1`""
  $s.WorkingDirectory = $dst; $s.IconLocation = "$dst\bravin.ico,0"; $s.WindowStyle = 7; $s.Description = 'Bravin - dung video'
  $s.Save()
}
$u = $ws.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Programs')) 'Go cai dat Bravin.lnk'))
$u.TargetPath = $ps; $u.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$dst\uninstall.ps1`""; $u.WorkingDirectory = $dst; $u.IconLocation = "$dst\bravin.ico,0"; $u.Save()
Write-Host '  Xong. Da tao loi tat "Bravin" o Desktop va Start Menu.'
Write-Host '  Dang mo Bravin...'
Start-Process -FilePath $ps -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', "`"$dst\bravin.ps1`"") -WindowStyle Hidden
Start-Sleep -Seconds 2
