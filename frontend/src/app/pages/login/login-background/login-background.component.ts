import { CommonModule } from '@angular/common';
import { Component, HostListener, signal } from '@angular/core';

/** Fundo decorativo da tela de login: alguns blobs desfocados e ícones
 * temáticos (calendário, nota fiscal, dinheiro, declaração) que se movem em
 * profundidades diferentes conforme o mouse se move - efeito paralaxe.
 * Puramente visual (`aria-hidden`), não recebe nem emite nada. */
@Component({
  selector: 'app-login-background',
  imports: [CommonModule],
  templateUrl: './login-background.component.html',
  styleUrl: './login-background.component.scss',
})
export class LoginBackgroundComponent {
  private readonly offsetX = signal(0);
  private readonly offsetY = signal(0);

  private readonly reducedMotion =
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (this.reducedMotion) {
      return;
    }
    // Normaliza pra -1..1 a partir do centro da tela.
    this.offsetX.set((event.clientX / window.innerWidth - 0.5) * 2);
    this.offsetY.set((event.clientY / window.innerHeight - 0.5) * 2);
  }

  /** `depth` maior = se move mais - dá a sensação de estar mais "perto" da
   * câmera do que as camadas com profundidade menor. */
  protected layerStyle(depth: number): Record<string, string> {
    return {
      transform: `translate3d(${(this.offsetX() * depth).toFixed(1)}px, ${(this.offsetY() * depth).toFixed(1)}px, 0)`,
    };
  }
}
