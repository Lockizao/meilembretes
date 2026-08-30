import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { NEVER } from 'rxjs';

import { App } from './app.component';

describe('App', () => {
  beforeEach(async () => {
    // O service worker de verdade só existe fora dos testes (via
    // provideServiceWorker no app.config) - aqui um stub desabilitado é
    // suficiente pro AppUpdateService injetado no App não quebrar a criação.
    const swUpdateStub = { isEnabled: false, versionUpdates: NEVER, checkForUpdate: () => Promise.resolve(false) };

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SwUpdate, useValue: swUpdateStub },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the toolbar title', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.title')?.textContent).toContain('MEI Lembretes');
  });
});
