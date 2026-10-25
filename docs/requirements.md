# Project 3 coverage

| Required feature | Implementation | Verification |
|---|---|---|
| Product and Order entity design | Product, PurchaseOrder, embedded order items, ownership and price snapshots; reversible owner-controlled listing status | JPA schema validation and integration tests |
| REST product/order APIs | ProductController, OrderController | Postman collection and live smoke test |
| Pagination and sorting | Stable paginated product, seller, admin and order listings | API validation and live catalogue test |
| Transaction management | Spring TransactionTemplate, serializable local transactions, persistent order recovery, cancellation compensation | Rollback, concurrency, idempotency and interrupted-confirmation tests |
| AOP logging | OperationLogging aspect with timing and trace IDs | Service logs during tests and live runs |
| SOAP invoice generation | InvoiceEndpoint, XSD, WSDL and InvoiceClient | Real SOAP integration tests and gateway-to-SOAP live flow |
| Validation and exceptions | Bean Validation, business checks, REST error advice, SOAP validation/faults | Unauthorized, forbidden, stock and malformed-request tests |
| Objective | architecture.md | Documentation |
| System architecture | architecture.md | Mermaid service diagram |
| Entity relationships | architecture.md and versioned SQL migrations | Mermaid ER diagram and database schemas |
| API endpoints and responses | api.md and Postman collection | Request/response examples and live evidence |
| Screenshots | docs/screenshots/README.md | Capture checklist for the submission; dated synthetic API evidence is in verification.json and demo-verification.json. |
| Additional: microservices | Four business services plus gateway; service-owned users/products/orders/invoices schemas in the ecomm database | Five independent applications; REST/SOAP communication and local service transactions |
| Additional: user roles | Customer, Seller, isolated Admin with exact product ownership checks | Security tests and dated live admin/seller checks |

Syllabus concepts demonstrated include constructor dependency injection, Spring Boot configuration, repositories and JPA, REST controllers, request bodies, path/query parameters, ResponseEntity, Spring Security, CORS, AOP and SOAP. The project brief does not require demonstrating every practice exercise separately (such as setter injection or a second JDBC-only application).
