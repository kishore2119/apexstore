package com.ecom.order;
import com.ecom.common.*;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import java.net.URI;
import java.util.UUID;
@RestController @RequestMapping("/api/orders")
public class OrderController {
    private final OrderService service;
    public OrderController(OrderService service) { this.service=service; }
    @PostMapping public ResponseEntity<OrderService.View> place(@RequestHeader(value="Idempotency-Key",required=false) String key,@Valid @RequestBody OrderService.Input input) {
        var order=service.place(key,input); HttpStatus status=order.status().equals("PENDING")?HttpStatus.ACCEPTED:order.status().equals("FAILED")?HttpStatus.CONFLICT:HttpStatus.OK;
        return ResponseEntity.status(status).location(URI.create("/api/orders/"+order.id())).body(order);
    }
    @GetMapping public Pages.Result<OrderService.View> list(@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="12") int size,@RequestParam(defaultValue="createdAt,desc") String sort,@RequestParam(required=false) String status) { return service.list(page,size,sort,status); }
    @GetMapping("/{id}") public OrderService.View get(@PathVariable UUID id) { return service.get(id); }
    @PostMapping("/{id}/cancel") public ResponseEntity<OrderService.View> cancel(@PathVariable UUID id) { var o=service.cancel(id); return ResponseEntity.status(o.status().equals("CANCEL_PENDING")?202:200).body(o); }
    @PostMapping("/{id}/invoice") public InvoiceContract.Invoice generate(@PathVariable UUID id) { return service.invoice(id,true); }
    @GetMapping("/{id}/invoice") public InvoiceContract.Invoice invoice(@PathVariable UUID id) { return service.invoice(id,false); }
}
