import { Injectable } from '@angular/core';
import { OrderRequest } from '../models/ecom.models';

export interface CheckoutAttempt {
  buyerId: string;
  key: string;
  payload: OrderRequest;
  orderId?: string;
}

@Injectable({ providedIn: 'root' })
export class CheckoutAttemptService {
  private readonly attempts = new Map<string, CheckoutAttempt>();

  load(buyerId: string): CheckoutAttempt | null {
    const cached = this.attempts.get(buyerId);
    if (cached) return cached;
    try {
      const attempt = JSON.parse(
        sessionStorage.getItem(this.key(buyerId)) ||
          sessionStorage.getItem('ecom_checkout') ||
          'null',
      );
      if (
        attempt?.buyerId !== buyerId ||
        typeof attempt.key !== 'string' ||
        !attempt.key ||
        !Array.isArray(attempt.payload?.items) ||
        !attempt.payload.items.length ||
        !['customerName', 'customerEmail', 'address'].every(
          (field) => typeof attempt.payload[field] === 'string',
        ) ||
        !attempt.payload.items.every(
          (item: { productId?: unknown; quantity?: unknown }) =>
            typeof item.productId === 'string' &&
            Number.isInteger(item.quantity) &&
            Number(item.quantity) > 0,
        )
      )
        return null;
      this.save(attempt);
      return attempt;
    } catch {
      return null;
    }
  }

  save(attempt: CheckoutAttempt): void {
    this.attempts.set(attempt.buyerId, attempt);
    try {
      sessionStorage.setItem(this.key(attempt.buyerId), JSON.stringify(attempt));
    } catch {
      /* Preserve retries in this tab when browser storage is unavailable. */
    }
  }

  clear(buyerId: string): void {
    this.attempts.delete(buyerId);
    try {
      sessionStorage.removeItem(this.key(buyerId));
      const legacy = JSON.parse(sessionStorage.getItem('ecom_checkout') || 'null');
      if (legacy?.buyerId === buyerId) sessionStorage.removeItem('ecom_checkout');
    } catch {
      /* In-memory state is still cleared. */
    }
  }

  private key(buyerId: string): string {
    return 'ecom_checkout:user:' + buyerId;
  }
}
