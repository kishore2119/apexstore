function tokenClaims(token: string | null): Record<string, unknown> | null {
  try {
    if (!token || token.split('.').length !== 3) return null;
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

export function tokenExpiry(token: string | null): number {
  const expires = tokenClaims(token)?.['exp'];
  return typeof expires === 'number' && Number.isFinite(expires) ? expires * 1000 : 0;
}

export function tokenSubject(token: string | null): string | null {
  const subject = tokenClaims(token)?.['sub'];
  return typeof subject === 'string' ? subject : null;
}
