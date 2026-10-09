export class WelcomePrompt {
  private seen = false;

  shouldOpen(path: string, authenticated: boolean): boolean {
    if (authenticated || path === '/admin' || this.seen) return false;
    this.seen = true;
    try {
      if (sessionStorage.getItem('apex_welcome_seen') === '1') return false;
      sessionStorage.setItem('apex_welcome_seen', '1');
    } catch { /* A blocked storage API must not break the welcome or browsing. */ }
    return true;
  }
}
