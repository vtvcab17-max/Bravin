# Phim AI (LocalMiniDrama tiếng Việt) – trình khởi động cho Windows
# phimai.ps1            : bật máy chủ (nếu chưa chạy) rồi mở giao diện http://localhost:5679
# phimai.ps1 -Start     : chỉ bật máy chủ (Bravin gọi qua liên kết bravinlmd://start)
# phimai.ps1 -Stop      : tắt máy chủ
param([switch]$Start, [switch]$Stop, [string]$Url = "")
$ErrorActionPreference = "SilentlyContinue"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$node = Join-Path $root "node\node.exe"
$be   = Join-Path $root "app\backend-node"
$port = 5679
if ($Url -match "stop") { $Stop = $true }
if ($Url -match "start") { $Start = $true }

function Test-Up {
  try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 "http://127.0.0.1:$port/health"; return $r.StatusCode -eq 200 } catch { return $false }
}
function Get-ServerPids {
  $ids = @()
  try { $ids += (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop).OwningProcess } catch {}
  $ids += (Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.ExecutablePath -eq $node }).ProcessId
  return $ids | Where-Object { $_ } | Select-Object -Unique
}

if ($Stop) { Get-ServerPids | ForEach-Object { Stop-Process -Id $_ -Force }; exit 0 }

if (-not (Test-Up)) {
  $logDir = Join-Path $be "data"; New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  Start-Process -FilePath $node -ArgumentList "src\server.js" -WorkingDirectory $be -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logDir "server.log") -RedirectStandardError (Join-Path $logDir "server-error.log")
  for ($i = 0; $i -lt 60; $i++) { Start-Sleep -Milliseconds 500; if (Test-Up) { break } }
}
if (-not (Test-Up)) {
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show("Phim AI chưa khởi động được.`r`nXem nhật ký: $be\data\server-error.log", "Phim AI") | Out-Null
  exit 1
}
if (-not $Start) { Start-Process "http://localhost:$port/" }
