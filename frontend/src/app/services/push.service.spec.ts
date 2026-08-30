import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SwPush } from '@angular/service-worker';
import { Observable, of } from 'rxjs';
import { vi } from 'vitest';

import { environment } from '../../environments/environment';
import { PushService } from './push.service';

describe('PushService', () => {
  let service: PushService;
  let httpMock: HttpTestingController;
  let swPushStub: {
    isEnabled: boolean;
    subscription: Observable<unknown>;
    requestSubscription: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    swPushStub = {
      isEnabled: true,
      subscription: of(null),
      requestSubscription: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SwPush, useValue: swPushStub },
      ],
    });
    service = TestBed.inject(PushService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('fetches the VAPID key, requests a browser subscription and posts it to the backend', async () => {
    const fakeSubscription = {
      endpoint: 'https://push.example.com/abc',
      toJSON: () => ({
        endpoint: 'https://push.example.com/abc',
        keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
      }),
    };
    swPushStub.requestSubscription.mockResolvedValue(fakeSubscription);

    const resultPromise = service.subscribe();

    const vapidReq = httpMock.expectOne(`${environment.apiUrl}/push/vapid-public-key`);
    vapidReq.flush({ public_key: 'server-public-key' });

    // aguarda os microtasks do requestSubscription + Promise.race (usado para
    // o timeout de 15s) resolverem antes do POST ser disparado
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const subscribeReq = httpMock.expectOne(`${environment.apiUrl}/push/subscribe`);
    expect(subscribeReq.request.body).toEqual({
      endpoint: 'https://push.example.com/abc',
      keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
    });
    subscribeReq.flush({ ok: true });

    const result = await resultPromise;
    expect(result.ok).toBe(true);
    expect(swPushStub.requestSubscription).toHaveBeenCalledWith({
      serverPublicKey: 'server-public-key',
    });
  });

  it('returns a friendly message when notifications are unsupported', async () => {
    swPushStub.isEnabled = false;

    const result = await service.subscribe();

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('não tem suporte');
  });
});
