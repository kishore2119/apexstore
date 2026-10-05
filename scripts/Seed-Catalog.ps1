param([string]$BaseUrl='http://localhost:8080', [string]$FrontendUrl='http://localhost:4200')
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Load-Settings.ps1')
& (Join-Path $PSScriptRoot 'Wait-Backend.ps1')
function Call-CatalogApi([string]$Method, [string]$Path, $Body=$null) {
    $arguments = @{Method=$Method; Uri=($BaseUrl.TrimEnd('/')+$Path); TimeoutSec=60; Headers=@{}}
    if ($script:catalogToken) { $arguments.Headers.Authorization="Bearer $script:catalogToken" }
    if ($null -ne $Body) { $arguments.ContentType='application/json'; $arguments.Body=[System.Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 8 -Compress)) }
    Invoke-RestMethod @arguments
}
$script:catalogToken = $null
$session = Call-CatalogApi POST '/api/auth/login' @{email=$settings.ADMIN_EMAIL; password=$settings.ADMIN_PASSWORD}
if ($session.user.roles -notcontains 'ADMIN') { throw 'The configured account must have the admin role.' }
$script:catalogToken = $session.accessToken
$existing = @{}
$page = 0
do {
    $result = Call-CatalogApi GET "/api/admin/products?size=100&page=$page&sort=createdAt,desc"
    foreach ($product in $result.content) { $existing[$product.sku] = $product }
    $page++
} while ($page -lt $result.totalPages)
$catalog = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'data\catalog.json') -Raw | ConvertFrom-Json
$created = 0
$skipped = 0
$records = @()
foreach ($entry in $catalog) {
    if ($existing.ContainsKey($entry.sku)) {
        $product = $existing[$entry.sku]
        $skipped++
    } else {
        $body = @{sku=$entry.sku; name=$entry.name; description=$entry.description; category=$entry.category; price=$entry.price; stockOnHand=$entry.stockOnHand; imageUrl=($FrontendUrl.TrimEnd('/')+$entry.imagePath)}
        $product = Call-CatalogApi POST '/api/admin/products' $body
        if ($product.availableStock -ne $entry.stockOnHand) { throw "Initial stock was not saved for $($entry.sku). Rebuild and restart the backend before seeding." }
        $created++
        Write-Host "Added $created / $($catalog.Count): $($entry.name)"
    }
    $records += [ordered]@{id=$product.id; sku=$product.sku; name=$product.name; category=$product.category; active=$product.active; price=$product.price; availableStock=$product.availableStock; imageUrl=$product.imageUrl}
}
$report = [ordered]@{timestamp=(Get-Date).ToUniversalTime().ToString('o'); created=$created; skipped=$skipped; records=$records}
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $projectRoot '.local\catalog-seed.json') -Encoding UTF8
Write-Host "Catalog ready: $created added, $skipped already present. Existing stock and edited products were preserved."
foreach ($category in ($records | Group-Object { $_['category'] })) { Write-Host "$($category.Name): $($category.Count) catalog records" }
