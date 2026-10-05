# API guide

Base URL: `http://localhost:8080`. All REST bodies are JSON. Authenticate with `Authorization: Bearer <accessToken>`. Product browsing and registration/login are public. Internal endpoints cannot be reached through the gateway.

## Accounts

| Method | Path | Access |
|---|---|---|
| POST | /api/auth/register | Public |
| POST | /api/auth/login | Public |
| POST | /api/auth/admin/login | Public login; only configured admin credentials succeed |
| GET | /api/users/me | Signed-in user |
| POST | /api/users/me/seller | Signed-in user |

Registration body:

```json
{"name":"Demo Buyer","email":"buyer@example.test","password":"use-a-private-password"}
```

Login accepts email and password. Successful authentication returns:

```json
{"accessToken":"<signed token>","tokenType":"Bearer","expiresIn":1800,"user":{"id":"<uuid>","name":"Demo Buyer","email":"buyer@example.test","roles":["CUSTOMER"]}}
```

Seller enablement returns this same session shape with the SELLER role. Replace the old token with the new one. Public registration ignores arbitrary role fields and never grants admin rights. An existing email produces 409.

Admin login accepts `{"adminId":"ECOM-ADMIN","password":"<private ADMIN_PASSWORD>"}`. `ADMIN_LOGIN_ID` selects the unique login ID for the configured `ADMIN_EMAIL` account. Invalid IDs, passwords, disabled users, and accounts without ADMIN return 401. The Angular admin page is `/admin`.

## Products

| Method | Path | Access |
|---|---|---|
| GET | /api/products | Public, active listings |
| GET | /api/products/{id} | Public, active listing |
| GET | /api/seller/products | Seller's own listings, including inactive |
| POST | /api/seller/products | Seller/Admin |
| PUT | /api/seller/products/{id} | Owner/Admin |
| PATCH | /api/seller/products/{id}/stock | Owner/Admin |
| DELETE | /api/seller/products/{id} | Owner/Admin |
| GET | /api/admin/products | Admin, all listings |
| POST | /api/admin/products | Admin |
| PUT | /api/admin/products/{id} | Admin |
| PATCH | /api/admin/products/{id}/stock | Admin |
| DELETE | /api/admin/products/{id} | Admin |

Create/edit body:

```json
{"sku":"KB-001","name":"Mechanical keyboard","description":"Compact keyboard","category":"Electronics","price":1499.00,"imageUrl":"https://example.com/keyboard.png"}
```

POST accepts optional `stockOnHand` (a whole number from 0 to 100,000,000), saved in the same transaction as the listing. Without it, stock defaults to zero. PATCH stock with `{"stockOnHand":10}` to change inventory afterward. The value is the current total inventory, not an increment, and cannot fall below active reservations. PUT updates listing details without altering ownership or inventory; a stock field on PUT does not change stock. DELETE deactivates and returns 204.

SKU is optional on POST: omission/blank generates a unique `PRD-<UUID>` product code. On PUT, omission preserves the existing code.

Upload a local JPG/PNG with multipart field `file` to `POST /api/seller/products/images` (seller/admin) or `POST /api/admin/products/images` (admin only). Response: `{"imageUrl":"/api/products/images/<uuid>.png"}` with 201. Use this path in the product create/update body. Images are limited to 5 MB, 6000 pixels per side, and 16 megapixels, decoded and re-encoded before saving. `GET /api/products/images/{filename}` serves them publicly. Image data stays on the local filesystem; the database stores the path. SVG and non-image uploads are rejected.

Product response:

```json
{"id":"<uuid>","sellerId":"<uuid>","sku":"KB-001","name":"Mechanical keyboard","description":"Compact keyboard","category":"Electronics","price":1499.00,"currency":"INR","imageUrl":"https://example.com/keyboard.png","active":true,"stockOnHand":10,"reserved":2,"availableStock":8}
```

Catalogue query parameters: `page` (default 0), `size` (default 12, maximum 100), `sort` (`createdAt,desc` by default), `search` (name substring), `category` (case-insensitive exact match), `minPrice`, `maxPrice`, and `inStock` (default false). Prices must be nonnegative and the minimum cannot exceed the maximum. `inStock=true` requires available stock greater than zero. Filters apply before pagination, so totals describe all matching products. Supported product sort fields: name, price, createdAt. Listings use an ID tiebreaker for stable ordering.

```http
GET /api/products?page=0&size=10&sort=price,asc&category=Electronics
```

List responses use `{"content":[...],"page":0,"size":10,"totalElements":24,"totalPages":3}`.

## Orders

| Method | Path | Result |
|---|---|---|
| POST | /api/orders | Place or replay an order |
| GET | /api/orders | Current buyer's paginated history |
| GET | /api/orders/{id} | Own order, or Admin |
| POST | /api/orders/{id}/cancel | Cancel confirmed, uninvoiced order |
| POST | /api/orders/{id}/invoice | Generate/retrieve invoice through SOAP |
| GET | /api/orders/{id}/invoice | Retrieve already-generated invoice |

Checkout requires `Idempotency-Key: checkout-demo-001` (8–100 letters, digits, underscores or hyphens).

```json
{"customerName":"Demo Buyer","customerEmail":"buyer@example.test","address":"Delivery address","items":[{"productId":"<product UUID>","quantity":2}]}
```

One request accepts 1–50 distinct products and quantities 1–10000. All prices and seller IDs come from Product Service. The body cannot override prices.

New checkout bodies also accept `deliveryAddress` and `paymentMethod`:

```json
{"deliveryAddress":{"line1":"12 Demo Street","line2":"","city":"Kakinada","state":"Andhra Pradesh","pincode":"533001","country":"India","phone":"9000000000"},"paymentMethod":"ONLINE_DEMO"}
```

Merge these fields with the contact, `address`, and items fields above. Structured delivery fields are validated and formatted on the server; line 2 is optional. Payment method is `COD` or `ONLINE_DEMO`, defaulting to COD for legacy requests. Responses include structured delivery details, the method, and `paymentStatus: "DEMO_NOT_COLLECTED"`. No payment is processed. Changed payment/address details under an existing idempotency key are rejected. Legacy address-only bodies and previously issued orders remain supported.

Response status is 200 for a completed/replayed order, 202 for PENDING, or 409 for FAILED. The Location header identifies `/api/orders/{id}`. A repeated key with different content returns 409. Poll a PENDING order; the recovery worker keeps trying during outages.

```json
{"id":"<uuid>","buyerId":"<uuid>","status":"CONFIRMED","customerName":"Demo Buyer","customerEmail":"buyer@example.test","address":"Delivery address","currency":"INR","total":2998.00,"createdAt":"2026-10-04T12:00:00Z","invoiceRequested":false,"items":[{"productId":"<uuid>","sellerId":"<uuid>","name":"Mechanical keyboard","quantity":2,"unitPrice":1499.00,"subtotal":2998.00}]}
```

PENDING items may temporarily have null name, sellerId, unitPrice and subtotal until the reservation snapshot is saved. Order sort fields are createdAt, total and status. Pagination follows the product-list format. `GET /api/orders` accepts optional `status`: CONFIRMED, PENDING, CANCELLED, CANCEL_PENDING, or FAILED. PENDING also includes CANCEL_PENDING. Filtering applies before pagination and remains scoped to the signed-in buyer.

Cancellation returns 200 when CANCELLED or 202 while CANCEL_PENDING. Repeated cancellation is safe. Orders with invoice generation started cannot be cancelled in this version.

## Invoices and SOAP

REST invoice response:

```json
{"id":"<uuid>","invoiceNumber":"INV-<uuid>","orderId":"<uuid>","customerName":"Demo Buyer","customerEmail":"buyer@example.test","address":"Delivery address","currency":"INR","total":2998.00,"issuedAt":"2026-10-04T12:00:00Z","items":[{"productId":"<uuid>","sellerId":"<uuid>","name":"Mechanical keyboard","quantity":2,"unitPrice":1499.00}]}
```

Invoice Service listens directly at `http://localhost:8084/ws`; WSDL is `http://localhost:8084/ws/invoices.wsdl`. Both require `X-Service-Key: <INTERNAL_API_KEY>`. This key belongs only in trusted backend tooling, never in Angular. The SOAP namespace is `urn:ecom:invoice:v1`, using SOAP 1.1 and `Content-Type: text/xml`.

```xml
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:inv="urn:ecom:invoice:v1">
  <soap:Body>
    <inv:generateInvoiceRequest>
      <inv:orderId>11111111-1111-4111-8111-111111111111</inv:orderId>
      <inv:customerName>Demo Buyer</inv:customerName>
      <inv:customerEmail>buyer@example.test</inv:customerEmail>
      <inv:address>Delivery address</inv:address>
      <inv:currency>INR</inv:currency>
      <inv:items><inv:item>
        <inv:productId>22222222-2222-4222-8222-222222222222</inv:productId>
        <inv:sellerId>33333333-3333-4333-8333-333333333333</inv:sellerId>
        <inv:name>Mechanical keyboard</inv:name>
        <inv:quantity>2</inv:quantity><inv:unitPrice>1499.00</inv:unitPrice>
      </inv:item></inv:items>
    </inv:generateInvoiceRequest>
  </soap:Body>
</soap:Envelope>
```

`generateInvoiceResponse` contains id, invoiceNumber, orderId, customerName, customerEmail, address, currency, total, issuedAt and items in that order. The XSD in invoice-service defines the full schema. Invalid payloads return a SOAP fault. An existing order ID with changed billing data is rejected. Identical retries return the original invoice.

## Internal inventory operations

Direct Product Service address: `http://localhost:8082`. All require X-Service-Key.

| Method | Path | Purpose |
|---|---|---|
| POST | /internal/reservations/{orderId} | Reserve `{"items":[{"productId":"<uuid>","quantity":2}]}` |
| GET | /internal/reservations/{orderId} | Query current state and saved prices |
| POST | /internal/reservations/{orderId}/confirm | Finalize reserved purchase |
| POST | /internal/reservations/{orderId}/release | Release an unconfirmed reservation |
| POST | /internal/reservations/{orderId}/cancel | Restore confirmed purchase stock |

## Errors

```json
{"code":"VALIDATION_FAILED","message":"Check the highlighted fields","fields":{"price":"must be greater than or equal to 0.01"},"traceId":"<trace UUID>"}
```

Status codes: 400 invalid input, 401 unauthenticated, 403 forbidden, 404 missing resource, 409 conflict, 500 unexpected failure, 503 invoice service temporarily unavailable. A failed checkout uses the order response with status FAILED instead of the generic error body so its persistent order ID remains available.

## Angular integration

The included Angular app uses the gateway only. Its interceptor attaches bearer tokens only to this API and clears rejected/expired sessions. Seller enablement replaces the token. A new purchase uses a new checkout key; retries reuse the saved key and payload. CORS allows `http://localhost:4200` by default; change FRONTEND_ORIGIN for another origin. Frontend source is in `frontend/`.
