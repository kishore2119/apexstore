$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$sources = Get-Content (Join-Path $root 'scripts/data/photo-sources.json') -Raw | ConvertFrom-Json
$rows = @('export const CATALOG_PHOTOS: Readonly<Record<string, string>> = {')
$credits = @()
foreach ($photo in ($sources | Sort-Object sku)) {
    if ($photo.error) { continue }
    $rows += "  '$($photo.sku)': '$($photo.imagePath)',"
    $artist = if ($photo.artist) { [Net.WebUtility]::HtmlEncode(($photo.artist -replace '<[^>]+>', '')) } else { 'Creator not listed in API metadata; see original source.' }
    $title = [Net.WebUtility]::HtmlEncode($photo.title)
    $license = [Net.WebUtility]::HtmlEncode($photo.license)
    $source = [Net.WebUtility]::HtmlEncode($photo.source)
    $credits += "<article><img src='$($photo.imagePath)' alt='' loading='lazy'><div><strong>$($photo.sku)</strong><p>$title</p><p>$artist</p><p>$license · <a href='$source'>Original source and license</a></p></div></article>"
}
$rows += '};'
$rows | Set-Content (Join-Path $root 'frontend/src/app/config/catalog-photos.ts') -Encoding utf8
$html = @"
<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ApexMart photo credits</title><style>body{font:14px/1.6 system-ui;background:#f3f5fa;color:#243149;max-width:1000px;margin:auto;padding:30px}a{color:#245be0}article{display:flex;gap:22px;padding:20px;margin:16px 0;background:white;border-radius:10px}img{width:110px;height:110px;object-fit:contain}p{margin:4px 0;overflow-wrap:anywhere}h1{font-size:30px}</style><a href="/">← Back to ApexMart</a><h1>Photo credits</h1><p>Representative product photography for the academic sample catalog, sourced from Wikimedia Commons and the DummyJSON sample catalog. Sample product names and specifications are illustrative. Seller-uploaded images are supplied by the seller. Photos are cached locally; original sources and license details are linked below. Images have not been edited; the layout uses CSS to fit them into cards.</p>$($credits -join "`n")</html>
"@
Set-Content (Join-Path $root 'frontend/public/photo-credits.html') $html -Encoding utf8
Write-Host "$($credits.Count) photo credits and image mappings generated."

