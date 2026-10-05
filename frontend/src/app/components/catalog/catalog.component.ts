import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { RevealDirective } from '../../directives/reveal.directive';
import { ProductService } from '../../services/product.service';
import { CartService } from '../../services/cart.service';
import { Product } from '../../models/ecom.models';
import { BannerStripComponent } from '../banner-strip/banner-strip.component';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-catalog',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, BannerStripComponent, RevealDirective],
  templateUrl: './catalog.component.html',
  styleUrls: ['./catalog.component.css']
})
export class CatalogComponent implements OnInit, OnDestroy {
  private readonly productService = inject(ProductService);
  private readonly cartService = inject(CartService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private querySubscription?: Subscription;
  private productSubscription?: Subscription;

  ngOnDestroy(): void {
    this.querySubscription?.unsubscribe();
    this.productSubscription?.unsubscribe();
  }

  products = signal<Product[]>([]);
  isLoading = signal(true);
  loadError = signal(false);
  filtersOpen = signal(false);

  // Pagination & meta
  currentPage = signal(0);
  pageSize = signal(12);
  totalElements = signal(0);
  totalPages = signal(1);

  // Filter state
  activeCategory = signal<string>('All');
  searchKeyword = signal<string>('');
  selectedSort = signal<string>('createdAt,desc');

  // Filters are applied before pagination by the backend
  minPrice = signal<number | null>(null);
  maxPrice = signal<number | null>(null);
  inStockOnly = signal<boolean>(false);

  readonly categoriesList = [
    'All',
    'Electronics',
    'Fashion',
    'Appliances',
    'Home',
    'Books'
  ];

  readonly sortOptions = [
    { label: 'Price: low to high', value: 'price,asc' },
    { label: 'Price: high to low', value: 'price,desc' },
    { label: 'Newest First', value: 'createdAt,desc' }
  ];

  ngOnInit(): void {
    this.querySubscription = this.route.queryParams.subscribe(params => {
      const cat = params['category'] || 'All';
      const search = params['search'] || '';
      const sort = this.sortOptions.some(option => option.value === params['sort']) ? params['sort'] : 'createdAt,desc';
      const candidate = Number(params['page'] || 0);
      const page = Number.isInteger(candidate) && candidate >= 0 ? candidate : 0;
      const price = (value: unknown): number | null => value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
      this.minPrice.set(price(params['minPrice']));
      this.maxPrice.set(price(params['maxPrice']));
      this.inStockOnly.set(params['inStock'] === 'true');

      this.activeCategory.set(cat);
      this.searchKeyword.set(search);
      this.selectedSort.set(sort);
      this.currentPage.set(page);

      this.loadProducts();
    });
  }

  loadProducts(): void {
    this.isLoading.set(true);
    this.loadError.set(false);

    this.productSubscription?.unsubscribe();
    this.productSubscription = this.productService.getProducts({
      page: this.currentPage(),
      size: this.pageSize(),
      sort: this.selectedSort(),
      search: this.searchKeyword() || undefined,
      category: this.activeCategory() !== 'All' ? this.activeCategory() : undefined,
      minPrice: this.minPrice() ?? undefined,
      maxPrice: this.maxPrice() ?? undefined,
      inStock: this.inStockOnly()
    }).subscribe({
      next: (res) => {
        if (res.totalPages > 0 && this.currentPage() >= res.totalPages) { this.updateQueryParams({ page: res.totalPages - 1 }); return; }
        this.products.set(res.content);
        this.totalElements.set(res.totalElements);
        this.totalPages.set(res.totalPages);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.loadError.set(true);
        this.products.set([]);
        this.totalElements.set(0);
        this.totalPages.set(0);
      }
    });
  }

  filteredProducts(): Product[] { return this.products(); }

  onSortChange(sortValue: string): void {
    this.selectedSort.set(sortValue);
    this.updateQueryParams({ sort: sortValue, page: 0 });
  }

  onCategorySelect(cat: string): void {
    this.activeCategory.set(cat);
    this.updateQueryParams({ category: cat !== 'All' ? cat : null, page: 0 });
  }

  setPriceRange(min: number | null, max: number | null): void {
    if ((min !== null && (!Number.isFinite(min) || min < 0)) || (max !== null && (!Number.isFinite(max) || max < 0)) || (min !== null && max !== null && min > max)) {
      this.toast.warning('Enter a valid price range. The minimum must be less than the maximum.');
      return;
    }
    this.updateQueryParams({ minPrice: min, maxPrice: max, page: 0 });
  }

  setAvailability(inStock: boolean): void {
    this.updateQueryParams({ inStock: inStock ? true : null, page: 0 });
  }

  clearPriceFilters(): void { this.updateQueryParams({ minPrice: null, maxPrice: null, inStock: null, page: 0 }); }


  clearFilters(): void {
    this.minPrice.set(null);
    this.maxPrice.set(null);
    this.inStockOnly.set(false);
    this.activeCategory.set('All');
    this.searchKeyword.set('');
    this.selectedSort.set('createdAt,desc');
    this.router.navigate(['/'], { fragment: 'products' });
  }

  goToPage(page: number): void {
    if (page >= 0 && page < this.totalPages()) {
      this.currentPage.set(page);
      this.updateQueryParams({ page });
      document.getElementById('products')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  }

  private updateQueryParams(params: Record<string, any>): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: 'merge',
      fragment: 'products'
    });
  }

  addToCart(product: Product, event: MouseEvent): void {
    event.stopPropagation();
    this.cartService.addToCart(product, 1);
  }

  buyNow(product: Product, event: MouseEvent): void {
    event.stopPropagation();
    if (this.cartService.addToCart(product, 1)) this.router.navigate(['/cart']);
  }

  onImageError(event: Event): void {
    const image = event.target as HTMLImageElement;
    image.onerror = null;
    image.src = '/product-placeholder.svg';
  }


}
