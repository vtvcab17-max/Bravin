# VINCut local server - serves this folder on http://localhost:8765 with byte-range support (needed for video seeking).
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Split-Path -Parent $MyInvocation.MyCommand.Path))
$listener = $null
foreach ($p in 8765..8775) {
  try { $l = New-Object System.Net.HttpListener; $l.Prefixes.Add("http://localhost:$p/"); $l.Start(); $listener = $l; $port = $p; break } catch { }
}
if (-not $listener) { Write-Host "Khong mo duoc cong 8765-8775. Dong cac chuong trinh dang dung cong roi thu lai."; Read-Host "Nhan Enter de thoat"; exit 1 }
$url = "http://localhost:$port/"
Write-Host ""
Write-Host "  VINCut dang chay tai $url"
Write-Host "  Giu cua so nay mo trong luc dung VINCut. Dong cua so de tat."
Write-Host ""
Start-Process $url
$mime = @{ '.mjs'='text/javascript'; '.wasm'='application/wasm'; '.ttf'='font/ttf'; '.webm'='video/webm'; '.html'='text/html; charset=utf-8'; '.json'='application/json; charset=utf-8'; '.mp4'='video/mp4'; '.mp3'='audio/mpeg'; '.wav'='audio/wav'; '.jpg'='image/jpeg'; '.png'='image/png'; '.js'='text/javascript'; '.css'='text/css'; '.md'='text/plain; charset=utf-8'; '.txt'='text/plain; charset=utf-8' }
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
$chunk = 2MB
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $fs = $null
  try {
    $req = $ctx.Request; $res = $ctx.Response
    $rel = [Uri]::UnescapeDataString($req.Url.AbsolutePath.TrimStart('/'))
    if ($rel -eq '') { $rel = 'index.html' }
    if ($rel -eq 'tts') {
      $qs = Get-Query $req.Url.Query; $rate = 1.0; [double]::TryParse([string]$qs['rate'], [ref]$rate) | Out-Null
      $lang = [string]$qs['lang']; if (-not $lang) { $lang = 'vi-VN' }
      $bytes = Get-TtsWav ([string]$qs['text']) $lang $rate
      $res.ContentType = 'audio/wav'; $res.ContentLength64 = $bytes.Length; $res.OutputStream.Write($bytes, 0, $bytes.Length); $res.Close(); continue
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
