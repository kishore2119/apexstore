import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, filter, tap } from 'rxjs';
import { API_BASE, API_ENDPOINTS } from '../config/api.config';
import { AuthResponse, User } from '../models/ecom.models';
import { ToastService } from './toast.service';
import { tokenExpiry, tokenSubject } from './session';
import { CartService } from './cart.service';

@Injectable({
  providedIn: 'root',
})
export class AuthService implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly cart = inject(CartService);

  private readonly tokenSignal = signal<string | null>(this.readStorage('ecom_token'));
  private readonly userSignal = signal<User | null>(this.loadStoredUser());

  readonly token = this.tokenSignal.asReadonly();
  readonly currentUser = this.userSignal.asReadonly();

  readonly isAuthenticated = computed(() => !!this.tokenSignal() && !!this.userSignal());
  readonly isSeller = computed(() => this.userSignal()?.roles?.includes('SELLER') ?? false);
  readonly isAdmin = computed(() => this.userSignal()?.roles?.includes('ADMIN') ?? false);
  private expiryTimer?: ReturnType<typeof setTimeout>;
  private sessionVersion = 0;
  private readonly storageListener = (event: StorageEvent): void => {
    if (event.key !== null && event.key !== 'ecom_user' && event.key !== 'ecom_token') return;
    const token = this.readStorage('ecom_token');
    const user = this.loadStoredUser();
    if (!user || tokenExpiry(token) <= Date.now()) {
      this.logout(false);
      return;
    }
    // Token and user are written separately. Wait for the matching pair on an account switch.
    if (tokenSubject(token) !== user.id) return;
    if (token === this.tokenSignal() && JSON.stringify(user) === JSON.stringify(this.userSignal()))
      return;
    this.sessionVersion++;
    this.cart.activateUser(user.id, user.roles.includes('ADMIN'));
    this.tokenSignal.set(token);
    this.userSignal.set(user);
    this.scheduleExpiry();
  };

  private readStorage(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private storeSession(): void {
    try {
      const token = this.tokenSignal(),
        user = this.userSignal();
      if (token && user) {
        localStorage.setItem('ecom_token', token);
        localStorage.setItem('ecom_user', JSON.stringify(user));
      } else {
        localStorage.removeItem('ecom_token');
        localStorage.removeItem('ecom_user');
      }
    } catch {
      /* The current session can still run in memory when storage is unavailable. */
    }
  }

  constructor() {
    if (
      !this.userSignal() ||
      tokenExpiry(this.tokenSignal()) <= Date.now() ||
      tokenSubject(this.tokenSignal()) !== this.userSignal()?.id
    )
      this.logout(false);
    else {
      this.cart.activateUser(this.userSignal()!.id, this.isAdmin());
      this.scheduleExpiry();
    }
    if (typeof window !== 'undefined') window.addEventListener('storage', this.storageListener);
  }

  private scheduleExpiry(): void {
    clearTimeout(this.expiryTimer);
    this.expiryTimer = setTimeout(
      () => {
        this.logout(false);
        this.toast.info('Your session has expired. Please sign in again.');
      },
      Math.max(0, Math.min(tokenExpiry(this.tokenSignal()) - Date.now(), 2147483647)),
    );
  }

  private loadStoredUser(): User | null {
    try {
      const raw = this.readStorage('ecom_user');
      const user = raw ? JSON.parse(raw) : null;
      return user &&
        typeof user.id === 'string' &&
        typeof user.name === 'string' &&
        typeof user.email === 'string' &&
        Array.isArray(user.roles)
        ? user
        : null;
    } catch {
      return null;
    }
  }

  setSession(auth: AuthResponse): void {
    this.sessionVersion++;
    this.cart.activateUser(auth.user.id, auth.user.roles.includes('ADMIN'));
    this.tokenSignal.set(auth.accessToken);
    this.userSignal.set(auth.user);
    this.storeSession();
    this.scheduleExpiry();
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(API_ENDPOINTS.auth.login, { email, password }).pipe(
      tap({
        next: (res) => {
          this.setSession(res);
          this.toast.success(`Welcome back, ${res.user.name}!`);
        },
        error: (err) => {
          const msg = err.error?.message || 'Invalid email or password';
          this.toast.error(msg);
        },
      }),
    );
  }

  register(name: string, email: string, password: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(API_ENDPOINTS.auth.register, { name, email, password })
      .pipe(
        tap({
          next: (response) => {
            this.setSession(response);
            this.toast.success('Your account is ready. Welcome to ApexMart!');
          },
          error: (err) => {
            const msg = err.error?.message || 'Registration failed. Email might already exist.';
            this.toast.error(msg);
          },
        }),
      );
  }

  loginAdmin(adminId: string, password: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(API_BASE + '/api/auth/admin/login', { adminId, password })
      .pipe(
        tap((session) => {
          if (!session.user.roles.includes('ADMIN'))
            throw new Error('This account does not have admin access.');
          this.setSession(session);
        }),
      );
  }

  refreshMe(): Observable<User> {
    const version = this.sessionVersion;
    return this.http.get<User>(API_ENDPOINTS.users.me).pipe(
      filter(() => this.sessionVersion === version),
      tap({
        next: (user) => {
          this.userSignal.set(user);
          this.storeSession();
        },
        error: (err) => {
          if (err.status === 401 && this.sessionVersion === version) {
            this.logout(false);
          }
        },
      }),
    );
  }

  becomeSeller(): Observable<AuthResponse> {
    const version = this.sessionVersion;
    return this.http.post<AuthResponse>(API_ENDPOINTS.users.becomeSeller, {}).pipe(
      filter(() => this.sessionVersion === version),
      tap({
        next: (res) => {
          this.setSession(res);
          this.toast.success('You can now list products for sale on ApexMart.');
        },
        error: (err) => {
          const msg = err.error?.message || 'Could not upgrade account to Seller';
          this.toast.error(msg);
        },
      }),
    );
  }

  logout(showToast = true): void {
    this.sessionVersion++;
    clearTimeout(this.expiryTimer);
    this.tokenSignal.set(null);
    this.userSignal.set(null);
    this.cart.activateUser(null);
    this.storeSession();
    if (showToast) {
      this.toast.info('You have logged out successfully.');
    }
  }

  ngOnDestroy(): void {
    clearTimeout(this.expiryTimer);
    if (typeof window !== 'undefined') window.removeEventListener('storage', this.storageListener);
  }
}
