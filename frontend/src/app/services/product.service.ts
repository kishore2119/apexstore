import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map, expand, reduce, EMPTY } from 'rxjs';
import { API_BASE, API_ENDPOINTS } from '../config/api.config';
import { Product, ProductCreatePayload, ProductPageResponse, StockUpdatePayload } from '../models/ecom.models';


@Injectable({
  providedIn: 'root'
})
export class ProductService {
  private readonly http = inject(HttpClient);

  uploadImage(file: File, admin = false): Observable<{ imageUrl: string }> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<{ imageUrl: string }>(API_BASE + (admin ? '/api/admin/products/images' : '/api/seller/products/images'), form);
  }

  getProducts(query?: {
    page?: number;
    size?: number;
    sort?: string;
    search?: string;
    category?: string;
    minPrice?: number;
    maxPrice?: number;
    inStock?: boolean;
  }): Observable<ProductPageResponse> {
    let params = new HttpParams();
    if (query?.page !== undefined) params = params.set('page', query.page);
    if (query?.size !== undefined) params = params.set('size', query.size);
    if (query?.sort) params = params.set('sort', query.sort);
    if (query?.minPrice !== undefined) params = params.set('minPrice', query.minPrice);
    if (query?.maxPrice !== undefined) params = params.set('maxPrice', query.maxPrice);
    if (query?.inStock) params = params.set('inStock', true);
    if (query?.search?.trim()) params = params.set('search', query.search.trim());
    if (query?.category?.trim() && query.category.trim() !== 'All') {
      params = params.set('category', query.category.trim());
    }

    return this.http.get<ProductPageResponse>(API_ENDPOINTS.products.publicList, { params }).pipe(
      map(res => ({
        ...res,
        content: res.content.map(p => this.enrichProduct(p))
      }))
    );
  }

  getProduct(id: string): Observable<Product> {
    return this.http.get<Product>(API_ENDPOINTS.products.publicDetail(id)).pipe(
      map(p => this.enrichProduct(p))
    );
  }

  getSellerProducts(): Observable<Product[]> {
    return this.getManagedProducts(API_ENDPOINTS.products.sellerList);
  }

  createSellerProduct(payload: ProductCreatePayload): Observable<Product> {
    return this.http.post<Product>(API_ENDPOINTS.products.sellerCreate, payload).pipe(
      map(p => this.enrichProduct(p))
    );
  }

  updateSellerProduct(id: string, payload: ProductCreatePayload): Observable<Product> {
    return this.http.put<Product>(API_ENDPOINTS.products.sellerUpdate(id), payload).pipe(
      map(p => this.enrichProduct(p))
    );
  }

  updateSellerStock(id: string, stockOnHand: number): Observable<Product> {
    const payload: StockUpdatePayload = { stockOnHand };
    return this.http.patch<Product>(API_ENDPOINTS.products.sellerStock(id), payload).pipe(
      map(p => this.enrichProduct(p))
    );
  }

  deleteSellerProduct(id: string): Observable<void> {
    return this.http.delete<void>(API_ENDPOINTS.products.sellerDelete(id));
  }

  getAdminProducts(): Observable<Product[]> {
    return this.getManagedProducts(API_ENDPOINTS.products.adminList);
  }

  createAdminProduct(payload: ProductCreatePayload): Observable<Product> {
    return this.http.post<Product>(API_ENDPOINTS.products.adminCreate, payload).pipe(
      map(p => this.enrichProduct(p))
    );
  }

  updateAdminProduct(id: string, payload: ProductCreatePayload): Observable<Product> {
    return this.http.put<Product>(API_ENDPOINTS.products.adminUpdate(id), payload).pipe(
      map(p => this.enrichProduct(p))
    );
  }

  updateAdminStock(id: string, stockOnHand: number): Observable<Product> {
    const payload: StockUpdatePayload = { stockOnHand };
    return this.http.patch<Product>(API_ENDPOINTS.products.adminStock(id), payload).pipe(
      map(p => this.enrichProduct(p))
    );
  }

  deleteAdminProduct(id: string): Observable<void> {
    return this.http.delete<void>(API_ENDPOINTS.products.adminDelete(id));
  }

  private getManagedProducts(url: string): Observable<Product[]> {
    const page = (index: number) => this.http.get<ProductPageResponse>(url, {
      params: { page: index, size: 100, sort: 'createdAt,desc' }
    });
    return page(0).pipe(
      expand(response => response.page + 1 < response.totalPages ? page(response.page + 1) : EMPTY),
      reduce((products, response) => [...products, ...response.content.map(p => this.enrichProduct(p))], [] as Product[])
    );
  }

  enrichProduct(product: Product): Product {
    // Display only information supplied by the seller/backend. Never invent ratings or prices.
    return product.imageUrl?.startsWith('/api/products/images/') ? { ...product, imageUrl: API_BASE + product.imageUrl } : { ...product };
  }
}
