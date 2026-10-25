param(
    [Parameter(Mandatory=$true)][ValidatePattern('^[A-Za-z0-9.-]+$')][string]$DatabaseHost,
    [Parameter(Mandatory=$true)][ValidateNotNullOrEmpty()][string]$DatabaseUser,
    [string]$DatabasePassword,
    [ValidatePattern('^[A-Za-z_][A-Za-z0-9_]{0,62}$')][string]$DatabaseName,
    [string]$AdminEmail = 'admin@ecom.local'
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$localDir = Join-Path $projectRoot '.local'
$envPath = Join-Path $projectRoot '.env'
if (Test-Path -LiteralPath $envPath) { throw 'The .env file already exists. Edit it deliberately rather than replacing credentials.' }
if (-not $DatabasePassword) {
    $secure = Read-Host 'CockroachDB password' -AsSecureString
    $DatabasePassword = [System.Net.NetworkCredential]::new('', $secure).Password
}
if ([string]::IsNullOrWhiteSpace($DatabasePassword) -or $DatabasePassword -match '[\r\n]') { throw 'A nonempty single-line database password is required.' }
if ($DatabaseUser -match '[\r\n]') { throw 'The database username must be a single line.' }
if ($AdminEmail -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$') { throw 'Supply an administrator email address with a dotted domain.' }
function New-Secret {
    $bytes = New-Object byte[] 48
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes); return [Convert]::ToBase64String($bytes) } finally { $rng.Dispose() }
}
New-Item -ItemType Directory -Path $localDir -Force | Out-Null
$connectionOptions = 'sslmode=verify-full&sslfactory=org.postgresql.ssl.DefaultJavaSSLFactory'
$databasePrefix = "jdbc:postgresql://${DatabaseHost}:26257"
function Get-ServiceDatabaseUrl([string]$Service) {
    if ($DatabaseName) { return "${databasePrefix}/${DatabaseName}?${connectionOptions}&currentSchema=$Service" }
    return "${databasePrefix}/${Service}_db?${connectionOptions}"
}
$envLines = @(
    "DB_USERNAME=$DatabaseUser"
    "DB_PASSWORD=$DatabasePassword"
    "DATABASE_HOST=$DatabaseHost"
    "JWT_SECRET=$(New-Secret)"
    "INTERNAL_API_KEY=$(New-Secret)"
    "ADMIN_EMAIL=$AdminEmail"
    "ADMIN_PASSWORD=$(New-Secret)"
    "DATABASE_SETUP_URL=${databasePrefix}/defaultdb?${connectionOptions}"
    "USER_DB_URL=$(Get-ServiceDatabaseUrl 'users')"
    "PRODUCT_DB_URL=$(Get-ServiceDatabaseUrl 'products')"
    "ORDER_DB_URL=$(Get-ServiceDatabaseUrl 'orders')"
    "INVOICE_DB_URL=$(Get-ServiceDatabaseUrl 'invoices')"
)
if ($DatabaseName) { $envLines += "DATABASE_NAME=$DatabaseName" }
$envLines | Set-Content -LiteralPath $envPath -Encoding UTF8
Write-Host 'Private settings saved in .env. This file is excluded from Git.'
