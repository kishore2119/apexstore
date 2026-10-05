import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { API_BASE } from '../config/api.config';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(API_BASE + '/api/')) return next(req);
  const auth = inject(AuthService);
  const token = req.url.includes('/api/auth/') ? null : auth.token();
  const traceId = 'trace-' + Math.random().toString(36).substring(2, 10) + '-' + Date.now();

  let headers = req.headers.set('X-Trace-Id', traceId);

  if (token) {
    headers = headers.set('Authorization', `Bearer ${token}`);
  }

  const cloned = req.clone({ headers });
  return next(cloned).pipe(catchError(error => {
    if (error.status === 401 && token && auth.token() === token) auth.logout(false);
    return throwError(() => error);
  }));
};
