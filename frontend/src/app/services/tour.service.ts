import { Injectable, signal } from '@angular/core';

/** Um passo do tour guiado.
 *
 * `selector` é um seletor CSS pra um elemento já presente na tela que deve
 * ficar em destaque (spotlight). Se omitido, o passo aparece como um cartão
 * centralizado sem destacar nada — útil pra introdução/fechamento do tour.
 */
export interface TourStep {
  selector?: string;
  title: string;
  description: string;
}

const SEEN_KEY_PREFIX = 'mei-lembretes:tour-seen:';

/** Controla o estado de um tour guiado (tela desfocada com foco num elemento
 * por vez, explicando pra que serve). A UI de fato (overlay + spotlight) fica
 * no `TourOverlayComponent`, montado uma vez na raiz do app; este service só
 * guarda "qual tour está rodando, em qual passo".
 */
@Injectable({ providedIn: 'root' })
export class TourService {
  readonly active = signal(false);
  readonly steps = signal<TourStep[]>([]);
  readonly stepIndex = signal(0);

  private currentTourId: string | null = null;

  /** Já viu esse tour antes (guardado no navegador)? Usado pra decidir se
   * ele deve abrir sozinho na primeira visita à tela. */
  hasSeen(tourId: string): boolean {
    try {
      return localStorage.getItem(SEEN_KEY_PREFIX + tourId) === '1';
    } catch {
      // Storage indisponível (modo privado, etc.) - trata como "já visto"
      // pra nunca travar a tela por causa disso.
      return true;
    }
  }

  start(tourId: string, steps: TourStep[]): void {
    if (steps.length === 0) {
      return;
    }
    this.currentTourId = tourId;
    this.steps.set(steps);
    this.stepIndex.set(0);
    this.active.set(true);
  }

  next(): void {
    if (this.stepIndex() >= this.steps().length - 1) {
      this.finish();
      return;
    }
    this.stepIndex.update((i) => i + 1);
  }

  prev(): void {
    this.stepIndex.update((i) => Math.max(0, i - 1));
  }

  /** Fecha o tour sem marcar como visto - "Pular" pode ser chamado de novo
   * mais tarde (o botão "Como usar" sempre reabre, visto ou não). */
  skip(): void {
    this.active.set(false);
  }

  /** Chegou ao fim naturalmente (clicou "Concluir" no último passo) -
   * marca como visto pra não abrir sozinho de novo. */
  finish(): void {
    this.active.set(false);
    if (this.currentTourId) {
      try {
        localStorage.setItem(SEEN_KEY_PREFIX + this.currentTourId, '1');
      } catch {
        // Sem storage disponivel - sem problema, so nao lembra pra proxima vez.
      }
    }
  }
}
