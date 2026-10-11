param(
  [switch]$InstallStartup
)

$siteRoot = Split-Path -Parent $PSScriptRoot
$bridgeScript = Join-Path $siteRoot 'tools\byte-bridge.mjs'
$node = (Get-Command node -ErrorAction Stop).Source

function Test-ByteBridgeHealth {
  try {
    $response = Invoke-WebRequest -Uri 'http://127.0.0.1:8766/workspace/index' `
      -Headers @{ Origin = 'https://voidscriptor.com' } `
      -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
    return $response.StatusCode -eq 200 -and
      $response.Headers['Access-Control-Allow-Origin'] -eq 'https://voidscriptor.com'
  } catch {
    return $false
  }
}

function Get-ByteBridgeProcesses {
  @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine -match [regex]::Escape($bridgeScript) })
}

if (-not (Test-ByteBridgeHealth)) {
  # A listener on port 8766 is not enough: an unrelated local HTTP server can
  # occupy IPv6 while a stale bridge still owns IPv4. Only stop an exact
  # byte-bridge.mjs process; never touch other Node or Python processes.
  foreach ($process in Get-ByteBridgeProcesses) {
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
  }
  $logDir = Join-Path ([IO.Path]::GetTempPath()) 'voidscriptor-byte-bridge'
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
  # Start-Process passes ArgumentList as a single command line. Quote the
  # script path so a workspace path containing spaces stays one Node argument.
  Start-Process -FilePath $node -ArgumentList @('"' + $bridgeScript + '"') -WorkingDirectory $siteRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'stdout.log') -RedirectStandardError (Join-Path $logDir 'stderr.log') | Out-Null
  Start-Sleep -Milliseconds 600
  if (Test-ByteBridgeHealth) {
    Write-Host 'Byte bridge started and passed the production-origin health check on http://127.0.0.1:8766'
  } else {
    Write-Warning "Byte bridge was started but did not pass its health check. See $(Join-Path $logDir 'stderr.log')"
  }
} else {
  Write-Host 'Byte bridge is already healthy on http://127.0.0.1:8766'
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
