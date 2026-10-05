import { Component, DestroyRef, EventEmitter, OnInit, OnDestroy, Output, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, exhaustMap, finalize, of, Subscription, take, timer } from 'rxjs';
import { DialogDirective } from '../../directives/dialog.directive';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { CartService } from '../../services/cart.service';
import { OrderService } from '../../services/order.service';
import { ToastService } from '../../services/toast.service';
import { CheckoutAttempt, CheckoutAttemptService } from '../../services/checkout-attempt.service';
import { apiError } from '../../services/api-error';
import { Order, OrderRequest } from '../../models/ecom.models';

@Component({
  selector: 'app-checkout-modal', standalone: true,
  imports: [DialogDirective, CommonModule, FormsModule],
  templateUrl: './checkout-modal.component.html', styleUrls: ['./checkout-modal.component.css']
})
export class CheckoutModalComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  readonly cart = inject(CartService);
  private readonly orderService = inject(OrderService);
  private readonly toast = inject(ToastService);
  private readonly attempts = inject(CheckoutAttemptService);
  private readonly destroyRef = inject(DestroyRef);
  @Output() close = new EventEmitter<void>();
  @Output() orderCompleted = new EventEmitter<string>();
  customerName = '';
  customerEmail = '';
  address = '';
  addressLine1 = '';
  addressLine2 = '';
  city = '';
  state = '';
  pincode = '';
  phone = '';
  country = 'India';
  paymentMethod: 'COD' | 'ONLINE_DEMO' = 'COD';
  readonly states = ['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Andaman and Nicobar Islands','Chandigarh','Dadra and Nagar Haveli and Daman and Diu','Delhi','Jammu and Kashmir','Ladakh','Lakshadweep','Puducherry'];
  isSubmitting = signal(false);
  isPolling = signal(false);
  errorMessage = signal<string | null>(null);
  placedOrder = signal<Order | null>(null);
  attempt = signal<CheckoutAttempt | null>(null);
  private polling?: Subscription;

  ngOnInit(): void {
    const user = this.auth.currentUser();
    this.customerName = user?.name || '';
    this.customerEmail = user?.email || '';
    const saved = user ? this.attempts.load(user.id) : null;
    if (saved) {
      this.attempt.set(saved);
      this.customerName = saved.payload.customerName;
      this.customerEmail = saved.payload.customerEmail;
      this.address = saved.payload.address;
      const delivery = saved.payload.deliveryAddress;
      this.addressLine1 = delivery?.line1 || saved.payload.address;
      this.addressLine2 = delivery?.line2 || '';
      this.city = delivery?.city || '';
      this.state = delivery?.state || '';
      this.pincode = delivery?.pincode || '';
      this.phone = delivery?.phone || '';
      this.country = delivery?.country || 'India';
      this.paymentMethod = saved.payload.paymentMethod || 'COD';
      if (saved.orderId) {
        this.isSubmitting.set(true);
        this.orderService.getOrder(saved.orderId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
          next: order => { this.isSubmitting.set(false); this.acceptOrder(order); },
          error: () => { this.isSubmitting.set(false); this.errorMessage.set('We could not check your previous order. Retry confirmation or check My Orders.'); }
        });
      } else this.errorMessage.set('Your previous checkout needs confirmation. Retry below; your order will not be duplicated.');
    }
  }

  submitOrder(): void {
    if (this.isSubmitting() || this.isPolling()) return;
    const buyer = this.auth.currentUser();
    if (!buyer) { this.errorMessage.set('Please sign in before placing an order.'); return; }
    let attempt = this.attempt();
    if (!attempt) {
      if (!this.customerName.trim() || !this.customerEmail.trim() || !this.addressLine1.trim() || !this.city.trim() || !this.state || !/^[1-9]\d{5}$/.test(this.pincode) || !/^[6-9]\d{9}$/.test(this.phone)) { this.errorMessage.set('Enter your contact details, address, city, state, six-digit pincode, and ten-digit mobile number.'); return; }
      if (!this.cart.canCheckout()) { this.errorMessage.set('Review unavailable items and quantities in your bag.'); return; }
      const deliveryAddress = { line1: this.addressLine1.trim(), line2: this.addressLine2.trim(), city: this.city.trim(), state: this.state, pincode: this.pincode, country: this.country, phone: this.phone };
      this.address = [deliveryAddress.line1, deliveryAddress.line2, deliveryAddress.city, deliveryAddress.state + ' - ' + deliveryAddress.pincode, deliveryAddress.country].filter(Boolean).join(', ') + '. Phone: ' + this.phone;
      const payload: OrderRequest = {
        customerName: this.customerName.trim(), customerEmail: this.customerEmail.trim(), address: this.address,
        deliveryAddress, paymentMethod: this.paymentMethod,
        items: this.cart.items().map(item => ({ productId: item.product.id, quantity: item.quantity }))
      };
      attempt = { buyerId: buyer.id, key: 'checkout-' + crypto.randomUUID(), payload };
      this.attempt.set(attempt);
      this.attempts.save(attempt);
    }
    this.errorMessage.set(null);
    this.isSubmitting.set(true);
    this.orderService.placeOrder(attempt.payload, attempt.key).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: response => {
        this.isSubmitting.set(false);
        if (response.body) this.acceptOrder(response.body);
        else this.errorMessage.set('We couldn’t confirm the response. Retry with the same order below.');
      },
      error: error => {
        this.isSubmitting.set(false);
        if (error.status === 409 && error.error?.id) this.acceptOrder(error.error);
        else {
          if ([400, 401, 403, 422].includes(error.status)) { this.attempts.clear(); this.attempt.set(null); }
          this.errorMessage.set(apiError(error, 'Confirmation was interrupted. Retry below to check the same order, or check My Orders.'));
        }
      }
    });
  }

  private acceptOrder(order: Order): void {
    this.placedOrder.set(order);
    if (order.status === 'CONFIRMED' || order.status === 'PENDING') {
      const attempt = this.attempt();
      if (attempt) { const saved = { ...attempt, orderId: order.id }; this.attempt.set(saved); this.attempts.save(saved); }
      if (order.status === 'CONFIRMED') this.cart.clearCart();
      if (order.status === 'PENDING') this.startPolling(order.id);
      else { this.polling?.unsubscribe(); this.toast.success('Your order is confirmed.'); }
    } else {
      this.polling?.unsubscribe();
      this.attempts.clear();
      this.attempt.set(null);
      this.errorMessage.set(order.status === 'FAILED' ? 'One or more items are no longer available in the requested quantity. Review your bag before trying again.' : 'This order is closed. You can view its status in My Orders.');
    }
  }

  private startPolling(id: string): void {
    if (this.polling && !this.polling.closed) return;
    this.isPolling.set(true);
    this.polling = timer(2000, 3000).pipe(
      exhaustMap(() => this.orderService.getOrder(id).pipe(catchError(() => of(null)))),
      take(16), takeUntilDestroyed(this.destroyRef),
      finalize(() => {
        this.isPolling.set(false);
        if (this.placedOrder()?.status === 'PENDING') this.errorMessage.set('Your order is still processing. You can check its progress in My Orders.');
      })
    ).subscribe(order => { if (order && order.status !== 'PENDING') this.acceptOrder(order); });
  }

  generateNewIdempotencyKey(): void {
    // Only offered after the server has returned a final failure.
    this.attempts.clear(); this.attempt.set(null); this.placedOrder.set(null); this.errorMessage.set(null);
  }
  ngOnDestroy(): void { this.polling?.unsubscribe(); }
  finishOrder(): void {
    const order = this.placedOrder();
    if (order) { this.attempts.clear(); this.orderCompleted.emit(order.id); }
    else this.close.emit();
  }
  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop') && !this.isSubmitting() && !this.isPolling()) this.close.emit();
  }
}
