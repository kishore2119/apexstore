param([switch]$Restart)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot
if ($Restart) { & (Join-Path $PSScriptRoot 'Stop-Backend.ps1') }
& (Join-Path $PSScriptRoot 'Start-Backend.ps1')
Write-Host "Backend daemon active. Holding process open..."
while ($true) {
    Start-Sleep -Seconds 10
}
