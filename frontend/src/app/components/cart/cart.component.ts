import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { CartService } from '../../services/cart.service';
import { AuthService } from '../../services/auth.service';
import { CheckoutModalComponent } from '../checkout-modal/checkout-modal.component';
import { AuthModalComponent } from '../auth-modal/auth-modal.component';
import { CheckoutAttemptService } from '../../services/checkout-attempt.service';

@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [CommonModule, RouterModule, CheckoutModalComponent, AuthModalComponent],
  templateUrl: './cart.component.html',
  styleUrls: ['./cart.component.css']
})
export class CartComponent implements OnInit {
  readonly cart = inject(CartService);
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly attempts = inject(CheckoutAttemptService);

  isCheckoutOpen = signal(false);
  isAuthModalOpen = signal(false);
  isRefreshing = signal(false);
  refreshError = signal(false);

  ngOnInit(): void { this.refreshCart(false); }

  refreshCart(checkout: boolean): void {
    if (this.isRefreshing()) return;
    this.isRefreshing.set(true);
    this.refreshError.set(false);
    this.cart.refreshProducts().subscribe({
      next: () => { this.isRefreshing.set(false); if (checkout && this.cart.canCheckout()) this.isCheckoutOpen.set(true); },
      error: () => { this.isRefreshing.set(false); this.refreshError.set(true); }
    });
  }

  openCheckout(): void {
    if (!this.auth.isAuthenticated()) {
      this.isAuthModalOpen.set(true);
      return;
    }
    if (this.attempts.load(this.auth.currentUser()!.id)) { this.isCheckoutOpen.set(true); return; }
    this.refreshCart(true);
  }

  onAuthClosed(): void { this.isAuthModalOpen.set(false); if (this.auth.isAuthenticated()) this.openCheckout(); }

  closeCheckout(): void {
    this.isCheckoutOpen.set(false);
  }

  onOrderSuccess(orderId: string): void {
    this.cart.clearCart();
    this.isCheckoutOpen.set(false);
    this.router.navigate(['/orders']);
  }
}
