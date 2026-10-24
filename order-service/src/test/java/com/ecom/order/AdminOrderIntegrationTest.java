package com.ecom.order;
import com.ecom.common.Transactions;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import java.util.*;
import java.time.Instant;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test")
class AdminOrderIntegrationTest {
    @Autowired MockMvc mvc; @Autowired OrderRepository orders; @Autowired Transactions tx;
    @Test void adminSeesAccurateCountsRecentOrdersAndBuyerFiltering() throws Exception {
        UUID buyer=UUID.randomUUID(),other=UUID.randomUUID(),empty=UUID.randomUUID();
        long before=orders.count();
        var beforeCounts=new java.util.HashMap<String,Long>(); orders.statusCounts().forEach(c -> beforeCounts.put(c.getStatus(),c.getTotal()));
        for(int i=0;i<3;i++) { final int n=i; tx.run(() -> {
            PurchaseOrder o=new PurchaseOrder(); o.buyerId=n==2?other:buyer; o.customerName="Report Customer"; o.customerEmail="report@example.test";
            o.address="Test address"; o.idempotencyKey=UUID.randomUUID().toString(); o.requestHash="test"; o.status=n==0?"CANCELLED":"CONFIRMED"; o.createdAt=Instant.now().plusSeconds(100+n); orders.saveAndFlush(o); return null;
        }); }
        var admin=jwt().jwt(j -> j.subject(UUID.randomUUID().toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN"));
        mvc.perform(get("/api/admin/orders/summary").with(admin)).andExpect(status().isOk()).andExpect(jsonPath("$.total").value((int)before+3)).andExpect(jsonPath("$.confirmed").value(beforeCounts.getOrDefault("CONFIRMED",0L).intValue()+2)).andExpect(jsonPath("$.cancelled").value(beforeCounts.getOrDefault("CANCELLED",0L).intValue()+1));
        mvc.perform(post("/api/admin/orders/customer-stats").with(admin).contentType("application/json").content("{\"ids\":[\""+buyer+"\",\""+empty+"\"]}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$[0].total").value(2)).andExpect(jsonPath("$[1].total").value(0)).andExpect(jsonPath("$[1].latestOrderAt").isEmpty());
        mvc.perform(get("/api/admin/orders?size=1").with(admin)).andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value((int)before+3)).andExpect(jsonPath("$.content[0].buyerId").value(other.toString()));
        mvc.perform(get("/api/admin/orders?buyerId="+buyer+"&status=CONFIRMED").with(admin)).andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1));
        mvc.perform(get("/api/admin/orders?status=BOGUS").with(admin)).andExpect(status().isBadRequest());
    }
    @Test void reportingIsAdminOnlyAndEvenLegacyAdminTokensCannotShop() throws Exception {
        var customer=jwt().authorities(new SimpleGrantedAuthority("ROLE_CUSTOMER"));
        mvc.perform(get("/api/admin/orders").with(customer)).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/orders/summary").with(customer)).andExpect(status().isForbidden());
        mvc.perform(post("/api/admin/orders/customer-stats").with(customer).contentType("application/json").content("{\"ids\":[]}")).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/orders")).andExpect(status().isUnauthorized());
        var legacyAdmin=jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"),new SimpleGrantedAuthority("ROLE_CUSTOMER"));
        mvc.perform(get("/api/orders").with(legacyAdmin)).andExpect(status().isForbidden());
        mvc.perform(post("/api/orders").with(legacyAdmin).header("Idempotency-Key","admin-order-attempt").contentType("application/json").content("{\"customerName\":\"Admin\",\"customerEmail\":\"admin@example.test\",\"address\":\"Test\",\"items\":[{\"productId\":\""+UUID.randomUUID()+"\",\"quantity\":1}]}" )).andExpect(status().isForbidden());
    }
}
