import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';

import { Faturamento } from '../../models/api.models';
import { ObligationsService } from '../../services/obligations.service';

@Component({
  selector: 'app-faturamento',
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    MatTableModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './faturamento.component.html',
  styleUrl: './faturamento.component.scss',
})
export class FaturamentoComponent implements OnInit {
  readonly loading = signal(true);
  readonly faturamento = signal<Faturamento | null>(null);
  readonly ano = signal(new Date().getFullYear());
  readonly anosDisponiveis: number[];

  readonly displayedColumns = ['competencia', 'valor', 'status'];

  constructor(
    private readonly obligationsService: ObligationsService,
    private readonly snackBar: MatSnackBar,
  ) {
    const anoAtual = new Date().getFullYear();
    // Ano atual + 4 anos anteriores - suficiente pra cobrir declaracoes atrasadas.
    this.anosDisponiveis = [anoAtual, anoAtual - 1, anoAtual - 2, anoAtual - 3, anoAtual - 4];
  }

  ngOnInit(): void {
    this.load();
  }

  onAnoChange(ano: number): void {
    this.ano.set(ano);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.obligationsService.getFaturamento(this.ano()).subscribe({
      next: (data) => {
        this.faturamento.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snackBar.open('Não foi possível carregar o faturamento. Tente novamente.', 'Fechar', {
          duration: 5000,
        });
      },
    });
  }

  statusLabel(status: string): string {
    switch (status) {
      case 'CONCLUIDO':
        return 'Emitida';
      case 'ATRASADO':
        return 'Atrasada';
      case 'CANCELADO':
        return 'Cancelada';
      default:
        return 'Pendente';
    }
  }

  async copyTotal(): Promise<void> {
    const fat = this.faturamento();
    if (!fat) {
      return;
    }
    try {
      await navigator.clipboard.writeText(fat.total.toFixed(2).replace('.', ','));
      this.snackBar.open('Total copiado para a área de transferência.', 'Fechar', { duration: 3000 });
    } catch {
      this.snackBar.open('Não foi possível copiar automaticamente. Copie manualmente.', 'Fechar', {
        duration: 5000,
      });
    }
  }
}
