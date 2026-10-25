# ApexMart frontend

Angular storefront and separate seller/admin workspaces for the E-Commerce Product & Order Management project. The application reads product, account and order data through the Spring gateway; failed requests display a retry state rather than fabricated records.

## Run locally

Start the backend from the project root, then:

```powershell
cd frontend
npm ci
npm start
```

Open `http://localhost:4200`. The gateway defaults to `http://localhost:8080`; API configuration is in `src/app/config/api.config.ts`. Open `/admin` for the dedicated administrator ID/password login. Use a normal customer account to shop and `/seller` to enable selling and manage that account's products.

## Customer and management flows

- Product search, category/price/availability filters, sorting and pagination use backend queries. Homepage collections show the five seeded categories with locally cached representative photography; photo credits are available from the footer.
- Customer carts are separate for each account in this browser. Logout switches to the guest cart; signing back in restores the account cart. Guest selections merge on customer sign-in within stock and cart limits. Carts do not sync across devices.
- Checkout validates the structured Indian delivery address and records cash on delivery or an online payment selection. No money is collected. Interrupted checkout retains its idempotency key and payload for a safe retry.
- Customers view their own order history, cancel eligible orders and request the SOAP-backed invoice. Administrators cannot use the shopping routes or customer order APIs.
- Sellers and administrators upload local JPG/PNG product photos and manage only their own listings. Inactive products stay in inventory and can be reactivated.
- The admin workspace provides order summaries and details, customer search and order histories, sign-in controls, inventory alerts, CSV export of the displayed order page and a read-only marketplace catalogue.

## Build and verification

```powershell
npm test
npm run build
```

`npm test` runs focused regression checks against the actual Angular services/components with mocked HTTP and browser storage. They cover catalog requests, account and cart boundaries, checkout retries, session handling and storefront behavior. They are not a substitute for live service/database verification. See [project verification](../docs/testing.md) for current evidence and limitations.

Production output is `dist/frontend/browser`. Product photography metadata is documented in `public/images/products/README.md`; older category assets and the local font license are documented in `public/images/ASSETS.md`. Seller uploads are served by Product Service and are not part of the frontend build.
