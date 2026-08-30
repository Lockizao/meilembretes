import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';
import {
  PushSubscriptionRequest,
  PushUnsubscribeRequest,
  VapidPublicKeyResponse,
} from '../models/api.models';

/**
 * Resultado de uma tentativa de (des)inscrição em push notifications.
 * `ok` indica sucesso; caso contrário `reason` traz uma mensagem amigável
 * para exibir ao usuário (ex: permissão negada, navegador sem suporte).
 */
export interface PushActionResult {
  ok: boolean;
  reason?: string;
}

@Injectable({
  providedIn: 'root',
})
export class PushService {
  private readonly baseUrl = environment.apiUrl;

  constructor(
    private readonly http: HttpClient,
    private readonly swPush: SwPush,
  ) {}

  /** Indica se o navegador/service worker suporta push notifications. */
  get isSupported(): boolean {
    return this.swPush.isEnabled;
  }

  /** Estado atual da permissão de notificação do navegador. */
  get permission(): NotificationPermission | 'unsupported' {
    if (typeof Notification === 'undefined') {
      return 'unsupported';
    }
    return Notification.permission;
  }

  /**
   * Indica se existe uma inscrição de push ATIVA neste navegador agora.
   *
   * Importante: isso é diferente de `permission === 'granted'`. A permissão
   * do navegador pode ter sido concedida numa tentativa anterior que falhou
   * antes de criar a inscrição de fato (ex: PushManager.subscribe() rejeitado
   * porque o navegador tinha o serviço de push desativado). Usar só a
   * permissão pra decidir o que mostrar na tela faz a UI achar que já está
   * "ativado" quando na verdade não existe nenhuma inscrição real.
   */
  async hasActiveSubscription(): Promise<boolean> {
    if (!this.isSupported || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return false;
    }
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      return subscription !== null;
    } catch {
      return false;
    }
  }

  async subscribe(): Promise<PushActionResult> {
    if (!this.isSupported) {
      return {
        ok: false,
        reason: 'Este navegador não tem suporte a notificações push.',
      };
    }

    if (this.permission === 'denied') {
      return {
        ok: false,
        reason:
          'A permissão de notificações foi negada. Habilite manualmente nas configurações do navegador para este site.',
      };
    }

    try {
      const vapid = await firstValueFrom(
        this.http.get<VapidPublicKeyResponse>(`${this.baseUrl}/push/vapid-public-key`),
      );

      let timeoutId: ReturnType<typeof setTimeout>;
      const timeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error('Tempo esgotado esperando o navegador registrar a inscrição de push (15s).')),
          15000,
        );
      });
      let subscription;
      try {
        subscription = await Promise.race([
          this.swPush.requestSubscription({ serverPublicKey: vapid.public_key }),
          timeout,
        ]);
      } finally {
        // Evita deixar o timer pendurado quando requestSubscription resolve
        // antes do timeout (importante inclusive nos testes, que rodam com
        // timers reais e travam se um setTimeout de 15s ficar aberto).
        clearTimeout(timeoutId!);
      }

      const json = subscription.toJSON();
      const body: PushSubscriptionRequest = {
        endpoint: json.endpoint ?? subscription.endpoint,
        keys: {
          p256dh: json.keys?.['p256dh'] ?? '',
          auth: json.keys?.['auth'] ?? '',
        },
      };

      await firstValueFrom(
        this.http.post<{ ok: boolean }>(`${this.baseUrl}/push/subscribe`, body, {
          withCredentials: true,
        }),
      );

      return { ok: true };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[push.service] falha ao ativar notificações:', err);
      const deniedNow = typeof Notification !== 'undefined' && Notification.permission === 'denied';
      if (deniedNow) {
        return {
          ok: false,
          reason:
            'A permissão de notificações foi negada. Habilite manualmente nas configurações do navegador para este site.',
        };
      }
      return {
        ok: false,
        reason: 'Não foi possível ativar as notificações. Tente novamente.',
      };
    }
  }

  async unsubscribe(): Promise<PushActionResult> {
    if (!this.isSupported) {
      return {
        ok: false,
        reason: 'Este navegador não tem suporte a notificações push.',
      };
    }

    try {
      const subscription = await firstValueFrom(this.swPush.subscription);

      if (!subscription) {
        return { ok: true };
      }

      const body: PushUnsubscribeRequest = { endpoint: subscription.endpoint };

      await firstValueFrom(
        this.http.delete<void>(`${this.baseUrl}/push/subscribe`, {
          body,
          withCredentials: true,
        }),
      );

      await subscription.unsubscribe();

      return { ok: true };
    } catch {
      return {
        ok: false,
        reason: 'Não foi possível cancelar as notificações. Tente novamente.',
      };
    }
  }
}
