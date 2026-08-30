import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { environment } from '../../environments/environment';

/**
 * - Garante `withCredentials: true` em toda chamada para a API do backend
 *   (o cookie httpOnly de sessão precisa ser enviado/recebido).
 * - Em caso de 401 (não autenticado / sessão expirada), redireciona para /login.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);

  const isApiRequest = req.url.startsWith(environment.apiUrl);
  const authReq = isApiRequest ? req.clone({ withCredentials: true }) : req;

  return next(authReq).pipe(
    catchError((error: unknown) => {
      if (
        isApiRequest &&
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        !req.url.endsWith('/auth/login')
      ) {
        router.navigate(['/login']);
      }
      return throwError(() => error);
    }),
  );
};
