import { Routes, Router, CanActivateFn } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from './services/auth.service';
export const shoppingAccount: CanActivateFn = () => inject(AuthService).isAdmin() ? inject(Router).createUrlTree(['/admin']) : true;

export const routes: Routes = [
  { path: '', canActivate: [shoppingAccount], loadComponent: () => import('./components/catalog/catalog.component').then(m => m.CatalogComponent), pathMatch: 'full' },
  { path: 'product/:id', canActivate: [shoppingAccount], loadComponent: () => import('./components/product-detail/product-detail.component').then(m => m.ProductDetailComponent) },
  { path: 'cart', canActivate: [shoppingAccount], loadComponent: () => import('./components/cart/cart.component').then(m => m.CartComponent) },
  { path: 'orders', canActivate: [shoppingAccount], loadComponent: () => import('./components/orders/orders.component').then(m => m.OrdersComponent) },
  { path: 'seller', canActivate: [shoppingAccount], loadComponent: () => import('./components/seller-admin/seller-admin.component').then(m => m.SellerAdminComponent) },
  { path: 'admin', loadComponent: () => import('./components/admin-page/admin-page.component').then(m => m.AdminPageComponent) },
  { path: '**', redirectTo: '' }
];
