import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./components/catalog/catalog.component').then(m => m.CatalogComponent), pathMatch: 'full' },
  { path: 'product/:id', loadComponent: () => import('./components/product-detail/product-detail.component').then(m => m.ProductDetailComponent) },
  { path: 'cart', loadComponent: () => import('./components/cart/cart.component').then(m => m.CartComponent) },
  { path: 'orders', loadComponent: () => import('./components/orders/orders.component').then(m => m.OrdersComponent) },
  { path: 'seller', loadComponent: () => import('./components/seller-admin/seller-admin.component').then(m => m.SellerAdminComponent) },
  { path: 'admin', loadComponent: () => import('./components/admin-page/admin-page.component').then(m => m.AdminPageComponent) },
  { path: '**', redirectTo: '' }
];
