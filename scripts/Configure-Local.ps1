param(
    [string]$DatabaseHost = 'ecommerce-34294.j77.aws-ap-south-1.cockroachlabs.cloud',
    [string]$DatabaseUser = 'sai',
    [string]$DatabasePassword,
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
function New-Secret {
    $bytes = New-Object byte[] 48
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes); return [Convert]::ToBase64String($bytes) } finally { $rng.Dispose() }
}
New-Item -ItemType Directory -Path $localDir -Force | Out-Null
$envLines = @(
    "DB_USERNAME=$DatabaseUser"
    "DB_PASSWORD=$DatabasePassword"
    "DATABASE_HOST=$DatabaseHost"
    "JWT_SECRET=$(New-Secret)"
    "INTERNAL_API_KEY=$(New-Secret)"
    "ADMIN_EMAIL=$AdminEmail"
    "ADMIN_PASSWORD=$(New-Secret)"
    "USER_DB_URL=jdbc:postgresql://${DatabaseHost}:26257/users_db?sslmode=verify-full"
    "PRODUCT_DB_URL=jdbc:postgresql://${DatabaseHost}:26257/products_db?sslmode=verify-full"
    "ORDER_DB_URL=jdbc:postgresql://${DatabaseHost}:26257/orders_db?sslmode=verify-full"
    "INVOICE_DB_URL=jdbc:postgresql://${DatabaseHost}:26257/invoices_db?sslmode=verify-full"
)
$envLines | Set-Content -LiteralPath $envPath -Encoding UTF8
Write-Host 'Private settings saved in .env. This file is excluded from Git.'
