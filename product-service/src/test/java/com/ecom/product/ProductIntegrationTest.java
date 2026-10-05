package com.ecom.product;
import com.ecom.common.*;
import com.ecom.common.StockContracts.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import java.math.BigDecimal;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
@SpringBootTest(properties="app.upload-directory=.local/test-uploads") @AutoConfigureMockMvc @ActiveProfiles("test")
class ProductIntegrationTest {
    @Autowired InventoryService inventory; @Autowired ProductRepository products; @Autowired Transactions tx; @Autowired MockMvc mvc;
    Product product(int stock) { return tx.run(() -> { Product p=new Product(); p.sellerId=UUID.randomUUID(); p.sku=UUID.randomUUID().toString(); p.name="Keyboard"; p.description="Test"; p.category="Electronics"; p.price=new BigDecimal("500.00"); p.stockOnHand=stock; return products.saveAndFlush(p); }); }
    @Test void generatedCodesAreUniqueAndDoNotRequireSellerInput() throws Exception {
        var actor=jwt().jwt(j -> j.subject(UUID.randomUUID().toString())).authorities(new SimpleGrantedAuthority("ROLE_SELLER"));
        String body="{\"name\":\"Photo listing\",\"description\":\"Test\",\"category\":\"Home\",\"price\":100,\"stockOnHand\":3}";
        String first=mvc.perform(post("/api/seller/products").with(actor).contentType("application/json").content(body)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String second=mvc.perform(post("/api/seller/products").with(actor).contentType("application/json").content(body)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        var json=new com.fasterxml.jackson.databind.ObjectMapper();
        assertThat(json.readTree(first).get("sku").asText()).startsWith("PRD-").isNotEqualTo(json.readTree(second).get("sku").asText());
    }
    @Test void localPhotoUploadRequiresSellerAndRejectsNonImages() throws Exception {
        var out=new java.io.ByteArrayOutputStream();
        var pixels=new java.awt.image.BufferedImage(2,2,java.awt.image.BufferedImage.TYPE_INT_RGB);
        pixels.setRGB(0,0,0xff0000); javax.imageio.ImageIO.write(pixels,"png",out);
        var file=new org.springframework.mock.web.MockMultipartFile("file","../../photo.png","image/png",out.toByteArray());
        mvc.perform(multipart("/api/seller/products/images").file(file).with(jwt().authorities(new SimpleGrantedAuthority("ROLE_CUSTOMER")))).andExpect(status().isForbidden());
        var seller=jwt().authorities(new SimpleGrantedAuthority("ROLE_SELLER"));
        mvc.perform(multipart("/api/admin/products/images").file(file).with(seller)).andExpect(status().isForbidden());
        String response=mvc.perform(multipart("/api/seller/products/images").file(file).with(seller)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String path=new com.fasterxml.jackson.databind.ObjectMapper().readTree(response).get("imageUrl").asText();
        assertThat(path).matches("/api/products/images/[a-f0-9-]+\\.png");
        byte[] bytes=mvc.perform(get(path)).andExpect(status().isOk()).andExpect(content().contentType("image/png")).andReturn().getResponse().getContentAsByteArray();
        assertThat(javax.imageio.ImageIO.read(new java.io.ByteArrayInputStream(bytes)).getRGB(0,0)&0xffffff).isEqualTo(0xff0000);
        var fake=new org.springframework.mock.web.MockMultipartFile("file","fake.png","image/png","<script>bad</script>".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        mvc.perform(multipart("/api/seller/products/images").file(fake).with(seller)).andExpect(status().isBadRequest());
        java.nio.file.Files.deleteIfExists(java.nio.file.Path.of(".local/test-uploads",path.substring(path.lastIndexOf('/')+1)));
    }
    @Test void retriesDoNotDeductOrRestoreTwice() {
        Product p=product(10); UUID order=UUID.randomUUID(); Request r=new Request(List.of(new Item(p.id,3)));
        inventory.reserve(order,r); inventory.reserve(order,r); assertThat(products.findById(p.id).orElseThrow().reserved).isEqualTo(3);
        inventory.transition(order,"CONFIRMED"); inventory.transition(order,"CONFIRMED"); assertThat(products.findById(p.id).orElseThrow().stockOnHand).isEqualTo(7);
        inventory.transition(order,"CANCELLED"); inventory.transition(order,"CANCELLED"); assertThat(products.findById(p.id).orElseThrow().stockOnHand).isEqualTo(10);
    }
    @Test void failedMultiItemReservationRollsBack() {
        Product first=product(10),second=product(0);
        assertThatThrownBy(() -> inventory.reserve(UUID.randomUUID(),new Request(List.of(new Item(first.id,2),new Item(second.id,1))))).isInstanceOf(ApiException.class);
        assertThat(products.findById(first.id).orElseThrow().reserved).isZero();
    }
    @Test void concurrentOrdersCannotOversell() throws Exception {
        Product p=product(1); var pool=Executors.newFixedThreadPool(2); var start=new CountDownLatch(1);
        try {
            Callable<Boolean> buy=() -> { start.await(); try { inventory.reserve(UUID.randomUUID(),new Request(List.of(new Item(p.id,1)))); return true; } catch(RuntimeException e) { return false; } };
            var a=pool.submit(buy); var b=pool.submit(buy); start.countDown();
            assertThat(List.of(a.get(15,TimeUnit.SECONDS),b.get(15,TimeUnit.SECONDS))).containsExactlyInAnyOrder(true,false);
            assertThat(products.findById(p.id).orElseThrow().reserved).isEqualTo(1);
        } finally { pool.shutdownNow(); }
    }
    @Test void sellerCannotEditAnotherSellersProductOrUseAdminRoute() throws Exception {
        Product p=product(4); String body="{\"sku\":\"edit-test\",\"name\":\"Changed\",\"description\":\"Test\",\"category\":\"Test\",\"price\":100}";
        var stranger=jwt().jwt(j -> j.subject(UUID.randomUUID().toString())).authorities(new SimpleGrantedAuthority("ROLE_SELLER"));
        mvc.perform(put("/api/seller/products/"+p.id).with(stranger).contentType("application/json").content(body)).andExpect(status().isForbidden());
        mvc.perform(post("/api/admin/products").with(stranger).contentType("application/json").content(body)).andExpect(status().isForbidden());
        mvc.perform(post("/internal/reservations/"+UUID.randomUUID()).with(stranger).contentType("application/json").content("{\"items\":[]}")).andExpect(status().isForbidden());
        mvc.perform(get("/api/products?size=1000")).andExpect(status().isBadRequest());
    }
    @Test void adminCanCreateProducts() throws Exception {
        mvc.perform(post("/api/admin/products").with(jwt().jwt(j -> j.subject(UUID.randomUUID().toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
          .contentType("application/json").content("{\"sku\":\"admin-test\",\"name\":\"Admin Product\",\"description\":\"Test\",\"category\":\"Test\",\"price\":10}"))
          .andExpect(status().isCreated());
    }
    @Test void priceAndAvailabilityFiltersApplyBeforePagination() throws Exception {
        for(int i=0;i<15;i++) {
            final int n=i;
            tx.run(() -> { Product p=new Product(); p.sellerId=UUID.randomUUID(); p.sku=UUID.randomUUID().toString(); p.name="Filter item "+n; p.category="FilterChecks"; p.description="Test"; p.price=BigDecimal.valueOf(100L+n*100L); p.stockOnHand=n%2==0?5:0; products.saveAndFlush(p); return null; });
        }
        mvc.perform(get("/api/products?category=FilterChecks&minPrice=300&maxPrice=1100&inStock=true&size=2&sort=price,asc"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(5)).andExpect(jsonPath("$.totalPages").value(3)).andExpect(jsonPath("$.content[0].price").value(300));
        mvc.perform(get("/api/products?category=FilterChecks&minPrice=300&maxPrice=1100&inStock=true&size=2&page=2&sort=price,asc"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.content.length()").value(1)).andExpect(jsonPath("$.content[0].price").value(1100));
        mvc.perform(get("/api/products?minPrice=1000&maxPrice=100")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/products?minPrice=-1")).andExpect(status().isBadRequest());
    }
    @Test void initialStockIsValidatedAndSavedWithProduct() throws Exception {
        var admin=jwt().jwt(j -> j.subject(UUID.randomUUID().toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN"));
        String body="{\"sku\":\"atomic-stock\",\"name\":\"Stock Product\",\"description\":\"Test\",\"category\":\"Test\",\"price\":100,\"stockOnHand\":12}";
        mvc.perform(post("/api/admin/products").with(admin).contentType("application/json").content(body)).andExpect(status().isCreated()).andExpect(jsonPath("$.availableStock").value(12));
        mvc.perform(post("/api/admin/products").with(admin).contentType("application/json").content(body.replace("atomic-stock","bad-stock").replace("12}","-1}"))).andExpect(status().isBadRequest());
        assertThat(products.findAll().stream().anyMatch(p -> p.sku.equals("bad-stock"))).isFalse();
    }
}
