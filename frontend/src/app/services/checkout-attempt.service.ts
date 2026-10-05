import { Injectable } from '@angular/core';
import { OrderRequest } from '../models/ecom.models';

export interface CheckoutAttempt { buyerId: string; key: string; payload: OrderRequest; orderId?: string; }

@Injectable({ providedIn: 'root' })
export class CheckoutAttemptService {
  load(buyerId: string): CheckoutAttempt | null {
    try {
      const attempt = JSON.parse(sessionStorage.getItem('ecom_checkout') || 'null');
      return attempt?.buyerId === buyerId && typeof attempt.key === 'string' && Array.isArray(attempt.payload?.items) ? attempt : null;
    } catch { return null; }
  }
  save(attempt: CheckoutAttempt): void { sessionStorage.setItem('ecom_checkout', JSON.stringify(attempt)); }
  clear(): void { sessionStorage.removeItem('ecom_checkout'); }
}
