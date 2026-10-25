import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { catchError, forkJoin, map, Observable, of, tap, throwError } from 'rxjs';
import { CartItem, OrderItemRequest, Product } from '../models/ecom.models';
import { ToastService } from './toast.service';
import { ProductService } from './product.service';
import { catalogPhoto } from '../config/product-image';

@Injectable({ providedIn: 'root' })
export class CartService implements OnDestroy {
  private readonly toast = inject(ToastService);
  private readonly products = inject(ProductService);
  private storageKey = 'ecom_cart:guest';
  private scopeVersion = 0;
  private adminSession = false;
  // The old ecom_cart key has no owner and must never be assigned to a customer.
  private readonly itemsSignal = signal<CartItem[]>(this.loadCart(this.storageKey));
  readonly items = this.itemsSignal.asReadonly();
  readonly totalCount = computed(() =>
    this.itemsSignal().reduce((sum, item) => sum + item.quantity, 0),
  );
  readonly subtotal = computed(
    () =>
      this.itemsSignal().reduce(
        (sum, item) => sum + Math.round(item.product.price * 100) * item.quantity,
        0,
      ) / 100,
  );
  readonly canCheckout = computed(
    () =>
      this.itemsSignal().length > 0 &&
      this.itemsSignal().every(
        (item) => item.product.active && item.product.availableStock >= item.quantity,
      ),
  );
  private readonly storageListener = (event: StorageEvent): void => {
    if (this.adminSession || (event.key !== null && event.key !== this.storageKey)) return;
    this.scopeVersion++;
    this.itemsSignal.set(this.loadCart(this.storageKey));
  };

  constructor() {
    if (typeof window !== 'undefined') window.addEventListener('storage', this.storageListener);
  }

  private loadCart(key: string): CartItem[] {
    try {
      const items = JSON.parse(localStorage.getItem(key) || '[]');
      if (!Array.isArray(items)) return [];
      const seen = new Set<string>();
      return items
        .filter((item) => {
          const valid =
            item?.product &&
            typeof item.product.id === 'string' &&
            Number.isFinite(item.product.price) &&
            item.product.price > 0 &&
            Number.isInteger(item.quantity) &&
            item.quantity > 0 &&
            item.quantity <= 10000 &&
            !seen.has(item.product.id);
          if (valid) seen.add(item.product.id);
          return valid;
        })
        .slice(0, 50)
        .map((item) =>
          item.product.imageUrl
            ? {
                ...item,
                product: {
                  ...item.product,
                  imageUrl: catalogPhoto(item.product.sku, item.product.imageUrl),
                },
              }
            : item,
        );
    } catch {
      return [];
    }
  }

  private saveCart(items: CartItem[]): void {
    this.itemsSignal.set(items);
    if (!this.adminSession) this.persist(this.storageKey, items);
  }

  private persist(key: string, items: CartItem[]): void {
    try {
      localStorage.setItem(key, JSON.stringify(items));
    } catch {
      /* Keep the current cart usable when storage is unavailable. */
    }
  }

  activateUser(userId: string | null, admin = false): void {
    const nextKey = admin
      ? 'ecom_cart:admin'
      : userId
        ? 'ecom_cart:user:' + userId
        : 'ecom_cart:guest';
    if (nextKey === this.storageKey && admin === this.adminSession) return;
    const fromGuest = this.storageKey === 'ecom_cart:guest';
    const guest = fromGuest ? this.itemsSignal() : [];
    this.storageKey = nextKey;
    this.adminSession = admin;
    this.scopeVersion++;
    let next = admin ? [] : this.loadCart(nextKey);
    // Transfer items explicitly chosen as a guest into the account being signed in.
    // Account carts never transfer to a guest or to another account.
    if (userId && !admin && fromGuest && guest.length) {
      const remaining: CartItem[] = [];
      for (const item of guest) {
        const existing = next.find((line) => line.product.id === item.product.id);
        if (!existing && next.length >= 50) {
          remaining.push(item);
          continue;
        }
        const requested = item.quantity + (existing?.quantity || 0);
        const quantity = Math.min(
          requested,
          item.product.availableStock > 0 ? item.product.availableStock : 10000,
          10000,
        );
        const merged = { product: item.product, quantity };
        next = existing
          ? next.map((line) => (line.product.id === item.product.id ? merged : line))
          : [...next, merged];
      }
      this.persist('ecom_cart:guest', remaining);
      if (remaining.length)
        this.toast.warning(
          'Your account cart is full. Extra guest items remain in the guest cart.',
        );
    }
    this.saveCart(next);
  }

  refreshProducts(): Observable<void> {
    const current = this.itemsSignal();
    const version = this.scopeVersion;
    if (!current.length) return of(undefined);
    return forkJoin(
      current.map((item) =>
        this.products
          .getProduct(item.product.id)
          .pipe(
            catchError((error) =>
              error.status === 404
                ? of({ ...item.product, active: false, availableStock: 0 })
                : throwError(() => error),
            ),
          ),
      ),
    ).pipe(
      tap((products) => {
        if (version !== this.scopeVersion) return;
        let changed = false;
        // Keep removals and quantity changes made while the requests were running.
        const updated = this.itemsSignal().map((item) => {
          const product = products.find((p) => p.id === item.product.id) || item.product;
          const quantity =
            product.availableStock > 0
              ? Math.min(item.quantity, product.availableStock, 10000)
              : item.quantity;
          changed ||=
            product.price !== item.product.price ||
            quantity !== item.quantity ||
            product.active !== item.product.active ||
            product.availableStock === 0;
          return { product, quantity };
        });
        this.saveCart(updated);
        if (changed)
          this.toast.info('Your bag has been updated with the latest prices and availability.');
      }),
      map(() => undefined),
    );
  }

  addToCart(product: Product, quantity = 1): boolean {
    if (this.adminSession) return false;
    if (!Number.isInteger(quantity) || quantity < 1) return false;
    if (!product.active || product.availableStock <= 0) {
      this.toast.error('This product is currently unavailable.');
      return false;
    }
    const current = this.itemsSignal();
    const existing = current.find((item) => item.product.id === product.id);
    if (!existing && current.length >= 50) {
      this.toast.warning('You can order up to 50 different products at a time.');
      return false;
    }
    const max = Math.min(product.availableStock, 10000);
    const requested = (existing?.quantity || 0) + quantity;
    const next = { product: { ...product }, quantity: Math.min(requested, max) };
    this.saveCart(
      existing
        ? current.map((item) => (item.product.id === product.id ? next : item))
        : [...current, next],
    );
    if (requested > max)
      this.toast.warning('The quantity has been adjusted to the available stock.');
    else this.toast.success(`Added "${product.name}" to your bag.`);
    return true;
  }

  updateQuantity(productId: string, quantity: number): void {
    if (!Number.isInteger(quantity)) return;
    if (quantity <= 0) {
      this.removeFromCart(productId);
      return;
    }
    this.saveCart(
      this.itemsSignal().map((item) =>
        item.product.id === productId
          ? {
              ...item,
              quantity:
                item.product.availableStock > 0
                  ? Math.min(quantity, item.product.availableStock, 10000)
                  : item.quantity,
            }
          : item,
      ),
    );
  }

  removeFromCart(productId: string): void {
    this.saveCart(this.itemsSignal().filter((item) => item.product.id !== productId));
  }

  removeOrderedItems(ordered: OrderItemRequest[]): void {
    const quantities = new Map(ordered.map((item) => [item.productId, item.quantity]));
    this.saveCart(
      this.itemsSignal()
        .map((item) => ({
          ...item,
          quantity: item.quantity - (quantities.get(item.product.id) || 0),
        }))
        .filter((item) => item.quantity > 0),
    );
  }

  clearCart(): void {
    this.saveCart([]);
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') window.removeEventListener('storage', this.storageListener);
  }
}
