package com.ecom.order;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
@Entity @Table(name="orders")
public class PurchaseOrder {
    @Id public UUID id=UUID.randomUUID();
    @Column(name="buyer_id",nullable=false) public UUID buyerId;
    @Column(nullable=false,length=20) public String status="PENDING";
    @Column(name="idempotency_key",nullable=false,length=100) public String idempotencyKey;
    @Column(name="request_hash",nullable=false,length=64) public String requestHash;
    @Column(name="customer_name",nullable=false,length=100) public String customerName;
    @Column(name="customer_email",nullable=false,length=254) public String customerEmail;
    @Column(nullable=false,length=1000) public String address;
    @Column(name="address_line1",length=200) public String addressLine1;
    @Column(name="address_line2",length=200) public String addressLine2;
    @Column(name="delivery_city",length=100) public String city;
    @Column(name="delivery_state",length=100) public String state;
    @Column(name="delivery_pincode",length=6) public String pincode;
    @Column(name="delivery_country",length=50) public String country;
    @Column(name="delivery_phone",length=10) public String phone;
    @Column(name="payment_method",nullable=false,length=20) public String paymentMethod="COD";
    @Column(nullable=false,length=3) public String currency="INR";
    @Column(nullable=false,precision=24,scale=2) public BigDecimal total=BigDecimal.ZERO;
    @Column(name="created_at",nullable=false) public Instant createdAt=Instant.now();
    @Column(name="invoice_requested",nullable=false) public boolean invoiceRequested;
    @Column(name="invoice_xml",columnDefinition="text") public String invoiceXml;
    @Version public long version;
    @ElementCollection(fetch=FetchType.EAGER) @CollectionTable(name="order_items",joinColumns=@JoinColumn(name="order_id")) @OrderColumn(name="line_no") public List<Item> items=new ArrayList<>();
    @Embeddable public static class Item {
        @Column(name="product_id",nullable=false) public UUID productId;
        @Column(name="seller_id") public UUID sellerId;
        @Column(length=200) public String name;
        @Column(name="unit_price",precision=19,scale=2) public BigDecimal unitPrice;
        @Column(nullable=false) public int quantity;
    }
}
