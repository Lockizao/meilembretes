"""Envio de notificacoes push (Web Push / VAPID).

Desenhado como uma pequena abstracao (`NotificationChannel`) para permitir,
no futuro, outros canais (e-mail, SMS, etc.) sem reescrever `reminders.py`.
"""

from __future__ import annotations

import json
import logging
from abc import ABC, abstractmethod
from typing import Any

from pywebpush import WebPushException, webpush
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import PushSubscription

logger = logging.getLogger(__name__)


class NotificationChannel(ABC):
    """Interface simples para canais de notificacao."""

    @abstractmethod
    async def send(self, subscription: PushSubscription, payload: dict[str, Any]) -> bool:
        """Envia o payload para a subscription. Retorna True se enviado com sucesso."""
        raise NotImplementedError


class WebPushChannel(NotificationChannel):
    """Canal de Web Push usando pywebpush + VAPID."""

    async def send(self, subscription: PushSubscription, payload: dict[str, Any]) -> bool:
        settings = get_settings()
        subscription_info = {
            "endpoint": subscription.endpoint,
            "keys": {
                "p256dh": subscription.p256dh,
                "auth": subscription.auth,
            },
        }
        vapid_claims = {"sub": f"mailto:{settings.vapid_claims_email}"}

        try:
            webpush(
                subscription_info=subscription_info,
                data=json.dumps(payload),
                vapid_private_key=settings.vapid_private_key,
                vapid_claims=vapid_claims,
            )
            return True
        except WebPushException as exc:
            status_code = None
            if exc.response is not None:
                status_code = exc.response.status_code
            if status_code in (404, 410):
                # Subscription expirada/invalida: remove do banco.
                raise ExpiredSubscriptionError() from exc
            logger.warning("Falha ao enviar push para endpoint %s: %s", subscription.endpoint, exc)
            return False


class ExpiredSubscriptionError(Exception):
    """Sinaliza que a subscription expirou (404/410) e deve ser removida."""


async def send_push_to_user_subscriptions(
    db: AsyncSession,
    subscriptions: list[PushSubscription],
    payload: dict[str, Any],
    channel: NotificationChannel | None = None,
) -> list[tuple[PushSubscription, bool]]:
    """Envia o payload para todas as subscriptions informadas.

    Retorna lista de (subscription, sucesso). Subscriptions expiradas (404/410)
    sao removidas do banco automaticamente.
    """
    channel = channel or WebPushChannel()
    results: list[tuple[PushSubscription, bool]] = []

    for sub in subscriptions:
        try:
            ok = await channel.send(sub, payload)
            results.append((sub, ok))
        except ExpiredSubscriptionError:
            logger.info("Removendo subscription expirada: %s", sub.endpoint)
            await db.delete(sub)
            results.append((sub, False))
        except Exception:  # noqa: BLE001 - nao deve derrubar o processo do job
            logger.exception("Erro inesperado ao enviar push para %s", sub.endpoint)
            results.append((sub, False))

    return results
