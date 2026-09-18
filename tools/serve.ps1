# ============================================================
#  PREMIERE GROUP - minimal static dev server (no Node required)
#  Usage:  powershell -ExecutionPolicy Bypass -File tools\serve.ps1 [-Port 8777]
#  Then open:  http://localhost:8777/         (User App)
#              http://localhost:8777/admin.html (Admin Panel)
# ============================================================
param([int]$Port = 8777)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot   # project root = parent of \tools

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".svg"  = "image/svg+xml"
  ".png"  = "image/png"; ".jpg" = "image/jpeg"; ".jpeg" = "image/jpeg"
  ".ico"  = "image/x-icon"; ".woff2" = "font/woff2"
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Premiere Group dev server -> http://localhost:$Port/  (Ctrl+C to stop)"

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response
    try {
      $rel = [Uri]::UnescapeDataString($req.Url.AbsolutePath.TrimStart("/"))
      if ([string]::IsNullOrWhiteSpace($rel)) { $rel = "index.html" }
      $path = Join-Path $root $rel
      if ((Test-Path $path -PathType Container)) { $path = Join-Path $path "index.html" }

      if (Test-Path $path -PathType Leaf) {
        $ext = [System.IO.Path]::GetExtension($path).ToLower()
        $res.ContentType = $mime[$ext]; if (-not $res.ContentType) { $res.ContentType = "application/octet-stream" }
        $bytes = [System.IO.File]::ReadAllBytes($path)
        $res.Headers.Add("Cache-Control", "no-store")
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      } else {
        $res.StatusCode = 404
        $b = [Text.Encoding]::UTF8.GetBytes("404 Not Found: $rel")
        $res.OutputStream.Write($b, 0, $b.Length)
      }
    } catch {
      $res.StatusCode = 500
      $b = [Text.Encoding]::UTF8.GetBytes("500 " + $_.Exception.Message)
      try { $res.OutputStream.Write($b, 0, $b.Length) } catch {}
    } finally {
      $res.OutputStream.Close()
    }
  }
} finally {
  $listener.Stop(); $listener.Close()
}
