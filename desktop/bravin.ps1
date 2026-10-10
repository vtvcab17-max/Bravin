# Bravin cho may tinh (Windows): may chu noi bo + mo Bravin trong cua so rieng (Edge/Chrome che do ung dung).
# Dong cua so Bravin la may chu tu tat.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = [IO.Path]::GetFullPath((Join-Path $here 'app'))
$profileDir = Join-Path $env:LOCALAPPDATA 'Bravin\Profile'
New-Item -ItemType Directory -Force -Path $profileDir | Out-Null

function Find-Browser {
  $c = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
         "$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe")
  foreach ($p in $c) { if ($p -and (Test-Path -LiteralPath $p)) { return $p } }
  return $null
}
function Open-App([string]$url) {
  $b = Find-Browser
  if ($b) {
    Start-Process -FilePath $b -ArgumentList @("--app=$url", "--user-data-dir=`"$profileDir`"", '--no-first-run', '--no-default-browser-check', '--start-maximized', '--autoplay-policy=no-user-gesture-required', '--disable-features=Translate')
  } else { Start-Process $url }
}
function Test-Bravin([int]$p) { try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 "http://localhost:$p/bravin-ping"; return ($r.Content -eq 'bravin') } catch { return $false } }

# Bravin dang chay roi: chi mo them cua so
foreach ($p in 8765..8775) { if (Test-Bravin $p) { Open-App "http://localhost:$p/"; exit 0 } }

$listener = $null
foreach ($p in 8765..8775) {
  try { $l = New-Object System.Net.HttpListener; $l.Prefixes.Add("http://localhost:$p/"); $l.Start(); $listener = $l; $port = $p; break } catch { }
}
if (-not $listener) {
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show('Khong mo duoc cong 8765-8775. Dong cac chuong trinh dang dung cong do roi mo lai Bravin.', 'Bravin') | Out-Null
  exit 1
}
$url = "http://localhost:$port/"
Open-App $url
$mime = @{ '.mjs'='text/javascript'; '.wasm'='application/wasm'; '.ttf'='font/ttf'; '.woff2'='font/woff2'; '.svg'='image/svg+xml'; '.ico'='image/x-icon'; '.webm'='video/webm'; '.html'='text/html; charset=utf-8'; '.json'='application/json; charset=utf-8'; '.mp4'='video/mp4'; '.mp3'='audio/mpeg'; '.wav'='audio/wav'; '.jpg'='image/jpeg'; '.png'='image/png'; '.js'='text/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.md'='text/plain; charset=utf-8'; '.txt'='text/plain; charset=utf-8'; '.cube'='text/plain; charset=utf-8'; '.onnx'='application/octet-stream' }
function Get-TtsWav([string]$text, [string]$lang, [double]$rate) {
  try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
    $synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
    $voice = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | Where-Object { $_.Language -like ($lang.Substring(0, 2) + '*') } | Select-Object -First 1
    if (-not $voice) { throw 'no voice' }
    $synth.Voice = $voice
    try { $synth.Options.SpeakingRate = [Math]::Max(0.5, [Math]::Min(3.0, $rate)) } catch { }
    $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
    $task = $asTask.MakeGenericMethod([Windows.Media.SpeechSynthesis.SpeechSynthesisStream]).Invoke($null, @($synth.SynthesizeTextToStreamAsync($text)))
    $task.Wait(); $stream = $task.Result
    $netStream = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($stream)
    $ms = New-Object IO.MemoryStream; $netStream.CopyTo($ms); return , $ms.ToArray()
  } catch {
    Add-Type -AssemblyName System.Speech
    $sp = New-Object System.Speech.Synthesis.SpeechSynthesizer
    $ms = New-Object IO.MemoryStream; $sp.SetOutputToWaveStream($ms); $sp.Rate = [int][Math]::Round(($rate - 1) * 10); $sp.Speak($text); $sp.Dispose()
    return , $ms.ToArray()
  }
}
function Get-Query([string]$q) { $h = @{}; foreach ($kv in $q.TrimStart('?').Split('&')) { if (-not $kv) { continue }; $p = $kv.Split('=', 2); $k = [Uri]::UnescapeDataString($p[0].Replace('+', ' ')); $v = ''; if ($p.Count -gt 1) { $v = [Uri]::UnescapeDataString($p[1].Replace('+', ' ')) }; $h[$k] = $v }; return $h }

function Bravin-WindowOpen { try { $n = @(Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='chrome.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine -like "*Bravin\Profile*" }).Count; return ($n -gt 0) } catch { return $true } }
$chunk = 2MB
$started = Get-Date; $lastCheck = Get-Date; $missing = 0
while ($listener.IsListening) {
  $async = $listener.BeginGetContext($null, $null)
  while (-not $async.AsyncWaitHandle.WaitOne(1000)) {
    if (((Get-Date) - $started).TotalSeconds -gt 20 -and ((Get-Date) - $lastCheck).TotalSeconds -ge 3) {
      $lastCheck = Get-Date
      if (Bravin-WindowOpen) { $missing = 0 } else { $missing++ ; if ($missing -ge 2) { $listener.Stop(); exit 0 } }
    }
  }
  $ctx = $listener.EndGetContext($async)
  $fs = $null
  try {
    $req = $ctx.Request; $res = $ctx.Response
    $rel = [Uri]::UnescapeDataString($req.Url.AbsolutePath.TrimStart('/'))
    if ($rel -eq '') { $rel = 'index.html' }
    if ($rel -eq 'bravin-ping') { $b = [Text.Encoding]::ASCII.GetBytes('bravin'); $res.ContentType = 'text/plain'; $res.ContentLength64 = $b.Length; $res.OutputStream.Write($b, 0, $b.Length); $res.Close(); continue }
    if ($rel -eq 'tts') {
      $qs = Get-Query $req.Url.Query; $rate = 1.0; [double]::TryParse([string]$qs['rate'], [ref]$rate) | Out-Null
      $lang = [string]$qs['lang']; if (-not $lang) { $lang = 'vi-VN' }
      $bytes = Get-TtsWav ([string]$qs['text']) $lang $rate
      $res.ContentType = 'audio/wav'; $res.ContentLength64 = $bytes.Length; $res.OutputStream.Write($bytes, 0, $bytes.Length); $res.Close(); continue
    }
    if ($rel -eq 'dl') {
      # Tai ho mot link http(s) (trinh duyet bi CORS chan nhieu trang). Chi nhan yeu cau co header X-Bravin.
      if (-not $req.Headers['X-Bravin']) { $res.StatusCode = 403; $res.Close(); continue }
      $qs = Get-Query $req.Url.Query; $target = [string]$qs['url']
      if ($target -notmatch '^https?://') { $res.StatusCode = 400; $res.Close(); continue }
      $in = $null; $wr = $null
      try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls11
        $wr = [Net.HttpWebRequest]::Create($target); $wr.UserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
        $wr.Accept = '*/*'; $wr.Timeout = 20000; $wr.ReadWriteTimeout = 30000; $wr.AllowAutoRedirect = $true; $wr.MaximumAutomaticRedirections = 6
        $rp = $wr.GetResponse(); $in = $rp.GetResponseStream()
        $res.ContentType = $rp.ContentType; if ($rp.ContentLength -ge 0) { $res.ContentLength64 = $rp.ContentLength }
        $cd = $rp.Headers['Content-Disposition']; if ($cd) { $res.AddHeader('X-Dl-Disposition', [Uri]::EscapeDataString($cd)) }
        $res.AddHeader('X-Dl-Url', [Uri]::EscapeDataString($rp.ResponseUri.AbsoluteUri)); $res.AddHeader('Cache-Control', 'no-store')
        $buf = New-Object byte[] 65536
        while (($n = $in.Read($buf, 0, $buf.Length)) -gt 0) { $res.OutputStream.Write($buf, 0, $n) }
        $res.Close()
      } catch [Net.WebException] {
        $code = 504; if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
        try { $res.StatusCode = 502; $res.AddHeader('X-Dl-Status', [string]$code); $res.Close() } catch { try { $res.Abort() } catch { } }
      } finally { if ($in) { $in.Close() } }
      continue
    }
    $path = [IO.Path]::GetFullPath((Join-Path $root $rel))
    if (-not $path.StartsWith($root) -or -not (Test-Path -LiteralPath $path -PathType Leaf)) { $res.StatusCode = 404; $res.Close(); continue }
    $ext = [IO.Path]::GetExtension($path).ToLower()
    if ($mime.ContainsKey($ext)) { $res.ContentType = $mime[$ext] } else { $res.ContentType = 'application/octet-stream' }
    $res.AddHeader('Accept-Ranges', 'bytes'); $res.AddHeader('Cache-Control', 'no-cache')
    $fs = [IO.File]::Open($path, 'Open', 'Read', 'ReadWrite')
    $len = $fs.Length; $start = [int64]0; $end = $len - 1
    $range = $req.Headers['Range']
    if ($range -and $range -match 'bytes=(\d*)-(\d*)') {
      if ($matches[1] -ne '') { $start = [int64]$matches[1]; if ($matches[2] -ne '') { $end = [int64]$matches[2] } else { $end = [Math]::Min($len - 1, $start + $chunk - 1) } }
      elseif ($matches[2] -ne '') { $start = [Math]::Max(0, $len - [int64]$matches[2]) }
      if ($end -ge $len) { $end = $len - 1 }
      if ($start -gt $end) { $res.StatusCode = 416; $res.AddHeader('Content-Range', "bytes */$len"); $fs.Close(); $res.Close(); continue }
      $res.StatusCode = 206; $res.AddHeader('Content-Range', "bytes $start-$end/$len")
    }
    $count = $end - $start + 1; $res.ContentLength64 = $count
    [void]$fs.Seek($start, 'Begin')
    if ($req.HttpMethod -ne 'HEAD') {
      $buf = New-Object byte[] 65536; $left = $count
      while ($left -gt 0) { $n = $fs.Read($buf, 0, [int][Math]::Min($buf.Length, $left)); if ($n -le 0) { break }; $res.OutputStream.Write($buf, 0, $n); $left -= $n }
    }
    $fs.Close(); $res.Close()
  } catch {
    if ($fs) { $fs.Close() }
    try { $ctx.Response.Abort() } catch { }
  }
}
