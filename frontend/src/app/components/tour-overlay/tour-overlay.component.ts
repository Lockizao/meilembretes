import { CommonModule } from '@angular/common';
import { Component, computed, effect, OnDestroy, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

import { TourService } from '../../services/tour.service';

/** Margem visual ao redor do elemento em destaque, pra ele não ficar
 * "colado" na borda do recorte. */
const SPOTLIGHT_PADDING = 8;

@Component({
  selector: 'app-tour-overlay',
  imports: [CommonModule, MatButtonModule],
  templateUrl: './tour-overlay.component.html',
  styleUrl: './tour-overlay.component.scss',
})
export class TourOverlayComponent implements OnDestroy {
  protected readonly rect = signal<DOMRect | null>(null);

  protected readonly currentStep = computed(() => {
    const steps = this.tour.steps();
    return steps[this.tour.stepIndex()] ?? null;
  });

  protected readonly isLastStep = computed(
    () => this.tour.stepIndex() === this.tour.steps().length - 1,
  );

  private readonly onResize = () => this.measure();
  private measureTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(protected readonly tour: TourService) {
    // Toda vez que o passo atual muda (ou o tour começa/termina), remede a
    // posição do elemento em destaque - com um pequeno atraso pra dar tempo
    // do scroll suave até o elemento terminar antes de medir a posição final.
    effect(() => {
      const step = this.currentStep();
      const active = this.tour.active();

      if (this.measureTimeout) {
        clearTimeout(this.measureTimeout);
        this.measureTimeout = null;
      }

      if (!active || !step) {
        this.rect.set(null);
        return;
      }

      if (!step.selector) {
        this.rect.set(null);
        return;
      }

      const el = document.querySelector<HTMLElement>(step.selector);
      if (!el) {
        // Elemento não existe nessa tela/estado (ex: seção vazia) - segue o
        // tour sem travar, só sem destacar nada nesse passo.
        this.rect.set(null);
        return;
      }

      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      this.measureTimeout = setTimeout(() => this.measure(), 300);
    });

    effect(() => {
      if (this.tour.active()) {
        document.body.style.overflow = 'hidden';
        window.addEventListener('resize', this.onResize);
      } else {
        document.body.style.overflow = '';
        window.removeEventListener('resize', this.onResize);
      }
    });
  }

  private measure(): void {
    const step = this.currentStep();
    if (!step?.selector) {
      return;
    }
    const el = document.querySelector<HTMLElement>(step.selector);
    this.rect.set(el ? el.getBoundingClientRect() : null);
  }

  protected spotlightStyle(): Record<string, string> {
    const r = this.rect();
    if (!r) {
      return {};
    }
    return {
      top: `${r.top - SPOTLIGHT_PADDING}px`,
      left: `${r.left - SPOTLIGHT_PADDING}px`,
      width: `${r.width + SPOTLIGHT_PADDING * 2}px`,
      height: `${r.height + SPOTLIGHT_PADDING * 2}px`,
    };
  }

  /** Posiciona o cartão de explicação embaixo do elemento em destaque (ou
   * acima, se não couber embaixo); sem destaque, fica centralizado. */
  protected cardStyle(): Record<string, string> {
    const r = this.rect();
    if (!r) {
      return {};
    }
    const cardWidth = 320;
    const margin = 16;
    const spaceBelow = window.innerHeight - r.bottom;
    const top = spaceBelow > 220 ? r.bottom + SPOTLIGHT_PADDING + margin : undefined;
    const bottom = top === undefined ? window.innerHeight - r.top + SPOTLIGHT_PADDING + margin : undefined;
    const left = Math.min(Math.max(r.left, margin), window.innerWidth - cardWidth - margin);

    const style: Record<string, string> = { left: `${left}px` };
    if (top !== undefined) {
      style['top'] = `${top}px`;
    } else if (bottom !== undefined) {
      style['bottom'] = `${bottom}px`;
    }
    return style;
  }

  ngOnDestroy(): void {
    if (this.measureTimeout) {
      clearTimeout(this.measureTimeout);
    }
    document.body.style.overflow = '';
    window.removeEventListener('resize', this.onResize);
  }
}
