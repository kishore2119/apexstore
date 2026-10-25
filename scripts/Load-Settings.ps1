$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot '.env'
if (-not (Test-Path -LiteralPath $envPath)) { throw 'Create .env first with scripts/Configure-Local.ps1.' }
$loadedSettings = @{}
foreach ($line in Get-Content -LiteralPath $envPath) {
    $entry = $line.Trim()
    if (-not $entry -or $entry.StartsWith('#')) { continue }
    $separator = $entry.IndexOf('=')
    if ($separator -lt 1) { throw 'Invalid .env entry: expected NAME=VALUE.' }
    $name = $entry.Substring(0, $separator).Trim()
    $value = $entry.Substring($separator + 1).Trim()
    if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
        $value = $value.Substring(1, $value.Length - 2)
    }
    if ($name -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') { throw "Invalid .env variable name: $name" }
    $databaseUrl = $name -like '*_DB_URL' -or $name -eq 'DATABASE_SETUP_URL'
    if ($databaseUrl -and $value -like 'jdbc:postgresql:*' -and
        $value -notmatch '[?&]sslfactory=' -and $value -notmatch '[?&]sslrootcert=' -and
        $value -notmatch '[?&]sslmode=disable(?:&|$)') {
        $delimiter = if ($value.Contains('?')) { '&' } else { '?' }
        $value += "${delimiter}sslfactory=org.postgresql.ssl.DefaultJavaSSLFactory"
    }
    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
    $loadedSettings[$name] = $value
}
$settings = [pscustomobject]$loadedSettings
