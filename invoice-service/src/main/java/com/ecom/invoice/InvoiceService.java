package com.ecom.invoice;

import com.ecom.common.ApiException;
import com.ecom.common.EmailAddress;
import com.ecom.common.Hashes;
import com.ecom.common.InvoiceContract;
import com.ecom.common.InvoiceXml;
import com.ecom.common.Transactions;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;

@Service
public class InvoiceService {
    private final InvoiceRepository invoices;
    private final Transactions tx;

    public InvoiceService(InvoiceRepository invoices, Transactions tx) {
        this.invoices = invoices;
        this.tx = tx;
    }

    public InvoiceContract.Invoice generate(InvoiceContract.Request request) {
        validate(request);
        String hash = Hashes.sha256(InvoiceXml.request(request));
        try {
            return tx.run(() -> {
                var existing = invoices.findByOrderId(request.orderId());
                if (existing.isPresent()) return sameInvoice(existing.get(), hash);

                Invoice invoice = new Invoice();
                invoice.orderId = request.orderId();
                invoice.requestHash = hash;
                invoice.customerName = request.customerName();
                invoice.customerEmail = request.customerEmail();
                invoice.address = request.address();
                invoice.currency = request.currency();
                invoice.total = BigDecimal.ZERO;
                for (var line : request.items()) {
                    Invoice.Item item = new Invoice.Item();
                    item.productId = line.productId();
                    item.sellerId = line.sellerId();
                    item.name = line.name();
                    item.quantity = line.quantity();
                    item.unitPrice = line.unitPrice();
                    invoice.items.add(item);
                    invoice.total = invoice.total.add(item.unitPrice.multiply(BigDecimal.valueOf(item.quantity)));
                }
                return view(invoices.saveAndFlush(invoice));
            });
        } catch (DataIntegrityViolationException conflict) {
            // Two first-time requests may both miss the row. The unique order ID elects one invoice.
            return tx.run(() -> sameInvoice(invoices.findByOrderId(request.orderId()).orElseThrow(() -> conflict), hash));
        }
    }

    private InvoiceContract.Invoice sameInvoice(Invoice invoice, String hash) {
        if (!invoice.requestHash.equals(hash)) throw ApiException.conflict("Invoice data differs from original order");
        return view(invoice);
    }

    private void validate(InvoiceContract.Request request) {
        if (request == null || request.orderId() == null
            || request.customerName() == null || request.customerName().isBlank() || request.customerName().length() > 100
            || request.customerEmail() == null || request.customerEmail().length() > 254 || !request.customerEmail().matches(EmailAddress.PATTERN)
            || request.address() == null || request.address().isBlank() || request.address().length() > 1000
            || !"INR".equals(request.currency()) || request.items() == null || request.items().isEmpty() || request.items().size() > 50) {
            throw ApiException.bad("Invalid invoice details");
        }
        for (var item : request.items()) {
            if (item == null || item.productId() == null || item.sellerId() == null
                || item.name() == null || item.name().isBlank() || item.name().length() > 200
                || item.quantity() < 1 || item.quantity() > 10000
                || item.unitPrice() == null || item.unitPrice().signum() <= 0
                || item.unitPrice().scale() > 2 || item.unitPrice().precision() - item.unitPrice().scale() > 12) {
                throw ApiException.bad("Invalid invoice item");
            }
        }
    }

    private InvoiceContract.Invoice view(Invoice invoice) {
        return new InvoiceContract.Invoice(invoice.id, invoice.invoiceNumber, invoice.orderId, invoice.customerName,
            invoice.customerEmail, invoice.address, invoice.currency, invoice.total, invoice.issuedAt,
            invoice.items.stream().map(line -> new InvoiceContract.Item(line.productId, line.sellerId, line.name, line.quantity, line.unitPrice)).toList());
    }
}
