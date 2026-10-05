# Submission screenshots

The live backend was verified using actual HTTP requests. Full non-secret response evidence is saved in `../verification.json`.

The Angular storefront can be inspected at `http://localhost:4200`. The academic report should also include Postman or SoapUI captures to show HTTP responses and SOAP explicitly.

Import `../../postman/ecom-backend.postman_collection.json`, run the demo requests and capture:

1. Seller product creation (201) and a catalogue page with pagination/sorting.
2. A confirmed order showing saved items and total.
3. The generated invoice response. Show the Invoice Service WSDL or a SOAP response as well to demonstrate SOAP explicitly.
4. Insufficient-stock rejection and an invalid request response.
5. A forbidden edit by a different user.
6. AOP log lines showing operation, duration, outcome and trace ID.

Keep tokens, passwords, private settings, and internal service keys outside screenshots. Use the generated demo records, which contain only synthetic names and addresses.
