package com.ecom.order;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import org.springframework.data.domain.*;
import java.util.*;
public interface OrderRepository extends JpaRepository<PurchaseOrder,UUID> {
    Optional<PurchaseOrder> findByBuyerIdAndIdempotencyKey(UUID buyerId,String idempotencyKey);
    Page<PurchaseOrder> findByBuyerId(UUID buyerId,Pageable page);
    Page<PurchaseOrder> findByBuyerIdAndStatusIn(UUID buyerId,Collection<String> statuses,Pageable page);
    @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select o from PurchaseOrder o where o.id=:id") Optional<PurchaseOrder> locked(@Param("id") UUID id);
}
