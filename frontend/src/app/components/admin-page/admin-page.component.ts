import { Component, effect, inject, signal, untracked, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Subscription, switchMap, map, of } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { apiError } from '../../services/api-error';
import { API_BASE } from '../../config/api.config';
import { Order, OrderPageResponse, Product, ProductPageResponse } from '../../models/ecom.models';
import { ProductService } from '../../services/product.service';
import { SellerAdminComponent } from '../seller-admin/seller-admin.component';

export interface AdminSummary {
  total: number;
  confirmed: number;
  pending: number;
  cancelled: number;
  failed: number;
  totalRevenue: number;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  roles: string[];
  enabled: boolean;
  createdAt: string;
  orderCount: number;
  totalSpent: number;
  latestOrderAt: string | null;
}

interface CustomerStats {
  buyerId: string;
  total: number;
  totalSpent: number;
  latestOrderAt: string | null;
}

interface Page<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

@Component({
  selector: 'app-admin-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, SellerAdminComponent],
  templateUrl: './admin-page.component.html',
  styleUrl: './admin-page.component.css'
})
export class AdminPageComponent implements OnDestroy {
  readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);

  // Authentication inputs
  adminId = '';
  password = '';
  busy = signal(false);
  error = signal('');

  // Active navigation tab
  tab = signal<'overview' | 'users' | 'orders' | 'products' | 'my-products'>('overview');

  // Summary Metrics
  summary = signal<AdminSummary | null>(null);
  summaryError = signal('');

  // Users Management
  users = signal<AdminUser[]>([]);
  usersLoading = signal(false);
  userError = signal('');
  userSearch = '';
  userPage = signal(0);
  userPages = signal(0);
  userTotal = signal(0);

  // Orders Management
  orders = signal<Order[]>([]);
  ordersLoading = signal(false);
  orderError = signal('');
  orderSearch = '';
  orderStatus = '';
  orderPage = signal(0);
  orderPages = signal(0);
  orderTotal = signal(0);
  selectedCustomer = signal<AdminUser | null>(null);
  expandedOrder = signal<string | null>(null);

  // Read-only marketplace catalogue
  products = signal<Product[]>([]);
  productsLoading = signal(false);
  productError = signal('');
  productSearch = '';
  productCategory = '';
  productPage = signal(0);
  productPages = signal(0);
  productTotal = signal(0);

  readonly today = new Date();
  userSummary = signal<{total:number;sellers:number;paused:number}|null>(null);
  inventory = signal<{total:number;active:number;inactive:number;lowStock:number;outOfStock:number}|null>(null);
  overviewError = signal('');
  recentOrders = signal<Order[]>([]);
  recentLoading = signal(false);
  recentError = signal('');
  statusBusy = signal<string | null>(null);
  lastUpdated = signal<Date | null>(null);
  private readonly productService = inject(ProductService);
  private overviewRequests = new Subscription();
  private userRequest?: Subscription;
  private orderRequest?: Subscription;
  private summaryRequest?: Subscription;
  private productRequest?: Subscription;

  constructor() {
    effect(() => {
      const admin = this.auth.isAdmin();
      untracked(() => {
        this.cancelRequests();
        this.users.set([]);
        this.orders.set([]);
        this.products.set([]);
        this.summary.set(null);
        this.selectedCustomer.set(null);
        if (admin) {
          this.refreshAll();
        }
      });
    });
  }

  login(): void {
    if (this.busy() || !this.adminId.trim() || !this.password) return;
    this.busy.set(true);
    this.error.set('');
    this.auth.loginAdmin(this.adminId.trim(), this.password).subscribe({
      next: () => {
        this.password = '';
        this.busy.set(false);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(apiError(err, 'Could not sign in. Check your admin ID and password.'));
      }
    });
  }

  refreshAll(): void {
    this.loadSummary();
    this.overviewRequests.unsubscribe(); this.overviewRequests = new Subscription(); this.overviewError.set('');
    this.overviewRequests.add(this.http.get<{total:number;sellers:number;paused:number}>(`${API_BASE}/api/admin/users/summary`).subscribe({next:data=>this.userSummary.set(data),error:()=>{this.userSummary.set(null);this.overviewError.set('Customer totals could not load.');}}));
    this.overviewRequests.add(this.http.get<{total:number;active:number;inactive:number;lowStock:number;outOfStock:number}>(`${API_BASE}/api/admin/products/summary`).subscribe({next:data=>this.inventory.set(data),error:()=>{this.inventory.set(null);this.overviewError.set('Inventory totals could not load.');}}));
    this.recentLoading.set(true); this.recentError.set('');
    this.overviewRequests.add(this.http.get<OrderPageResponse>(`${API_BASE}/api/admin/orders`,{params:new HttpParams().set('size',5)}).subscribe({next:data=>{this.recentOrders.set(data.content);this.recentLoading.set(false);},error:()=>{this.recentError.set('Recent orders could not load.');this.recentLoading.set(false);}}));
    this.loadUsers(0);
    this.loadOrders(0);
    this.loadProducts(0);
  }

  loadSummary(): void {
    this.summaryError.set('');
    this.summaryRequest?.unsubscribe();
    this.summaryRequest = this.http.get<AdminSummary>(`${API_BASE}/api/admin/orders/summary`).subscribe({
      next: (data) => { this.summary.set(data); this.lastUpdated.set(new Date()); },
      error: (err) => {
        this.summary.set(null);
        this.summaryError.set(apiError(err, 'Platform summary metrics could not load.'));
      }
    });
  }

  loadUsers(page = 0): void {
    this.userRequest?.unsubscribe();
    this.userError.set('');
    this.usersLoading.set(true);
    this.users.set([]);
    const params = new HttpParams().set('page', page).set('size', 10).set('search', this.userSearch.trim());

    this.userRequest = this.http.get<Page<AdminUser>>(`${API_BASE}/api/admin/users`, { params }).pipe(
      switchMap((usersPage) => {
        const ids = usersPage.content.map((u) => u.id);
        if (ids.length === 0) {
          return of({ usersPage, statsMap: new Map<string, CustomerStats>() });
        }
        return this.http.post<CustomerStats[]>(`${API_BASE}/api/admin/orders/customer-stats`, { ids }).pipe(
          map((stats) => ({
            usersPage,
            statsMap: new Map(stats.map((s) => [s.buyerId, s]))
          }))
        );
      })
    ).subscribe({
      next: ({ usersPage, statsMap }) => {
        this.users.set(
          usersPage.content.map((u) => {
            const stat = statsMap.get(u.id);
            return {
              ...u,
              orderCount: stat ? stat.total : 0,
              totalSpent: stat ? stat.totalSpent : 0,
              latestOrderAt: stat ? stat.latestOrderAt : null
            };
          })
        );
        this.userPage.set(usersPage.page);
        this.userPages.set(usersPage.totalPages);
        this.userTotal.set(usersPage.totalElements);
        this.usersLoading.set(false);
      },
      error: (err) => {
        this.usersLoading.set(false);
        this.userError.set(apiError(err, 'Users list could not be loaded.'));
      }
    });
  }

  toggleUserStatus(user: AdminUser): void {
    if(this.statusBusy()) return;
    this.statusBusy.set(user.id);
    const updatedStatus = !user.enabled;
    this.http.patch<AdminUser>(`${API_BASE}/api/admin/users/${user.id}/status`, { enabled: updatedStatus }).subscribe({
      next: (res) => {
        this.statusBusy.set(null);
        this.users.set(this.users().map((u) => u.id === user.id ? { ...u, enabled: res.enabled } : u));
        this.userSummary.update(s=>s?{...s,paused:s.paused+(res.enabled?-1:1)}:s);
      },
      error: (err) => {
        this.statusBusy.set(null);
        this.userError.set(apiError(err, `Failed to update status for ${user.name}`));
      }
    });
  }

  selectCustomer(customer: AdminUser | null): void {
    this.selectedCustomer.set(customer);
    this.orderStatus = '';
    this.orderSearch = '';
    this.tab.set('orders');
    this.loadOrders(0);
  }

  loadOrders(page = 0): void {
    this.orderRequest?.unsubscribe();
    this.orderError.set('');
    this.ordersLoading.set(true);
    this.expandedOrder.set(null);

    let params = new HttpParams().set('page', page).set('size', 10);
    if (this.selectedCustomer()) {
      params = params.set('buyerId', this.selectedCustomer()!.id);
    }
    if (this.orderStatus) {
      params = params.set('status', this.orderStatus);
    }
    if (this.orderSearch.trim()) {
      params = params.set('search', this.orderSearch.trim());
    }

    this.orderRequest = this.http.get<OrderPageResponse>(`${API_BASE}/api/admin/orders`, { params }).subscribe({
      next: (data) => {
        this.orders.set(data.content);
        this.orderPage.set(data.page);
        this.orderPages.set(data.totalPages);
        this.orderTotal.set(data.totalElements);
        this.ordersLoading.set(false);
      },
      error: (err) => {
        this.ordersLoading.set(false);
        this.orderError.set(apiError(err, 'Orders list could not load.'));
      }
    });
  }

  loadProducts(page = 0): void {
    this.productRequest?.unsubscribe();
    this.productError.set('');
    this.productsLoading.set(true);

    this.productRequest = this.productService.getProducts({page,size:12,search:this.productSearch.trim(),category:this.productCategory}).subscribe({
      next: (data) => {
        this.products.set(data.content);
        this.productPage.set(data.page);
        this.productPages.set(data.totalPages);
        this.productTotal.set(data.totalElements);
        this.productsLoading.set(false);
      },
      error: (err) => {
        this.productsLoading.set(false);
        this.productError.set(apiError(err, 'Products catalog could not load.'));
      }
    });
  }

  setTab(tabName: 'overview' | 'users' | 'orders' | 'products' | 'my-products'): void {
    this.tab.set(tabName);
    if (tabName === 'overview') this.loadSummary();
    else if (tabName === 'users') this.loadUsers(this.userPage());
    else if (tabName === 'orders') this.loadOrders(this.orderPage());
    else if (tabName === 'products') this.loadProducts(this.productPage());
  }

  filterOrders(status: string): void { this.selectedCustomer.set(null); this.orderSearch=''; this.orderStatus=status; this.tab.set('orders'); this.loadOrders(0); }
  openOrder(order: Order): void { this.selectCustomer(null); this.orderSearch=order.id; this.loadOrders(0); }
  exportOrders(): void {
    const cell=(v:unknown)=>'"'+String(v??'').replace(/^[\s]*[=+@-]/,"'$&").replace(/"/g,'""')+'"';
    const rows=[['Order ID','Customer','Email','Date','Status','Total INR'],...this.orders().map(o=>[o.id,o.customerName,o.customerEmail,o.createdAt,o.status,o.total])];
    const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='orders-page-'+(this.orderPage()+1)+'.csv';a.click();URL.revokeObjectURL(url);
  }
  onImageError(event: Event): void { const image=event.target as HTMLImageElement;if(!image.src.endsWith('/product-placeholder.svg'))image.src='/product-placeholder.svg'; }
  toggleOrderExpand(orderId: string): void {
    this.expandedOrder.set(this.expandedOrder() === orderId ? null : orderId);
  }

  private cancelRequests(): void {
    this.overviewRequests.unsubscribe();
    this.userRequest?.unsubscribe();
    this.orderRequest?.unsubscribe();
    this.summaryRequest?.unsubscribe();
    this.productRequest?.unsubscribe();
  }

  ngOnDestroy(): void {
    this.cancelRequests();
  }
}
