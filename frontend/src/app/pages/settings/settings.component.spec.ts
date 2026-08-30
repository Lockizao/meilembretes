import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { DasConfig, DasnSimeiConfig, NfConfig, RtRecebimentoConfig } from '../../models/api.models';
import { ConfigService } from '../../services/config.service';
import { PushService } from '../../services/push.service';
import { TourService } from '../../services/tour.service';
import { SettingsComponent } from './settings.component';

describe('SettingsComponent', () => {
  let component: SettingsComponent;
  let fixture: ComponentFixture<SettingsComponent>;
  let configServiceSpy: {
    getDasConfig: ReturnType<typeof vi.fn>;
    updateDasConfig: ReturnType<typeof vi.fn>;
    getNfConfig: ReturnType<typeof vi.fn>;
    updateNfConfig: ReturnType<typeof vi.fn>;
    getRtRecebimentoConfig: ReturnType<typeof vi.fn>;
    updateRtRecebimentoConfig: ReturnType<typeof vi.fn>;
    getDasnSimeiConfig: ReturnType<typeof vi.fn>;
    updateDasnSimeiConfig: ReturnType<typeof vi.fn>;
  };
  let pushServiceStub: {
    isSupported: boolean;
    permission: string;
    subscribe: ReturnType<typeof vi.fn>;
    unsubscribe: ReturnType<typeof vi.fn>;
    hasActiveSubscription: ReturnType<typeof vi.fn>;
  };
  let tourServiceStub: { hasSeen: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn> };

  const sample: DasConfig = {
    valor_mensal: 75.9,
    dia_vencimento: 20,
    dias_antecedencia_lembrete: [5, 1, 0],
    ativo: true,
  };

  const nfSample: NfConfig = {
    tomador_razao_social: null,
    tomador_cnpj: null,
    tomador_email: null,
    descricao_servico: null,
    valor_mensal: null,
    dia_emissao: 5,
    dias_antecedencia_lembrete: [5, 3, 1, 0],
    ativo: true,
  };

  const rtSample: RtRecebimentoConfig = {
    dias_prazo_pagamento: 30,
    dias_antecedencia_lembrete: [5, 3, 1, 0],
    ativo: true,
  };

  const dasnSample: DasnSimeiConfig = {
    dias_antecedencia_lembrete: [15, 7, 3, 1, 0],
    ativo: true,
  };

  beforeEach(async () => {
    configServiceSpy = {
      getDasConfig: vi.fn().mockReturnValue(of(sample)),
      updateDasConfig: vi.fn().mockReturnValue(of(sample)),
      getNfConfig: vi.fn().mockReturnValue(of(nfSample)),
      updateNfConfig: vi.fn().mockReturnValue(of(nfSample)),
      getRtRecebimentoConfig: vi.fn().mockReturnValue(of(rtSample)),
      updateRtRecebimentoConfig: vi.fn().mockReturnValue(of(rtSample)),
      getDasnSimeiConfig: vi.fn().mockReturnValue(of(dasnSample)),
      updateDasnSimeiConfig: vi.fn().mockReturnValue(of(dasnSample)),
    };
    pushServiceStub = {
      isSupported: true,
      permission: 'default',
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      hasActiveSubscription: vi.fn().mockResolvedValue(false),
    };
    tourServiceStub = {
      hasSeen: vi.fn().mockReturnValue(true),
      start: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [
        { provide: ConfigService, useValue: configServiceSpy },
        { provide: PushService, useValue: pushServiceStub },
        { provide: TourService, useValue: tourServiceStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('loads das config on init and fills the form', () => {
    fixture.detectChanges();

    expect(configServiceSpy.getDasConfig).toHaveBeenCalled();
    expect(component.form.controls.valor_mensal.value).toBe(75.9);
    expect(component.form.controls.dia_vencimento.value).toBe(20);
    expect(component.diasAntecedencia.value).toEqual([5, 1, 0]);
  });

  it('adds a new dia de antecedencia keeping the list sorted descending', () => {
    fixture.detectChanges();
    component.novoDiaAntecedencia.setValue(10);

    component.addDiaAntecedencia();

    expect(component.diasAntecedencia.value).toEqual([10, 5, 1, 0]);
  });

  it('submits the updated config', () => {
    fixture.detectChanges();
    component.form.patchValue({ valor_mensal: 80, ativo: false });

    component.submit();

    expect(configServiceSpy.updateDasConfig).toHaveBeenCalledWith(
      expect.objectContaining({ valor_mensal: 80, ativo: false }),
    );
  });

  it('activates push notifications', async () => {
    pushServiceStub.subscribe.mockResolvedValue({ ok: true });
    fixture.detectChanges();

    await component.activatePush();

    expect(component.pushGranted()).toBe(true);
  });

  it('starts the guided tour when "Como usar" is triggered', () => {
    fixture.detectChanges();

    component.startTour();

    expect(tourServiceStub.start).toHaveBeenCalledWith('settings', expect.any(Array));
  });

  it('auto-starts the guided tour on first visit', () => {
    vi.useFakeTimers();
    tourServiceStub.hasSeen.mockReturnValue(false);

    fixture.detectChanges();
    expect(tourServiceStub.start).not.toHaveBeenCalled();

    vi.runAllTimers();

    expect(tourServiceStub.start).toHaveBeenCalledWith('settings', expect.any(Array));
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
