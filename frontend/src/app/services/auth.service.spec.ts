import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('POSTs credentials to /auth/login with credentials included', () => {
    const credentials = { email: 'matheus@rtvendas.com', password: 'segredo' };

    service.login(credentials).subscribe((response) => {
      expect(response).toEqual({ email: 'matheus@rtvendas.com' });
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/auth/login`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(credentials);
    expect(req.request.withCredentials).toBe(true);
    req.flush({ email: 'matheus@rtvendas.com' });
  });

  it('propagates a 401 with the backend error detail on invalid credentials', () => {
    let nextCalled = false;
    let errorReceived: unknown = null;

    service.login({ email: 'x@x.com', password: 'errada' }).subscribe({
      next: () => {
        nextCalled = true;
      },
      error: (err) => {
        errorReceived = err;
      },
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/auth/login`);
    req.flush({ detail: 'Credenciais inválidas' }, { status: 401, statusText: 'Unauthorized' });

    expect(nextCalled).toBe(false);
    expect((errorReceived as { status: number }).status).toBe(401);
    expect((errorReceived as { error: unknown }).error).toEqual({
      detail: 'Credenciais inválidas',
    });
  });

  it('POSTs to /auth/logout with credentials included', () => {
    service.logout().subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/auth/logout`);
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBe(true);
    req.flush(null, { status: 204, statusText: 'No Content' });
  });
});
