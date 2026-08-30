import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { DasConfig } from '../models/api.models';
import { ConfigService } from './config.service';

describe('ConfigService', () => {
  let service: ConfigService;
  let httpMock: HttpTestingController;

  const sample: DasConfig = {
    valor_mensal: 75.9,
    dia_vencimento: 20,
    dias_antecedencia_lembrete: [5, 1, 0],
    ativo: true,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ConfigService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('GETs /config/das', () => {
    service.getDasConfig().subscribe((config) => {
      expect(config).toEqual(sample);
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/config/das`);
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);
    req.flush(sample);
  });

  it('PUTs the updated config to /config/das', () => {
    service.updateDasConfig(sample).subscribe((config) => {
      expect(config).toEqual(sample);
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/config/das`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(sample);
    expect(req.request.withCredentials).toBe(true);
    req.flush(sample);
  });
});
