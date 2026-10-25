import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ProductService } from '../../services/product.service';
import { CartService } from '../../services/cart.service';
import { Product } from '../../models/ecom.models';
import { ToastService } from '../../services/toast.service';
import { productImageFallback } from '../../config/image-fallback';

@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './product-detail.component.html',
  styleUrls: ['./product-detail.component.css'],
})
export class ProductDetailComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly productService = inject(ProductService);
  private readonly cartService = inject(CartService);
  private readonly toast = inject(ToastService);

  product = signal<Product | null>(null);
  isLoading = signal(true);
  loadError = signal<string | null>(null);
  quantity = signal(1);
  private routeSubscription?: Subscription;
  private productSubscription?: Subscription;

  ngOnInit(): void {
    this.routeSubscription = this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (id) {
        this.loadProduct(id);
      }
    });
  }

  loadProduct(id: string): void {
    this.isLoading.set(true);
    this.loadError.set(null);
    this.product.set(null);
    this.quantity.set(1);
    this.productSubscription?.unsubscribe();
    this.productSubscription = this.productService.getProduct(id).subscribe({
      next: (prod) => {
        this.product.set(prod);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.loadError.set(
          err.status === 404
            ? 'This product is no longer available.'
            : 'We couldn’t load this product. Please try again.',
        );
      },
    });
  }

  retryLoad(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.loadProduct(id);
  }

  readonly onImageError = productImageFallback;

  incrementQty(): void {
    const prod = this.product();
    if (!prod) return;
    if (this.quantity() < Math.min(prod.availableStock, 10000)) {
      this.quantity.update((q) => q + 1);
    } else {
      this.toast.warning(`Only ${prod.availableStock} unit(s) available in stock.`);
    }
  }

  decrementQty(): void {
    if (this.quantity() > 1) {
      this.quantity.update((q) => q - 1);
    }
  }

  addToCart(): void {
    const prod = this.product();
    if (prod) {
      this.cartService.addToCart(prod, this.quantity());
    }
  }

  buyNow(): void {
    const prod = this.product();
    if (prod) {
      if (this.cartService.addToCart(prod, this.quantity())) this.router.navigate(['/cart']);
    }
  }
  ngOnDestroy(): void {
    this.routeSubscription?.unsubscribe();
    this.productSubscription?.unsubscribe();
  }
}
