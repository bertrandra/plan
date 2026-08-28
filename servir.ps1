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
  # Depot de fixture : POST /_fixture/<nom> ecrit le corps brut dans tests/fixtures/golden/.
  # Sert a capturer les golden files au bit pres (les PDF sont binaires : les faire transiter
  # par une chaine de caracteres les corromprait). Refuse tout ce qui sort du dossier, et
  # n'accepte que des noms de fichier simples.
  if ($ctx.Request.HttpMethod -eq 'POST' -and $rel -like '_fixture/*') {
    $nom = $rel.Substring(9)
    if ($nom -match '^[A-Za-z0-9._-]+$') {
      $dossier = Join-Path $root 'tests/fixtures/golden'
      if (-not (Test-Path -LiteralPath $dossier)) { New-Item -ItemType Directory -Force $dossier | Out-Null }
      $ms = New-Object System.IO.MemoryStream
      $ctx.Request.InputStream.CopyTo($ms)
      [System.IO.File]::WriteAllBytes((Join-Path $dossier $nom), $ms.ToArray())
      $ctx.Response.StatusCode = 200
      $rep = [System.Text.Encoding]::UTF8.GetBytes('{"ecrit":"' + $nom + '","octets":' + $ms.Length + '}')
    } else {
      $ctx.Response.StatusCode = 400
      $rep = [System.Text.Encoding]::UTF8.GetBytes('{"error":"nom de fichier refuse"}')
    }
    $ctx.Response.ContentType = 'application/json'
    $ctx.Response.Headers.Add('Access-Control-Allow-Origin', '*')
    $ctx.Response.OutputStream.Write($rep, 0, $rep.Length)
    $ctx.Response.Close()
    continue
  }
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
