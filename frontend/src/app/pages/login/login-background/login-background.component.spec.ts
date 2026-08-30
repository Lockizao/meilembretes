import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LoginBackgroundComponent } from './login-background.component';

/** jsdom não implementa `window.matchMedia` - precisa existir antes de dar
 * pra mockar o retorno dela. */
function stubMatchMedia(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    value: vi.fn().mockReturnValue({ matches }),
    writable: true,
    configurable: true,
  });
}

describe('LoginBackgroundComponent', () => {
  let fixture: ComponentFixture<LoginBackgroundComponent>;
  let component: LoginBackgroundComponent;

  beforeEach(async () => {
    stubMatchMedia(false);

    await TestBed.configureTestingModule({
      imports: [LoginBackgroundComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginBackgroundComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shifts the decorative layers on mouse move', () => {
    component.onMouseMove({ clientX: window.innerWidth, clientY: window.innerHeight / 2 } as MouseEvent);
    fixture.detectChanges();

    const blob = fixture.nativeElement.querySelector('.blob-a') as HTMLElement;
    expect(blob.style.transform).not.toBe('');
  });

  it('does nothing when the user prefers reduced motion', async () => {
    stubMatchMedia(true);
    TestBed.resetTestingModule();

    await TestBed.configureTestingModule({
      imports: [LoginBackgroundComponent],
    }).compileComponents();
    const reducedFixture = TestBed.createComponent(LoginBackgroundComponent);
    reducedFixture.detectChanges();

    reducedFixture.componentInstance.onMouseMove({ clientX: 999, clientY: 999 } as MouseEvent);
    reducedFixture.detectChanges();

    const blob = reducedFixture.nativeElement.querySelector('.blob-a') as HTMLElement;
    expect(blob.style.transform).toBe('translate3d(0.0px, 0.0px, 0)');
  });
});
