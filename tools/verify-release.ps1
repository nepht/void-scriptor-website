[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
  [string]$InstallerPath,

  [Parameter(Mandatory = $true)]
  [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
  [string]$ManifestPath
)

$ErrorActionPreference = 'Stop'

$installer = (Resolve-Path -LiteralPath $InstallerPath).Path
$manifest = (Resolve-Path -LiteralPath $ManifestPath).Path
$installerName = [IO.Path]::GetFileName($installer)
$manifestLines = @(Get-Content -LiteralPath $manifest | Where-Object { $_ -match '\S' })
$entry = @($manifestLines | Where-Object {
  $_ -match '^([a-fA-F0-9]{64})\s{1,2}\*?(.+?)\s*$'
})

if ($entry.Count -ne 1) {
  throw "Manifest harus memiliki tepat satu entri SHA-256 yang dapat dibaca: $manifest"
}

if ($entry[0] -notmatch '^([a-fA-F0-9]{64})\s{1,2}\*?(.+?)\s*$') {
  throw "Format manifest tidak valid: $manifest"
}

$expectedHash = $Matches[1].ToLowerInvariant()
$expectedName = $Matches[2].Trim()
$actualHash = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant()
$hashMatches = $actualHash -eq $expectedHash -and $installerName -eq $expectedName
$signature = Get-AuthenticodeSignature -FilePath $installer
$signerSubject = if ($null -ne $signature.SignerCertificate) { $signature.SignerCertificate.Subject } else { $null }
$signerIssuer = if ($null -ne $signature.SignerCertificate) { $signature.SignerCertificate.Issuer } else { $null }

$result = [ordered]@{
  Installer = $installerName
  ExpectedHash = $expectedHash
  ActualHash = $actualHash
  HashMatchesManifest = $hashMatches
  SignatureStatus = [string]$signature.Status
  SignatureMessage = $signature.StatusMessage
  SignerSubject = $signerSubject
  SignerIssuer = $signerIssuer
  TimestampPresent = ($null -ne $signature.TimeStamperCertificate)
  PublisherTrust = 'Checksum dan Authenticode tidak menetapkan publisher trust atau jaminan SmartScreen.'
}

$result | ConvertTo-Json -Depth 3

if (-not $hashMatches) {
  exit 2
}

if ($signature.Status -ne 'Valid') {
  exit 3
}
