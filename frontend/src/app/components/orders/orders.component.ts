import { Component, OnDestroy, effect, untracked, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { OrderService } from '../../services/order.service';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { Invoice, Order, OrderStatus } from '../../models/ecom.models';
import { InvoiceModalComponent } from '../invoice-modal/invoice-modal.component';
import { AuthModalComponent } from '../auth-modal/auth-modal.component';

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [CommonModule, RouterModule, InvoiceModalComponent, AuthModalComponent],
  templateUrl: './orders.component.html',
  styleUrls: ['./orders.component.css']
})
export class OrdersComponent implements OnDestroy {
  private readonly orderService = inject(OrderService);
  readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  orders = signal<Order[]>([]);
  isLoading = signal(true);
  loadError = signal(false);
  currentPage = signal(0);
  totalPages = signal(1);
  totalElements = signal(0);

  // Active filter tab
  activeTab = signal<'ALL' | OrderStatus>('ALL');

  // Active invoice modal
  selectedInvoice = signal<Invoice | null>(null);
  isInvoiceLoading = signal(false);
  isAuthModalOpen = signal(false);
  private loadSubscription?: Subscription;

  constructor() {
    effect(() => {
      const user = this.auth.currentUser();
      untracked(() => { this.loadSubscription?.unsubscribe(); this.selectedInvoice.set(null); this.currentPage.set(0); this.orders.set([]); if (user) this.loadOrders(); else this.isLoading.set(false); });
    });
  }

  loadOrders(): void {
    this.isLoading.set(true);
    this.loadError.set(false);
    this.loadSubscription?.unsubscribe();
    this.loadSubscription = this.orderService.getMyOrders(this.currentPage(), 10, 'createdAt,desc', this.activeTab()).subscribe({
      next: (res) => {
        this.orders.set(res.content);
        this.totalPages.set(res.totalPages);
        this.totalElements.set(res.totalElements);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.loadError.set(true);
        this.orders.set([]);
        this.toast.error('Could not load orders: ' + (err.error?.message || err.message));
      }
    });
  }

  filteredOrders(): Order[] {
    return this.orders();
  }

  setTab(tab: 'ALL' | OrderStatus): void { this.activeTab.set(tab); this.currentPage.set(0); this.loadOrders(); }
  goToPage(page: number): void { if (page >= 0 && page < this.totalPages()) { this.currentPage.set(page); this.loadOrders(); } }

  cancelOrder(order: Order): void {
    if (!confirm(`Are you sure you want to cancel Order #${order.id.substring(0, 8)}? `)) {
      return;
    }

    this.orderService.cancelOrder(order.id).subscribe({
      next: (cancelled) => {
        this.toast.success(cancelled.status === 'CANCELLED' ? 'Order cancelled.' : 'Your cancellation is being processed.');
        this.loadOrders();
      },
      error: (err) => {
        const msg = err.error?.message || 'Cannot cancel order (invoice may already be generated or order is closed).';
        this.toast.error(msg);
      }
    });
  }

  viewInvoice(orderId: string): void {
    if (this.isInvoiceLoading()) return;
    this.isInvoiceLoading.set(true);
    this.orderService.generateInvoice(orderId).subscribe({
      next: (inv) => {
        this.isInvoiceLoading.set(false);
        this.selectedInvoice.set(inv);
        this.loadOrders();
      },
      error: (err) => {
        this.isInvoiceLoading.set(false);
        this.loadOrders();
        this.toast.error('We couldn’t load your invoice. Please try again.');
      }
    });
  }

  pollPending(orderId: string): void {
    this.orderService.getOrder(orderId).subscribe({
      next: (updated) => {
        this.toast.info(`Current status: ${updated.status}`);
        this.loadOrders();
      }, error: () => this.toast.error('Could not refresh this order. Try again.')
    });
  }
  ngOnDestroy(): void { this.loadSubscription?.unsubscribe(); }
}
