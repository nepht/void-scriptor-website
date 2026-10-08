param(
  [switch]$InstallStartup
)

$siteRoot = Split-Path -Parent $PSScriptRoot
$bridgeScript = Join-Path $siteRoot 'tools\byte-bridge.mjs'
$node = (Get-Command node -ErrorAction Stop).Source

$listener = Get-NetTCPConnection -State Listen -LocalPort 8766 -ErrorAction SilentlyContinue
if (-not $listener) {
  $logDir = Join-Path ([IO.Path]::GetTempPath()) 'voidscriptor-byte-bridge'
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
  Start-Process -FilePath $node -ArgumentList @($bridgeScript) -WorkingDirectory $siteRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'stdout.log') -RedirectStandardError (Join-Path $logDir 'stderr.log') | Out-Null
  Write-Host 'Byte bridge started on http://127.0.0.1:8766'
} else {
  Write-Host 'Byte bridge is already running on http://127.0.0.1:8766'
}

if ($InstallStartup) {
  $startup = [Environment]::GetFolderPath('Startup')
  $shortcutPath = Join-Path $startup 'Void Scriptor Byte Bridge.lnk'
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = (Get-Command powershell.exe).Source
  $shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $PSCommandPath + '"'
  $shortcut.WorkingDirectory = $siteRoot
  $shortcut.Description = 'Start the local Void Scriptor Byte bridge'
  $shortcut.Save()
  Write-Host "Startup shortcut installed: $shortcutPath"
}
