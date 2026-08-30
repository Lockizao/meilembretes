import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { NEVER, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppUpdateService } from './app-update.service';

describe('AppUpdateService', () => {
  let snackBarSpy: { open: ReturnType<typeof vi.fn> };

  afterEach(() => {
    vi.useRealTimers();
  });

  function setup(swUpdateStub: {
    isEnabled: boolean;
    versionUpdates: unknown;
    checkForUpdate: ReturnType<typeof vi.fn>;
  }): AppUpdateService {
    snackBarSpy = { open: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: SwUpdate, useValue: swUpdateStub },
        { provide: MatSnackBar, useValue: snackBarSpy },
      ],
    });
    return TestBed.inject(AppUpdateService);
  }

  it('does nothing when the service worker is not enabled', () => {
    const service = setup({ isEnabled: false, versionUpdates: NEVER, checkForUpdate: vi.fn() });

    service.init();

    expect(snackBarSpy.open).not.toHaveBeenCalled();
  });

  it('prompts to reload when a new version becomes ready', () => {
    const versionUpdates = new Subject<VersionReadyEvent>();
    const onAction = new Subject<void>();

    TestBed.configureTestingModule({
      providers: [
        { provide: SwUpdate, useValue: { isEnabled: true, versionUpdates, checkForUpdate: vi.fn() } },
        {
          provide: MatSnackBar,
          useValue: { open: vi.fn().mockReturnValue({ onAction: () => onAction.asObservable() }) },
        },
      ],
    });
    const service = TestBed.inject(AppUpdateService);
    const snackBar = TestBed.inject(MatSnackBar) as unknown as { open: ReturnType<typeof vi.fn> };
    const reloadSpy = vi.spyOn(
      service as unknown as { reloadPage: () => void },
      'reloadPage',
    ).mockImplementation(() => {});

    service.init();
    versionUpdates.next({ type: 'VERSION_READY' } as VersionReadyEvent);

    expect(snackBar.open).toHaveBeenCalledWith('Nova versão disponível.', 'Atualizar', expect.any(Object));

    onAction.next();
    expect(reloadSpy).toHaveBeenCalled();
  });

  it('checks for updates periodically', () => {
    vi.useFakeTimers();
    const checkForUpdate = vi.fn().mockResolvedValue(false);
    const service = setup({ isEnabled: true, versionUpdates: NEVER, checkForUpdate });

    service.init();
    expect(checkForUpdate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(5 * 60 * 1000);

    expect(checkForUpdate).toHaveBeenCalledTimes(1);
  });
});
