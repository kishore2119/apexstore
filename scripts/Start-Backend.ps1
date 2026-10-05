param([switch]$Restart)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Load-Settings.ps1')
if ($Restart) { & (Join-Path $PSScriptRoot 'Stop-Backend.ps1') }
$statePath = Join-Path $projectRoot '.local\processes.json'
if (Test-Path -LiteralPath $statePath) {
    $previous = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    foreach ($entry in $previous) {
        $existing = Get-Process -Id $entry.pid -ErrorAction SilentlyContinue
        if ($existing -and $existing.ProcessName -eq 'java' -and $existing.StartTime.ToUniversalTime().Ticks -eq ([datetime]$entry.startedAt).ToUniversalTime().Ticks) {
            Write-Host 'Backend processes are already running. Checking their status:'
            & (Join-Path $PSScriptRoot 'Status-Backend.ps1')
            Write-Host 'To restart all services, run .\scripts\Start-Backend.ps1 -Restart'
            return
        }
    }
}
$services = @(@{name='user-service';port=8081},@{name='product-service';port=8082},@{name='invoice-service';port=8084},@{name='order-service';port=8083},@{name='api-gateway';port=8080})
foreach ($service in $services) {
    if (Get-NetTCPConnection -LocalPort $service.port -State Listen -ErrorAction SilentlyContinue) { throw "Port $($service.port) is already in use." }
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "$($service.name)\target\$($service.name)-1.0.0.jar"))) { throw 'Build the applications first.' }
}
$records = @()
$javaHomeLine = (cmd /c "java -XshowSettings:properties -version 2>&1" | Select-String '^\s*java.home =').ToString()
$javaExecutable = Join-Path ($javaHomeLine -replace '^\s*java.home =\s*','') 'bin\java.exe'
foreach ($service in $services) {
    $jar = Join-Path $projectRoot "$($service.name)\target\$($service.name)-1.0.0.jar"
    $process = Start-Process -FilePath $javaExecutable -ArgumentList @('-Xms64m','-Xmx256m','-jar',"`"$jar`"") -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $projectRoot ".local\$($service.name).log") -RedirectStandardError (Join-Path $projectRoot ".local\$($service.name).error.log")
    $records += [ordered]@{name=$service.name;pid=$process.Id;startedAt=$process.StartTime.ToUniversalTime().ToString('o');port=$service.port}
    $records | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
    Write-Host "$($service.name) launched on port $($service.port)."
}
Write-Host 'Waiting for the services and database connections to become ready…'
& (Join-Path $PSScriptRoot 'Wait-Backend.ps1')
Write-Host 'Backend ready. Gateway: http://localhost:8080.'
