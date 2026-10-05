package com.ecom.common;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.*;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.oauth2.server.resource.authentication.*;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.client.RestClient;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.*;

@Configuration @EnableMethodSecurity
@ComponentScan(basePackageClasses=CommonConfiguration.class)
public class CommonConfiguration {
    public static final String ISSUER="ecom-user-service";
    @Bean JwtDecoder jwtDecoder(@Value("${app.jwt-secret}") String secret) {
        if(secret.length()<32) throw new IllegalArgumentException("JWT_SECRET must contain at least 32 characters");
        var decoder=NimbusJwtDecoder.withSecretKey(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8),"HmacSHA256")).macAlgorithm(MacAlgorithm.HS256).build();
        decoder.setJwtValidator(JwtValidators.createDefaultWithIssuer(ISSUER)); return decoder;
    }
    @Bean SecurityFilterChain security(HttpSecurity http,ObjectMapper mapper,@Value("${app.internal-key}") String internalKey) throws Exception {
        if(internalKey.length()<32) throw new IllegalArgumentException("INTERNAL_API_KEY must contain at least 32 characters");
        var converter=new JwtAuthenticationConverter();
        var authorities=new JwtGrantedAuthoritiesConverter(); authorities.setAuthoritiesClaimName("roles"); authorities.setAuthorityPrefix("ROLE_"); converter.setJwtGrantedAuthoritiesConverter(authorities);
        http.csrf(c -> c.disable()).sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(a -> a.requestMatchers("/actuator/health","/api/auth/register","/api/auth/login","/api/auth/admin/login").permitAll()
                .requestMatchers(org.springframework.http.HttpMethod.GET,"/api/products","/api/products/*","/api/products/images/*").permitAll()
                .requestMatchers("/api/admin/**").hasRole("ADMIN")
                .requestMatchers("/api/seller/**").hasAnyRole("SELLER","ADMIN")
                .requestMatchers("/internal/**","/ws","/ws/**").hasRole("SERVICE").anyRequest().authenticated())
            .oauth2ResourceServer(o -> o.jwt(j -> j.jwtAuthenticationConverter(converter)))
            .exceptionHandling(e -> e.authenticationEntryPoint((r,s,x) -> writeError(mapper,s,401,"UNAUTHENTICATED","Sign in to continue"))
                .accessDeniedHandler((r,s,x) -> writeError(mapper,s,403,"FORBIDDEN","Insufficient permission")));
        http.addFilterBefore(new OncePerRequestFilter() {
            @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain) throws ServletException,IOException {
                String path=request.getRequestURI().substring(request.getContextPath().length()); String key=request.getHeader("X-Service-Key");
                if((path.startsWith("/internal/") || path.startsWith("/ws")) && key!=null && MessageDigest.isEqual(key.getBytes(StandardCharsets.UTF_8),internalKey.getBytes(StandardCharsets.UTF_8))) {
                    SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("order-service",null,List.of(new SimpleGrantedAuthority("ROLE_SERVICE"))));
                }
                chain.doFilter(request,response);
            }
        },BearerTokenAuthenticationFilter.class);
        return http.build();
    }
    private static void writeError(ObjectMapper mapper,HttpServletResponse response,int status,String code,String message) throws IOException {
        response.setStatus(status); response.setContentType("application/json");
        mapper.writeValue(response.getOutputStream(),new Errors.ErrorBody(code,message,Map.of(),MDC.get("traceId")));
    }
    @Bean FilterRegistrationBean<OncePerRequestFilter> tracing() {
        var bean=new FilterRegistrationBean<OncePerRequestFilter>(); bean.setOrder(-110);
        bean.setFilter(new OncePerRequestFilter() {
            @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain) throws ServletException,IOException {
                String supplied=request.getHeader("X-Trace-Id");
                String trace=supplied!=null && supplied.matches("[a-zA-Z0-9-]{1,64}")?supplied:UUID.randomUUID().toString();
                MDC.put("traceId",trace); response.setHeader("X-Trace-Id",trace);
                try { chain.doFilter(request,response); } finally { MDC.remove("traceId"); }
            }
        }); return bean;
    }
    @Bean RestClient.Builder internalRestClient(@Value("${app.internal-key}") String key) {
        var factory=new JdkClientHttpRequestFactory(java.net.http.HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build());
        factory.setReadTimeout(Duration.ofSeconds(8));
        return RestClient.builder().requestFactory(factory).defaultHeader("X-Service-Key",key).requestInterceptor((request,body,execution) -> {
            String trace=MDC.get("traceId"); if(trace!=null) request.getHeaders().set("X-Trace-Id",trace);
            return execution.execute(request,body);
        });
    }
}
