import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, CanActivateFn, RouterStateSnapshot } from '@angular/router';

import { authGuard } from './auth.guard';

describe('authGuard', () => {
  const executeGuard: CanActivateFn = (...guardParameters) =>
    TestBed.runInInjectionContext(() => authGuard(...guardParameters));

  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('always allows navigation (páginas cuidam do carregamento; interceptor redireciona em 401)', () => {
    const result = executeGuard(
      {} as ActivatedRouteSnapshot,
      {} as RouterStateSnapshot,
    );
    expect(result).toBe(true);
  });
});
