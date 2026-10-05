package com.ecom.user;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.assertj.core.api.Assertions.*;
@SpringBootTest(properties={"app.admin-email=admin@example.test","app.admin-password=admin-test-password","app.admin-login-id=ECOM-ADMIN"}) @AutoConfigureMockMvc @ActiveProfiles("test")
class UserIntegrationTest {
    @Autowired MockMvc mvc; @Autowired ObjectMapper json; @Autowired UserRepository users;
    @Test void registrationHashesPasswordAndCannotGrantAdmin() throws Exception {
        String response=mvc.perform(post("/api/auth/register").contentType("application/json").content("{\"name\":\"Buyer\",\"email\":\"buyer@example.test\",\"password\":\"secure-test-password\",\"roles\":[\"ADMIN\"]}"))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.user.roles[0]").value("CUSTOMER")).andReturn().getResponse().getContentAsString();
        assertThat(users.findByEmail("buyer@example.test").orElseThrow().passwordHash).startsWith("$2a$").isNotEqualTo("secure-test-password");
        String token=json.readTree(response).get("accessToken").asText();
        mvc.perform(get("/api/users/me").header("Authorization","Bearer "+token)).andExpect(status().isOk());
        mvc.perform(post("/api/users/me/seller").header("Authorization","Bearer "+token)).andExpect(status().isOk()).andExpect(jsonPath("$.user.roles").isArray());
        mvc.perform(post("/api/auth/login").contentType("application/json").content("{\"email\":\"buyer@example.test\",\"password\":\"incorrect-password\"}")).andExpect(status().isUnauthorized());
    }
    @Test void unauthenticatedProfileIsRejected() throws Exception { mvc.perform(get("/api/users/me")).andExpect(status().isUnauthorized()); }
    @Test void adminLoginRequiresUniqueIdAndAdminPassword() throws Exception {
        mvc.perform(post("/api/auth/admin/login").contentType("application/json").content("{\"adminId\":\"ECOM-ADMIN\",\"password\":\"admin-test-password\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.user.roles").value(org.hamcrest.Matchers.hasItem("ADMIN")));
        mvc.perform(post("/api/auth/admin/login").contentType("application/json").content("{\"adminId\":\"wrong-id\",\"password\":\"admin-test-password\"}"))
            .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/admin/login").contentType("application/json").content("{\"adminId\":\"ECOM-ADMIN\",\"password\":\"customer-password\"}"))
            .andExpect(status().isUnauthorized());
    }
}
