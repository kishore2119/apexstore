package com.ecom.order;
import com.ecom.common.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.data.jpa.domain.Specification;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;

@RestController @RequestMapping("/api/admin/orders") @PreAuthorize("hasRole('ADMIN')")
public class AdminOrderController {
    private final OrderRepository orders;
    private final Transactions tx;
    private final OrderService orderService;

    public AdminOrderController(OrderRepository orders, Transactions tx, OrderService orderService) {
        this.orders = orders;
        this.tx = tx;
        this.orderService = orderService;
    }

    public record Summary(long total, long confirmed, long pending, long cancelled, long failed, BigDecimal totalRevenue) {}
    public record Customers(@NotNull @Size(max=100) List<@NotNull UUID> ids) {}
    public record CustomerStats(UUID buyerId, long total, BigDecimal totalSpent, Instant latestOrderAt) {}

    @GetMapping("/summary")
    public Summary summary() {
        var counts = new HashMap<String, Long>();
        orders.statusCounts().forEach(c -> counts.put(c.getStatus(), c.getTotal()));
        BigDecimal rev = orders.totalRevenue();
        return new Summary(
            counts.values().stream().mapToLong(Long::longValue).sum(),
            counts.getOrDefault("CONFIRMED", 0L),
            counts.getOrDefault("PENDING", 0L) + counts.getOrDefault("CANCEL_PENDING", 0L),
            counts.getOrDefault("CANCELLED", 0L),
            counts.getOrDefault("FAILED", 0L),
            rev != null ? rev : BigDecimal.ZERO
        );
    }

    @PostMapping("/customer-stats")
    public List<CustomerStats> customers(@Valid @RequestBody Customers input) {
        if (input.ids().isEmpty()) return List.of();
        var counts = new HashMap<UUID, CustomerStats>();
        orders.customerCounts(input.ids()).forEach(c -> counts.put(c.getBuyerId(), new CustomerStats(c.getBuyerId(), c.getTotal(), c.getTotalSpent() != null ? c.getTotalSpent() : BigDecimal.ZERO, c.getLatestOrderAt())));
        return input.ids().stream().distinct().map(id -> counts.getOrDefault(id, new CustomerStats(id, 0, BigDecimal.ZERO, null))).toList();
    }

    @GetMapping
    public Pages.Result<OrderService.View> list(
        @RequestParam(defaultValue="0") int page,
        @RequestParam(defaultValue="12") int size,
        @RequestParam(required=false) UUID buyerId,
        @RequestParam(required=false) String status,
        @RequestParam(required=false) String search
    ) {
        if(search!=null && search.length()>254) throw ApiException.bad("Search must be at most 254 characters");
        if (status != null && !Set.of("CONFIRMED", "PENDING", "CANCEL_PENDING", "CANCELLED", "FAILED").contains(status)) {
            throw ApiException.bad("Unsupported order status");
        }
        Specification<PurchaseOrder> spec = (r, q, b) -> {
            var filters = new ArrayList<jakarta.persistence.criteria.Predicate>();
            if (buyerId != null) filters.add(b.equal(r.get("buyerId"), buyerId));
            if (status != null) filters.add(status.equals("PENDING") ? r.get("status").in("PENDING", "CANCEL_PENDING") : b.equal(r.get("status"), status));
            if (search != null && !search.trim().isEmpty()) {
                String term = "%" + search.trim().toLowerCase(Locale.ROOT).replace("\\","\\\\").replace("%","\\%").replace("_","\\_") + "%";
                var searchPredicates = new ArrayList<jakarta.persistence.criteria.Predicate>();
                searchPredicates.add(b.like(b.lower(r.get("customerName")), term,'\\'));
                searchPredicates.add(b.like(b.lower(r.get("customerEmail")), term,'\\'));
                try {
                    UUID orderUuid = UUID.fromString(search.trim());
                    searchPredicates.add(b.equal(r.get("id"), orderUuid));
                } catch (IllegalArgumentException ignored) {}
                filters.add(b.or(searchPredicates.toArray(jakarta.persistence.criteria.Predicate[]::new)));
            }
            return b.and(filters.toArray(jakarta.persistence.criteria.Predicate[]::new));
        };
        return tx.run(() -> Pages.Result.from(orders.findAll(spec, Pages.of(page, size, "createdAt,desc", Set.of("createdAt", "total"))).map(OrderService::view)));
    }

    @GetMapping("/{id}")
    public OrderService.View getOrder(@PathVariable UUID id) {
        return orderService.get(id);
    }
}
