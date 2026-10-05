import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { apiError } from '../../services/api-error';
import { SellerAdminComponent } from '../seller-admin/seller-admin.component';

@Component({
  selector: 'app-admin-page', standalone: true, imports: [FormsModule, RouterLink, SellerAdminComponent],
  templateUrl: './admin-page.component.html', styleUrl: './admin-page.component.css'
})
export class AdminPageComponent {
  readonly auth = inject(AuthService);
  adminId = '';
  password = '';
  busy = signal(false);
  error = signal('');
  login(): void {
    if (this.busy() || !this.adminId.trim() || !this.password) return;
    this.busy.set(true); this.error.set('');
    this.auth.loginAdmin(this.adminId.trim(), this.password).subscribe({
      next: () => { this.password = ''; this.busy.set(false); },
      error: error => { this.busy.set(false); this.error.set(apiError(error, 'Could not sign in. Check your admin ID and password.')); }
    });
  }
}
