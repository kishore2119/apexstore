package com.ecom.product;

import com.ecom.common.Actor;
import com.ecom.common.Pages;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.Set;
import java.util.UUID;

@RestController
public class ProductController {
    private static final Set<String> SORTS = Set.of("name", "price", "createdAt");

    private final ProductService service;

    public ProductController(ProductService service) {
        this.service = service;
    }

    @GetMapping("/api/admin/products/summary")
    @PreAuthorize("hasRole('ADMIN')")
    public ProductService.InventorySummary summary() {
        return service.inventorySummary();
    }

    @GetMapping("/api/products")
    public Pages.Result<ProductService.View> list(
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "12") int size,
        @RequestParam(defaultValue = "createdAt,desc") String sort,
        @RequestParam(required = false) String search,
        @RequestParam(required = false) String category,
        @RequestParam(required = false) BigDecimal minPrice,
        @RequestParam(required = false) BigDecimal maxPrice,
        @RequestParam(defaultValue = "false") boolean inStock
    ) {
        return service.list(
            Pages.of(page, size, sort, SORTS), search, category, null, false,
            minPrice, maxPrice, inStock
        );
    }

    @GetMapping("/api/products/{id}")
    public ProductService.View get(@PathVariable UUID id) {
        return service.get(id);
    }

    @GetMapping("/api/seller/products")
    @PreAuthorize("hasAnyRole('SELLER','ADMIN')")
    public Pages.Result<ProductService.View> mine(
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "12") int size,
        @RequestParam(defaultValue = "createdAt,desc") String sort
    ) {
        return service.list(
            Pages.of(page, size, sort, SORTS), null, null, Actor.id(), true,
            null, null, false
        );
    }

    @GetMapping("/api/admin/products")
    @PreAuthorize("hasRole('ADMIN')")
    public Pages.Result<ProductService.View> all(
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "12") int size,
        @RequestParam(defaultValue = "createdAt,desc") String sort
    ) {
        return service.list(
            Pages.of(page, size, sort, SORTS), null, null, Actor.id(), true,
            null, null, false
        );
    }

    @PostMapping({"/api/seller/products", "/api/admin/products"})
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('SELLER','ADMIN') and (!#request.servletPath.startsWith('/api/admin') or hasRole('ADMIN'))")
    public ProductService.View create(
        HttpServletRequest request,
        @Valid @RequestBody ProductService.Input input
    ) {
        return service.create(input);
    }

    @PutMapping({"/api/seller/products/{id}", "/api/admin/products/{id}"})
    @PreAuthorize("hasAnyRole('SELLER','ADMIN') and (!#request.servletPath.startsWith('/api/admin') or hasRole('ADMIN'))")
    public ProductService.View update(
        HttpServletRequest request,
        @PathVariable UUID id,
        @Valid @RequestBody ProductService.Input input
    ) {
        return service.update(id, input);
    }

    @PatchMapping({"/api/seller/products/{id}/stock", "/api/admin/products/{id}/stock"})
    @PreAuthorize("hasAnyRole('SELLER','ADMIN') and (!#request.servletPath.startsWith('/api/admin') or hasRole('ADMIN'))")
    public ProductService.View stock(
        HttpServletRequest request,
        @PathVariable UUID id,
        @Valid @RequestBody ProductService.Stock input
    ) {
        return service.stock(id, input);
    }

    @PatchMapping({"/api/seller/products/{id}/status", "/api/admin/products/{id}/status"})
    @PreAuthorize("hasAnyRole('SELLER','ADMIN') and (!#request.servletPath.startsWith('/api/admin') or hasRole('ADMIN'))")
    public ProductService.View status(
        HttpServletRequest request,
        @PathVariable UUID id,
        @Valid @RequestBody ProductService.ListingStatus input
    ) {
        return service.status(id, input);
    }

    @DeleteMapping({"/api/seller/products/{id}", "/api/admin/products/{id}"})
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasAnyRole('SELLER','ADMIN') and (!#request.servletPath.startsWith('/api/admin') or hasRole('ADMIN'))")
    public void delete(HttpServletRequest request, @PathVariable UUID id) {
        service.deactivate(id);
    }
}
