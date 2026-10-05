package com.ecom.product;
import com.ecom.common.*;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.*;
import java.math.BigDecimal;
@RestController
public class ProductController {
    private final ProductService service;
    private static final Set<String> SORTS=Set.of("name","price","createdAt");
    public ProductController(ProductService service) { this.service=service; }
    @GetMapping("/api/products") public Pages.Result<ProductService.View> list(@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="12") int size,@RequestParam(defaultValue="createdAt,desc") String sort,@RequestParam(required=false) String search,@RequestParam(required=false) String category,@RequestParam(required=false) BigDecimal minPrice,@RequestParam(required=false) BigDecimal maxPrice,@RequestParam(defaultValue="false") boolean inStock) { return service.list(Pages.of(page,size,sort,SORTS),search,category,null,false,minPrice,maxPrice,inStock); }
    @GetMapping("/api/products/{id}") public ProductService.View get(@PathVariable UUID id) { return service.get(id); }
    @GetMapping("/api/seller/products") @PreAuthorize("hasAnyRole('SELLER','ADMIN')") public Pages.Result<ProductService.View> mine(@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="12") int size,@RequestParam(defaultValue="createdAt,desc") String sort) { return service.list(Pages.of(page,size,sort,SORTS),null,null,Actor.id(),true,null,null,false); }
    @GetMapping("/api/admin/products") @PreAuthorize("hasRole('ADMIN')") public Pages.Result<ProductService.View> all(@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="12") int size,@RequestParam(defaultValue="createdAt,desc") String sort) { return service.list(Pages.of(page,size,sort,SORTS),null,null,null,true,null,null,false); }
    @PostMapping({"/api/seller/products","/api/admin/products"}) @ResponseStatus(HttpStatus.CREATED) @PreAuthorize("hasAnyRole('SELLER','ADMIN') and (!#request.servletPath.startsWith('/api/admin') or hasRole('ADMIN'))")
    public ProductService.View create(jakarta.servlet.http.HttpServletRequest request,@Valid @RequestBody ProductService.Input input) { return service.create(input); }
    @PutMapping({"/api/seller/products/{id}","/api/admin/products/{id}"}) @PreAuthorize("hasAnyRole('SELLER','ADMIN') and (!#request.servletPath.startsWith('/api/admin') or hasRole('ADMIN'))")
    public ProductService.View update(jakarta.servlet.http.HttpServletRequest request,@PathVariable UUID id,@Valid @RequestBody ProductService.Input input) { return service.update(id,input); }
    @PatchMapping({"/api/seller/products/{id}/stock","/api/admin/products/{id}/stock"}) @PreAuthorize("hasAnyRole('SELLER','ADMIN') and (!#request.servletPath.startsWith('/api/admin') or hasRole('ADMIN'))")
    public ProductService.View stock(jakarta.servlet.http.HttpServletRequest request,@PathVariable UUID id,@Valid @RequestBody ProductService.Stock input) { return service.stock(id,input); }
    @DeleteMapping({"/api/seller/products/{id}","/api/admin/products/{id}"}) @ResponseStatus(HttpStatus.NO_CONTENT) @PreAuthorize("hasAnyRole('SELLER','ADMIN') and (!#request.servletPath.startsWith('/api/admin') or hasRole('ADMIN'))")
    public void delete(jakarta.servlet.http.HttpServletRequest request,@PathVariable UUID id) { service.deactivate(id); }
}
