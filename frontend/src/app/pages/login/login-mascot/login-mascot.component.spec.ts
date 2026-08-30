import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { LoginMascotComponent } from './login-mascot.component';

describe('LoginMascotComponent', () => {
  let fixture: ComponentFixture<LoginMascotComponent>;
  let component: LoginMascotComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginMascotComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginMascotComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('keeps the pupils centered with no email typed', () => {
    fixture.componentRef.setInput('emailProgress', 0);
    fixture.detectChanges();

    expect((component as unknown as { pupilOffset: () => number }).pupilOffset()).toBe(-5);
  });

  it('slides the pupils to the right as the email fills in', () => {
    fixture.componentRef.setInput('emailProgress', 1);
    fixture.detectChanges();

    expect((component as unknown as { pupilOffset: () => number }).pupilOffset()).toBe(5);
  });

  it('clamps pupil offset for out-of-range progress values', () => {
    fixture.componentRef.setInput('emailProgress', 5);
    fixture.detectChanges();
    expect((component as unknown as { pupilOffset: () => number }).pupilOffset()).toBe(5);

    fixture.componentRef.setInput('emailProgress', -5);
    fixture.detectChanges();
    expect((component as unknown as { pupilOffset: () => number }).pupilOffset()).toBe(-5);
  });

  it('applies the "covering" class when the password field is focused', () => {
    fixture.componentRef.setInput('passwordFocused', true);
    fixture.detectChanges();

    const mascot = fixture.nativeElement.querySelector('.mascot');
    expect(mascot.classList.contains('covering')).toBe(true);
  });

  it('applies the "peeking" class only when covering AND the password is visible', () => {
    fixture.componentRef.setInput('passwordFocused', false);
    fixture.componentRef.setInput('passwordVisible', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.mascot').classList.contains('peeking')).toBe(false);

    fixture.componentRef.setInput('passwordFocused', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.mascot').classList.contains('peeking')).toBe(true);
  });
});
