param([ValidateRange(1,600)][int]$TimeoutSeconds=180)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Backend-Processes.ps1')
$projectRoot = Split-Path -Parent $PSScriptRoot
$records = @(Read-BackendRecords (Join-Path $projectRoot '.local\processes.json'))
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$waiting = [System.Collections.Generic.List[int]]::new()
foreach ($port in @(8080,8081,8082,8083,8084)) { $waiting.Add($port) }
while ($waiting.Count -gt 0 -and (Get-Date) -lt $deadline) {
    foreach ($port in @($waiting.ToArray())) {
        try {
            $health = Invoke-RestMethod -Uri "http://localhost:$port/actuator/health" -TimeoutSec 2
            if ($health.status -eq 'UP') { $waiting.Remove($port) | Out-Null; Write-Host "Port ${port}: ready" }
        } catch { }
        if ($waiting.Contains($port)) {
            $record = $records | Where-Object { $_.port -eq $port } | Select-Object -First 1
            if ($record -and -not (Get-RecordedBackendProcess $record)) {
                throw "$($record.name) exited before becoming ready. Check .local/$($record.name).log and .error.log."
            }
        }
    }
    if ($waiting.Count -gt 0) { Start-Sleep -Seconds 1 }
}
if ($waiting.Count -gt 0) { throw "Services on ports $($waiting -join ', ') did not become ready. Check the logs in .local and run Status-Backend.ps1." }
