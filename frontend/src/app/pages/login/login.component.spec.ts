import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { AuthService } from '../../services/auth.service';
import { LoginComponent } from './login.component';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let authServiceSpy: { login: ReturnType<typeof vi.fn> };
  let router: Router;

  beforeEach(async () => {
    authServiceSpy = { login: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [{ provide: AuthService, useValue: authServiceSpy }],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('navigates to /dashboard on successful login', () => {
    authServiceSpy.login.mockReturnValue(of({ email: 'matheus@rtvendas.com' }));
    component.form.setValue({ email: 'matheus@rtvendas.com', password: 'segredo' });

    component.submit();

    expect(authServiceSpy.login).toHaveBeenCalledWith({
      email: 'matheus@rtvendas.com',
      password: 'segredo',
    });
    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard');
  });

  it('shows a friendly message on 401', () => {
    authServiceSpy.login.mockReturnValue(
      throwError(
        () => new HttpErrorResponse({ status: 401, error: { detail: 'Credenciais inválidas' } }),
      ),
    );
    component.form.setValue({ email: 'matheus@rtvendas.com', password: 'errada' });

    component.submit();

    expect(component.errorMessage()).toBe('Credenciais inválidas');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('does not submit an invalid form', () => {
    component.form.setValue({ email: '', password: '' });

    component.submit();

    expect(authServiceSpy.login).not.toHaveBeenCalled();
  });

  it('grows the email progress signal as the email field fills in', () => {
    expect(component.emailProgress()).toBe(0);

    component.form.controls.email.setValue('matheus@rtvendas.com');

    expect(component.emailProgress()).toBeGreaterThan(0);
    expect(component.emailProgress()).toBeLessThanOrEqual(1);
  });

  it('toggles the forgot-password hint', () => {
    expect(component.showForgotPasswordHelp()).toBe(false);

    component.toggleForgotPasswordHelp();
    expect(component.showForgotPasswordHelp()).toBe(true);

    component.toggleForgotPasswordHelp();
    expect(component.showForgotPasswordHelp()).toBe(false);
  });
});
