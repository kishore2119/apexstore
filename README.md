# E-Commerce Product & Order Management

Academic Project 3 for API & Microservices. Java/Spring microservices with an Angular storefront, customer checkout, seller listings, and an admin portal.

## Applications

| Application | Port | Database / schema | Responsibility |
|---|---:|---|---|
| API Gateway | 8080 | none | Public routing and Angular CORS |
| User Service | 8081 | ecomm / users | Registration, login, customer/seller/admin roles |
| Product Service | 8082 | ecomm / products | Listings, ownership, pagination, sorting, inventory |
| Order Service | 8083 | ecomm / orders | Checkout, durable recovery, cancellation, invoice requests |
| Invoice Service | 8084 | ecomm / invoices | SOAP invoice creation and immutable snapshots |

The four business services use separate schemas in the single CockroachDB database `ecomm`. Each owns its tables and Flyway migration history and accesses other services through REST or SOAP rather than cross-schema queries. `common` is a library for security, errors, transaction retries, logging and API contracts; it is not a deployed service and contains no shared persistence entities.

## Run on Windows

Prerequisites: JDK 21–25, Maven 3.9+, Node.js 22.22.3+, 24.15.0+, or 26+, and access to a CockroachDB cluster. Tested Java environment: JDK 25. Source targets Java 21. Use a Node version matching Angular CLI's supported engines.

```powershell
# Run from this project directory.
.\scripts\Build.ps1
# One-time setup; prompts for your database password.
.\scripts\Configure-Local.ps1 -DatabaseHost 'YOUR_CLUSTER_HOST' -DatabaseUser 'YOUR_SQL_USER' -DatabaseName 'ecomm'
.\scripts\Initialize-Database.ps1
.\scripts\Start-Backend.ps1
.\scripts\Status-Backend.ps1
```

When `.env` already exists, skip configuration. The generated administrator email and password are in that private file. Database credentials, JWT signing key and service credentials are never committed. The default admin email is `admin@ecom.local`; the password is randomly generated. Admin bootstrap creates an account only when that email does not already exist.

The gateway is **http://localhost:8080**. Send JSON requests to `/api/...`. The Angular storefront runs at **http://localhost:4200**, with `/seller`, `/admin`, `/cart`, and `/orders` pages. Backend role and ownership checks protect the seller/admin APIs.

Open **http://localhost:4200/admin** for the dedicated administrator login. The default admin ID is `ECOM-ADMIN` (override with `ADMIN_LOGIN_ID` in `.env`); use the existing private `ADMIN_PASSWORD`. This signs in the admin account configured by `ADMIN_EMAIL`. Customers and sellers cannot grant themselves admin access.

In another terminal:

```powershell
cd frontend
npm ci                 # First setup, or after dependency changes
npm start
```

From the project root, populate the sample catalog after starting the backend:

```powershell
.\scripts\Seed-Catalog.ps1
```

This imports 75 products: 15 each in Electronics, Fashion, Appliances, Home, and Books. Each has a price, stock, description, and a local representative product photo served by Angular. Existing SKUs are skipped, preserving stock and edits on repeated runs; legacy seed artwork is replaced by the frontend photo mapping. Source/license details are linked from the storefront's Photo credits page. To seed for a different frontend address, pass `-FrontendUrl 'http://your-frontend-address'`.

```powershell
.\scripts\Smoke-Test.ps1  # Creates demo users/products/orders and verifies the live system
.\scripts\Stop-Backend.ps1
```

Logs and process IDs are saved under `.local/`. The stop script checks process ID, process name and launch time before stopping a service and removes stale records. Startup waits for all five health endpoints. Repeating the start command keeps existing processes and starts any missing services. If a launch fails, it stops only processes launched by that invocation; pre-existing services are retained. A port occupied by an unrecorded process is reported rather than forcibly cleared. `Build.ps1` stops recorded running services before replacing their JARs and restarts them after a successful build. To restart manually, run `.\scripts\Start-Backend.ps1 -Restart`.

## Configuration

The scripts load `.env` into process environment variables. For another host, supply `DATABASE_HOST`, `DATABASE_NAME=ecomm`, `DB_USERNAME`, `DB_PASSWORD`, `USER_DB_URL`, `PRODUCT_DB_URL`, `ORDER_DB_URL`, `INVOICE_DB_URL`, `JWT_SECRET` and `INTERNAL_API_KEY`. All four JDBC URLs connect to `/ecomm`, with `currentSchema=users`, `currentSchema=products`, `currentSchema=orders`, or `currentSchema=invoices` respectively. For example, User Service uses `jdbc:postgresql://YOUR_CLUSTER_HOST:26257/ecomm?sslmode=verify-full&currentSchema=users`.

`Initialize-Database.ps1` creates `ecomm` if needed and its four service schemas. The SQL user needs permission to create the database and schemas. Optional `DATABASE_SETUP_URL` controls the initialization connection to `defaultdb`; when absent, initialization uses `DATABASE_HOST:26257/defaultdb` with Cloud TLS settings. Older configurations without `DATABASE_NAME` retain the separate `users_db`, `products_db`, `orders_db`, and `invoices_db` initialization path. Switching database settings does not migrate existing users, orders or invoices.

The JWT signing secret and internal service key must each be at least 32 characters. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` for initial admin provisioning. Service URL variables and `FRONTEND_ORIGIN` are optional.

JDBC connections use `sslmode=verify-full`. For Cloud connections, the launcher selects `org.postgresql.ssl.DefaultJavaSSLFactory` so Java's trusted CA store verifies the server certificate. An explicit `sslfactory` or `sslrootcert` is preserved. Keep the same SSL settings when launching jars directly. Production secrets should be supplied by an external secret store rather than a local file.

Flyway applies versioned schemas on startup; Hibernate validates them. H2 is used only by automated integration tests. The live smoke test validates the real CockroachDB/JDBC path and communication between separate applications.

If Cloud startup logs report SQLSTATE `53300` together with “monthly Request Unit limit” and a disabled cluster, CockroachDB has blocked that Cloud cluster until its allowance is restored. Restore the cluster or configure a replacement; restarting Java cannot remove a Cloud quota block. Isolated H2 tests can still pass while the configured database is unavailable.

## Features and boundaries

- Customers register and purchase. Sellers enable selling on their own account and receive a fresh token containing their new role.
- Admins have a separate management account and cannot shop or use customer checkout. Admins and sellers manage only products they own. Creation accepts optional `stockOnHand`, saved atomically with the listing; it defaults to zero. The stock endpoint updates inventory afterward.
- Catalog search, category, price, availability, sorting, and pagination run on the backend. Order status filters apply across the full buyer history.
- Product codes are generated automatically when a seller leaves the SKU out. Sellers/admins choose a JPG or PNG file (up to 5 MB) instead of entering an image URL. Image pixels are stored locally in `.local/uploads/products`; only the file path is stored with the database listing. Uploaded images are public product photos, served through the gateway. Preserve this directory when moving the demo to another computer. Existing catalog image URLs remain supported by the API.
- Checkout collects address line 1, optional line 2, city, state, six-digit Indian pincode, ten-digit mobile number, and country (India for this demo). These fields are stored with the order; the SOAP invoice receives their formatted address.
- Payment choices are cash on delivery or online payment **simulations**. The choice is saved and displayed in order history, with status `DEMO_NOT_COLLECTED`. There is no payment provider, no card/UPI collection, and no actual payment or delivery.
- Deleting a product deactivates it; old orders and invoices remain valid. Its owner can reactivate it from inventory, preserving the same code, stock and history.
- Checkout requires an `Idempotency-Key`. A temporarily interrupted order returns `202 PENDING` and is recovered in the background. Poll its location to obtain the final status.
- Cancellation restores stock exactly once. It is disallowed once invoice generation starts, including during an invoice-service outage. Retry invoice generation to finish it.
- Invoices are consolidated academic order bills generated through SOAP and returned to clients as JSON. No PDF, tax calculation, credit note or statutory seller-invoice workflow is included.
- JWTs expire after 30 minutes; the frontend clears expired sessions. Interrupted checkout retains its request key and frozen payload in session storage, so reopening and retrying cannot create a second purchase. Logout is client-side token removal. Tokens are not immediately revocable in this academic implementation.
- Internal stock and SOAP routes require a service key and have no gateway route. Business services independently enforce JWT roles and ownership.
- There is no Eureka/Kafka dependency. Services use configurable URLs and a persisted recovery worker.
- The supplied database login is currently shared across the four service schemas in `ecomm`. Logical service ownership is implemented in code; separate database logins with grants limited to each schema would provide stronger database-level isolation for a production deployment.

## Documentation and verification

- [System design and entity relationships](docs/architecture.md)
- [API guide and examples](docs/api.md)
- [Requirement coverage](docs/requirements.md)
- [Verification details and limits](docs/testing.md)
- [Postman collection](postman/ecom-backend.postman_collection.json)
- [Live verification results](docs/verification.json) (17 passing assertions, 24 October 2026)
- [Live upload and checkout feature results](docs/demo-verification.json) (11 passing assertions, 24 October 2026)

See [verification details](docs/testing.md) for test scope and the dates of live API evidence. For the academic report's Postman/SoapUI captures, use the [capture checklist](docs/screenshots/README.md). The Postman collection uses the dedicated admin login and includes reporting, ownership checks and product reactivation. It creates synthetic records; use a development database.

The replacement CockroachDB connection was verified on 24 October 2026: all five backend health endpoints returned UP, the four service schemas each had their own Flyway history in `ecomm`, and the public catalog contained 75 active seeded products after verification cleanup. The previous cluster's account and order history was not migrated; the new database contains the seeded catalog and synthetic verification records.

`Build.ps1` runs integration tests for registration, authorization, catalog filters, stock concurrency and rollback, order idempotency and recovery, cancellation, and real SOAP requests. `Smoke-Test.ps1` creates verification users/orders and attempts to deactivate its product fixtures during cleanup, including when an assertion fails.

Run `.\scripts\Check-Scripts.ps1` for offline Windows launcher checks. These use isolated process doubles and do not start or stop real backend processes.

```powershell
cd frontend
npm test               # Service, cart, session, and checkout retry regression checks
npm run build          # Production build
```


## Admin workspace

Open `http://localhost:4200/admin` and sign in with the configured admin ID and password. The workspace has order totals and confirmed order value, customer/seller counts, inventory alerts for the admin’s own listings, recent orders, customer name/email search, per-customer history, order search/status filters, order line and delivery details, CSV export of the displayed order page, and a read-only marketplace catalogue. “My inventory” manages only products created by this admin. Customer accounts handle shopping separately.

Pausing a customer’s sign-in blocks new logins. Existing JWTs expire normally within 30 minutes. Registration validates email format and requires 8–64 password characters (at most 72 UTF-8 bytes). Email format checks do not verify ownership of an inbox.


Customer carts are saved separately per account in this browser. Logging out switches to a separate guest cart, and signing back in restores that account’s saved items. Guest selections transfer into a customer cart on sign-in, subject to stock and cart limits. Admin sessions have no shopping cart. The old shared `ecom_cart` entry is ignored because its owner cannot be determined. Carts currently remain local to this browser rather than syncing between devices.
