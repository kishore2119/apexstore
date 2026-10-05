import { Component, EventEmitter, Output, inject, signal } from '@angular/core';
import { DialogDirective } from '../../directives/dialog.directive';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { apiError } from '../../services/api-error';

@Component({
  selector: 'app-auth-modal',
  standalone: true,
  imports: [DialogDirective, CommonModule, FormsModule],
  templateUrl: './auth-modal.component.html',
  styleUrls: ['./auth-modal.component.css']
})
export class AuthModalComponent {
  private readonly auth = inject(AuthService);

  @Output() close = new EventEmitter<void>();

  isLoginMode = signal(true);
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);

  // Form inputs
  name = '';
  email = '';
  password = '';

  setLoginMode(login: boolean): void {
    this.isLoginMode.set(login);
    this.errorMessage.set(null);
  }

  onSubmit(): void {
    if (this.isLoading()) return;
    this.errorMessage.set(null);
    this.email = this.email.trim();
    this.name = this.name.trim();

    if (this.isLoginMode()) {
      if (!this.email || !this.password) {
        this.errorMessage.set('Please provide both email and password.');
        return;
      }

      this.isLoading.set(true);
      this.auth.login(this.email, this.password).subscribe({
        next: () => {
          this.isLoading.set(false);
          this.close.emit();
        },
        error: (err) => {
          this.isLoading.set(false);
          this.errorMessage.set(apiError(err, 'Login failed. Check your credentials.'));
        }
      });
    } else {
      if (!this.name || !this.email || !this.password) {
        this.errorMessage.set('Please fill out all fields.');
        return;
      }
      if (this.password.length < 10 || this.password.length > 64 || new TextEncoder().encode(this.password).length > 72) {
        this.errorMessage.set('Use a password with 10–64 characters, up to 72 UTF-8 bytes.');
        return;
      }

      this.isLoading.set(true);
      this.auth.register(this.name, this.email, this.password).subscribe({
        next: () => {
          this.isLoading.set(false);
          this.close.emit();
        },
        error: (err) => {
          this.isLoading.set(false);
          this.errorMessage.set(apiError(err, 'Registration failed. Email might already exist.'));
        }
      });
    }
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.close.emit();
    }
  }
}
