import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams, HttpResponse } from '@angular/common/http';
import { Observable, delay, filter, map, of, retry, switchMap, take, throwError, timer } from 'rxjs';
import { API_ENDPOINTS } from '../config/api.config';
import { Invoice, Order, OrderPageResponse, OrderRequest } from '../models/ecom.models';
import { ToastService } from './toast.service';

@Injectable({
  providedIn: 'root'
})
export class OrderService {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);

  placeOrder(payload: OrderRequest, customIdempotencyKey?: string): Observable<HttpResponse<Order>> {
    const key = customIdempotencyKey || `checkout-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const headers = new HttpHeaders({
      'Idempotency-Key': key
    });

    return this.http.post<Order>(API_ENDPOINTS.orders.checkout, payload, {
      headers,
      observe: 'response'
    });
  }

  getOrder(id: string): Observable<Order> {
    return this.http.get<Order>(API_ENDPOINTS.orders.detail(id));
  }

  getMyOrders(page = 0, size = 10, sort = 'createdAt,desc', status?: string): Observable<OrderPageResponse> {
    let params = new HttpParams()
      .set('page', page)
      .set('size', size)
      .set('sort', sort);
    if (status && status !== 'ALL') params = params.set('status', status);

    return this.http.get<OrderPageResponse>(API_ENDPOINTS.orders.myOrders, { params });
  }

  cancelOrder(id: string): Observable<Order> {
    return this.http.post<Order>(API_ENDPOINTS.orders.cancel(id), {});
  }

  generateInvoice(orderId: string): Observable<Invoice> {
    return this.http.post<Invoice>(API_ENDPOINTS.orders.generateInvoice(orderId), {});
  }

  getInvoice(orderId: string): Observable<Invoice> {
    return this.http.get<Invoice>(API_ENDPOINTS.orders.getInvoice(orderId));
  }
}
