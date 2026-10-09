import { Component, inject, signal, effect } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from './services/auth.service';
import { WelcomePrompt } from './services/welcome-prompt';
import { CommonModule, DOCUMENT, ViewportScroller } from '@angular/common';
import { HeaderComponent } from './components/header/header.component';
import { FooterComponent } from './components/footer/footer.component';
import { ToastComponent } from './components/toast/toast.component';
import { AuthModalComponent } from './components/auth-modal/auth-modal.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    HeaderComponent,
    FooterComponent,
    ToastComponent,
    AuthModalComponent
  ],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  private readonly auth = inject(AuthService);
  private readonly welcome = new WelcomePrompt();
  isAuthModalOpen = signal(false);

  constructor() {
    const document = inject(DOCUMENT);
    // Router anchor scrolling uses an explicit offset for the sticky header.
    inject(ViewportScroller).setOffset(() => [0, (document.querySelector('app-header')?.getBoundingClientRect().height ?? 88) + 16]);
    inject(Router).events.pipe(filter(event => event instanceof NavigationEnd), takeUntilDestroyed()).subscribe(event => {
      const path = (event as NavigationEnd).urlAfterRedirects.split(/[?#]/)[0];
      // The admin portal has its own login. A dismissed welcome stays dismissed in this tab.
      if (path === '/admin') { this.closeAuthModal(); return; }
      if (this.welcome.shouldOpen(path, this.auth.isAuthenticated())) this.openAuthModal();
    });
    effect(() => { if (this.auth.isAuthenticated()) this.closeAuthModal(); });
  }

  openAuthModal(): void {
    this.isAuthModalOpen.set(true);
  }

  closeAuthModal(): void {
    this.isAuthModalOpen.set(false);
  }
}
