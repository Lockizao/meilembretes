"""Servico central de lembretes DAS-MEI.

`run_daily_job` e o ponto de entrada usado pela rota POST /jobs/run-daily.
E IDEMPOTENTE: pode ser chamado varias vezes no mesmo dia sem duplicar
instancias de obrigacao nem reenviar notificacoes ja registradas.
"""

from __future__ import annotations

import logging
from calendar import monthrange
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    DasConfig,
    DasnSimeiConfig,
    NfConfig,
    NotificationLog,
    ObligationInstance,
    PushSubscription,
    RtRecebimentoConfig,
    StatusNotificacao,
    StatusObrigacao,
    TipoObrigacao,
    User,
)
from app.services.push_sender import send_push_to_user_subscriptions

logger = logging.getLogger(__name__)


def _first_day_of_month(d: date) -> date:
    return d.replace(day=1)


def _add_months(d: date, months: int) -> date:
    month_index = d.month - 1 + months
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    return date(year, month, 1)


def _safe_day(year: int, month: int, day: int) -> date:
    last_day = monthrange(year, month)[1]
    return date(year, month, min(day, last_day))


async def ensure_das_instances_for_user(db: AsyncSession, user: User, today: date) -> int:
    """Garante instancias DAS para o mes corrente e o proximo (se config ativa).

    Retorna quantas instancias novas foram criadas.
    """
    result = await db.execute(select(DasConfig).where(DasConfig.user_id == user.id))
    config = result.scalar_one_or_none()
    if config is None or not config.ativo:
        return 0

    created = 0
    for months_ahead in (0, 1):
        competencia = _add_months(_first_day_of_month(today), months_ahead)
        data_vencimento = _safe_day(competencia.year, competencia.month, config.dia_vencimento)

        exists_result = await db.execute(
            select(ObligationInstance).where(
                ObligationInstance.user_id == user.id,
                ObligationInstance.tipo == TipoObrigacao.DAS,
                ObligationInstance.competencia == competencia,
                ObligationInstance.status != StatusObrigacao.CANCELADO,
            )
        )
        if exists_result.scalar_one_or_none() is not None:
            continue

        instance = ObligationInstance(
            user_id=user.id,
            tipo=TipoObrigacao.DAS,
            competencia=competencia,
            data_vencimento=data_vencimento,
            valor=config.valor_mensal,
            status=StatusObrigacao.PENDENTE,
        )
        db.add(instance)
        created += 1

    if created:
        await db.flush()

    return created


async def ensure_nf_instances_for_user(db: AsyncSession, user: User, today: date) -> int:
    """Garante instancias NF_EMISSAO para o mes corrente e o proximo (se config ativa).

    So prepara o lembrete/dados para emissao manual (ver /obligations/{id}/nf-data) -
    nao emite nada de verdade no nfse.gov.br.
    """
    result = await db.execute(select(NfConfig).where(NfConfig.user_id == user.id))
    config = result.scalar_one_or_none()
    if config is None or not config.ativo:
        return 0

    created = 0
    for months_ahead in (0, 1):
        competencia = _add_months(_first_day_of_month(today), months_ahead)
        data_vencimento = _safe_day(competencia.year, competencia.month, config.dia_emissao)

        exists_result = await db.execute(
            select(ObligationInstance).where(
                ObligationInstance.user_id == user.id,
                ObligationInstance.tipo == TipoObrigacao.NF_EMISSAO,
                ObligationInstance.competencia == competencia,
                ObligationInstance.status != StatusObrigacao.CANCELADO,
            )
        )
        if exists_result.scalar_one_or_none() is not None:
            continue

        instance = ObligationInstance(
            user_id=user.id,
            tipo=TipoObrigacao.NF_EMISSAO,
            competencia=competencia,
            data_vencimento=data_vencimento,
            valor=config.valor_mensal,
            status=StatusObrigacao.PENDENTE,
        )
        db.add(instance)
        created += 1

    if created:
        await db.flush()

    return created


async def ensure_rt_recebimento_for_nf(
    db: AsyncSession, user: User, nf_instance: ObligationInstance
) -> ObligationInstance | None:
    """Gera (ou atualiza) a instancia RT_RECEBIMENTO vinculada a uma NF concluida.

    Chamada quando uma instancia NF_EMISSAO e marcada como CONCLUIDO (ver
    PATCH /obligations/{id}). Vencimento = data de conclusao da NF +
    dias_prazo_pagamento configurado. Idempotente: chamar de novo para a
    mesma competencia atualiza a instancia existente em vez de duplicar
    (ha uma constraint unica em (user_id, tipo, competencia)).
    """
    if nf_instance.tipo != TipoObrigacao.NF_EMISSAO or nf_instance.concluido_em is None:
        return None

    result = await db.execute(select(RtRecebimentoConfig).where(RtRecebimentoConfig.user_id == user.id))
    config = result.scalar_one_or_none()
    if config is None or not config.ativo:
        return None

    data_vencimento = nf_instance.concluido_em.date() + timedelta(days=config.dias_prazo_pagamento)

    existing_result = await db.execute(
        select(ObligationInstance).where(
            ObligationInstance.user_id == user.id,
            ObligationInstance.tipo == TipoObrigacao.RT_RECEBIMENTO,
            ObligationInstance.competencia == nf_instance.competencia,
        )
    )
    instance = existing_result.scalar_one_or_none()

    if instance is None:
        instance = ObligationInstance(
            user_id=user.id,
            tipo=TipoObrigacao.RT_RECEBIMENTO,
            competencia=nf_instance.competencia,
            status=StatusObrigacao.PENDENTE,
        )
        db.add(instance)

    instance.data_vencimento = data_vencimento
    instance.valor = nf_instance.valor
    instance.gerado_a_partir_de_id = nf_instance.id

    await db.flush()
    return instance


async def ensure_dasn_instances_for_user(db: AsyncSession, user: User, today: date) -> int:
    """Garante a instancia DASN_SIMEI do ano corrente (se config ativa).

    O prazo e fixo em lei: 31/05, referente ao faturamento do ano ANTERIOR.
    Diferente do DAS/NF (mensais, gera mes atual + proximo), aqui e anual -
    so garante 1 instancia por ano, com `competencia` marcando o ano de
    referencia do faturamento (ex: competencia=2026-01-01 => declaracao do
    faturamento de 2026, vencimento 2027-05-31).
    """
    result = await db.execute(select(DasnSimeiConfig).where(DasnSimeiConfig.user_id == user.id))
    config = result.scalar_one_or_none()
    if config is None or not config.ativo:
        return 0

    ano_referencia = today.year - 1
    competencia = date(ano_referencia, 1, 1)
    data_vencimento = date(today.year, 5, 31)

    exists_result = await db.execute(
        select(ObligationInstance).where(
            ObligationInstance.user_id == user.id,
            ObligationInstance.tipo == TipoObrigacao.DASN_SIMEI,
            ObligationInstance.competencia == competencia,
            ObligationInstance.status != StatusObrigacao.CANCELADO,
        )
    )
    if exists_result.scalar_one_or_none() is not None:
        return 0

    instance = ObligationInstance(
        user_id=user.id,
        tipo=TipoObrigacao.DASN_SIMEI,
        competencia=competencia,
        data_vencimento=data_vencimento,
        status=StatusObrigacao.PENDENTE,
    )
    db.add(instance)
    await db.flush()
    return 1


async def mark_overdue_for_user(db: AsyncSession, user: User, today: date) -> int:
    """Marca como ATRASADO toda instancia PENDENTE cujo vencimento ja passou."""
    result = await db.execute(
        select(ObligationInstance).where(
            ObligationInstance.user_id == user.id,
            ObligationInstance.status == StatusObrigacao.PENDENTE,
            ObligationInstance.data_vencimento < today,
        )
    )
    instances = result.scalars().all()
    for instance in instances:
        instance.status = StatusObrigacao.ATRASADO

    if instances:
        await db.flush()

    return len(instances)


# Rotulos e verbos usados no corpo da notificacao, por tipo de obrigacao.
# RT_RECEBIMENTO e um recebimento (dinheiro entrando), nao um pagamento -
# por isso usa "previsto"/"esperado" em vez de "vence".
_TIPO_LABEL = {
    TipoObrigacao.DAS: "DAS-MEI",
    TipoObrigacao.NF_EMISSAO: "Emissão de NF (RT Intelligence)",
    TipoObrigacao.RT_RECEBIMENTO: "Recebimento da RT Intelligence",
    TipoObrigacao.DASN_SIMEI: "Declaração DASN-SIMEI",
}


def _build_notification_body(instance: ObligationInstance, dias_ate_vencimento: int) -> str:
    label = _TIPO_LABEL.get(instance.tipo, instance.tipo.value)
    data = instance.data_vencimento.isoformat()

    if instance.tipo == TipoObrigacao.RT_RECEBIMENTO:
        if dias_ate_vencimento < 0:
            return f"{label} ainda não caiu, previsto para {data} (há {abs(dias_ate_vencimento)} dia(s)). Confira."
        if dias_ate_vencimento == 0:
            return f"{label} previsto para hoje ({data}). Confira se caiu."
        return f"{label} previsto em {dias_ate_vencimento} dia(s) ({data})."

    if dias_ate_vencimento < 0:
        return f"{label} atrasado(a) ha {abs(dias_ate_vencimento)} dia(s). Vencimento: {data}."
    if dias_ate_vencimento == 0:
        return f"{label} vence hoje ({data})."
    return f"{label} vence em {dias_ate_vencimento} dia(s) ({data})."


async def _dias_antecedencia_por_tipo(db: AsyncSession, user: User) -> dict[TipoObrigacao, list[int]]:
    """Busca a lista de dias de antecedencia configurada para cada tipo de obrigacao."""
    default = [5, 3, 1, 0]

    das_result = await db.execute(select(DasConfig).where(DasConfig.user_id == user.id))
    das_config = das_result.scalar_one_or_none()

    nf_result = await db.execute(select(NfConfig).where(NfConfig.user_id == user.id))
    nf_config = nf_result.scalar_one_or_none()

    rt_result = await db.execute(select(RtRecebimentoConfig).where(RtRecebimentoConfig.user_id == user.id))
    rt_config = rt_result.scalar_one_or_none()

    dasn_result = await db.execute(select(DasnSimeiConfig).where(DasnSimeiConfig.user_id == user.id))
    dasn_config = dasn_result.scalar_one_or_none()

    return {
        TipoObrigacao.DAS: das_config.dias_antecedencia_lembrete if das_config else default,
        TipoObrigacao.NF_EMISSAO: nf_config.dias_antecedencia_lembrete if nf_config else default,
        TipoObrigacao.RT_RECEBIMENTO: rt_config.dias_antecedencia_lembrete if rt_config else default,
        TipoObrigacao.DASN_SIMEI: dasn_config.dias_antecedencia_lembrete if dasn_config else default,
    }


async def process_notifications_for_user(db: AsyncSession, user: User, today: date) -> tuple[int, int]:
    """Dispara notificacoes pendentes para o usuario. Retorna (processed, notifications_sent)."""
    dias_antecedencia_por_tipo = await _dias_antecedencia_por_tipo(db, user)

    result = await db.execute(
        select(ObligationInstance).where(
            ObligationInstance.user_id == user.id,
            ObligationInstance.status.not_in([StatusObrigacao.CONCLUIDO, StatusObrigacao.CANCELADO]),
        )
    )
    instances = result.scalars().all()

    subs_result = await db.execute(select(PushSubscription).where(PushSubscription.user_id == user.id))
    subscriptions = subs_result.scalars().all()

    processed = 0
    notifications_sent = 0

    for instance in instances:
        processed += 1
        dias_ate_vencimento = (instance.data_vencimento - today).days
        dias_antecedencia_lembrete = dias_antecedencia_por_tipo.get(instance.tipo, [5, 3, 1, 0])

        deve_notificar = dias_ate_vencimento in dias_antecedencia_lembrete or dias_ate_vencimento < 0
        if not deve_notificar:
            continue

        log_result = await db.execute(
            select(NotificationLog).where(
                NotificationLog.obligation_instance_id == instance.id,
                NotificationLog.dias_antecedencia == dias_ate_vencimento,
            )
        )
        if log_result.scalar_one_or_none() is not None:
            continue  # ja notificado sobre esse dia especifico de antecedencia

        if not subscriptions:
            # Nao ha subscription cadastrada: nada para enviar, nao registra log
            # (assim, quando o usuario cadastrar uma subscription, ainda sera notificado).
            continue

        # O Angular Service Worker (SwPush) so exibe a notificacao se o payload
        # do push seguir exatamente este formato ({"notification": {...}}) -
        # sem esse envelope, o SW recebe o push mas nao chama showNotification().
        label = _TIPO_LABEL.get(instance.tipo, instance.tipo.value)
        payload = {
            "notification": {
                "title": f"Lembrete: {label}",
                "body": _build_notification_body(instance, dias_ate_vencimento),
                "data": {"obligation_id": instance.id, "tipo": instance.tipo.value},
            }
        }

        results = await send_push_to_user_subscriptions(db, subscriptions, payload)
        enviado_com_sucesso = any(ok for _, ok in results)

        log = NotificationLog(
            obligation_instance_id=instance.id,
            dias_antecedencia=dias_ate_vencimento,
            status=StatusNotificacao.ENVIADO if enviado_com_sucesso else StatusNotificacao.FALHOU,
        )
        db.add(log)
        if enviado_com_sucesso:
            notifications_sent += 1

    await db.flush()
    return processed, notifications_sent


async def run_daily_job(db: AsyncSession, today: date | None = None) -> dict:
    """Ponto de entrada do job diario. Idempotente para o mesmo `today`."""
    today = today or date.today()

    users_result = await db.execute(select(User))
    users = users_result.scalars().all()

    total_processed = 0
    total_sent = 0

    for user in users:
        await ensure_das_instances_for_user(db, user, today)
        await ensure_nf_instances_for_user(db, user, today)
        await ensure_dasn_instances_for_user(db, user, today)
        await mark_overdue_for_user(db, user, today)
        processed, sent = await process_notifications_for_user(db, user, today)
        total_processed += processed
        total_sent += sent

    await db.commit()

    return {"processed": total_processed, "notifications_sent": total_sent}
