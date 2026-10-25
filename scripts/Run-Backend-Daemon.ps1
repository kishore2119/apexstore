param([switch]$Restart)
$ErrorActionPreference = 'Stop'
# Compatibility entry point: Start-Backend already launches independent hidden processes.
& (Join-Path $PSScriptRoot 'Start-Backend.ps1') -Restart:$Restart
