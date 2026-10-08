param(
  [string]$Url = 'https://voidscriptor.pages.dev/?desktop=byte'
)

$edgeCandidates = @(
  'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
  'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
  'C:\Program Files\Google\Chrome\Application\chrome.exe'
)
$browser = $edgeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $browser) {
  Start-Process $Url
  exit 0
}

$profile = Join-Path ($env:LOCALAPPDATA) 'VoidScriptor\ByteDesktopProfile'
New-Item -ItemType Directory -Path $profile -Force | Out-Null
Start-Process -FilePath $browser -ArgumentList @(
  '--app=' + $Url,
  '--user-data-dir=' + $profile,
  '--window-size=430,760',
  '--window-position=24,120'
)
