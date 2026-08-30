import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { environment } from '../../environments/environment';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('adds withCredentials to requests targeting the API', () => {
    http.get(`${environment.apiUrl}/config/das`).subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/config/das`);
    expect(req.request.withCredentials).toBe(true);
    req.flush({});
  });

  it('does not tamper with requests to other hosts', () => {
    http.get('https://outro-servico.example.com/x').subscribe();

    const req = httpMock.expectOne('https://outro-servico.example.com/x');
    expect(req.request.withCredentials).toBe(false);
    req.flush({});
  });

  it('redirects to /login on a 401 from the API', () => {
    http.get(`${environment.apiUrl}/obligations`).subscribe({ error: () => {} });

    const req = httpMock.expectOne(`${environment.apiUrl}/obligations`);
    req.flush({ detail: 'unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('does not redirect on a 401 from the login endpoint itself', () => {
    http.post(`${environment.apiUrl}/auth/login`, {}).subscribe({ error: () => {} });

    const req = httpMock.expectOne(`${environment.apiUrl}/auth/login`);
    req.flush({ detail: 'Credenciais inválidas' }, { status: 401, statusText: 'Unauthorized' });

    expect(router.navigate).not.toHaveBeenCalled();
  });
});
