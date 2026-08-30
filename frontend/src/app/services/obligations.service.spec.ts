import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { Obligation } from '../models/api.models';
import { ObligationsService } from './obligations.service';

describe('ObligationsService', () => {
  let service: ObligationsService;
  let httpMock: HttpTestingController;

  const sample: Obligation = {
    id: 1,
    tipo: 'DAS',
    competencia: '2026-08-01',
    data_vencimento: '2026-08-20',
    valor: 75.9,
    status: 'PENDENTE',
    concluido_em: null,
    observacoes: null,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ObligationsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('GETs /obligations with the tipo=DAS query param', () => {
    service.list({ tipo: 'DAS' }).subscribe((obligations) => {
      expect(obligations).toEqual([sample]);
    });

    const req = httpMock.expectOne(
      (r) => r.url === `${environment.apiUrl}/obligations` && r.params.get('tipo') === 'DAS',
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);
    req.flush([sample]);
  });

  it('GETs a single obligation by id', () => {
    service.getById(1).subscribe((obligation) => {
      expect(obligation).toEqual(sample);
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/obligations/1`);
    expect(req.request.method).toBe('GET');
    req.flush(sample);
  });

  it('markAsPaid PATCHes status=CONCLUIDO', () => {
    const paid = { ...sample, status: 'CONCLUIDO' as const };

    service.markAsPaid(1).subscribe((obligation) => {
      expect(obligation.status).toBe('CONCLUIDO');
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/obligations/1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'CONCLUIDO' });
    expect(req.request.withCredentials).toBe(true);
    req.flush(paid);
  });
});
