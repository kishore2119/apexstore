package com.ecom.order;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import org.springframework.data.domain.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;

public interface OrderRepository extends JpaRepository<PurchaseOrder,UUID>, JpaSpecificationExecutor<PurchaseOrder> {
    interface StatusCount { String getStatus(); long getTotal(); }
    interface CustomerCount { UUID getBuyerId(); long getTotal(); BigDecimal getTotalSpent(); Instant getLatestOrderAt(); }

    @Query("select o.status as status, count(o) as total from PurchaseOrder o group by o.status")
    List<StatusCount> statusCounts();

    @Query("select coalesce(sum(o.total), 0) from PurchaseOrder o where o.status = 'CONFIRMED'")
    BigDecimal totalRevenue();

    @Query("select o.buyerId as buyerId, count(o) as total, coalesce(sum(case when o.status='CONFIRMED' then o.total else 0 end), 0) as totalSpent, max(o.createdAt) as latestOrderAt from PurchaseOrder o where o.buyerId in :ids group by o.buyerId")
    List<CustomerCount> customerCounts(@Param("ids") Collection<UUID> ids);

    Optional<PurchaseOrder> findByBuyerIdAndIdempotencyKey(UUID buyerId, String idempotencyKey);
    Page<PurchaseOrder> findByBuyerId(UUID buyerId, Pageable page);
    Page<PurchaseOrder> findByBuyerIdAndStatusIn(UUID buyerId, Collection<String> statuses, Pageable page);
    @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select o from PurchaseOrder o where o.id=:id") Optional<PurchaseOrder> locked(@Param("id") UUID id);
}
