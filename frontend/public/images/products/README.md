# Product photos

The academic catalog uses representative real product photography from Wikimedia Commons and the DummyJSON sample catalog, cached in `images/products/` so the storefront does not depend on an image API during browsing. These photographs illustrate generic sample listings; seller uploads retain their own images.

`scripts/data/photo-sources.json` records each file, photographer, source and license. The public `/photo-credits.html` page contains attributions and original-source links. `scripts/Build-Photo-Manifest.ps1` regenerates that page and the frontend image mapping. Images are displayed with CSS containment without editing the source files.

The mapping replaces only the original seed SVG URLs. Product prices, availability, IDs, and transactions still come from the Spring backend.

