# Verification

Tests are separated by what they exercise: isolated backend behavior, frontend state and requests, Windows launch scripts, and actual communication with CockroachDB. A passing mocked-client test does not prove a cloud database or another running service is reachable.

## Automated backend checks

Run from the project root:

```powershell
.\scripts\Build.ps1
```

The Maven reactor passed 35 integration tests on 24 October 2026: 6 User, 13 Product, 11 Order and 5 Invoice tests, with no failures or errors. These use isolated H2 databases and Flyway migrations. Coverage includes:

- Registration, password hashing, email/password limits, seller enrollment and dedicated administrator authentication. Paused users cannot renew their session through seller enrollment.
- Exact product ownership for sellers and administrators, initial stock, catalog filtering, stable pagination, local raster upload validation and listing deactivation/reactivation.
- Atomic reservations, insufficient-stock rollback and concurrent stock updates; missing stock and null item inputs return validation errors.
- Persistent checkout identity, interrupted confirmation recovery, buyer ownership, cancellation, stock restoration and structured delivery/payment data.
- Administrator reporting, customer histories, literal search, status filters, account separation and inventory summaries.
- Real HTTP SOAP requests and WSDL retrieval against the test Invoice Service, immutable invoice data, authentication/contract faults and concurrent first-generation retries.
- Correct 4xx responses for unsupported requests, missing uploads and excessive pagination offsets.

Order integration tests mock their remote Product/Invoice clients to reproduce failure cases. Invoice integration tests send actual SOAP HTTP requests to an isolated test application. These checks are not live process-crash or CockroachDB concurrency tests.

## Frontend checks

```powershell
cd frontend
npm test
npm run build
```

The regression scripts execute the actual Angular service/component code with controlled HTTP responses and browser storage. They cover catalog request parameters and failures, account-scoped carts and checkout retries, token expiration, late responses after account changes, quantity/stock limits, frozen checkout payloads and guest welcome behavior. Admin checks cover failed reporting requests, retained customer-directory data, stale search responses, inventory image editing, reusing successful photo uploads after a failed update, listing restoration and mutation cleanup. Product fixtures belong to tests; the application does not substitute them for failed catalog requests.

The final `npm test` run passed all four regression scripts, and the production Angular build completed without errors or warnings (397.91 kB initial bundle). The build checks TypeScript and Angular templates and produces `frontend/dist/frontend/browser`. Guest seller access and the dedicated admin sign-in page were inspected in the browser; the admin sign-in page fits a 390px mobile viewport without horizontal overflow. After connecting the replacement database on 24 October, retrying the Electronics collection displayed its 15 seeded products with photos and no collection error. Authenticated flows were verified through the live API scripts described below; authenticated browser checkout was not repeated during this database switch.

## Windows scripts and Postman

Run the offline launcher checks from the project root:

```powershell
.\scripts\Check-Scripts.ps1
```

The 24 October review checked all PowerShell scripts for parser errors and exercised process bookkeeping with offline process doubles in both Windows PowerShell 5.1 and PowerShell 7:

- First launch and repeated launch without duplicates.
- Recovery when one recorded service is missing.
- Refusal to take over an unrecorded occupied port.
- Rollback of only newly launched processes after a launch/readiness failure.
- Safe handling of stale PIDs, reused Java PIDs and invalid service records.
- State removal after shutdown, early failure if a recorded process exits, and readiness deadlines without recorded processes.

`Backend-Processes.ps1` shares the process validation used by startup, shutdown and build scripts. Check fixtures are stored under ignored `.local/script-checks`. Configuration generation and PostgreSQL JDBC SSL query parameters were also checked with an isolated settings fixture. No live processes were killed and no cloud data was written by these script checks.

The Postman collection was validated for 25 request definitions, JSON bodies, script syntax, empty private credential defaults and bounded pending-order polling. Its admin login uses `/api/auth/admin/login`. It includes reporting, ownership restrictions and listing status changes. Full Collection Runner execution requires running services and private administrator credentials; offline validation does not claim those requests were sent.

## Live system checks

Earlier on 24 October, the previous CockroachDB cluster rejected SQL connections with SQLSTATE `53300`: its monthly Request Unit limit had been reached and the cluster was disabled. Live checkout, catalog and SOAP checks against that cluster could not complete. That is dated evidence about the previous cluster, not a quota diagnosis for a replacement cluster.

The replacement cluster was connected and verified on 24 October 2026. It uses one CockroachDB database, `ecomm`, with service-owned `users`, `products`, `orders`, and `invoices` schemas. All four JDBC URLs target `/ecomm` and select their schema with `currentSchema`. Initialization created the four schemas in the existing database. SQL checks confirmed the current database/schema selection and a separate Flyway history in each schema. All five backend health endpoints returned UP.

The seed script created 75 active products, 15 in each category. Live API verification then passed all 17 smoke assertions and all 11 feature assertions. The smoke test confirms that administrators cannot edit another seller's listing or use customer order history, as required by the current role separation. Read-only admin probes also verified an ADMIN-only session, own inventory totals, five synthetic orders, three synthetic customer records and per-customer order statistics. The administrator had 75 active seeded listings and one inactive smoke-test fixture at that snapshot.

This is a fresh database setup, not a migration: the previous cluster's users, products, orders and invoices were not copied. The administrator bootstrap reused the existing private application credentials. Verification scripts created synthetic users and order history in the replacement database.

After configuring the cluster in private settings, initialize its database and schemas, then run:

```powershell
.\scripts\Initialize-Database.ps1
.\scripts\Start-Backend.ps1
.\scripts\Status-Backend.ps1
.\scripts\Smoke-Test.ps1
.\scripts\Verify-Demo-Features.ps1
```

Both verification scripts create synthetic users and records in the configured database. They deactivate their product fixtures in cleanup; test users, orders, invoices and uploaded photos remain for inspection. They do not collect payment. Run against a development cluster.

The smoke test checks seller enrollment/product creation, role and ownership restrictions, public catalog pagination, authoritative prices, idempotent checkout, stock deduction, order privacy, SOAP-backed invoicing, invoice/cancellation conflicts, exactly-once cancellation stock restoration and validation failures. The feature script checks local image storage/retrieval, generated product codes, structured delivery validation, payment-choice persistence and SOAP address formatting.

## Dated evidence and boundaries

- `verification.json` is the current 24 October 2026 live receipt with 17 passing assertions against the replacement cluster. It includes the current administrator ownership and shopping restrictions and replaces the earlier receipt.
- `demo-verification.json` is the current 24 October 2026 receipt with 11 passing live feature assertions, including image uploads, structured addresses, payment choices and SOAP invoice formatting.
- Live admin checks on 21 October reconciled order/customer/inventory counts and verified admin access to customer orders returns 403. Browser checks then covered admin search, order detail, inventory pagination, the 75-product catalog and the 390px mobile layout.
- The sample catalog contains 75 products, 15 per category. Repeated seeding skips existing SKUs and preserves edited listings and inventory. Product photos are representative locally cached assets with source/license metadata; seller uploads are preserved.
- Carts and unfinished checkout attempts are browser-local. Payments, delivery and email ownership verification are outside this academic implementation. Account pausing prevents new sessions; already issued JWTs expire normally.

For report captures, follow `screenshots/README.md`. Capture current responses and keep all credentials, tokens and service keys outside screenshots.
