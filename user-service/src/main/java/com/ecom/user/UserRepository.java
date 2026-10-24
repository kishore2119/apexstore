package com.ecom.user;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface UserRepository extends JpaRepository<User,UUID>, org.springframework.data.jpa.repository.JpaSpecificationExecutor<User> { Optional<User> findByEmail(String email); }
