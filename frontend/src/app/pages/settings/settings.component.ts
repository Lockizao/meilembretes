import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormControl,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ConfigService } from '../../services/config.service';
import { PushService } from '../../services/push.service';
import { TourService, TourStep } from '../../services/tour.service';

/** Passos do tour guiado da tela de Configurações - cada `selector` bate com
 * um atributo `data-tour` no template. Todos apontam pros títulos de seção
 * e pro card de notificações, que ficam na tela independente do carregamento
 * de cada config (os formulários em si só aparecem depois de carregar). */
const SETTINGS_TOUR_ID = 'settings';
const SETTINGS_TOUR_STEPS: TourStep[] = [
  {
    title: 'Configurações',
    description:
      'Aqui você ajusta valores, datas de vencimento/emissão e com quantos dias de antecedência cada lembrete chega, pra cada uma das 4 obrigações.',
  },
  {
    selector: '[data-tour="settings-das"]',
    title: 'DAS-MEI',
    description:
      'Valor do boleto, dia do vencimento (padrão dia 20) e os dias de antecedência do lembrete. O toggle "Lembretes ativos" desliga a notificação sem apagar a configuração.',
  },
  {
    selector: '[data-tour="settings-nf"]',
    title: 'Nota Fiscal (RT Intelligence)',
    description:
      'Dados do tomador e descrição do serviço usados nos "dados prontos pra copiar" do Dashboard, além do dia de emissão e a antecedência do lembrete.',
  },
  {
    selector: '[data-tour="settings-rt"]',
    title: 'Recebimento (RT Intelligence)',
    description:
      'O prazo de pagamento aqui é o que define a data prevista do recebimento (emissão da NF + esses dias), gerada automaticamente.',
  },
  {
    selector: '[data-tour="settings-dasn"]',
    title: 'Declaração DASN-SIMEI',
    description: 'O prazo (31/05) é fixo em lei - só dá pra configurar a antecedência do lembrete.',
  },
  {
    selector: '[data-tour="settings-push"]',
    title: 'Notificações push',
    description:
      'É aqui que você ativa (ou cancela) as notificações no navegador/celular - sem isso, os lembretes configurados acima não chegam a lugar nenhum.',
  },
  {
    title: 'Pronto!',
    description: 'Depois de salvar, volte pro Dashboard pra ver tudo em ação.',
  },
];

@Component({
  selector: 'app-settings',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly configService = inject(ConfigService);
  private readonly pushService = inject(PushService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly tourService = inject(TourService);

  private autoTourTimeout: ReturnType<typeof setTimeout> | null = null;

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly pushBusy = signal(false);
  readonly pushGranted = signal(false);
  readonly pushSupported = signal(true);

  readonly nfLoading = signal(true);
  readonly nfSaving = signal(false);

  readonly rtLoading = signal(true);
  readonly rtSaving = signal(false);

  readonly dasnLoading = signal(true);
  readonly dasnSaving = signal(false);

  readonly form = this.fb.group({
    valor_mensal: this.fb.control<number | null>(null),
    dia_vencimento: this.fb.control(20, {
      validators: [Validators.required, Validators.min(1), Validators.max(31)],
      nonNullable: true,
    }),
    dias_antecedencia_lembrete: this.fb.array<FormControl<number>>([]),
    ativo: this.fb.control(true, { nonNullable: true }),
  });

  readonly novoDiaAntecedencia = this.fb.control<number | null>(null);

  readonly nfForm = this.fb.group({
    tomador_razao_social: this.fb.control<string | null>(null),
    tomador_cnpj: this.fb.control<string | null>(null),
    tomador_email: this.fb.control<string | null>(null, { validators: [Validators.email] }),
    descricao_servico: this.fb.control<string | null>(null),
    valor_mensal: this.fb.control<number | null>(null),
    dia_emissao: this.fb.control(5, {
      validators: [Validators.required, Validators.min(1), Validators.max(31)],
      nonNullable: true,
    }),
    dias_antecedencia_lembrete: this.fb.array<FormControl<number>>([]),
    ativo: this.fb.control(true, { nonNullable: true }),
  });

  readonly novoDiaAntecedenciaNf = this.fb.control<number | null>(null);

  readonly rtForm = this.fb.group({
    dias_prazo_pagamento: this.fb.control(30, {
      validators: [Validators.required, Validators.min(1)],
      nonNullable: true,
    }),
    dias_antecedencia_lembrete: this.fb.array<FormControl<number>>([]),
    ativo: this.fb.control(true, { nonNullable: true }),
  });

  readonly novoDiaAntecedenciaRt = this.fb.control<number | null>(null);

  readonly dasnForm = this.fb.group({
    dias_antecedencia_lembrete: this.fb.array<FormControl<number>>([]),
    ativo: this.fb.control(true, { nonNullable: true }),
  });

  readonly novoDiaAntecedenciaDasn = this.fb.control<number | null>(null);

  get diasAntecedencia(): FormArray<FormControl<number>> {
    return this.form.controls.dias_antecedencia_lembrete;
  }

  get diasAntecedenciaNf(): FormArray<FormControl<number>> {
    return this.nfForm.controls.dias_antecedencia_lembrete;
  }

  get diasAntecedenciaRt(): FormArray<FormControl<number>> {
    return this.rtForm.controls.dias_antecedencia_lembrete;
  }

  get diasAntecedenciaDasn(): FormArray<FormControl<number>> {
    return this.dasnForm.controls.dias_antecedencia_lembrete;
  }

  ngOnInit(): void {
    this.pushSupported.set(this.pushService.isSupported);
    this.pushService.hasActiveSubscription().then((active) => this.pushGranted.set(active));
    this.loadConfig();
    this.loadNfConfig();
    this.loadRtConfig();
    this.loadDasnConfig();

    if (!this.tourService.hasSeen(SETTINGS_TOUR_ID)) {
      // Mesmo atraso do tour do Dashboard - só dá tempo da tela desenhar.
      this.autoTourTimeout = setTimeout(() => this.startTour(), 600);
    }
  }

  ngOnDestroy(): void {
    if (this.autoTourTimeout) {
      clearTimeout(this.autoTourTimeout);
    }
  }

  startTour(): void {
    this.tourService.start(SETTINGS_TOUR_ID, SETTINGS_TOUR_STEPS);
  }

  loadConfig(): void {
    this.loading.set(true);
    this.configService.getDasConfig().subscribe({
      next: (config) => {
        this.form.patchValue({
          valor_mensal: config.valor_mensal,
          dia_vencimento: config.dia_vencimento,
          ativo: config.ativo,
        });
        this.diasAntecedencia.clear();
        for (const dia of config.dias_antecedencia_lembrete) {
          this.diasAntecedencia.push(this.fb.control(dia, { nonNullable: true }));
        }
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snackBar.open('Não foi possível carregar as configurações.', 'Fechar', {
          duration: 5000,
        });
      },
    });
  }

  addDiaAntecedencia(): void {
    const valor = this.novoDiaAntecedencia.value;
    if (valor === null || valor === undefined || valor < 0) {
      return;
    }
    if (this.diasAntecedencia.value.includes(valor)) {
      this.novoDiaAntecedencia.reset();
      return;
    }
    this.diasAntecedencia.push(this.fb.control(valor, { nonNullable: true }));
    this.diasAntecedencia.setValue(
      [...this.diasAntecedencia.value].sort((a, b) => b - a),
    );
    this.novoDiaAntecedencia.reset();
  }

  removeDiaAntecedencia(index: number): void {
    this.diasAntecedencia.removeAt(index);
  }

  loadNfConfig(): void {
    this.nfLoading.set(true);
    this.configService.getNfConfig().subscribe({
      next: (config) => {
        this.nfForm.patchValue({
          tomador_razao_social: config.tomador_razao_social,
          tomador_cnpj: config.tomador_cnpj,
          tomador_email: config.tomador_email,
          descricao_servico: config.descricao_servico,
          valor_mensal: config.valor_mensal,
          dia_emissao: config.dia_emissao,
          ativo: config.ativo,
        });
        this.diasAntecedenciaNf.clear();
        for (const dia of config.dias_antecedencia_lembrete) {
          this.diasAntecedenciaNf.push(this.fb.control(dia, { nonNullable: true }));
        }
        this.nfLoading.set(false);
      },
      error: () => {
        this.nfLoading.set(false);
        this.snackBar.open('Não foi possível carregar as configurações de NF.', 'Fechar', {
          duration: 5000,
        });
      },
    });
  }

  addDiaAntecedenciaNf(): void {
    const valor = this.novoDiaAntecedenciaNf.value;
    if (valor === null || valor === undefined || valor < 0) {
      return;
    }
    if (this.diasAntecedenciaNf.value.includes(valor)) {
      this.novoDiaAntecedenciaNf.reset();
      return;
    }
    this.diasAntecedenciaNf.push(this.fb.control(valor, { nonNullable: true }));
    this.diasAntecedenciaNf.setValue(
      [...this.diasAntecedenciaNf.value].sort((a, b) => b - a),
    );
    this.novoDiaAntecedenciaNf.reset();
  }

  removeDiaAntecedenciaNf(index: number): void {
    this.diasAntecedenciaNf.removeAt(index);
  }

  submitNf(): void {
    if (this.nfForm.invalid || this.nfSaving()) {
      this.nfForm.markAllAsTouched();
      return;
    }

    this.nfSaving.set(true);
    const value = this.nfForm.getRawValue();

    this.configService
      .updateNfConfig({
        tomador_razao_social: value.tomador_razao_social,
        tomador_cnpj: value.tomador_cnpj,
        tomador_email: value.tomador_email,
        descricao_servico: value.descricao_servico,
        valor_mensal: value.valor_mensal,
        dia_emissao: value.dia_emissao,
        dias_antecedencia_lembrete: value.dias_antecedencia_lembrete,
        ativo: value.ativo,
      })
      .subscribe({
        next: () => {
          this.nfSaving.set(false);
          this.snackBar.open('Configurações de NF salvas.', 'Fechar', { duration: 3000 });
        },
        error: () => {
          this.nfSaving.set(false);
          this.snackBar.open('Não foi possível salvar. Tente novamente.', 'Fechar', {
            duration: 5000,
          });
        },
      });
  }

  submit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    const value = this.form.getRawValue();

    this.configService
      .updateDasConfig({
        valor_mensal: value.valor_mensal,
        dia_vencimento: value.dia_vencimento,
        dias_antecedencia_lembrete: value.dias_antecedencia_lembrete,
        ativo: value.ativo,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.snackBar.open('Configurações salvas.', 'Fechar', { duration: 3000 });
        },
        error: () => {
          this.saving.set(false);
          this.snackBar.open('Não foi possível salvar. Tente novamente.', 'Fechar', {
            duration: 5000,
          });
        },
      });
  }

  loadRtConfig(): void {
    this.rtLoading.set(true);
    this.configService.getRtRecebimentoConfig().subscribe({
      next: (config) => {
        this.rtForm.patchValue({
          dias_prazo_pagamento: config.dias_prazo_pagamento,
          ativo: config.ativo,
        });
        this.diasAntecedenciaRt.clear();
        for (const dia of config.dias_antecedencia_lembrete) {
          this.diasAntecedenciaRt.push(this.fb.control(dia, { nonNullable: true }));
        }
        this.rtLoading.set(false);
      },
      error: () => {
        this.rtLoading.set(false);
        this.snackBar.open('Não foi possível carregar as configurações de recebimento.', 'Fechar', {
          duration: 5000,
        });
      },
    });
  }

  addDiaAntecedenciaRt(): void {
    const valor = this.novoDiaAntecedenciaRt.value;
    if (valor === null || valor === undefined || valor < 0) {
      return;
    }
    if (this.diasAntecedenciaRt.value.includes(valor)) {
      this.novoDiaAntecedenciaRt.reset();
      return;
    }
    this.diasAntecedenciaRt.push(this.fb.control(valor, { nonNullable: true }));
    this.diasAntecedenciaRt.setValue(
      [...this.diasAntecedenciaRt.value].sort((a, b) => b - a),
    );
    this.novoDiaAntecedenciaRt.reset();
  }

  removeDiaAntecedenciaRt(index: number): void {
    this.diasAntecedenciaRt.removeAt(index);
  }

  submitRt(): void {
    if (this.rtForm.invalid || this.rtSaving()) {
      this.rtForm.markAllAsTouched();
      return;
    }

    this.rtSaving.set(true);
    const value = this.rtForm.getRawValue();

    this.configService
      .updateRtRecebimentoConfig({
        dias_prazo_pagamento: value.dias_prazo_pagamento,
        dias_antecedencia_lembrete: value.dias_antecedencia_lembrete,
        ativo: value.ativo,
      })
      .subscribe({
        next: () => {
          this.rtSaving.set(false);
          this.snackBar.open('Configurações de recebimento salvas.', 'Fechar', { duration: 3000 });
        },
        error: () => {
          this.rtSaving.set(false);
          this.snackBar.open('Não foi possível salvar. Tente novamente.', 'Fechar', {
            duration: 5000,
          });
        },
      });
  }

  loadDasnConfig(): void {
    this.dasnLoading.set(true);
    this.configService.getDasnSimeiConfig().subscribe({
      next: (config) => {
        this.dasnForm.patchValue({ ativo: config.ativo });
        this.diasAntecedenciaDasn.clear();
        for (const dia of config.dias_antecedencia_lembrete) {
          this.diasAntecedenciaDasn.push(this.fb.control(dia, { nonNullable: true }));
        }
        this.dasnLoading.set(false);
      },
      error: () => {
        this.dasnLoading.set(false);
        this.snackBar.open('Não foi possível carregar as configurações da DASN-SIMEI.', 'Fechar', {
          duration: 5000,
        });
      },
    });
  }

  addDiaAntecedenciaDasn(): void {
    const valor = this.novoDiaAntecedenciaDasn.value;
    if (valor === null || valor === undefined || valor < 0) {
      return;
    }
    if (this.diasAntecedenciaDasn.value.includes(valor)) {
      this.novoDiaAntecedenciaDasn.reset();
      return;
    }
    this.diasAntecedenciaDasn.push(this.fb.control(valor, { nonNullable: true }));
    this.diasAntecedenciaDasn.setValue(
      [...this.diasAntecedenciaDasn.value].sort((a, b) => b - a),
    );
    this.novoDiaAntecedenciaDasn.reset();
  }

  removeDiaAntecedenciaDasn(index: number): void {
    this.diasAntecedenciaDasn.removeAt(index);
  }

  submitDasn(): void {
    if (this.dasnForm.invalid || this.dasnSaving()) {
      this.dasnForm.markAllAsTouched();
      return;
    }

    this.dasnSaving.set(true);
    const value = this.dasnForm.getRawValue();

    this.configService
      .updateDasnSimeiConfig({
        dias_antecedencia_lembrete: value.dias_antecedencia_lembrete,
        ativo: value.ativo,
      })
      .subscribe({
        next: () => {
          this.dasnSaving.set(false);
          this.snackBar.open('Configurações da DASN-SIMEI salvas.', 'Fechar', { duration: 3000 });
        },
        error: () => {
          this.dasnSaving.set(false);
          this.snackBar.open('Não foi possível salvar. Tente novamente.', 'Fechar', {
            duration: 5000,
          });
        },
      });
  }

  async activatePush(): Promise<void> {
    this.pushBusy.set(true);
    const result = await this.pushService.subscribe();
    this.pushBusy.set(false);

    if (result.ok) {
      this.pushGranted.set(true);
      this.snackBar.open('Notificações ativadas com sucesso.', 'Fechar', { duration: 3000 });
    } else {
      this.snackBar.open(result.reason ?? 'Não foi possível ativar as notificações.', 'Fechar', {
        duration: 6000,
      });
    }
  }

  async deactivatePush(): Promise<void> {
    this.pushBusy.set(true);
    const result = await this.pushService.unsubscribe();
    this.pushBusy.set(false);

    if (result.ok) {
      this.pushGranted.set(false);
      this.snackBar.open('Notificações canceladas.', 'Fechar', { duration: 3000 });
    } else {
      this.snackBar.open(result.reason ?? 'Não foi possível cancelar as notificações.', 'Fechar', {
        duration: 6000,
      });
    }
  }
}
