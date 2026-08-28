# Serveur statique minimal pour ouvrir plan.html dans un navigateur : sans lui, en file://,
# les navigateurs bloquent les appels aux API IGN (origine "null") et l'import cadastre, le
# PLU et l'orthophoto sont indisponibles.
#   pwsh -File servir.ps1     puis     http://localhost:8765/plan.html
# Le fichier est relu a CHAQUE requete : un snapshot en memoire servirait indefiniment les
# octets d'avant les dernieres modifications.
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add('http://localhost:8765/')
$listener.Start()
Write-Host "serving $root on http://localhost:8765/"
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $rel = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
  if ([string]::IsNullOrWhiteSpace($rel)) { $rel = 'plan.html' }
  $path = Join-Path $root $rel
  try {
    if (Test-Path -LiteralPath $path -PathType Leaf) {
      $bytes = [System.IO.File]::ReadAllBytes($path)
      $ext = [System.IO.Path]::GetExtension($path).ToLower()
      $type = switch ($ext) {
        '.html' { 'text/html; charset=utf-8' }
        '.json' { 'application/json; charset=utf-8' }
        '.svg'  { 'image/svg+xml' }
        default { 'application/octet-stream' }
      }
      $ctx.Response.ContentType = $type
      $ctx.Response.Headers.Add('Cache-Control', 'no-store, no-cache, must-revalidate')
      $ctx.Response.StatusCode = 200
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
      $msg = [System.Text.Encoding]::UTF8.GetBytes('{"error":"not found"}')
      $ctx.Response.ContentType = 'application/json'
      $ctx.Response.OutputStream.Write($msg, 0, $msg.Length)
    }
  } catch {
    $ctx.Response.StatusCode = 500
  }
  $ctx.Response.Close()
}
