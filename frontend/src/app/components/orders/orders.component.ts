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
  styleUrls: ['./orders.component.css'],
})
export class OrdersComponent implements OnDestroy {
  private readonly orderService = inject(OrderService);
  readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly orders = signal<Order[]>([]);
  readonly isLoading = signal(true);
  readonly loadError = signal(false);
  readonly currentPage = signal(0);
  readonly totalPages = signal(0);
  readonly totalElements = signal(0);
  readonly activeTab = signal<'ALL' | OrderStatus>('ALL');
  readonly selectedInvoice = signal<Invoice | null>(null);
  readonly isInvoiceLoading = signal(false);
  readonly invoiceOrderId = signal<string | null>(null);
  readonly busyOrders = signal<string[]>([]);
  readonly isAuthModalOpen = signal(false);
  private loadSubscription?: Subscription;
  private actions = new Subscription();
  private destroyed = false;

  constructor() {
    effect(() => {
      const buyerId = this.auth.currentUser()?.id;
      untracked(() => {
        this.loadSubscription?.unsubscribe();
        this.actions.unsubscribe();
        this.actions = new Subscription();
        this.selectedInvoice.set(null);
        this.isInvoiceLoading.set(false);
        this.invoiceOrderId.set(null);
        this.busyOrders.set([]);
        this.currentPage.set(0);
        this.totalPages.set(0);
        this.totalElements.set(0);
        this.orders.set([]);
        if (buyerId) {
          this.isAuthModalOpen.set(false);
          this.loadOrders();
        } else this.isLoading.set(false);
      });
    });
  }

  private isCurrentBuyer(buyerId: string | undefined): boolean {
    return !!buyerId && !this.destroyed && this.auth.currentUser()?.id === buyerId;
  }

  loadOrders(): void {
    const buyerId = this.auth.currentUser()?.id;
    if (!buyerId || this.destroyed) return;
    this.isLoading.set(true);
    this.loadError.set(false);
    this.loadSubscription?.unsubscribe();
    this.loadSubscription = this.orderService
      .getMyOrders(this.currentPage(), 10, 'createdAt,desc', this.activeTab())
      .subscribe({
        next: (response) => {
          if (!this.isCurrentBuyer(buyerId)) return;
          if (response.totalPages > 0 && this.currentPage() >= response.totalPages) {
            this.currentPage.set(response.totalPages - 1);
            this.loadOrders();
            return;
          }
          this.orders.set(response.content);
          this.totalPages.set(response.totalPages);
          this.totalElements.set(response.totalElements);
          this.isLoading.set(false);
        },
        error: () => {
          if (!this.isCurrentBuyer(buyerId)) return;
          this.isLoading.set(false);
          this.loadError.set(true);
          this.orders.set([]);
          this.totalPages.set(0);
          this.totalElements.set(0);
          this.toast.error('We couldn’t load your orders. Please try again.');
        },
      });
  }

  setTab(tab: 'ALL' | OrderStatus): void {
    this.activeTab.set(tab);
    this.currentPage.set(0);
    this.loadOrders();
  }

  goToPage(page: number): void {
    if (page >= 0 && page < this.totalPages()) {
      this.currentPage.set(page);
      this.loadOrders();
    }
  }

  cancelOrder(order: Order): void {
    const buyerId = this.auth.currentUser()?.id;
    if (
      !buyerId ||
      this.busyOrders().includes(order.id) ||
      order.status !== 'CONFIRMED' ||
      order.invoiceRequested
    )
      return;
    if (!confirm(`Cancel order #${order.id.substring(0, 8)}?`)) return;
    this.busyOrders.update((ids) => [...ids, order.id]);
    this.actions.add(
      this.orderService.cancelOrder(order.id).subscribe({
        next: (cancelled) => {
          if (!this.isCurrentBuyer(buyerId)) return;
          this.busyOrders.update((ids) => ids.filter((id) => id !== order.id));
          this.toast.success(
            cancelled.status === 'CANCELLED'
              ? 'Order cancelled.'
              : 'Your cancellation is being processed.',
          );
          this.loadOrders();
        },
        error: (error) => {
          if (!this.isCurrentBuyer(buyerId)) return;
          this.busyOrders.update((ids) => ids.filter((id) => id !== order.id));
          this.toast.error(
            error.error?.message ||
              'This order could not be cancelled. Refresh its status and try again.',
          );
          this.loadOrders();
        },
      }),
    );
  }

  viewInvoice(orderId: string): void {
    const buyerId = this.auth.currentUser()?.id;
    if (!buyerId || this.isInvoiceLoading()) return;
    this.isInvoiceLoading.set(true);
    this.invoiceOrderId.set(orderId);
    this.actions.add(
      this.orderService.generateInvoice(orderId).subscribe({
        next: (invoice) => {
          if (!this.isCurrentBuyer(buyerId)) return;
          this.isInvoiceLoading.set(false);
          this.invoiceOrderId.set(null);
          this.selectedInvoice.set(invoice);
          this.loadOrders();
        },
        error: () => {
          if (!this.isCurrentBuyer(buyerId)) return;
          this.isInvoiceLoading.set(false);
          this.invoiceOrderId.set(null);
          this.loadOrders();
          this.toast.error('We couldn’t load your invoice. Please try again.');
        },
      }),
    );
  }

  pollPending(orderId: string): void {
    const buyerId = this.auth.currentUser()?.id;
    if (!buyerId || this.busyOrders().includes(orderId)) return;
    this.busyOrders.update((ids) => [...ids, orderId]);
    this.actions.add(
      this.orderService.getOrder(orderId).subscribe({
        next: (updated) => {
          if (!this.isCurrentBuyer(buyerId)) return;
          this.busyOrders.update((ids) => ids.filter((id) => id !== orderId));
          this.toast.info('Order status: ' + this.statusLabel(updated.status));
          this.loadOrders();
        },
        error: () => {
          if (!this.isCurrentBuyer(buyerId)) return;
          this.busyOrders.update((ids) => ids.filter((id) => id !== orderId));
          this.toast.error('Could not refresh this order. Try again.');
        },
      }),
    );
  }

  statusLabel(status: OrderStatus): string {
    return {
      CONFIRMED: 'Confirmed',
      PENDING: 'Processing',
      CANCELLED: 'Cancelled',
      CANCEL_PENDING: 'Cancellation processing',
      FAILED: 'Unsuccessful',
    }[status];
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.loadSubscription?.unsubscribe();
    this.actions.unsubscribe();
  }
}
