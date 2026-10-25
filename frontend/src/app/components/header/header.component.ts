import { Component, EventEmitter, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../services/auth.service';
import { CartService } from '../../services/cart.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css'],
})
export class HeaderComponent {
  readonly auth = inject(AuthService);
  readonly cart = inject(CartService);
  private readonly router = inject(Router);

  @Output() openAuthModal = new EventEmitter<void>();

  closePanels(): void {
    this.closeAccountMenu();
  }

  searchQuery = signal('');
  selectedCategory = signal('All');
  isAccountMenuOpen = signal(false);

  constructor() {
    inject(ActivatedRoute)
      .queryParams.pipe(takeUntilDestroyed())
      .subscribe((params) => {
        this.searchQuery.set(params['search'] || '');
        this.selectedCategory.set(params['category'] || 'All');
      });
  }

  readonly subCategories = [
    { name: 'All Products', category: 'All' },
    { name: 'Electronics', category: 'Electronics' },
    { name: 'Fashion', category: 'Fashion' },
    { name: 'Home & Living', category: 'Home' },
    { name: 'Appliances', category: 'Appliances' },
    { name: 'Books', category: 'Books' },
  ];

  toggleAccountMenu(): void {
    this.isAccountMenuOpen.update((v) => !v);
  }

  closeAccountMenu(): void {
    this.isAccountMenuOpen.set(false);
  }

  onSearch(): void {
    const query = this.searchQuery().trim();
    this.closePanels();
    void this.router.navigate(['/'], {
      queryParams: { search: query || null, view: query ? null : 'all' },
      fragment: 'products',
    });
  }

  handleBecomeSeller(): void {
    if (!this.auth.isAuthenticated()) {
      this.openAuthModal.emit();
      return;
    }
    this.auth
      .becomeSeller()
      .subscribe({ next: () => this.router.navigate(['/seller']), error: () => {} });
  }

  handleLogout(): void {
    this.auth.logout();
    this.isAccountMenuOpen.set(false);
    this.router.navigate(['/']);
  }
}
