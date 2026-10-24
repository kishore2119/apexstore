package com.ecom.user;
import com.ecom.common.Pages;
import com.ecom.common.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.data.jpa.domain.Specification;
import java.time.Instant;
import java.util.*;

@RestController @RequestMapping("/api/admin/users") @PreAuthorize("hasRole('ADMIN')")
public class AdminUserController {
    private final UserRepository users;
    private final Transactions tx;
    public record UserView(UUID id, String name, String email, Set<String> roles, boolean enabled, Instant createdAt) {}
    public AdminUserController(UserRepository users,Transactions tx) { this.users = users; this.tx=tx; }
    public record Totals(long total,long sellers,long paused) {}
    public record AccountStatus(@NotNull Boolean enabled) {}
    @GetMapping("/summary") public Totals summary() {
        Specification<User> customers=(r,q,b) -> b.isNotMember("ADMIN",r.get("roles"));
        return tx.run(() -> new Totals(users.count(customers),users.count(customers.and((r,q,b) -> b.isMember("SELLER",r.get("roles")))),users.count(customers.and((r,q,b) -> b.isFalse(r.get("enabled"))))));
    }

    @GetMapping
    public Pages.Result<UserView> list(@RequestParam(defaultValue="0") int page, @RequestParam(defaultValue="12") int size, @RequestParam(defaultValue="") String search) {
        if (search.length() > 254) throw com.ecom.common.ApiException.bad("Search must be at most 254 characters");
        String term = "%" + search.trim().toLowerCase(Locale.ROOT).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
        Specification<User> spec = (r, q, b) -> b.and(b.isNotMember("ADMIN", r.get("roles")), b.or(b.like(b.lower(r.get("name")), term, '\\'), b.like(b.lower(r.get("email")), term, '\\')));
        return Pages.Result.from(users.findAll(spec, Pages.of(page, size, "createdAt,desc", Set.of("createdAt"))).map(u -> new UserView(u.id, u.name, u.email, Set.copyOf(u.roles), u.enabled, u.createdAt)));
    }

    @PatchMapping("/{id}/status")
    public UserView toggleStatus(@PathVariable UUID id, @Valid @RequestBody AccountStatus body) {
        return tx.run(() -> {
            User u=users.findById(id).orElseThrow(() -> ApiException.missing("User"));
            if(u.roles.contains("ADMIN")) throw ApiException.forbidden();
            u.enabled=body.enabled(); users.saveAndFlush(u);
            return new UserView(u.id,u.name,u.email,Set.copyOf(u.roles),u.enabled,u.createdAt);
        });
    }
}
