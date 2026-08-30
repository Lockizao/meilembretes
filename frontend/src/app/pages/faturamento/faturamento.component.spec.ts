import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { Faturamento } from '../../models/api.models';
import { ObligationsService } from '../../services/obligations.service';
import { FaturamentoComponent } from './faturamento.component';

describe('FaturamentoComponent', () => {
  let component: FaturamentoComponent;
  let fixture: ComponentFixture<FaturamentoComponent>;
  let obligationsServiceSpy: { getFaturamento: ReturnType<typeof vi.fn> };

  const sample: Faturamento = {
    ano: 2026,
    total: 3000,
    meses: [
      { competencia: '2026-08-01', valor: 3000, status: 'CONCLUIDO' },
      { competencia: '2026-09-01', valor: 3000, status: 'PENDENTE' },
    ],
  };

  beforeEach(async () => {
    obligationsServiceSpy = {
      getFaturamento: vi.fn().mockReturnValue(of(sample)),
    };

    await TestBed.configureTestingModule({
      imports: [FaturamentoComponent],
      providers: [{ provide: ObligationsService, useValue: obligationsServiceSpy }],
    }).compileComponents();

    fixture = TestBed.createComponent(FaturamentoComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('loads faturamento do ano atual on init', () => {
    fixture.detectChanges();

    expect(obligationsServiceSpy.getFaturamento).toHaveBeenCalledWith(new Date().getFullYear());
    expect(component.faturamento()).toEqual(sample);
    expect(component.loading()).toBe(false);
  });

  it('reloads when the year changes', () => {
    fixture.detectChanges();
    obligationsServiceSpy.getFaturamento.mockReturnValue(of({ ano: 2025, total: 0, meses: [] }));

    component.onAnoChange(2025);

    expect(obligationsServiceSpy.getFaturamento).toHaveBeenCalledWith(2025);
    expect(component.ano()).toBe(2025);
  });
});
