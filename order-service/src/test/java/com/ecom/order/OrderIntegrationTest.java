package com.ecom.order;
import com.ecom.common.*;
import com.ecom.common.StockContracts.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.client.ResourceAccessException;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
@SpringBootTest @ActiveProfiles("test")
class OrderIntegrationTest {
    @Autowired OrderService service; @Autowired OrderWorkflowService workflow; @Autowired OrderRepository orders;
    @MockitoBean ProductClient products; @MockitoBean InvoiceClient invoices;
    UUID buyer,product,seller;
    @BeforeEach void login() {
        buyer=UUID.randomUUID(); product=UUID.randomUUID(); seller=UUID.randomUUID();
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(buyer.toString(),null,List.of(new SimpleGrantedAuthority("ROLE_CUSTOMER"))));
        when(products.reserve(any(),any())).thenAnswer(i -> new Reservation(i.getArgument(0),"RESERVED",List.of(new Line(product,seller,"Keyboard",new BigDecimal("500.00"),2))));
        when(products.transition(any(),eq("confirm"))).thenAnswer(i -> new Reservation(i.getArgument(0),"CONFIRMED",List.of()));
    }
    @AfterEach void logout() { SecurityContextHolder.clearContext(); }
    OrderService.Input input() { return new OrderService.Input("Buyer","buyer@example.test","Test delivery address",List.of(new Item(product,2))); }
    @Test void structuredAddressAndDemoPaymentPersistAndParticipateInIdempotency() {
        var address=new OrderService.DeliveryAddress("12 Demo Street","","Kakinada","Andhra Pradesh","533001","India","9000000000");
        var input=new OrderService.Input("Buyer","buyer@example.test",address.formatted(),List.of(new Item(product,2)),address,"ONLINE_DEMO");
        String key=UUID.randomUUID().toString(); var placed=service.place(key,input);
        assertThat(service.get(placed.id()).deliveryAddress()).isEqualTo(address);
        assertThat(service.get(placed.id()).paymentMethod()).isEqualTo("ONLINE_DEMO");
        assertThat(service.get(placed.id()).paymentStatus()).isEqualTo("DEMO_NOT_COLLECTED");
        assertThat(placed.address()).contains("Kakinada","533001");
        assertThat(service.place(key,input).id()).isEqualTo(placed.id());
        assertThatThrownBy(() -> service.place(key,new OrderService.Input(input.customerName(),input.customerEmail(),input.address(),input.items(),address,"COD")))
            .isInstanceOf(ApiException.class).hasMessageContaining("different order contents");
    }
    @Test void duplicateCheckoutReturnsSameOrderAndRejectsChangedBody() {
        String key=UUID.randomUUID().toString(); var first=service.place(key,input()); var again=service.place(key,input());
        assertThat(first.status()).isEqualTo("CONFIRMED"); assertThat(first.total()).isEqualByComparingTo("1000.00"); assertThat(again.id()).isEqualTo(first.id());
        verify(products,times(1)).reserve(any(),any());
        var changed=new OrderService.Input("Different","buyer@example.test","Test delivery address",List.of(new Item(product,2)));
        assertThatThrownBy(() -> service.place(key,changed)).isInstanceOf(ApiException.class).hasMessageContaining("different order contents");
    }
    @Test void interruptedConfirmationRecoversWithoutRecreatingOrder() {
        when(products.transition(any(),eq("confirm"))).thenThrow(new ResourceAccessException("Connection lost"));
        var pending=service.place(UUID.randomUUID().toString(),input()); assertThat(pending.status()).isEqualTo("PENDING");
        when(products.reserve(any(),any())).thenAnswer(i -> new Reservation(i.getArgument(0),"CONFIRMED",List.of(new Line(product,seller,"Keyboard",new BigDecimal("500.00"),2))));
        workflow.advance(pending.id()); assertThat(service.get(pending.id()).status()).isEqualTo("CONFIRMED");
        verify(products,times(1)).transition(any(),eq("confirm"));
    }
    @Test void cancellationRetriesRestoreStockOnce() {
        var placed=service.place(UUID.randomUUID().toString(),input());
        service.cancel(placed.id()); var again=service.cancel(placed.id());
        assertThat(again.status()).isEqualTo("CANCELLED"); verify(products,times(1)).transition(placed.id(),"cancel");
    }
    @Test void customerCannotReadAnotherCustomersOrder() {
        var placed=service.place(UUID.randomUUID().toString(),input());
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(UUID.randomUUID().toString(),null,List.of(new SimpleGrantedAuthority("ROLE_CUSTOMER"))));
        assertThatThrownBy(() -> service.get(placed.id())).isInstanceOf(ApiException.class).hasMessageContaining("cannot access");
    }
    @Test void invoiceSnapshotIsCachedAndLocksCancellation() {
        var placed=service.place(UUID.randomUUID().toString(),input());
        when(invoices.generate(any())).thenReturn(new InvoiceContract.Invoice(UUID.randomUUID(),"INV-test",placed.id(),"Buyer","buyer@example.test","Test delivery address","INR",new BigDecimal("1000.00"),Instant.now(),List.of(new InvoiceContract.Item(product,seller,"Keyboard",2,new BigDecimal("500.00")))));
        var invoice=service.invoice(placed.id(),true); assertThat(service.invoice(placed.id(),false).invoiceNumber()).isEqualTo(invoice.invoiceNumber());
        service.invoice(placed.id(),true); verify(invoices,times(1)).generate(any());
        assertThatThrownBy(() -> service.cancel(placed.id())).isInstanceOf(ApiException.class).hasMessageContaining("invoice generation");
    }
    @Test void invoiceOutageDoesNotUndoOrder() {
        var placed=service.place(UUID.randomUUID().toString(),input()); when(invoices.generate(any())).thenThrow(new ResourceAccessException("unavailable"));
        assertThatThrownBy(() -> service.invoice(placed.id(),true)).isInstanceOf(ApiException.class);
        assertThat(service.get(placed.id()).status()).isEqualTo("CONFIRMED");
    }
    @Test void statusFiltersAndPaginationOnlyReturnThisBuyersOrders() {
        for(int i=0;i<12;i++) service.place(UUID.randomUUID().toString(),input());
        var first=service.list(0,5,"createdAt,desc","CONFIRMED");
        assertThat(first.totalElements()).isEqualTo(12); assertThat(first.totalPages()).isEqualTo(3);
        assertThat(service.list(2,5,"createdAt,desc","CONFIRMED").content()).hasSize(2);
        service.cancel(first.content().getFirst().id());
        assertThat(service.list(0,5,"createdAt,desc","CANCELLED").totalElements()).isEqualTo(1);
        assertThat(service.list(0,5,"createdAt,desc","CONFIRMED").totalElements()).isEqualTo(11);
        assertThatThrownBy(() -> service.list(0,5,"createdAt,desc","BOGUS")).isInstanceOf(ApiException.class);
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(UUID.randomUUID().toString(),null,List.of(new SimpleGrantedAuthority("ROLE_CUSTOMER"))));
        assertThat(service.list(0,5,"createdAt,desc",null).totalElements()).isZero();
    }
}
