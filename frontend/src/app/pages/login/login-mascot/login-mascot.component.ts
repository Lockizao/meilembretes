import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Personagem do login: os olhos acompanham o que é digitado no e-mail (a
 * pupila desliza horizontalmente conforme o texto cresce) e as mãos tapam os
 * olhos quando o campo de senha está em foco - com uma "espiadinha" se o
 * usuário ativa o botão de mostrar senha. */
@Component({
  selector: 'app-login-mascot',
  templateUrl: './login-mascot.component.html',
  styleUrl: './login-mascot.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginMascotComponent {
  /** 0 (campo vazio) a 1 (texto "longo") - controla o quanto a pupila
   * desliza pra direita, simulando o personagem lendo a digitação. */
  readonly emailProgress = input(0);
  readonly passwordFocused = input(false);
  /** Senha visível (usuário clicou no ícone de "mostrar senha" enquanto
   * digita) - nesse caso o personagem só espia, sem tapar os olhos de vez. */
  readonly passwordVisible = input(false);

  protected readonly peeking = computed(() => this.passwordFocused() && this.passwordVisible());

  /** -5px a +5px: desloca a pupila dentro do olho conforme `emailProgress`. */
  protected readonly pupilOffset = computed(() => -5 + Math.min(Math.max(this.emailProgress(), 0), 1) * 10);
}
