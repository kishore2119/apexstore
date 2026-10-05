# E-Commerce Product & Order Management

Academic Project 3 for API & Microservices. Java/Spring microservices with an Angular storefront, customer checkout, seller listings, and an admin portal.

## Applications

| Application | Port | Database | Responsibility |
|---|---:|---|---|
| API Gateway | 8080 | none | Public routing and Angular CORS |
| User Service | 8081 | users_db | Registration, login, customer/seller/admin roles |
| Product Service | 8082 | products_db | Listings, ownership, pagination, sorting, inventory |
| Order Service | 8083 | orders_db | Checkout, durable recovery, cancellation, invoice requests |
| Invoice Service | 8084 | invoices_db | SOAP invoice creation and immutable snapshots |

All four databases use the same CockroachDB cluster. `common` is a library for security, errors, transaction retries, logging and API contracts; it is not a deployed service and contains no shared persistence entities.

## Run on Windows

Prerequisites: JDK 21–25, Maven 3.9+, Node.js 22.22.3+, 24.15.0+, or 26+, and access to the CockroachDB cluster. Tested Java environment: JDK 25. Source targets Java 21. Use a Node version matching Angular CLI's supported engines.

```powershell
# Run from this project directory.
.\scripts\Build.ps1
# One-time setup; prompts for your database password.
.\scripts\Configure-Local.ps1
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

This imports 75 products: 15 each in Electronics, Fashion, Appliances, Home, and Books. Each has a price, stock, description, and a local SVG illustration served by Angular. Existing SKUs are skipped, preserving stock and edits on repeated runs. To seed for a different frontend address, pass `-FrontendUrl 'http://your-frontend-address'`.

```powershell
.\scripts\Smoke-Test.ps1  # Creates demo users/products/orders and verifies the live system
.\scripts\Stop-Backend.ps1
```

Logs and process IDs are saved under `.local/`. The stop script checks process ID, process name and launch time before stopping a service. Startup waits for all five health endpoints. Repeating the start command shows the existing service status. `Build.ps1` stops recorded running services before replacing their JARs and restarts them after a successful build. To restart manually, run `.\scripts\Start-Backend.ps1 -Restart`.

## Configuration

The scripts load `.env` into process environment variables. For another host, supply `DB_USERNAME`, `DB_PASSWORD`, `USER_DB_URL`, `PRODUCT_DB_URL`, `ORDER_DB_URL`, `INVOICE_DB_URL`, `JWT_SECRET` and `INTERNAL_API_KEY`. Secrets must be at least 32 characters. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` for initial admin provisioning. Service URL variables and `FRONTEND_ORIGIN` are optional.

JDBC connections use `sslmode=verify-full`. The launcher selects `org.postgresql.ssl.DefaultJavaSSLFactory` so Java's trusted CA store verifies the server certificate. Keep the same SSL settings when launching jars directly. Production secrets should be supplied by an external secret store rather than a local file.

Flyway applies versioned schemas on startup; Hibernate validates them. H2 is used only by automated integration tests. The live smoke test validates the real CockroachDB/JDBC path and communication between separate applications.

## Features and boundaries

- Customers register and purchase. Sellers enable selling on their own account and receive a fresh token containing their new role.
- Admins manage any product. Sellers manage only their own listings. Creation accepts optional `stockOnHand`, saved atomically with the listing; it defaults to zero. The stock endpoint updates inventory afterward.
- Catalog search, category, price, availability, sorting, and pagination run on the backend. Order status filters apply across the full buyer history.
- Product codes are generated automatically when a seller leaves the SKU out. Sellers/admins choose a JPG or PNG file (up to 5 MB) instead of entering an image URL. Image pixels are stored locally in `.local/uploads/products`; only the file path is stored with the database listing. Uploaded images are public product photos, served through the gateway. Preserve this directory when moving the demo to another computer. Existing catalog image URLs remain supported by the API.
- Checkout collects address line 1, optional line 2, city, state, six-digit Indian pincode, ten-digit mobile number, and country (India for this demo). These fields are stored with the order; the SOAP invoice receives their formatted address.
- Payment choices are cash on delivery or online payment **simulations**. The choice is saved and displayed in order history, with status `DEMO_NOT_COLLECTED`. There is no payment provider, no card/UPI collection, and no actual payment or delivery.
- Deleting a product deactivates it; old orders and invoices remain valid.
- Checkout requires an `Idempotency-Key`. A temporarily interrupted order returns `202 PENDING` and is recovered in the background. Poll its location to obtain the final status.
- Cancellation restores stock exactly once. It is disallowed once invoice generation starts, including during an invoice-service outage. Retry invoice generation to finish it.
- Invoices are consolidated academic order bills generated through SOAP and returned to clients as JSON. No PDF, tax calculation, credit note or statutory seller-invoice workflow is included.
- JWTs expire after 30 minutes; the frontend clears expired sessions. Interrupted checkout retains its request key and frozen payload in session storage, so reopening and retrying cannot create a second purchase. Logout is client-side token removal. Tokens are not immediately revocable in this academic implementation.
- Internal stock and SOAP routes require a service key and have no gateway route. Business services independently enforce JWT roles and ownership.
- There is no Eureka/Kafka dependency. Services use configurable URLs and a persisted recovery worker.
- The supplied database login is currently shared across the four application databases. Logical service ownership is implemented in code; separate database logins would provide stronger database-level isolation for a production deployment.

## Documentation and verification

- [System design and entity relationships](docs/architecture.md)
- [API guide and examples](docs/api.md)
- [Requirement coverage](docs/requirements.md)
- [Verification details and limits](docs/testing.md)
- [Postman collection](postman/ecom-backend.postman_collection.json)
- [Live verification results](docs/verification.json) (generated by the smoke test)

The backend, frontend build, frontend regression checks, and live API flows are verified. See [verification details](docs/testing.md). For the academic report's Postman/SoapUI captures, use the [capture checklist](docs/screenshots/README.md).

`Build.ps1` runs integration tests for registration, authorization, catalog filters, stock concurrency and rollback, order idempotency and recovery, cancellation, and real SOAP requests. `Smoke-Test.ps1` creates verification users/orders and hides its two product fixtures from public browsing after successful checks.

```powershell
cd frontend
npm test               # Service, cart, session, and checkout retry regression checks
npm run build          # Production build
```
