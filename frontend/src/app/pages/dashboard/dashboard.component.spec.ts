import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, vi } from 'vitest';

import { Obligation } from '../../models/api.models';
import { ObligationsService } from '../../services/obligations.service';
import { PushService } from '../../services/push.service';
import { TourService } from '../../services/tour.service';
import { DashboardComponent } from './dashboard.component';

describe('DashboardComponent', () => {
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;
  let obligationsServiceSpy: {
    list: ReturnType<typeof vi.fn>;
    markAsPaid: ReturnType<typeof vi.fn>;
    markAsPending: ReturnType<typeof vi.fn>;
    getFaturamento: ReturnType<typeof vi.fn>;
    cancelar: ReturnType<typeof vi.fn>;
  };
  let pushServiceStub: { isSupported: boolean; permission: string; subscribe: ReturnType<typeof vi.fn> };
  let tourServiceStub: { hasSeen: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn> };

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

  beforeEach(async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    obligationsServiceSpy = {
      list: vi.fn().mockReturnValue(of([sample])),
      markAsPaid: vi.fn(),
      markAsPending: vi.fn(),
      getFaturamento: vi.fn().mockReturnValue(of({ ano: 2026, total: 0, meses: [] })),
      cancelar: vi.fn(),
    };
    pushServiceStub = {
      isSupported: true,
      permission: 'default',
      subscribe: vi.fn(),
    };
    // Por padrão o tour já foi "visto" - a maioria dos testes não quer que o
    // auto-início dispare um setTimeout por baixo dos panos sem necessidade.
    tourServiceStub = {
      hasSeen: vi.fn().mockReturnValue(true),
      start: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        { provide: ObligationsService, useValue: obligationsServiceSpy },
        { provide: PushService, useValue: pushServiceStub },
        { provide: TourService, useValue: tourServiceStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('loads DAS obligations on init', () => {
    fixture.detectChanges();

    expect(obligationsServiceSpy.list).toHaveBeenCalledWith({ tipo: 'DAS' });
    expect(component.obligations()).toEqual([sample]);
    expect(component.loading()).toBe(false);
  });

  it('shows the push banner when permission is default', () => {
    fixture.detectChanges();
    expect(component.showPushBanner()).toBe(true);
  });

  it('hides the push banner when permission is already granted', () => {
    pushServiceStub.permission = 'granted';
    fixture.detectChanges();
    expect(component.showPushBanner()).toBe(false);
  });

  it('marks an obligation as paid and updates the list', () => {
    const paid = { ...sample, status: 'CONCLUIDO' as const };
    obligationsServiceSpy.markAsPaid.mockReturnValue(of(paid));
    fixture.detectChanges();

    component.markAsPaid(sample);

    expect(obligationsServiceSpy.markAsPaid).toHaveBeenCalledWith(1);
    expect(component.obligations()[0].status).toBe('CONCLUIDO');
  });

  it('does not mark as paid when the confirmation is cancelled', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    fixture.detectChanges();

    component.markAsPaid(sample);

    expect(obligationsServiceSpy.markAsPaid).not.toHaveBeenCalled();
  });

  it('reverts an obligation back to pending when confirmed', () => {
    const concluido = { ...sample, status: 'CONCLUIDO' as const };
    const revertido = { ...sample, status: 'PENDENTE' as const };
    obligationsServiceSpy.list.mockReturnValue(of([concluido]));
    obligationsServiceSpy.markAsPending.mockReturnValue(of(revertido));
    fixture.detectChanges();

    component.revertDasToPending(concluido);

    expect(obligationsServiceSpy.markAsPending).toHaveBeenCalledWith(1);
    expect(component.obligations()[0].status).toBe('PENDENTE');
  });

  it('does not revert to pending when the confirmation is cancelled', () => {
    const concluido = { ...sample, status: 'CONCLUIDO' as const };
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    obligationsServiceSpy.list.mockReturnValue(of([concluido]));
    fixture.detectChanges();

    component.revertDasToPending(concluido);

    expect(obligationsServiceSpy.markAsPending).not.toHaveBeenCalled();
  });

  it('starts the guided tour when "Como usar" is triggered', () => {
    fixture.detectChanges();

    component.startTour();

    expect(tourServiceStub.start).toHaveBeenCalledWith('dashboard', expect.any(Array));
  });

  it('auto-starts the guided tour on first visit', () => {
    vi.useFakeTimers();
    tourServiceStub.hasSeen.mockReturnValue(false);

    fixture.detectChanges();
    expect(tourServiceStub.start).not.toHaveBeenCalled();

    vi.runAllTimers();

    expect(tourServiceStub.start).toHaveBeenCalledWith('dashboard', expect.any(Array));
    vi.useRealTimers();
  });

  it('does not auto-start the guided tour when already seen', () => {
    vi.useFakeTimers();
    tourServiceStub.hasSeen.mockReturnValue(true);

    fixture.detectChanges();
    vi.runAllTimers();

    expect(tourServiceStub.start).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
