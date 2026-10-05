param([string]$BaseUrl='http://localhost:8080')
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Load-Settings.ps1')
& (Join-Path $PSScriptRoot 'Wait-Backend.ps1')
$checks=@()
$fixture=$null
$adminToken=$null
function Call-Demo([string]$Method,[string]$Path,$Body=$null,[string]$Token=$null,[string]$Key=$null) {
    $arguments=@{Method=$Method;Uri=($BaseUrl+$Path);TimeoutSec=60;Headers=@{}}
    if($Token) { $arguments.Headers.Authorization="Bearer $Token" }
    if($Key) { $arguments.Headers['Idempotency-Key']=$Key }
    if($null -ne $Body) { $arguments.ContentType='application/json'; $arguments.Body=[System.Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 10 -Compress)) }
    Invoke-RestMethod @arguments
}
function Check-Demo([string]$Name,[bool]$Passed) {
    if(-not $Passed) { throw "Failed check: $Name" }
    $script:checks+=@{check=$Name;passed=$true}; Write-Host "PASS: $Name"
}
function Reject-Demo([scriptblock]$Action,[int]$Status) {
    try { & $Action | Out-Null; return $false } catch { return [int]$_.Exception.Response.StatusCode -eq $Status }
}
try {
    $adminId=if($settings.ADMIN_LOGIN_ID) { $settings.ADMIN_LOGIN_ID } else { 'ECOM-ADMIN' }
    $admin=Call-Demo POST '/api/auth/admin/login' @{adminId=$adminId;password=$settings.ADMIN_PASSWORD}
    $adminToken=$admin.accessToken
    Check-Demo 'Dedicated admin ID/password login returns ADMIN' ($admin.user.roles -contains 'ADMIN')
    $tag=[guid]::NewGuid().ToString('N').Substring(0,12)
    $account=Call-Demo POST '/api/auth/register' @{name='Demo Feature Tester';email="demo-features-$tag@example.test";password="demo-test-$tag-password"}
    Check-Demo 'Customer cannot upload seller photos' (Reject-Demo { Call-Demo POST '/api/seller/products/images' @{} $account.accessToken } 403)
    $seller=Call-Demo POST '/api/users/me/seller' @{} $account.accessToken
    Add-Type -AssemblyName System.Net.Http
    $client=[System.Net.Http.HttpClient]::new()
    $client.Timeout=[TimeSpan]::FromSeconds(60)
    $client.DefaultRequestHeaders.Authorization=[System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer',$seller.accessToken)
    $multipart=[System.Net.Http.MultipartFormDataContent]::new()
    $bytes=[System.IO.File]::ReadAllBytes((Join-Path $projectRoot 'frontend\public\images\space.jpg'))
    $content=[System.Net.Http.ByteArrayContent]::new($bytes)
    $content.Headers.ContentType=[System.Net.Http.Headers.MediaTypeHeaderValue]::new('image/jpeg')
    $multipart.Add($content,'file','demo-photo.jpg')
    try {
        $response=$client.PostAsync(($BaseUrl+'/api/seller/products/images'),$multipart).GetAwaiter().GetResult()
        if(-not $response.IsSuccessStatusCode) { throw "Photo upload returned HTTP $([int]$response.StatusCode)" }
        $image=$response.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json
    } finally { $multipart.Dispose(); $client.Dispose() }
    $fileName=Split-Path $image.imageUrl -Leaf
    Check-Demo 'Uploaded photo is stored locally, outside the database' (Test-Path -LiteralPath (Join-Path $projectRoot ".local\uploads\products\$fileName"))
    $publicImage=Invoke-WebRequest -Uri ($BaseUrl+$image.imageUrl) -TimeoutSec 30 -UseBasicParsing
    Check-Demo 'Uploaded photo is publicly served through the gateway' ($publicImage.StatusCode -eq 200 -and $publicImage.Headers['Content-Type'] -match 'image/jpeg')
    $fixture=Call-Demo POST '/api/seller/products' @{name='Local photo verification fixture';description='Created by the demo feature verification script';category='Home';price=99.50;stockOnHand=5;imageUrl=$image.imageUrl} $seller.accessToken
    Check-Demo 'Seller listing generates its product code automatically' ($fixture.sku -match '^PRD-' -and $fixture.availableStock -eq 5)
    $address=@{line1='12 Demo Street';line2='';city='Kakinada';state='Andhra Pradesh';pincode='533001';country='India';phone='9000000000'}
    $payload=@{customerName='Demo Feature Tester';customerEmail=$account.user.email;address='Formatted on the server';deliveryAddress=$address;paymentMethod='ONLINE_DEMO';items=@(@{productId=$fixture.id;quantity=1})}
    $invalid=$payload.Clone(); $invalid.deliveryAddress=$address.Clone(); $invalid.deliveryAddress.pincode='123'
    Check-Demo 'Invalid pincode is rejected before order placement' (Reject-Demo { Call-Demo POST '/api/orders' $invalid $seller.accessToken "bad-$tag" } 400)
    $online=Call-Demo POST '/api/orders' $payload $seller.accessToken "online-$tag"
    Check-Demo 'Online demo saves address fields and does not collect payment' ($online.status -eq 'CONFIRMED' -and $online.deliveryAddress.city -eq 'Kakinada' -and $online.deliveryAddress.line2 -eq '' -and $online.paymentMethod -eq 'ONLINE_DEMO' -and $online.paymentStatus -eq 'DEMO_NOT_COLLECTED')
    $retry=Call-Demo POST '/api/orders' $payload $seller.accessToken "online-$tag"
    Check-Demo 'Retry of structured checkout returns the same order' ($retry.id -eq $online.id)
    $payload.paymentMethod='COD'
    Check-Demo 'Changing payment method under the same key is rejected' (Reject-Demo { Call-Demo POST '/api/orders' $payload $seller.accessToken "online-$tag" } 409)
    $cod=Call-Demo POST '/api/orders' $payload $seller.accessToken "cod-$tag"
    Check-Demo 'COD demo saves its method without collecting payment' ($cod.status -eq 'CONFIRMED' -and $cod.paymentMethod -eq 'COD' -and $cod.paymentStatus -eq 'DEMO_NOT_COLLECTED')
    $invoice=Call-Demo POST "/api/orders/$($online.id)/invoice" @{} $seller.accessToken
    Check-Demo 'SOAP invoice includes the formatted structured address' ($invoice.address -match 'Kakinada' -and $invoice.address -match '533001')
    $report=@{verifiedAt=(Get-Date).ToUniversalTime().ToString('o');checks=$checks;productId=$fixture.id;onlineOrderId=$online.id;codOrderId=$cod.id;imagePath=$image.imageUrl}
    $report | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $projectRoot 'docs\demo-verification.json') -Encoding UTF8
    Write-Host "Verified $($checks.Count) demo feature checks."
} finally {
    if($fixture -and $adminToken) { Call-Demo DELETE "/api/admin/products/$($fixture.id)" $null $adminToken | Out-Null; Write-Host 'Verification product hidden from the public catalog; test order history retained.' }
}
