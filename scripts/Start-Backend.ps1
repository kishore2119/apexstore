param([switch]$Restart)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Load-Settings.ps1')
. (Join-Path $PSScriptRoot 'Backend-Processes.ps1')
if ($Restart) { & (Join-Path $PSScriptRoot 'Stop-Backend.ps1') }
$statePath = Join-Path $projectRoot '.local\processes.json'
$records = @(Read-BackendRecords $statePath | Where-Object { Get-RecordedBackendProcess $_ })
$missing = @(Get-BackendServices | Where-Object { $_.name -notin @($records.name) })
foreach ($service in $missing) {
    if (Get-NetTCPConnection -LocalPort $service.port -State Listen -ErrorAction SilentlyContinue) { throw "Port $($service.port) is already in use." }
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "$($service.name)\target\$($service.name)-1.0.0.jar"))) { throw 'Build the applications first.' }
}
New-Item -ItemType Directory -Path (Join-Path $projectRoot '.local') -Force | Out-Null
Save-BackendRecords $statePath $records
$launched = @()
try {
    if ($missing.Count -gt 0) {
        $javaHomeLine = cmd /d /c 'java -XshowSettings:properties -version 2>&1' | Select-String '^\s*java.home =' | Select-Object -First 1
        if (-not $javaHomeLine) { throw 'Java was not found. Install JDK 21 or newer and make java available on PATH.' }
        $javaExecutable = Join-Path ($javaHomeLine.ToString() -replace '^\s*java.home =\s*','') 'bin\java.exe'
        foreach ($service in $missing) {
            $jar = Join-Path $projectRoot "$($service.name)\target\$($service.name)-1.0.0.jar"
            $process = Start-Process -FilePath $javaExecutable -ArgumentList @('-Xms64m','-Xmx256m','-jar',"`"$jar`"") -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $projectRoot ".local\$($service.name).log") -RedirectStandardError (Join-Path $projectRoot ".local\$($service.name).error.log")
            $entry = [pscustomobject]@{name=$service.name;pid=$process.Id;startedAt=$process.StartTime.ToUniversalTime().ToString('o');port=$service.port}
            $records += $entry
            $launched += $entry
            Save-BackendRecords $statePath $records
            Write-Host "$($service.name) launched on port $($service.port)."
        }
    } else { Write-Host 'All recorded backend processes are running. Checking readiness.' }
    Write-Host 'Waiting for the services and database connections to become ready...'
    & (Join-Path $PSScriptRoot 'Wait-Backend.ps1')
} catch {
    # Keep pre-existing services, but do not leave a half-launched stack behind.
    foreach ($entry in $launched) {
        try { Stop-RecordedBackendProcess $entry }
        catch { Write-Warning "Could not stop $($entry.name); its process record has been retained." }
    }
    $remaining = @($records | Where-Object { Get-RecordedBackendProcess $_ })
    Save-BackendRecords $statePath $remaining
    throw
}
Write-Host 'Backend ready. Gateway: http://localhost:8080.'
