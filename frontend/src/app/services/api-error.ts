export function apiError(error: any, fallback: string): string {
  const fields = error?.error?.fields;
  if (fields && Object.keys(fields).length) return Object.entries(fields).map(([name, message]) => `${name}: ${message}`).join('; ');
  return typeof error?.error?.message === 'string' ? error.error.message : fallback;
}
