# Shared process bookkeeping. Never stop a process solely because it occupies a port.
function Get-BackendServices {
    @(
        @{name='user-service'; port=8081}
        @{name='product-service'; port=8082}
        @{name='invoice-service'; port=8084}
        @{name='order-service'; port=8083}
        @{name='api-gateway'; port=8080}
    )
}

function Read-BackendRecords([string]$StatePath) {
    if (-not (Test-Path -LiteralPath $StatePath)) { return }
    try {
        $parsed = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
        $records = @($parsed)
    }
    catch { throw 'Cannot read .local/processes.json. Check the file before starting or stopping services.' }
    $known = @{}
    foreach ($service in Get-BackendServices) { $known[$service.name] = $service.port }
    $seen = @{}
    foreach ($entry in $records) {
        $processId = 0
        try { $startedAt = [datetime]$entry.startedAt }
        catch { throw 'Invalid backend launch time in .local/processes.json.' }
        if (-not $known.ContainsKey([string]$entry.name) -or $seen.ContainsKey([string]$entry.name) -or
            -not [int]::TryParse([string]$entry.pid, [ref]$processId) -or $processId -le 0 -or
            $startedAt -eq [datetime]::MinValue -or
            $entry.port -ne $known[[string]$entry.name]) {
            throw 'Invalid backend process record. Check .local/processes.json before changing running services.'
        }
        $seen[[string]$entry.name] = $true
        $entry
    }
}

function Get-RecordedBackendProcess($Record) {
    $process = Get-Process -Id $Record.pid -ErrorAction SilentlyContinue
    if ($process -and $process.ProcessName -eq 'java' -and
        $process.StartTime.ToUniversalTime().Ticks -eq ([datetime]$Record.startedAt).ToUniversalTime().Ticks) {
        return $process
    }
}

function Save-BackendRecords([string]$StatePath, [object[]]$Records) {
    if ($Records.Count -eq 0) {
        if (Test-Path -LiteralPath $StatePath) { Remove-Item -LiteralPath $StatePath -Force }
        return
    }
    $temporaryPath = "$StatePath.tmp"
    ConvertTo-Json -InputObject @($Records) | Set-Content -LiteralPath $temporaryPath -Encoding UTF8
    Move-Item -LiteralPath $temporaryPath -Destination $StatePath -Force
}

function Stop-RecordedBackendProcess($Record) {
    $process = Get-RecordedBackendProcess $Record
    if (-not $process) { return }
    Stop-Process -InputObject $process -ErrorAction Stop
    if (-not $process.WaitForExit(10000)) { throw "$($Record.name) did not stop within ten seconds." }
    Write-Host "$($Record.name) stopped."
}
