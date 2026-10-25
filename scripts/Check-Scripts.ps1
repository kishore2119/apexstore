$ErrorActionPreference = 'Stop'
$sourceRoot = Split-Path -Parent $PSScriptRoot
$parseFailures = @()
Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.ps1' | ForEach-Object {
    $parseErrors = $null
    [System.Management.Automation.Language.Parser]::ParseFile($_.FullName, [ref]$null, [ref]$parseErrors) | Out-Null
    $parseFailures += $parseErrors
}
if ($parseFailures.Count -gt 0) { throw ($parseFailures | Out-String) }
Write-Host 'PASS: All PowerShell scripts parse successfully'
$fixtureRoot = Join-Path $sourceRoot ('.local\script-checks\' + [guid]::NewGuid().ToString('N'))
$fixtureScripts = Join-Path $fixtureRoot 'scripts'
New-Item -ItemType Directory -Path $fixtureScripts -Force | Out-Null
foreach ($name in @('Start-Backend.ps1','Stop-Backend.ps1','Backend-Processes.ps1','Load-Settings.ps1')) {
    Copy-Item -LiteralPath (Join-Path $sourceRoot "scripts\$name") -Destination $fixtureScripts
}
Set-Content -LiteralPath (Join-Path $fixtureScripts 'Wait-Backend.ps1') -Value 'if ($global:BackendCheckFailReadiness) { throw "Simulated readiness failure" }'
Set-Content -LiteralPath (Join-Path $fixtureRoot '.env') -Value '# Offline test fixture; no live settings.'
foreach ($service in @('user-service','product-service','invoice-service','order-service','api-gateway')) {
    $jarDir = Join-Path $fixtureRoot "$service\target"
    New-Item -ItemType Directory -Path $jarDir -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $jarDir "$service-1.0.0.jar") -Value 'offline fixture'
}
$global:BackendCheckProcesses = @{}
$global:BackendCheckLaunchCount = 0
$global:BackendCheckStopCount = 0
$global:BackendCheckNextId = 10000
$global:BackendCheckOccupiedPort = 0
$global:BackendCheckFailLaunchAt = 0
$global:BackendCheckFailReadiness = $false
function Get-Process {
    param($Id, $ErrorAction)
    if ($global:BackendCheckProcesses.ContainsKey([int]$Id)) { $global:BackendCheckProcesses[[int]$Id] }
}
function Get-NetTCPConnection {
    param($LocalPort, $State, $ErrorAction)
    if ($LocalPort -eq $global:BackendCheckOccupiedPort) { [pscustomobject]@{LocalPort=$LocalPort} }
}
function cmd { '    java.home = C:\MockJdk' }
function Start-Process {
    param($FilePath,$ArgumentList,$WorkingDirectory,$WindowStyle,[switch]$PassThru,$RedirectStandardOutput,$RedirectStandardError)
    $global:BackendCheckLaunchCount++
    if ($global:BackendCheckFailLaunchAt -gt 0 -and $global:BackendCheckLaunchCount -eq $global:BackendCheckFailLaunchAt) { throw 'Simulated launch failure' }
    $global:BackendCheckNextId++
    $process = [pscustomobject]@{Id=$global:BackendCheckNextId;ProcessName='java';StartTime=[datetime]::UtcNow}
    $process | Add-Member -MemberType ScriptMethod -Name WaitForExit -Value { param($timeout); return $true }
    $global:BackendCheckProcesses[$process.Id] = $process
    $process
}
function Stop-Process {
    param($InputObject,$ErrorAction)
    $global:BackendCheckProcesses.Remove([int]$InputObject.Id)
    $global:BackendCheckStopCount++
}
function Assert-Test([bool]$Condition,[string]$Description) {
    if (-not $Condition) { throw "FAILED: $Description" }
    Write-Host "PASS: $Description"
}
function Expect-Failure([scriptblock]$Action,[string]$Description) {
    $failed = $false
    try { & $Action } catch { $failed = $true }
    Assert-Test $failed $Description
}
$startScript = Join-Path $fixtureScripts 'Start-Backend.ps1'
$stopScript = Join-Path $fixtureScripts 'Stop-Backend.ps1'
$statePath = Join-Path $fixtureRoot '.local\processes.json'
& $startScript
Assert-Test ($global:BackendCheckProcesses.Count -eq 5 -and $global:BackendCheckLaunchCount -eq 5) 'Clean launch records all five services'
& $startScript
Assert-Test ($global:BackendCheckLaunchCount -eq 5) 'Repeated launch does not create duplicate processes'
$records = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
$global:BackendCheckProcesses.Remove([int]$records[1].pid)
& $startScript
Assert-Test ($global:BackendCheckProcesses.Count -eq 5 -and $global:BackendCheckLaunchCount -eq 6) 'Missing service is recovered while existing services are retained'
& $stopScript
Assert-Test ($global:BackendCheckProcesses.Count -eq 0 -and -not (Test-Path -LiteralPath $statePath)) 'Stop clears matching processes and process state'

$global:BackendCheckOccupiedPort = 8082
Expect-Failure { & $startScript } 'Unrecorded occupied port blocks startup'
Assert-Test ($global:BackendCheckProcesses.Count -eq 0 -and $global:BackendCheckStopCount -eq 5) 'Occupied port never triggers process termination'
$global:BackendCheckOccupiedPort = 0
$global:BackendCheckFailLaunchAt = $global:BackendCheckLaunchCount + 3
Expect-Failure { & $startScript } 'A partial launch failure is reported'
Assert-Test ($global:BackendCheckProcesses.Count -eq 0 -and -not (Test-Path -LiteralPath $statePath)) 'Processes launched before failure are rolled back'
$global:BackendCheckFailLaunchAt = 0
& $startScript
$records = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
foreach ($record in $records[1..4]) { $global:BackendCheckProcesses.Remove([int]$record.pid) }
$global:BackendCheckFailReadiness = $true
Expect-Failure { & $startScript } 'Readiness failure is reported'
Assert-Test ($global:BackendCheckProcesses.Count -eq 1 -and $global:BackendCheckProcesses.ContainsKey([int]$records[0].pid)) 'Rollback preserves a pre-existing service'
$global:BackendCheckFailReadiness = $false
& $stopScript

. (Join-Path $fixtureScripts 'Backend-Processes.ps1')
$wrongProcess = [pscustomobject]@{Id=4242;ProcessName='powershell';StartTime=[datetime]::UtcNow}
$global:BackendCheckProcesses[4242] = $wrongProcess
$stale = [pscustomobject]@{name='user-service';pid=4242;port=8081;startedAt=$wrongProcess.StartTime.ToString('o')}
Save-BackendRecords $statePath @($stale)
& $stopScript
Assert-Test ($global:BackendCheckProcesses.ContainsKey(4242)) 'Stale PID for a different process is never stopped'
$global:BackendCheckProcesses[4242].ProcessName = 'java'
$stale.startedAt = ([datetime]::UtcNow.AddMinutes(-1)).ToString('o')
Save-BackendRecords $statePath @($stale)
& $stopScript
Assert-Test ($global:BackendCheckProcesses.ContainsKey(4242)) 'Reused Java PID with a different start time is never stopped'
$stale.name = 'unknown-service'
ConvertTo-Json -InputObject @($stale) | Set-Content -LiteralPath $statePath
Expect-Failure { & $stopScript } 'Invalid service records are rejected before termination'

# Test the real readiness script without opening network connections.
Copy-Item -LiteralPath (Join-Path $sourceRoot 'scripts\Wait-Backend.ps1') -Destination $fixtureScripts -Force
$global:BackendCheckHealthFailure = $false
function Invoke-RestMethod {
    param($Uri,$TimeoutSec)
    if ($global:BackendCheckHealthFailure) { throw 'Offline health failure' }
    [pscustomobject]@{status='UP'}
}
Save-BackendRecords $statePath @()
& (Join-Path $fixtureScripts 'Wait-Backend.ps1') -TimeoutSeconds 1
Assert-Test $true 'Readiness works without managed process records'
$global:BackendCheckHealthFailure = $true
$stale.name = 'user-service'
$stale.pid = 999999
Save-BackendRecords $statePath @($stale)
Expect-Failure { & (Join-Path $fixtureScripts 'Wait-Backend.ps1') -TimeoutSeconds 1 } 'A recorded process exiting before readiness fails immediately'
Save-BackendRecords $statePath @()
Expect-Failure { & (Join-Path $fixtureScripts 'Wait-Backend.ps1') -TimeoutSeconds 1 } 'Unavailable manually launched services respect the readiness deadline'
Get-Variable -Name 'BackendCheck*' -Scope Global | Remove-Variable -Scope Global
Write-Host 'Offline lifecycle checks complete. No live process or database was used.'
