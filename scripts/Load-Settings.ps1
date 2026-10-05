$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot '.env'
if (-not (Test-Path -LiteralPath $envPath)) { throw 'Create .env first with scripts/Configure-Local.ps1.' }
foreach ($line in Get-Content -LiteralPath $envPath) {
    $entry = $line.Trim()
    if (-not $entry -or $entry.StartsWith('#')) { continue }
    $separator = $entry.IndexOf('=')
    if ($separator -lt 1) { throw "Invalid .env entry: $line" }
    $name = $entry.Substring(0, $separator).Trim()
    $value = $entry.Substring($separator + 1).Trim()
    if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
        $value = $value.Substring(1, $value.Length - 2)
    }
    if ($name -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') { throw "Invalid .env variable name: $name" }
    if ($name -like '*_DB_URL' -and $value -notmatch 'sslfactory=') { $value += '&sslfactory=org.postgresql.ssl.DefaultJavaSSLFactory' }
    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
}
