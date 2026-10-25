param([switch]$SkipTests)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'Backend-Processes.ps1')
$restartAfterBuild = $false
$statePath = Join-Path $projectRoot '.local\processes.json'
if (Test-Path -LiteralPath $statePath) {
    foreach ($entry in (Read-BackendRecords $statePath)) {
        if (Get-RecordedBackendProcess $entry) { $restartAfterBuild = $true; break }
    }
    if ($restartAfterBuild) { Write-Host 'Stopping recorded backend services so Windows can replace their JAR files.'; & (Join-Path $PSScriptRoot 'Stop-Backend.ps1') }
}
Push-Location $projectRoot
try {
    $mavenArguments = @('-B', "-Dmaven.repo.local=$projectRoot\.local\m2", 'verify')
    if ($SkipTests) { $mavenArguments += '-DskipTests' }
    & mvn @mavenArguments
    if ($LASTEXITCODE -ne 0) { throw 'Build or tests failed.' }
} finally { Pop-Location }
if ($restartAfterBuild) { & (Join-Path $PSScriptRoot 'Start-Backend.ps1') }
