# Verification record

Verified on 5 October 2026 using the local Java applications, Angular frontend, and the connected CockroachDB 26.2 cluster.

## Automated integration tests

23 tests passed with zero failures or errors:

| Service | Tests | Main scenarios |
|---|---:|---|
| User | 3 | Password hashing, registration cannot grant admin, login, seller role, unauthorized profile, dedicated admin ID/password login |
| Product | 9 | Idempotent reservations, atomic rollback, concurrent purchases, ownership/admin restrictions, atomic initial stock, full-catalog filtering, generated product codes, local raster upload and public retrieval, fake-file rejection |
| Invoice | 3 | Real HTTP SOAP request, stable invoice identity, WSDL, internal authentication, SOAP validation faults |
| Order | 8 | Checkout idempotency, interrupted confirmation recovery, cancellation, buyer ownership, cached invoice, invoice outage, status filtering before pagination, structured delivery details and demo payment persistence |

These tests use isolated H2 databases with the versioned schema migrations. Order tests simulate remote failures using mocked clients; they are not a claim of live process-crash testing.

## Live CockroachDB verification

All five applications reported UP through their health endpoints. `scripts/Smoke-Test.ps1` passed 16 live assertions through the API Gateway:

- Seller registration and seller enablement.
- Seller creates product and sets inventory.
- Seller cannot use admin product creation.
- Customer cannot modify a seller listing.
- Public pagination and sorting.
- Admin creates a product and edits a seller's product.
- Checkout confirms and calculates prices on the server.
- Repeated checkout returns the same order.
- Stock is deducted once.
- Another user cannot read the buyer's order.
- REST invoice request calls the live SOAP service and repeated generation returns one invoice.
- Invoice generation protects against cancellation.
- Cancellation restores stock once.
- Insufficient stock rejects the order.
- Invalid page size is rejected.

The actual IDs, order data, invoice data and timestamp are in `verification.json`. Verification users, orders, and invoices remain in the application databases. The four known verification products from this and the earlier run were soft-deactivated, preserving their history. Successful future smoke tests deactivate their own two product fixtures. No payment provider was used.

## Frontend and sample catalog

`npm run build` passed. Routes load lazily; the initial production bundle is about 374 kB (99 kB estimated transfer).

`npm test` passed checks against the actual Angular service/component code for:

- Seller/admin pagination, empty results, and error propagation without fabricated products.
- Malformed stored carts, stock and quantity bounds, the 50-item limit, decimal totals, live price refresh, and unavailable products.
- Expired or malformed tokens clearing the authenticated session.
- Interrupted checkout surviving modal recreation and retaining the same key and payload even when the cart changes; confirmed checkout clears the cart.
- Structured delivery details, optional address line 2, and the demo payment choice remaining frozen during checkout retries.

These are focused regression checks using injected mocks where HTTP is needed; the live smoke test covers actual service/database interactions.

The sample import created 75 listings with initial stock and local illustrations, 15 in each of the five categories. A second import created zero duplicates and skipped all 75 existing SKUs. The detailed import report is private at `.local/catalog-seed.json`.

Browser checks confirmed category/price filtering, the second catalog page, product details, and adding/removing a verification item in the bag. An intermittent CockroachDB connection timeout occurred during the final browser pass; all four database services recovered automatically, and retrying the catalog returned all 75 products. The app still depends on a reachable cloud database.

## Demo feature verification

`scripts/Verify-Demo-Features.ps1` passed 11 live checks on the rebuilt services: dedicated admin login, customer upload denial, photo storage on local disk, public photo retrieval, generated product codes, pincode validation, online/COD demo order persistence, unchanged checkout replay, rejection of changed payment methods under an existing key, and SOAP invoice formatting. Evidence is in `demo-verification.json`. Its fixture product is deactivated after testing, preserving the 75-product public catalog.

The dedicated admin login and seller product form were inspected in the browser. Browser file selection was declined, so the photo picker test was stopped; local image upload and retrieval were verified by the earlier backend and live API checks.

## Compatibility fixes verified

- Java JDBC uses its trusted CA store with `sslmode=verify-full`; encryption and hostname verification remain enabled.
- Flyway 13.9.0's dedicated CockroachDB adapter replaces the older adapter that queried restricted internal tables. No `allow_unsafe_internals` setting was enabled. Flyway reports that CockroachDB 26.2 is newer than its latest verified version 26.1; the actual migrations and application operations passed on this cluster.
- Integer schema columns use INT4 to match Java integer fields on CockroachDB. Money totals use DECIMAL(24,2) to accommodate multi-item orders without floating-point arithmetic.
- The Windows launcher uses the actual JDK executable and records process launch times for safe shutdown.

## Remaining submission work

See `screenshots/README.md` for the specific Postman/SoapUI captures needed for the academic report.
