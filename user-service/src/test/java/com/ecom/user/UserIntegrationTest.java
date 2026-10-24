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

    @Test void emailFormatAndEightCharacterPasswordAreValidated() throws Exception {
        for(String email : new String[]{"missing-at", "name@localhost", "name@example..com", "name@-example.com"}) {
            mvc.perform(post("/api/auth/register").contentType("application/json").content(json.writeValueAsString(java.util.Map.of("name","Validation","email",email,"password","eight123")))).andExpect(status().isBadRequest());
        }
        mvc.perform(post("/api/auth/register").contentType("application/json").content(json.writeValueAsString(java.util.Map.of("name","Validation","email","eight@example.test","password","short12")))).andExpect(status().isBadRequest());
        mvc.perform(post("/api/auth/register").contentType("application/json").content(json.writeValueAsString(java.util.Map.of("name","Validation","email","eight@example.test","password","eight123")))).andExpect(status().isCreated());
    }
    @Test void adminIsSeparateAndCustomerSearchIsProtected() throws Exception {
        String result=mvc.perform(post("/api/auth/admin/login").contentType("application/json").content(json.writeValueAsString(java.util.Map.of("adminId","ECOM-ADMIN","password","admin-test-password"))))
            .andExpect(status().isOk()).andExpect(jsonPath("$.user.roles.length()").value(1)).andExpect(jsonPath("$.user.roles[0]").value("ADMIN")).andReturn().getResponse().getContentAsString();
        String token=json.readTree(result).get("accessToken").asText();
        mvc.perform(post("/api/auth/login").contentType("application/json").content(json.writeValueAsString(java.util.Map.of("email","admin@example.test","password","admin-test-password")))).andExpect(status().isForbidden());
        mvc.perform(post("/api/users/me/seller").header("Authorization","Bearer "+token)).andExpect(status().isForbidden());
        String buyer=mvc.perform(post("/api/auth/register").contentType("application/json").content(json.writeValueAsString(java.util.Map.of("name","Searchable Customer","email","search-person@example.test","password","eight123")))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String buyerToken=json.readTree(buyer).get("accessToken").asText();
        mvc.perform(get("/api/admin/users?search=SEARCHABLE").header("Authorization","Bearer "+token)).andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1));
        mvc.perform(get("/api/admin/users?search=search-person@").header("Authorization","Bearer "+token)).andExpect(status().isOk()).andExpect(jsonPath("$.content[0].email").value("search-person@example.test"));
        mvc.perform(get("/api/admin/users?search=admin@example.test").header("Authorization","Bearer "+token)).andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(0));
        mvc.perform(get("/api/admin/users").header("Authorization","Bearer "+buyerToken)).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/users")).andExpect(status().isUnauthorized());
    }

    @Test void pauseSignInRequiresAdminAndCannotTargetAdministrators() throws Exception {
        String session=mvc.perform(post("/api/auth/admin/login").contentType("application/json").content(json.writeValueAsString(java.util.Map.of("adminId","ECOM-ADMIN","password","admin-test-password")))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String token=json.readTree(session).get("accessToken").asText();
        String buyer=mvc.perform(post("/api/auth/register").contentType("application/json").content(json.writeValueAsString(java.util.Map.of("name","Paused Customer","email","paused@example.test","password","eight123")))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String id=json.readTree(buyer).get("user").get("id").asText();
        mvc.perform(patch("/api/admin/users/"+id+"/status").header("Authorization","Bearer "+token).contentType("application/json").content("{\"enabled\":false}")).andExpect(status().isOk()).andExpect(jsonPath("$.enabled").value(false));
        mvc.perform(post("/api/auth/login").contentType("application/json").content(json.writeValueAsString(java.util.Map.of("email","paused@example.test","password","eight123")))).andExpect(status().isUnauthorized());
        mvc.perform(patch("/api/admin/users/"+id+"/status").header("Authorization","Bearer "+token).contentType("application/json").content("{\"enabled\":null}")).andExpect(status().isBadRequest());
        mvc.perform(patch("/api/admin/users/"+json.readTree(session).get("user").get("id").asText()+"/status").header("Authorization","Bearer "+token).contentType("application/json").content("{\"enabled\":false}")).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/users/summary").header("Authorization","Bearer "+token)).andExpect(status().isOk()).andExpect(jsonPath("$.paused").value(1));
    }
}
