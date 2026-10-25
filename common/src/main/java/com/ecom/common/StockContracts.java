package com.ecom.common;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.util.*;
public final class StockContracts {
    private StockContracts() {}
    public record Item(@NotNull UUID productId,@Min(1) @Max(10000) int quantity) {}
    public record Request(@NotEmpty @Size(max=50) List<@NotNull @Valid Item> items) {}
    public record Line(UUID productId,UUID sellerId,String name,BigDecimal unitPrice,int quantity) {}
    public record Reservation(UUID orderId,String status,List<Line> items) {}
}
