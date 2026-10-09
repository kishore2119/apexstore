param([switch]$MetadataOnly)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$destination = Join-Path $root 'frontend/public/images/products'
New-Item -ItemType Directory -Force $destination | Out-Null
# Representative photos for the academic seed catalog. Seller uploads are never replaced.
$queries = @{
    ELE = @('mechanical keyboard', 'wireless computer mouse', 'over ear headphones', 'bluetooth speaker', 'wireless earbuds', 'USB C charger', 'USB C cable', 'power bank', 'laptop stand', 'webcam', 'USB hub', 'smartwatch', 'USB flash drive', 'computer monitor', 'wireless router')
    FAS = @('plain t shirt', 'button down shirt', 'hoodie', 'jeans', 'jogging trousers', 'canvas sneakers', 'walking shoes', 'crossbody bag', 'canvas tote bag', 'woven belt', 'baseball cap', 'scarf', 'socks', 'leather wallet', 'round sunglasses')
    APP = @('electric kettle', 'two slice toaster', 'mixer grinder', 'blender appliance', 'air fryer', 'sandwich toaster', 'rice cooker', 'induction cooker', 'steam iron', 'garment steamer', 'portable electric fan', 'table fan', 'air purifier', 'handheld vacuum cleaner', 'digital kitchen scale')
    HOM = @('desk lamp', 'steel water bottle', 'ceramic coffee mug', 'drinking glasses', 'plastic storage boxes', 'cushion pillow', 'throw blanket', 'round wall clock', 'ceramic flower pot', 'desk organizer', 'wall shelf', 'bath towel', 'food storage containers', 'non stick frying pan', 'laundry basket')
    BOO = @('notebook journal', 'gardening book', 'cookbook', 'java programming book', 'computer programming books', 'programming textbook', 'design book', 'paperback book', 'travel books', 'novel book', 'finance books', 'sketchbook', 'student planner notebook', 'interior design book', 'astronomy book')
}
$jobs = foreach ($group in $queries.Keys) {
    for ($index = 0; $index -lt 15; $index++) {
        [pscustomobject]@{ sku = 'APX-{0}-{1:d3}' -f $group, ($index + 1); query = $queries[$group][$index] }
    }
}
$previousPath = Join-Path $root 'scripts/data/photo-sources.json'
$previous = if (Test-Path $previousPath) { Get-Content $previousPath -Raw | ConvertFrom-Json } else { @() }
$photos = $jobs | ForEach-Object {
    $item = $_
    $dest = $destination
    $existing = $previous | Where-Object { $_.sku -eq $item.sku -and !$_.error } | Select-Object -First 1
    if ($existing) {
        $existingFile = Join-Path $root ('frontend/public' + $existing.imagePath)
        if (!(Test-Path $existingFile) -and !$MetadataOnly) { Invoke-WebRequest $existing.url -OutFile $existingFile -TimeoutSec 40 | Out-Null }
        $existing
        return
    }
    try {
        # Respect Commons API limits; cache successful results between runs.
        Start-Sleep -Seconds 3
        $search = [Uri]::EscapeDataString($item.query + ' filetype:bitmap -drawing -diagram -logo -icon -zoom')
        $endpoint = "https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=$search&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url%7Csize%7Cextmetadata&iiurlwidth=600&format=json"
        $response = $null
        for ($attempt = 0; $attempt -lt 3; $attempt++) {
            try { $response = Invoke-RestMethod $endpoint -TimeoutSec 30; break }
            catch { if ($_.Exception.Message -notmatch '429' -or $attempt -eq 2) { throw }; Start-Sleep -Seconds 30 }
        }
        $candidates = $response.query.pages.PSObject.Properties.Value | Where-Object {
            $_.imageinfo[0].width -ge 300 -and $_.imageinfo[0].height -ge 300 -and
            $_.imageinfo[0].url -match '\.(jpg|jpeg|png)(\?|$)' -and
            $_.title -notmatch '(?i)diagram|drawing|zoom|logo|stamp|map|advert|screenshot|screen shot'
        } | Sort-Object index
        $page = $candidates | Select-Object -First 1
        if (!$page) { throw 'No suitable photograph returned' }
        $info = $page.imageinfo[0]
        $extension = if ($info.url -match '\.png(\?|$)') { 'png' } else { 'jpg' }
        $name = $item.sku.ToLower() + '.' + $extension
        $url = ($info.thumburl -split '\?')[0]
        if (!$MetadataOnly) { Invoke-WebRequest $url -OutFile (Join-Path $dest $name) -TimeoutSec 40 | Out-Null }
        [pscustomobject]@{
            sku = $item.sku; query = $item.query; title = $page.title;
            imagePath = '/images/products/' + $name; source = $info.descriptionurl; url = $url;
            artist = $info.extmetadata.Artist.value; license = $info.extmetadata.LicenseShortName.value;
            licenseUrl = $info.extmetadata.LicenseUrl.value; attribution = $info.extmetadata.Attribution.value
        }
    } catch { [pscustomobject]@{ sku = $item.sku; query = $item.query; error = $_.Exception.Message } }
}
$photos | Sort-Object sku | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $root 'scripts/data/photo-sources.json') -Encoding utf8
$photos | Sort-Object sku | Select-Object sku, title, error | Format-Table -AutoSize
if ($photos.error) { Write-Warning 'Some images need a manual source or retry; see photo-sources.json.' }
