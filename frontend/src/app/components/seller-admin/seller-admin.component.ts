import { Component, OnDestroy, effect, untracked, inject, signal } from '@angular/core';
import { Subscription, of, switchMap, tap } from 'rxjs';
import { DialogDirective } from '../../directives/dialog.directive';
import { apiError } from '../../services/api-error';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ProductService } from '../../services/product.service';
import { ToastService } from '../../services/toast.service';
import { Product, ProductCreatePayload } from '../../models/ecom.models';
import { AuthModalComponent } from '../auth-modal/auth-modal.component';

@Component({
  selector: 'app-seller-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, AuthModalComponent, DialogDirective],
  templateUrl: './seller-admin.component.html',
  styleUrls: ['./seller-admin.component.css']
})
export class SellerAdminComponent implements OnDestroy {
  readonly auth = inject(AuthService);
  private readonly productService = inject(ProductService);
  private readonly toast = inject(ToastService);

  products = signal<Product[]>([]);
  isLoading = signal(true);
  activeTab = signal<'LISTINGS' | 'ADD_PRODUCT'>('LISTINGS');
  isAuthModalOpen = signal(false);
  private loadSubscription?: Subscription;

  // New product form
  newSku = '';
  newName = '';
  newDescription = '';
  newCategory = 'Electronics';
  newPrice = 999;
  newImageUrl = '';
  newImageFile: File | null = null;
  newImagePreview = '';
  editImageFile: File | null = null;
  editImagePreview = '';
  newInitialStock = 25;
  isCreating = signal(false);
  isSaving = signal(false);
  loadError = signal(false);

  // Stock edit modal
  editingProduct = signal<Product | null>(null);
  stockToUpdate = 0;
  isUpdatingStock = signal(false);

  // Edit details modal
  editModalProduct = signal<Product | null>(null);

  readonly categoryOptions = [
    'Electronics',
    'Fashion',
    'Appliances',
    'Home',
    'Books'
  ];

  onImageSelect(event: Event, edit = false): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 5 * 1024 * 1024 || file.size === 0) { this.toast.error('Choose a JPG or PNG image up to 5 MB.'); input.value = ''; return; }
    if (edit) { if (this.editImagePreview) URL.revokeObjectURL(this.editImagePreview); this.editImageFile = file; this.editImagePreview = URL.createObjectURL(file); }
    else { if (this.newImagePreview) URL.revokeObjectURL(this.newImagePreview); this.newImageFile = file; this.newImagePreview = URL.createObjectURL(file); this.newImageUrl = ''; }
  }

  constructor() {
    effect(() => {
      const user = this.auth.currentUser();
      untracked(() => {
        this.loadSubscription?.unsubscribe();
        this.products.set([]);
        if (user && (this.auth.isSeller() || this.auth.isAdmin())) this.loadProducts();
        else this.isLoading.set(false);
      });
    });
  }

  loadProducts(): void {
    this.isLoading.set(true);
    this.loadError.set(false);
    const req = this.auth.isAdmin() 
      ? this.productService.getAdminProducts() 
      : this.productService.getSellerProducts();

    this.loadSubscription?.unsubscribe();
    this.loadSubscription = req.subscribe({
      next: (list) => {
        this.products.set(list);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.loadError.set(true);
        this.products.set([]);
        this.toast.error('Failed to load listings: ' + (err.error?.message || err.message));
      }
    });
  }

  becomeSeller(): void {
    this.auth.becomeSeller().subscribe({ error: () => {} });
  }

  openStockModal(p: Product): void {
    this.editingProduct.set(p);
    this.stockToUpdate = p.stockOnHand;
  }

  saveStock(): void {
    const p = this.editingProduct();
    if (!p || this.isUpdatingStock()) return;
    if (!Number.isInteger(this.stockToUpdate) || this.stockToUpdate < 0 || this.stockToUpdate > 100000000) { this.toast.error('Stock must be a whole number from 0 to 100,000,000.'); return; }

    if (this.stockToUpdate < p.reserved) {
      this.toast.error(`Stock cannot be set lower than active reservations (${p.reserved}).`);
      return;
    }

    this.isUpdatingStock.set(true);
    const req = this.auth.isAdmin()
      ? this.productService.updateAdminStock(p.id, this.stockToUpdate)
      : this.productService.updateSellerStock(p.id, this.stockToUpdate);

    req.subscribe({
      next: (updated) => {
        this.isUpdatingStock.set(false);
        this.toast.success(`Inventory for "${p.name}" updated to ${updated.stockOnHand} units.`);
        this.editingProduct.set(null);
        this.loadProducts();
      },
      error: (err) => {
        this.isUpdatingStock.set(false);
        this.toast.error('Failed to update stock: ' + (err.error?.message || err.message));
      }
    });
  }

  openEditModal(p: Product): void {
    if (this.editImagePreview) URL.revokeObjectURL(this.editImagePreview);
    this.editImageFile = null; this.editImagePreview = '';
    this.editModalProduct.set({ ...p });
  }

  saveProductDetails(): void {
    const p = this.editModalProduct();
    if (!p || this.isSaving()) return;
    if (!p.name.trim() || !p.category.trim() || !this.validPrice(p.price) || !this.validImage(p.imageUrl || '')) { this.toast.error('Check the product name, category, price, and image URL.'); return; }
    this.isSaving.set(true);

    const payload: ProductCreatePayload = {
      sku: p.sku,
      name: p.name,
      description: p.description,
      category: p.category,
      price: p.price,
      imageUrl: p.imageUrl
    };

    const req = (this.editImageFile ? this.productService.uploadImage(this.editImageFile, this.auth.isAdmin()) : of({ imageUrl: p.imageUrl })).pipe(switchMap(image => {
      const updated = { ...payload, imageUrl: image.imageUrl };
      return this.auth.isAdmin() ? this.productService.updateAdminProduct(p.id, updated) : this.productService.updateSellerProduct(p.id, updated);
    }));

    req.subscribe({
      next: () => {
        this.isSaving.set(false);
        this.toast.success(`Listing "${p.name}" details updated.`);
        this.editModalProduct.set(null);
        this.loadProducts();
      },
      error: (err) => {
        this.isSaving.set(false);
        this.toast.error('Failed to update listing: ' + (err.error?.message || err.message));
      }
    });
  }

  deactivateProduct(p: Product): void {
    if (!confirm(`Are you sure you want to deactivate "${p.name}"? It will no longer appear in public search.`)) {
      return;
    }

    const req = this.auth.isAdmin()
      ? this.productService.deleteAdminProduct(p.id)
      : this.productService.deleteSellerProduct(p.id);

    req.subscribe({
      next: () => {
        this.toast.success(`Product "${p.name}" was deactivated.`);
        this.loadProducts();
      },
      error: (err) => {
        this.toast.error('Failed to deactivate listing: ' + (err.error?.message || err.message));
      }
    });
  }

  createProduct(): void {
    if (this.isCreating()) return;
    if (!this.newName.trim() || !this.newDescription.trim() || !this.newCategory.trim() || !this.validPrice(this.newPrice) || !this.validImage(this.newImageUrl.trim()) || !Number.isInteger(this.newInitialStock) || this.newInitialStock < 0 || this.newInitialStock > 100000000) {
      this.toast.error('Enter product details, a valid price, and a whole number for stock.');
      return;
    }

    this.isCreating.set(true);

    const payload: ProductCreatePayload = {
      name: this.newName.trim(),
      description: this.newDescription.trim(),
      category: this.newCategory,
      price: +this.newPrice,
      imageUrl: this.newImageUrl.trim(),
      stockOnHand: this.newInitialStock
    };

    const createReq = (this.newImageFile ? this.productService.uploadImage(this.newImageFile, this.auth.isAdmin()).pipe(tap(image => { this.newImageUrl = image.imageUrl; this.newImageFile = null; })) : of({ imageUrl: this.newImageUrl })).pipe(switchMap(image => {
      const listing = { ...payload, imageUrl: image.imageUrl };
      return this.auth.isAdmin() ? this.productService.createAdminProduct(listing) : this.productService.createSellerProduct(listing);
    }));

    createReq.subscribe({
      next: (created) => {
        this.isCreating.set(false);
        this.toast.success(`Product "${created.name}" created with ${created.stockOnHand} units in stock.`);
        this.resetForm();
        this.activeTab.set('LISTINGS');
        this.loadProducts();
      },
      error: (err) => {
        this.isCreating.set(false);
        this.toast.error(apiError(err, 'Failed to create the product. Please try again.'));
      }
    });
  }

  private validPrice(value: number): boolean { return Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) <= 999999999999.99 && Math.abs(Number(value) * 100 - Math.round(Number(value) * 100)) < 0.0001; }
  private validImage(value: string): boolean { return !value || /^https?:\/\/[^\s]+$/.test(value) || /^\/api\/products\/images\/[a-f0-9-]+\.(png|jpg)$/.test(value); }

  onImageError(event: Event): void {
    const image = event.target as HTMLImageElement;
    if (!image.src.endsWith('/product-placeholder.svg')) image.src = '/product-placeholder.svg';
  }

  resetForm(): void {
    this.newSku = '';
    this.newName = '';
    this.newDescription = '';
    this.newPrice = 999;
    this.newInitialStock = 25;
    this.newImageUrl = '';
    this.newImageFile = null;
    if (this.newImagePreview) URL.revokeObjectURL(this.newImagePreview);
    this.newImagePreview = '';
  }
  ngOnDestroy(): void { this.loadSubscription?.unsubscribe(); if (this.newImagePreview) URL.revokeObjectURL(this.newImagePreview); if (this.editImagePreview) URL.revokeObjectURL(this.editImagePreview); }
}
