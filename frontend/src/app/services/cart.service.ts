import { Injectable, computed, inject, signal } from '@angular/core';
import { catchError, forkJoin, map, Observable, of, tap, throwError } from 'rxjs';
import { CartItem, Product } from '../models/ecom.models';
import { ToastService } from './toast.service';
import { ProductService } from './product.service';

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly toast = inject(ToastService);
  private readonly products = inject(ProductService);
  private readonly itemsSignal = signal<CartItem[]>(this.loadCart());
  readonly items = this.itemsSignal.asReadonly();
  readonly totalCount = computed(() => this.itemsSignal().reduce((sum, item) => sum + item.quantity, 0));
  readonly subtotal = computed(() => this.itemsSignal().reduce((sum, item) => sum + Math.round(item.product.price * 100) * item.quantity, 0) / 100);
  readonly canCheckout = computed(() => this.itemsSignal().length > 0 && this.itemsSignal().every(item => item.product.active && item.product.availableStock >= item.quantity));

  private loadCart(): CartItem[] {
    try {
      const items = JSON.parse(localStorage.getItem('ecom_cart') || '[]');
      if (!Array.isArray(items)) return [];
      const seen = new Set<string>();
      return items.filter(item => {
        const valid = item?.product && typeof item.product.id === 'string' && Number.isFinite(item.product.price) && item.product.price > 0 && Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 10000 && !seen.has(item.product.id);
        if (valid) seen.add(item.product.id);
        return valid;
      }).slice(0, 50);
    } catch { return []; }
  }

  private saveCart(items: CartItem[]): void {
    this.itemsSignal.set(items);
    localStorage.setItem('ecom_cart', JSON.stringify(items));
  }

  refreshProducts(): Observable<void> {
    const current = this.itemsSignal();
    if (!current.length) return of(undefined);
    return forkJoin(current.map(item => this.products.getProduct(item.product.id).pipe(
      catchError(error => error.status === 404 ? of({ ...item.product, active: false, availableStock: 0 }) : throwError(() => error))
    ))).pipe(tap(products => {
      let changed = false;
      // Keep removals and quantity changes made while the requests were running.
      const updated = this.itemsSignal().map(item => {
        const product = products.find(p => p.id === item.product.id) || item.product;
        const quantity = product.availableStock > 0 ? Math.min(item.quantity, product.availableStock, 10000) : item.quantity;
        changed ||= product.price !== item.product.price || quantity !== item.quantity || product.active !== item.product.active || product.availableStock === 0;
        return { product, quantity };
      });
      this.saveCart(updated);
      if (changed) this.toast.info('Your bag has been updated with the latest prices and availability.');
    }), map(() => undefined));
  }

  addToCart(product: Product, quantity = 1): boolean {
    if (!Number.isInteger(quantity) || quantity < 1) return false;
    if (!product.active || product.availableStock <= 0) { this.toast.error('This product is currently unavailable.'); return false; }
    const current = this.itemsSignal();
    const existing = current.find(item => item.product.id === product.id);
    if (!existing && current.length >= 50) { this.toast.warning('You can order up to 50 different products at a time.'); return false; }
    const max = Math.min(product.availableStock, 10000);
    const requested = (existing?.quantity || 0) + quantity;
    const next = { product: { ...product }, quantity: Math.min(requested, max) };
    this.saveCart(existing ? current.map(item => item.product.id === product.id ? next : item) : [...current, next]);
    if (requested > max) this.toast.warning('The quantity has been adjusted to the available stock.');
    else this.toast.success(`Added "${product.name}" to your bag.`);
    return true;
  }

  updateQuantity(productId: string, quantity: number): void {
    if (!Number.isInteger(quantity)) return;
    if (quantity <= 0) { this.removeFromCart(productId); return; }
    this.saveCart(this.itemsSignal().map(item => item.product.id === productId
      ? { ...item, quantity: item.product.availableStock > 0 ? Math.min(quantity, item.product.availableStock, 10000) : item.quantity }
      : item));
  }

  removeFromCart(productId: string): void {
    this.saveCart(this.itemsSignal().filter(item => item.product.id !== productId));
  }
  clearCart(): void { this.saveCart([]); }
}
