param([string]$BaseUrl='http://localhost:8080')
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Load-Settings.ps1')
& (Join-Path $PSScriptRoot 'Wait-Backend.ps1')
$script:results = [System.Collections.Generic.List[object]]::new()
function Assert-True([bool]$Condition,[string]$Name) {
    if (-not $Condition) { throw "FAILED: $Name" }
    $script:results.Add([ordered]@{check=$Name;passed=$true})
    Write-Host "PASS: $Name"
}
function Call-Api([string]$Method,[string]$Path,$Body=$null,[string]$Token='', [hashtable]$Extra=@{}) {
    $headers=@{}
    if ($Token) { $headers.Authorization="Bearer $Token" }
    foreach ($key in $Extra.Keys) { $headers[$key]=$Extra[$key] }
    $arguments=@{Method=$Method;Uri="$BaseUrl$Path";Headers=$headers;TimeoutSec=60}
    if ($null -ne $Body) { $arguments.ContentType='application/json'; $arguments.Body=[System.Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 12 -Compress)) }
    Invoke-RestMethod @arguments
}
function Expect-Status([int]$Expected,[scriptblock]$Action,[string]$Name) {
    try { & $Action | Out-Null; throw "Expected HTTP $Expected" }
    catch {
        if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq $Expected) { Assert-True $true $Name }
        else { throw }
    }
}
function Wait-Order($Order,[string]$Token) {
    for($i=0;$i -lt 12 -and $Order.status -in @('PENDING','CANCEL_PENDING');$i++) { Start-Sleep -Seconds 5; $Order=Call-Api GET "/api/orders/$($Order.id)" $null $Token }
    return $Order
}
$product=$null
$createdByAdmin=$null
$seller=$null
$admin=$null
try {
$suffix=[Guid]::NewGuid().ToString('N').Substring(0,12)
$password='Demo-'+[Guid]::NewGuid().ToString('N')
$seller=Call-Api POST '/api/auth/register' @{name='Demo Seller';email="seller-$suffix@example.test";password=$password}
$seller=Call-Api POST '/api/users/me/seller' $null $seller.accessToken
$buyer=Call-Api POST '/api/auth/register' @{name='Demo Customer';email="buyer-$suffix@example.test";password=$password}
$admin=Call-Api POST '/api/auth/admin/login' @{adminId=$(if($settings.ADMIN_LOGIN_ID){$settings.ADMIN_LOGIN_ID}else{'ECOM-ADMIN'});password=$settings.ADMIN_PASSWORD}
Assert-True ($seller.user.roles -contains 'SELLER') 'Seller registration and role enablement'
$productInput=@{sku="DEMO-$suffix";name='Academic Demo Keyboard';description='Created by the backend verification script';category='Electronics';price=499.50;imageUrl='http://localhost:4200/images/products/apx-ele-001.jpg'}
$product=Call-Api POST '/api/seller/products' $productInput $seller.accessToken
$product=Call-Api PATCH "/api/seller/products/$($product.id)/stock" @{stockOnHand=10} $seller.accessToken
Assert-True ($product.availableStock -eq 10) 'Seller creates listing and sets inventory'
Expect-Status 403 { Call-Api POST '/api/admin/products' $productInput $seller.accessToken } 'Seller cannot access admin product creation'
Expect-Status 403 { Call-Api PUT "/api/seller/products/$($product.id)" $productInput $buyer.accessToken } 'Customer cannot edit seller listing'
$catalogue=Call-Api GET '/api/products?page=0&size=5&sort=price,asc&category=Electronics'
Assert-True ($catalogue.size -eq 5 -and $catalogue.totalElements -ge 1) 'Public catalogue pagination and sorting'
$adminProduct=$productInput.Clone(); $adminProduct.sku="ADMIN-$suffix"; $adminProduct.name='Admin Demo Listing'
$createdByAdmin=Call-Api POST '/api/admin/products' $adminProduct $admin.accessToken
Assert-True ($null -ne $createdByAdmin.id) 'Admin can create listings'
Expect-Status 403 { Call-Api PUT "/api/admin/products/$($product.id)" $productInput $admin.accessToken } 'Admin cannot edit another seller listing'
Expect-Status 403 { Call-Api GET '/api/orders' $null $admin.accessToken } 'Admin cannot use customer order history'
$orderInput=@{customerName='Demo Customer';customerEmail="buyer-$suffix@example.test";address='Academic demonstration address';items=@(@{productId=$product.id;quantity=2})}
$key="checkout-$suffix"
$order=Wait-Order (Call-Api POST '/api/orders' $orderInput $buyer.accessToken @{'Idempotency-Key'=$key}) $buyer.accessToken
Assert-True ($order.status -eq 'CONFIRMED' -and $order.total -eq 999.00) 'Order confirms with authoritative product prices'
$again=Call-Api POST '/api/orders' $orderInput $buyer.accessToken @{'Idempotency-Key'=$key}
Assert-True ($again.id -eq $order.id) 'Repeated checkout returns the same order'
$remaining=Call-Api GET "/api/products/$($product.id)"
Assert-True ($remaining.stockOnHand -eq 8 -and $remaining.reserved -eq 0) 'Stock deducted exactly once'
Expect-Status 403 { Call-Api GET "/api/orders/$($order.id)" $null $seller.accessToken } 'Other users cannot read buyer orders'
$invoice=Call-Api POST "/api/orders/$($order.id)/invoice" $null $buyer.accessToken
$invoiceAgain=Call-Api POST "/api/orders/$($order.id)/invoice" $null $buyer.accessToken
Assert-True ($invoice.total -eq 999.00 -and $invoice.id -eq $invoiceAgain.id) 'SOAP invoice generation is repeatable without duplicates'
Expect-Status 409 { Call-Api POST "/api/orders/$($order.id)/cancel" $null $buyer.accessToken } 'Issued invoice protects order from cancellation'
$cancelOrder=Wait-Order (Call-Api POST '/api/orders' $orderInput $buyer.accessToken @{'Idempotency-Key'="cancel-$suffix"}) $buyer.accessToken
$cancelled=Wait-Order (Call-Api POST "/api/orders/$($cancelOrder.id)/cancel" $null $buyer.accessToken) $buyer.accessToken
Call-Api POST "/api/orders/$($cancelOrder.id)/cancel" $null $buyer.accessToken | Out-Null
$remaining=Call-Api GET "/api/products/$($product.id)"
Assert-True ($cancelled.status -eq 'CANCELLED' -and $remaining.stockOnHand -eq 8) 'Cancellation restores inventory exactly once'
$badOrder=@{customerName='Demo Customer';customerEmail="buyer-$suffix@example.test";address='Demo';items=@(@{productId=$product.id;quantity=999})}
Expect-Status 409 { Call-Api POST '/api/orders' $badOrder $buyer.accessToken @{'Idempotency-Key'="failed-$suffix"} } 'Insufficient stock rejects purchase'
Expect-Status 400 { Call-Api GET '/api/products?size=1000' } 'Invalid page size produces validation error'
$receipt=[ordered]@{verifiedAt=(Get-Date).ToUniversalTime().ToString('o');gateway=$BaseUrl;checks=$script:results;product=$remaining;confirmedOrder=$order;invoice=$invoice;cancelledOrder=$cancelled}
$receipt | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath (Join-Path $projectRoot 'docs\verification.json') -Encoding UTF8
Write-Host "Verified $($script:results.Count) checks. Evidence: docs/verification.json"
} finally {
    # A failed assertion must not leave public verification listings behind.
    if ($product -and $seller) {
        try { Call-Api DELETE "/api/seller/products/$($product.id)" $null $seller.accessToken | Out-Null }
        catch { Write-Warning 'Could not hide the seller verification listing. Deactivate it from its owner account.' }
    }
    if ($createdByAdmin -and $admin) {
        try { Call-Api DELETE "/api/admin/products/$($createdByAdmin.id)" $null $admin.accessToken | Out-Null }
        catch { Write-Warning 'Could not hide the admin verification listing. Deactivate it from My inventory.' }
    }
}
Write-Host 'Verification finished. Test order history is retained. No real payments were made.'
