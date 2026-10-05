import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ProductService } from '../../services/product.service';
import { CartService } from '../../services/cart.service';
import { Product } from '../../models/ecom.models';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './product-detail.component.html',
  styleUrls: ['./product-detail.component.css']
})
export class ProductDetailComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly productService = inject(ProductService);
  private readonly cartService = inject(CartService);
  private readonly toast = inject(ToastService);

  product = signal<Product | null>(null);
  isLoading = signal(true);
  quantity = signal(1);
  selectedImageIndex = signal(0);
  pincode = signal('560001');
  private routeSubscription?: Subscription;
  private productSubscription?: Subscription;

  ngOnInit(): void {
    this.routeSubscription = this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.loadProduct(id);
      }
    });
  }

  loadProduct(id: string): void {
    this.isLoading.set(true);
    this.quantity.set(1);
    this.productSubscription?.unsubscribe();
    this.productSubscription = this.productService.getProduct(id).subscribe({
      next: (prod) => {
        this.product.set(prod);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.toast.error('Could not load product details: ' + (err.error?.message || err.message));
        this.router.navigate(['/']);
      }
    });
  }

  onImageError(event: Event): void {
    const image = event.target as HTMLImageElement;
    image.onerror = null;
    image.src = "/product-placeholder.svg";
  }

  incrementQty(): void {
    const prod = this.product();
    if (!prod) return;
    if (this.quantity() < prod.availableStock) {
      this.quantity.update(q => q + 1);
    } else {
      this.toast.warning(`Only ${prod.availableStock} unit(s) available in stock.`);
    }
  }

  decrementQty(): void {
    if (this.quantity() > 1) {
      this.quantity.update(q => q - 1);
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
  ngOnDestroy(): void { this.routeSubscription?.unsubscribe(); this.productSubscription?.unsubscribe(); }
}
