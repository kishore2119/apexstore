$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'Backend-Processes.ps1')
$statePath = Join-Path $projectRoot '.local\processes.json'
if (-not (Test-Path -LiteralPath $statePath)) { Write-Host 'No recorded backend processes.'; return }
$records = @(Read-BackendRecords $statePath)
$failures = @()
foreach ($entry in @($records | Sort-Object port)) {
    try { Stop-RecordedBackendProcess $entry }
    catch {
        $failures += $entry.name
        Write-Warning "Could not stop $($entry.name); its process record has been retained."
    }
}
$remaining = @($records | Where-Object { Get-RecordedBackendProcess $_ })
Save-BackendRecords $statePath $remaining
if ($failures.Count -gt 0) { throw "Could not stop: $($failures -join ', ')." }
