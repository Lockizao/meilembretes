import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';

import { AuthService } from '../../services/auth.service';
import { LoginBackgroundComponent } from './login-background/login-background.component';
import { LoginMascotComponent } from './login-mascot/login-mascot.component';

/** Tamanho de e-mail (em caracteres) a partir do qual a pupila do mascote já
 * chega ao limite do deslocamento - não precisa ser exato, é só um efeito. */
const EMAIL_PROGRESS_MAX_LENGTH = 24;

type FocusedField = 'email' | 'password' | null;

@Component({
  selector: 'app-login',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    LoginBackgroundComponent,
    LoginMascotComponent,
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly hidePassword = signal(true);
  readonly focusedField = signal<FocusedField>(null);
  readonly showForgotPasswordHelp = signal(false);

  readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  private readonly emailValue = toSignal(this.form.controls.email.valueChanges, {
    initialValue: this.form.controls.email.value,
  });

  /** Alimenta o mascote: 0 (vazio) a 1, conforme o e-mail digitado cresce. */
  readonly emailProgress = computed(
    () => Math.min((this.emailValue() ?? '').length, EMAIL_PROGRESS_MAX_LENGTH) / EMAIL_PROGRESS_MAX_LENGTH,
  );

  toggleForgotPasswordHelp(): void {
    this.showForgotPasswordHelp.update((shown) => !shown);
  }

  submit(): void {
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }

    this.errorMessage.set(null);
    this.loading.set(true);

    const { email, password } = this.form.getRawValue();

    this.authService.login({ email: email ?? '', password: password ?? '' }).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigateByUrl('/dashboard');
      },
      error: (error: HttpErrorResponse) => {
        this.loading.set(false);
        if (error.status === 401) {
          this.errorMessage.set(error.error?.detail ?? 'Credenciais inválidas.');
        } else {
          this.errorMessage.set('Não foi possível entrar agora. Tente novamente em instantes.');
        }
      },
    });
  }
}
