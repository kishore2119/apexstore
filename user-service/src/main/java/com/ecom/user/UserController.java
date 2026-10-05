package com.ecom.user;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
@RestController
public class UserController {
    private final UserService service;
    public UserController(UserService service) { this.service=service; }
    @PostMapping("/api/auth/register") @ResponseStatus(HttpStatus.CREATED) public UserService.Session register(@Valid @RequestBody UserService.Registration body) { return service.register(body); }
    @PostMapping("/api/auth/login") public UserService.Session login(@Valid @RequestBody UserService.Login body) { return service.login(body); }
    @PostMapping("/api/auth/admin/login") public UserService.Session adminLogin(@Valid @RequestBody UserService.AdminLogin body) { return service.adminLogin(body); }
    @GetMapping("/api/users/me") public UserService.Profile me() { return service.me(); }
    @PostMapping("/api/users/me/seller") public UserService.Session seller() { return service.seller(); }
}
