package com.ecom.user;
import com.ecom.common.*;
import jakarta.validation.constraints.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.stereotype.Service;
import com.nimbusds.jose.jwk.source.ImmutableSecret;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;

@Service
public class UserService {
    public record Registration(@NotBlank @Size(max=100) String name,@NotBlank @Email @Size(max=254) String email,@NotBlank @Size(min=10,max=64) String password) {}
    public record Login(@NotBlank @Email String email,@NotBlank @Size(max=64) String password) {}
    public record AdminLogin(@NotBlank @Size(max=100) String adminId,@NotBlank @Size(max=64) String password) {}
    @Value("${app.admin-login-id:ECOM-ADMIN}") private String adminLoginId;
    @Value("${app.admin-email:}") private String adminEmail;
    public record Profile(UUID id,String name,String email,Set<String> roles) {}
    public record Session(String accessToken,String tokenType,long expiresIn,Profile user) {}
    private final UserRepository users;
    private final Transactions tx;
    private final BCryptPasswordEncoder passwords=new BCryptPasswordEncoder(12);
    private final String dummyHash=passwords.encode("dummy-password-never-valid");
    private final JwtEncoder encoder;
    public UserService(UserRepository users,Transactions tx,@Value("${app.jwt-secret}") String secret) {
        this.users=users; this.tx=tx; encoder=new NimbusJwtEncoder(new ImmutableSecret<>(secret.getBytes(StandardCharsets.UTF_8)));
    }
    public Session register(Registration input) {
        String hash=hash(input.password());
        return session(tx.run(() -> {
            String email=normalize(input.email()); if(users.findByEmail(email).isPresent()) throw ApiException.conflict("Email already registered");
            User u=new User(); u.name=input.name().trim(); u.email=email; u.passwordHash=hash; u.roles.add("CUSTOMER"); return users.saveAndFlush(u);
        }));
    }
    public Session login(Login input) {
        User u=users.findByEmail(normalize(input.email())).orElse(null);
        boolean matches=passwords.matches(input.password(),u==null?dummyHash:u.passwordHash);
        if(u==null || !matches || !u.enabled) throw new ApiException(HttpStatus.UNAUTHORIZED,"INVALID_CREDENTIALS","Invalid email or password");
        return session(u);
    }
    public Profile me() { return profile(users.findById(Actor.id()).orElseThrow(() -> ApiException.missing("User"))); }
    public Session adminLogin(AdminLogin input) {
        User u=input.adminId().trim().equals(adminLoginId)?users.findByEmail(normalize(adminEmail)).orElse(null):null;
        boolean matches=passwords.matches(input.password(),u==null?dummyHash:u.passwordHash);
        if(u==null || !matches || !u.enabled || !u.roles.contains("ADMIN")) throw new ApiException(HttpStatus.UNAUTHORIZED,"INVALID_CREDENTIALS","Invalid admin ID or password");
        return session(u);
    }
    public Session seller() { return session(tx.run(() -> { User u=users.findById(Actor.id()).orElseThrow(() -> ApiException.missing("User")); u.roles.add("SELLER"); return users.saveAndFlush(u); })); }
    public void bootstrapAdmin(String email,String password) {
        if(email.isBlank() && password.isBlank()) return;
        if(email.isBlank() || password.length()<10) throw new IllegalArgumentException("Set both ADMIN_EMAIL and ADMIN_PASSWORD (minimum 10 characters)");
        String hash=hash(password);
        tx.run(() -> { if(users.findByEmail(normalize(email)).isEmpty()) { User u=new User(); u.name="Administrator"; u.email=normalize(email); u.passwordHash=hash; u.roles.addAll(Set.of("CUSTOMER","SELLER","ADMIN")); users.saveAndFlush(u); } return null; });
    }
    private String hash(String password) { if(password.getBytes(StandardCharsets.UTF_8).length>72) throw ApiException.bad("Password must fit within 72 UTF-8 bytes"); return passwords.encode(password); }
    private static String normalize(String email) { return email.trim().toLowerCase(Locale.ROOT); }
    private Profile profile(User u) { return new Profile(u.id,u.name,u.email,Set.copyOf(u.roles)); }
    private Session session(User u) {
        Instant now=Instant.now();
        var claims=JwtClaimsSet.builder().issuer(CommonConfiguration.ISSUER).subject(u.id.toString()).issuedAt(now).expiresAt(now.plusSeconds(1800)).claim("roles",u.roles).build();
        String token=encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(),claims)).getTokenValue();
        return new Session(token,"Bearer",1800,profile(u));
    }
}
