import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';

import { Faturamento, NfData, Obligation, ObligationTipo } from '../../models/api.models';
import { ObligationsService } from '../../services/obligations.service';
import { PushService } from '../../services/push.service';
import { TourService, TourStep } from '../../services/tour.service';

/** Passos do tour guiado do dashboard - cada `selector` precisa bater com um
 * atributo `data-tour` no template. Ficam sempre presentes na tela (não
 * dependem de ter obrigação carregada), pra funcionar mesmo num dashboard
 * vazio de usuário novo. */
const DASHBOARD_TOUR_ID = 'dashboard';
const DASHBOARD_TOUR_STEPS: TourStep[] = [
  {
    title: 'Bem-vindo ao MEI Lembretes 👋',
    description:
      'Esse tour rápido explica pra que serve cada informação da tela. Você pode pular a qualquer momento, ou reabrir depois clicando em "Como usar".',
  },
  {
    selector: '[data-tour="summary-proximo"]',
    title: 'Próximo vencimento',
    description:
      'A data mais próxima entre tudo que está em aberto (DAS, NF, Recebimento, DASN) - é sempre a primeira coisa a olhar.',
  },
  {
    selector: '[data-tour="summary-atrasadas"]',
    title: 'Atrasadas',
    description: 'Quantas obrigações já passaram do prazo sem serem concluídas. Zerado é sinal de tudo em dia.',
  },
  {
    selector: '[data-tour="summary-faturamento"]',
    title: 'Faturamento do ano',
    description:
      'Soma só as notas fiscais já emitidas (marcadas como concluídas) no ano - é o valor que você vai usar pra preencher a DASN-SIMEI.',
  },
  {
    selector: '[data-tour="section-das"]',
    title: 'DAS-MEI',
    description:
      'O boleto mensal do MEI, vence todo dia 20. Quando pagar de verdade, clique "Marcar como pago" (o app confirma antes, pra evitar clique sem querer). Marcou errado? "Voltar para pendente" desfaz.',
  },
  {
    selector: '[data-tour="section-nf"]',
    title: 'Nota Fiscal (RT Intelligence)',
    description:
      '"Ver dados para emitir" mostra os dados prontos pra copiar no nfse.gov.br - nada é enviado automaticamente. Depois de emitir de verdade lá, marque como emitida: isso libera a etapa de conferir o recebimento, logo abaixo.',
  },
  {
    selector: '[data-tour="section-rt"]',
    title: 'Recebimento (RT Intelligence)',
    description:
      'Criado automaticamente quando você marca uma NF como emitida - o prazo previsto é a data de emissão mais o prazo de pagamento configurado. Quando o dinheiro cair na conta, marque como recebido.',
  },
  {
    selector: '[data-tour="section-dasn"]',
    title: 'Declaração DASN-SIMEI',
    description: 'A declaração anual do Simples Nacional-MEI, com prazo até 31/05, sempre sobre o ano anterior.',
  },
  {
    title: 'Pronto!',
    description:
      'Pra editar valores, datas de vencimento e com quantos dias de antecedência cada lembrete chega, vá em "Configurações" no menu do topo.',
  },
];

@Component({
  selector: 'app-dashboard',
  imports: [
    CommonModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit, OnDestroy {
  readonly obligations = signal<Obligation[]>([]);
  readonly loading = signal(true);
  readonly updatingId = signal<number | null>(null);
  readonly showPushBanner = signal(false);
  readonly activatingPush = signal(false);

  readonly nfObligations = signal<Obligation[]>([]);
  readonly nfLoading = signal(true);
  readonly expandedNfId = signal<number | null>(null);
  readonly nfDataById = signal<Record<number, NfData>>({});
  readonly loadingNfDataId = signal<number | null>(null);

  readonly rtObligations = signal<Obligation[]>([]);
  readonly rtLoading = signal(true);

  readonly dasnObligations = signal<Obligation[]>([]);
  readonly dasnLoading = signal(true);

  readonly cancelingId = signal<number | null>(null);

  readonly faturamento = signal<Faturamento | null>(null);
  readonly anoAtual = new Date().getFullYear();

  /** Próximo vencimento em aberto entre todos os tipos, para o resumo do topo. */
  readonly proximoVencimento = signal<Obligation | null>(null);
  /** Quantidade de obrigações em aberto que já passaram do prazo. */
  readonly totalAtrasado = signal(0);

  private autoTourTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly obligationsService: ObligationsService,
    private readonly pushService: PushService,
    private readonly snackBar: MatSnackBar,
    private readonly tourService: TourService,
  ) {}

  ngOnInit(): void {
    this.loadObligations();
    this.loadNfObligations();
    this.loadRtObligations();
    this.loadDasnObligations();
    this.loadFaturamento();
    this.showPushBanner.set(
      this.pushService.isSupported && this.pushService.permission === 'default',
    );

    if (!this.tourService.hasSeen(DASHBOARD_TOUR_ID)) {
      // Pequeno atraso pra dar tempo da tela terminar de desenhar (fontes,
      // layout do Material) antes de medir a posição dos elementos.
      this.autoTourTimeout = setTimeout(() => this.startTour(), 600);
    }
  }

  ngOnDestroy(): void {
    if (this.autoTourTimeout) {
      clearTimeout(this.autoTourTimeout);
    }
  }

  startTour(): void {
    this.tourService.start(DASHBOARD_TOUR_ID, DASHBOARD_TOUR_STEPS);
  }

  /** Recalcula o resumo do topo (próximo vencimento + total atrasado) com base
   * em tudo que já foi carregado até agora. Chamado depois de cada load. */
  private atualizarResumo(): void {
    const todas = [
      ...this.obligations(),
      ...this.nfObligations(),
      ...this.rtObligations(),
      ...this.dasnObligations(),
    ];
    const emAberto = todas.filter((o) => o.status !== 'CONCLUIDO' && o.status !== 'CANCELADO');

    this.totalAtrasado.set(emAberto.filter((o) => o.status === 'ATRASADO').length);

    const proximo = [...emAberto].sort(
      (a, b) => new Date(a.data_vencimento).getTime() - new Date(b.data_vencimento).getTime(),
    )[0];
    this.proximoVencimento.set(proximo ?? null);
  }

  loadFaturamento(): void {
    this.obligationsService.getFaturamento(this.anoAtual).subscribe({
      next: (data) => this.faturamento.set(data),
      error: () => {
        // Silencioso: o card de resumo so some se nao tiver dado, sem travar a tela.
      },
    });
  }

  loadDasnObligations(): void {
    this.dasnLoading.set(true);
    this.obligationsService.list({ tipo: 'DASN_SIMEI' }).subscribe({
      next: (obligations) => {
        this.dasnObligations.set(obligations);
        this.dasnLoading.set(false);
        this.atualizarResumo();
      },
      error: () => {
        this.dasnLoading.set(false);
        this.snackBar.open('Não foi possível carregar a DASN-SIMEI.', 'Fechar', {
          duration: 5000,
        });
      },
    });
  }

  markDasnAsDeclarada(obligation: Obligation): void {
    if (!confirm('Confirma que a DASN-SIMEI deste ano já foi realmente declarada?')) {
      return;
    }
    this.updatingId.set(obligation.id);
    this.obligationsService.markAsPaid(obligation.id).subscribe({
      next: (updated) => {
        this.dasnObligations.update((list) =>
          list.map((item) => (item.id === updated.id ? updated : item)),
        );
        this.updatingId.set(null);
        this.atualizarResumo();
        this.snackBar.open('DASN-SIMEI marcada como declarada.', 'Fechar', { duration: 3000 });
      },
      error: () => {
        this.updatingId.set(null);
        this.snackBar.open('Não foi possível marcar como declarada. Tente novamente.', 'Fechar', {
          duration: 5000,
        });
      },
    });
  }

  revertDasnToPending(obligation: Obligation): void {
    if (!confirm('Voltar esta DASN-SIMEI para pendente? Use isso se marcou como declarada por engano.')) {
      return;
    }
    this.updatingId.set(obligation.id);
    this.obligationsService.markAsPending(obligation.id).subscribe({
      next: (updated) => {
        this.dasnObligations.update((list) =>
          list.map((item) => (item.id === updated.id ? updated : item)),
        );
        this.updatingId.set(null);
        this.atualizarResumo();
        this.snackBar.open('DASN-SIMEI voltou para pendente.', 'Fechar', { duration: 3000 });
      },
      error: () => {
        this.updatingId.set(null);
        this.snackBar.open('Não foi possível reverter. Tente novamente.', 'Fechar', { duration: 5000 });
      },
    });
  }

  loadObligations(): void {
    this.loading.set(true);
    this.obligationsService.list({ tipo: 'DAS' }).subscribe({
      next: (obligations) => {
        this.obligations.set(obligations);
        this.loading.set(false);
        this.atualizarResumo();
      },
      error: () => {
        this.loading.set(false);
        this.snackBar.open('Não foi possível carregar as obrigações de DAS.', 'Fechar', {
          duration: 5000,
        });
      },
    });
  }

  loadNfObligations(): void {
    this.nfLoading.set(true);
    this.obligationsService.list({ tipo: 'NF_EMISSAO' }).subscribe({
      next: (obligations) => {
        this.nfObligations.set(obligations);
        this.nfLoading.set(false);
        this.atualizarResumo();
      },
      error: () => {
        this.nfLoading.set(false);
        this.snackBar.open('Não foi possível carregar as obrigações de NF.', 'Fechar', {
          duration: 5000,
        });
      },
    });
  }

  loadRtObligations(): void {
    this.rtLoading.set(true);
    this.obligationsService.list({ tipo: 'RT_RECEBIMENTO' }).subscribe({
      next: (obligations) => {
        this.rtObligations.set(obligations);
        this.rtLoading.set(false);
        this.atualizarResumo();
      },
      error: () => {
        this.rtLoading.set(false);
        this.snackBar.open('Não foi possível carregar os recebimentos.', 'Fechar', {
          duration: 5000,
        });
      },
    });
  }

  markRtAsReceived(obligation: Obligation): void {
    if (!confirm('Confirma que o pagamento da RT Intelligence caiu na conta de verdade?')) {
      return;
    }
    this.updatingId.set(obligation.id);
    this.obligationsService.markAsPaid(obligation.id).subscribe({
      next: (updated) => {
        this.rtObligations.update((list) =>
          list.map((item) => (item.id === updated.id ? updated : item)),
        );
        this.updatingId.set(null);
        this.atualizarResumo();
        this.snackBar.open('Recebimento confirmado.', 'Fechar', { duration: 3000 });
      },
      error: () => {
        this.updatingId.set(null);
        this.snackBar.open('Não foi possível confirmar o recebimento. Tente novamente.', 'Fechar', {
          duration: 5000,
        });
      },
    });
  }

  revertRtToPending(obligation: Obligation): void {
    if (!confirm('Voltar este recebimento para pendente? Use isso se marcou como recebido por engano.')) {
      return;
    }
    this.updatingId.set(obligation.id);
    this.obligationsService.markAsPending(obligation.id).subscribe({
      next: (updated) => {
        this.rtObligations.update((list) =>
          list.map((item) => (item.id === updated.id ? updated : item)),
        );
        this.updatingId.set(null);
        this.atualizarResumo();
        this.snackBar.open('Recebimento voltou para pendente.', 'Fechar', { duration: 3000 });
      },
      error: () => {
        this.updatingId.set(null);
        this.snackBar.open('Não foi possível reverter. Tente novamente.', 'Fechar', { duration: 5000 });
      },
    });
  }

  rtStatusLabel(status: Obligation['status']): string {
    switch (status) {
      case 'CONCLUIDO':
        return 'Recebido';
      case 'ATRASADO':
        return 'Ainda não recebido';
      default:
        return 'Previsto';
    }
  }

  markNfAsEmitted(obligation: Obligation): void {
    if (!confirm('Confirma que esta NF já foi realmente emitida no nfse.gov.br?')) {
      return;
    }
    this.updatingId.set(obligation.id);
    this.obligationsService.markAsPaid(obligation.id).subscribe({
      next: (updated) => {
        this.nfObligations.update((list) =>
          list.map((item) => (item.id === updated.id ? updated : item)),
        );
        this.updatingId.set(null);
        this.atualizarResumo();
        this.loadFaturamento();
        this.snackBar.open('NF marcada como emitida.', 'Fechar', { duration: 3000 });
      },
      error: () => {
        this.updatingId.set(null);
        this.snackBar.open('Não foi possível marcar como emitida. Tente novamente.', 'Fechar', {
          duration: 5000,
        });
      },
    });
  }

  revertNfToPending(obligation: Obligation): void {
    if (
      !confirm(
        'Voltar esta NF para pendente? Use isso se marcou como emitida por engano.\n' +
          'Atenção: se já existir um recebimento gerado a partir dela, ele não é removido automaticamente.',
      )
    ) {
      return;
    }
    this.updatingId.set(obligation.id);
    this.obligationsService.markAsPending(obligation.id).subscribe({
      next: (updated) => {
        this.nfObligations.update((list) =>
          list.map((item) => (item.id === updated.id ? updated : item)),
        );
        this.updatingId.set(null);
        this.atualizarResumo();
        this.loadFaturamento();
        this.snackBar.open('NF voltou para pendente.', 'Fechar', { duration: 3000 });
      },
      error: () => {
        this.updatingId.set(null);
        this.snackBar.open('Não foi possível reverter. Tente novamente.', 'Fechar', { duration: 5000 });
      },
    });
  }

  cancelarNf(obligation: Obligation): void {
    if (!confirm('Cancelar esta NF? Uma nova pendente pra mesma competência é gerada automaticamente.')) {
      return;
    }
    this.cancelingId.set(obligation.id);
    this.obligationsService.cancelar(obligation.id).subscribe({
      next: () => {
        this.cancelingId.set(null);
        this.loadNfObligations(); // recarrega pra trazer a cancelada + a nova pendente gerada
        this.snackBar.open('NF cancelada. Uma nova pendente foi gerada pra essa competência.', 'Fechar', {
          duration: 5000,
        });
      },
      error: () => {
        this.cancelingId.set(null);
        this.snackBar.open('Não foi possível cancelar. Tente novamente.', 'Fechar', {
          duration: 5000,
        });
      },
    });
  }

  toggleNfData(obligation: Obligation): void {
    if (this.expandedNfId() === obligation.id) {
      this.expandedNfId.set(null);
      return;
    }
    this.expandedNfId.set(obligation.id);

    if (this.nfDataById()[obligation.id]) {
      return; // ja carregado
    }

    this.loadingNfDataId.set(obligation.id);
    this.obligationsService.getNfData(obligation.id).subscribe({
      next: (data) => {
        this.nfDataById.update((map) => ({ ...map, [obligation.id]: data }));
        this.loadingNfDataId.set(null);
      },
      error: () => {
        this.loadingNfDataId.set(null);
        this.snackBar.open('Não foi possível carregar os dados da NF.', 'Fechar', {
          duration: 5000,
        });
      },
    });
  }

  async copyNfData(data: NfData): Promise<void> {
    const texto = [
      `Tomador: ${data.tomador_razao_social ?? '(preencha em Configurações)'}`,
      `CNPJ: ${data.tomador_cnpj ?? '(preencha em Configurações)'}`,
      `Descrição do serviço: ${data.descricao_servico ?? '(preencha em Configurações)'}`,
      `Valor: ${data.valor !== null ? data.valor : '(preencha em Configurações)'}`,
      `Competência: ${data.competencia}`,
    ].join('\n');

    try {
      await navigator.clipboard.writeText(texto);
      this.snackBar.open('Dados copiados para a área de transferência.', 'Fechar', {
        duration: 3000,
      });
    } catch {
      this.snackBar.open('Não foi possível copiar automaticamente. Copie manualmente.', 'Fechar', {
        duration: 5000,
      });
    }
  }

  markAsPaid(obligation: Obligation): void {
    if (!confirm('Confirma que este DAS já foi realmente pago?')) {
      return;
    }
    this.updatingId.set(obligation.id);
    this.obligationsService.markAsPaid(obligation.id).subscribe({
      next: (updated) => {
        this.obligations.update((list) =>
          list.map((item) => (item.id === updated.id ? updated : item)),
        );
        this.updatingId.set(null);
        this.atualizarResumo();
        this.snackBar.open('DAS marcado como pago.', 'Fechar', { duration: 3000 });
      },
      error: () => {
        this.updatingId.set(null);
        this.snackBar.open('Não foi possível marcar como pago. Tente novamente.', 'Fechar', {
          duration: 5000,
        });
      },
    });
  }

  revertDasToPending(obligation: Obligation): void {
    if (!confirm('Voltar este DAS para pendente? Use isso se marcou como pago por engano.')) {
      return;
    }
    this.updatingId.set(obligation.id);
    this.obligationsService.markAsPending(obligation.id).subscribe({
      next: (updated) => {
        this.obligations.update((list) =>
          list.map((item) => (item.id === updated.id ? updated : item)),
        );
        this.updatingId.set(null);
        this.atualizarResumo();
        this.snackBar.open('DAS voltou para pendente.', 'Fechar', { duration: 3000 });
      },
      error: () => {
        this.updatingId.set(null);
        this.snackBar.open('Não foi possível reverter. Tente novamente.', 'Fechar', { duration: 5000 });
      },
    });
  }

  async activatePush(): Promise<void> {
    this.activatingPush.set(true);
    const result = await this.pushService.subscribe();
    this.activatingPush.set(false);

    if (result.ok) {
      this.showPushBanner.set(false);
      this.snackBar.open('Notificações ativadas com sucesso.', 'Fechar', { duration: 3000 });
    } else {
      this.snackBar.open(result.reason ?? 'Não foi possível ativar as notificações.', 'Fechar', {
        duration: 6000,
      });
    }
  }

  tipoLabel(tipo: ObligationTipo): string {
    switch (tipo) {
      case 'DAS':
        return 'DAS-MEI';
      case 'NF_EMISSAO':
        return 'Emissão de NF';
      case 'RT_RECEBIMENTO':
        return 'Recebimento RT';
      case 'DASN_SIMEI':
        return 'DASN-SIMEI';
    }
  }

  statusLabel(status: Obligation['status']): string {
    switch (status) {
      case 'CONCLUIDO':
        return 'Pago';
      case 'ATRASADO':
        return 'Atrasado';
      case 'CANCELADO':
        return 'Cancelada';
      default:
        return 'Pendente';
    }
  }

  statusClass(status: Obligation['status']): string {
    switch (status) {
      case 'CONCLUIDO':
        return 'status-concluido';
      case 'ATRASADO':
        return 'status-atrasado';
      case 'CANCELADO':
        return 'status-cancelado';
      default:
        return 'status-pendente';
    }
  }
}
