# E-Commerce Product & Order Management backend

Academic Project 3 for API & Microservices. Java/Spring backend only; Angular can consume the APIs later.

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

Prerequisites: JDK 21–25, Maven 3.9+, and access to the CockroachDB cluster. Tested environment: JDK 25. Source targets Java 21.

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

The gateway is **http://localhost:8080**. It is an API, so `/` and `/admin` do not serve pages. A future Angular app owns the `/admin` page. Send JSON requests to `/api/...`.

```powershell
.\scripts\Smoke-Test.ps1  # Creates demo users/products/orders and verifies the live system
.\scripts\Stop-Backend.ps1
```

Logs and process IDs are saved under `.local/`. The stop script checks process ID, process name and launch time before stopping a service. Start the applications once; do not start a second instance on the same ports.

## Configuration

The scripts load `.env` into process environment variables. For another host, supply `DB_USERNAME`, `DB_PASSWORD`, `USER_DB_URL`, `PRODUCT_DB_URL`, `ORDER_DB_URL`, `INVOICE_DB_URL`, `JWT_SECRET` and `INTERNAL_API_KEY`. Secrets must be at least 32 characters. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` for initial admin provisioning. Service URL variables and `FRONTEND_ORIGIN` are optional.

JDBC connections use `sslmode=verify-full`. The launcher selects `org.postgresql.ssl.DefaultJavaSSLFactory` so Java's trusted CA store verifies the server certificate. Keep the same SSL settings when launching jars directly. Production secrets should be supplied by an external secret store rather than a local file.

Flyway applies versioned schemas on startup; Hibernate validates them. H2 is used only by automated integration tests. The live smoke test validates the real CockroachDB/JDBC path and communication between separate applications.

## Features and boundaries

- Customers register and purchase. Sellers enable selling on their own account and receive a fresh token containing their new role.
- Admins manage any product. Sellers manage only their own listings. A listing starts with zero stock; use the stock endpoint to set inventory.
- Products use image URLs, INR currency, and decimal money. There is no image-upload storage or payment gateway.
- Deleting a product deactivates it; old orders and invoices remain valid.
- Checkout requires an `Idempotency-Key`. A temporarily interrupted order returns `202 PENDING` and is recovered in the background. Poll its location to obtain the final status.
- Cancellation restores stock exactly once. It is disallowed once invoice generation starts, including during an invoice-service outage. Retry invoice generation to finish it.
- Invoices are consolidated academic order bills generated through SOAP and returned to clients as JSON. No PDF, tax calculation, credit note or statutory seller-invoice workflow is included.
- JWTs expire after 30 minutes; log in again. Logout is client-side token removal. Tokens are not immediately revocable in this academic implementation.
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

The backend and live API flows are verified. Report screenshots still need capture in Postman/SoapUI because the app browser blocked localhost screenshot capture; see [capture checklist](docs/screenshots/README.md).

`Build.ps1` runs integration tests for registration, authorization, stock concurrency and rollback, order idempotency and recovery, cancellation, and real SOAP requests. Re-run the live smoke test only when you want another set of demo records.
