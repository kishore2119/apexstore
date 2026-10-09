# Demonstration catalog

`catalog.json` contains 75 sample products: 15 each in Electronics, Fashion, Appliances, Home, and Books. Names, descriptions, INR prices, and inventory are demonstration data. Real representative product photos are cached in `frontend/public/images/products`; sources and license details are in `photo-sources.json` and the storefront's Photo credits page. Old seed SVG URLs are mapped to these photos in the frontend, preserving existing product records and seller uploads.

Run `scripts/Seed-Catalog.ps1` with the backend running. The script logs in using the private local administrator settings and creates products through the public admin API, including their initial inventory in the same transaction. It skips an existing SKU, preserving edits, deactivations, and stock already used by orders. It does not delete existing records. Its run report is stored privately in `.local/catalog-seed.json`.

The image links default to `http://localhost:4200`. Supply `-FrontendUrl` when using a different frontend address. For a different database configuration, use the normal local configuration scripts first.

`scripts/Refresh-Catalog-Photos.ps1` restores missing photo files from their saved source URLs, respecting the photo providers' rate limits. `scripts/Build-Photo-Manifest.ps1` rebuilds the frontend mapping and public credit page. Browsing does not call those photo APIs; it uses the cached images and the existing Spring product API.
