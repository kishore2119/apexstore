package com.ecom.product;

import com.ecom.common.Actor;
import com.ecom.common.ApiException;
import com.ecom.common.Pages;
import com.ecom.common.Transactions;
import jakarta.persistence.criteria.Predicate;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Locale;
import java.util.UUID;

@Service
public class ProductService {
    public record Input(
        @Size(max = 64) String sku,
        @NotBlank @Size(max = 200) String name,
        @NotNull @Size(max = 4000) String description,
        @NotBlank @Size(max = 100) String category,
        @NotNull @DecimalMin("0.01") @Digits(integer = 12, fraction = 2) BigDecimal price,
        @Size(max = 2048)
        @Pattern(
            regexp = "^$|https?://[^\\s]+|/api/products/images/[a-f0-9-]+\\.(png|jpg)",
            message = "must be a product image path or HTTP(S) URL"
        ) String imageUrl,
        @Min(0) @Max(100000000) Integer stockOnHand
    ) {}

    public record Stock(@NotNull @Min(0) @Max(100000000) Integer stockOnHand) {}

    public record ListingStatus(@NotNull Boolean active) {}

    public record View(
        UUID id,
        UUID sellerId,
        String sku,
        String name,
        String description,
        String category,
        BigDecimal price,
        String currency,
        String imageUrl,
        boolean active,
        int stockOnHand,
        int reserved,
        int availableStock
    ) {}

    public record InventorySummary(long total, long active, long inactive, long lowStock, long outOfStock) {}

    private final ProductRepository products;
    private final Transactions tx;

    public ProductService(ProductRepository products, Transactions tx) {
        this.products = products;
        this.tx = tx;
    }

    public InventorySummary inventorySummary() {
        Specification<Product> ownedProducts = (root, query, builder) ->
            builder.equal(root.get("sellerId"), Actor.id());
        Specification<Product> activeProducts = ownedProducts.and((root, query, builder) ->
            builder.isTrue(root.get("active")));

        return tx.run(() -> new InventorySummary(
            products.count(ownedProducts),
            products.count(activeProducts),
            products.count(ownedProducts.and((root, query, builder) ->
                builder.isFalse(root.get("active")))),
            products.count(activeProducts.and((root, query, builder) ->
                builder.between(
                    builder.diff(root.<Integer>get("stockOnHand"), root.<Integer>get("reserved")),
                    1, 5
                ))),
            products.count(activeProducts.and((root, query, builder) ->
                builder.le(
                    builder.diff(root.<Integer>get("stockOnHand"), root.<Integer>get("reserved")),
                    0
                )))
        ));
    }

    public View create(Input input) {
        return tx.run(() -> {
            Product product = new Product();
            product.sellerId = Actor.id();
            assign(product, input);
            product.stockOnHand = input.stockOnHand() == null ? 0 : input.stockOnHand();
            return view(products.saveAndFlush(product));
        });
    }

    public View update(UUID id, Input input) {
        return tx.run(() -> {
            Product product = locked(id);
            if (!product.sellerId.equals(Actor.id())) {
                throw ApiException.forbidden();
            }
            assign(product, input);
            return view(products.saveAndFlush(product));
        });
    }

    public View stock(UUID id, Stock input) {
        return tx.run(() -> {
            Product product = locked(id);
            if (!product.sellerId.equals(Actor.id())) {
                throw ApiException.forbidden();
            }
            if (input.stockOnHand() < product.reserved) {
                throw ApiException.conflict("Stock cannot be lower than reserved quantity");
            }
            product.stockOnHand = input.stockOnHand();
            return view(products.saveAndFlush(product));
        });
    }

    public void deactivate(UUID id) {
        tx.run(() -> {
            Product product = locked(id);
            if (!product.sellerId.equals(Actor.id())) {
                throw ApiException.forbidden();
            }
            product.active = false;
            products.saveAndFlush(product);
            return null;
        });
    }

    public View status(UUID id, ListingStatus input) {
        return tx.run(() -> {
            Product product = locked(id);
            if (!product.sellerId.equals(Actor.id())) {
                throw ApiException.forbidden();
            }
            product.active = input.active();
            return view(products.saveAndFlush(product));
        });
    }

    public View get(UUID id) {
        Product product = products.findById(id).orElseThrow(() -> ApiException.missing("Product"));
        if (!product.active) {
            throw ApiException.missing("Product");
        }
        return view(product);
    }

    public Pages.Result<View> list(
        Pageable page,
        String search,
        String category,
        UUID seller,
        boolean all,
        BigDecimal minPrice,
        BigDecimal maxPrice,
        boolean inStock
    ) {
        if ((minPrice != null && minPrice.signum() < 0)
            || (maxPrice != null && maxPrice.signum() < 0)
            || (minPrice != null && maxPrice != null && minPrice.compareTo(maxPrice) > 0)) {
            throw ApiException.bad("Price range must be nonnegative and minimum cannot exceed maximum");
        }

        Specification<Product> specification = (root, query, builder) -> {
            var predicates = new ArrayList<Predicate>();
            if (!all) {
                predicates.add(builder.isTrue(root.get("active")));
            }
            if (seller != null) {
                predicates.add(builder.equal(root.get("sellerId"), seller));
            }
            if (search != null && !search.isBlank()) {
                String escaped = search.toLowerCase(Locale.ROOT)
                    .replace("\\", "\\\\")
                    .replace("%", "\\%")
                    .replace("_", "\\_");
                predicates.add(builder.like(builder.lower(root.get("name")), "%" + escaped + "%", '\\'));
            }
            if (category != null && !category.isBlank()) {
                predicates.add(builder.equal(builder.lower(root.get("category")), category.toLowerCase(Locale.ROOT)));
            }
            if (minPrice != null) {
                predicates.add(builder.greaterThanOrEqualTo(root.get("price"), minPrice));
            }
            if (maxPrice != null) {
                predicates.add(builder.lessThanOrEqualTo(root.get("price"), maxPrice));
            }
            if (inStock) {
                predicates.add(builder.greaterThan(
                    builder.diff(root.<Integer>get("stockOnHand"), root.<Integer>get("reserved")),
                    0
                ));
            }
            return builder.and(predicates.toArray(Predicate[]::new));
        };
        return Pages.Result.from(products.findAll(specification, page).map(ProductService::view));
    }

    private Product locked(UUID id) {
        return products.locked(id).orElseThrow(() -> ApiException.missing("Product"));
    }

    private void assign(Product product, Input input) {
        if (input.sku() != null && !input.sku().isBlank()) {
            product.sku = input.sku().trim();
        } else if (product.sku == null) {
            product.sku = "PRD-" + product.id.toString().toUpperCase(Locale.ROOT);
        }
        product.name = input.name().trim();
        product.description = input.description();
        product.category = input.category().trim();
        product.price = input.price();
        product.imageUrl = input.imageUrl();
    }

    static View view(Product product) {
        return new View(
            product.id, product.sellerId, product.sku, product.name, product.description,
            product.category, product.price, product.currency, product.imageUrl, product.active,
            product.stockOnHand, product.reserved, product.stockOnHand - product.reserved
        );
    }
}
