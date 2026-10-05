# Demonstration catalog

`catalog.json` contains 75 sample products: 15 each in Electronics, Fashion, Appliances, Home, and Books. Names, descriptions, INR prices, and inventory are demonstration data. The SVG files in `frontend/public/images/catalog` are illustrations drawn for this project, rather than photographs of real merchandise.

Run `scripts/Seed-Catalog.ps1` with the backend running. The script logs in using the private local administrator settings and creates products through the public admin API, including their initial inventory in the same transaction. It skips an existing SKU, preserving edits, deactivations, and stock already used by orders. It does not delete existing records. Its run report is stored privately in `.local/catalog-seed.json`.

The image links default to `http://localhost:4200`. Supply `-FrontendUrl` when using a different frontend address. For a different database configuration, use the normal local configuration scripts first.
