from datetime import date, timedelta

from sqlalchemy import select

from app.models import (
    NotificationLog,
    ObligationInstance,
    PushSubscription,
    StatusObrigacao,
    StatusNotificacao,
    TipoObrigacao,
)
from app.services import reminders


async def _count_obligations(db_session, user_id):
    result = await db_session.execute(select(ObligationInstance).where(ObligationInstance.user_id == user_id))
    return list(result.scalars().all())


async def test_ensure_das_instances_creates_current_and_next_month(db_session, test_user, das_config_ativo):
    today = date(2026, 8, 29)

    created = await reminders.ensure_das_instances_for_user(db_session, test_user, today)
    await db_session.commit()

    assert created == 2
    instances = await _count_obligations(db_session, test_user.id)
    assert len(instances) == 2

    competencias = sorted(i.competencia for i in instances)
    assert competencias == [date(2026, 8, 1), date(2026, 9, 1)]

    for instance in instances:
        assert instance.data_vencimento.day == 20
        assert instance.tipo == TipoObrigacao.DAS
        assert instance.status == StatusObrigacao.PENDENTE


async def test_ensure_das_instances_is_idempotent(db_session, test_user, das_config_ativo):
    today = date(2026, 8, 29)

    created_first = await reminders.ensure_das_instances_for_user(db_session, test_user, today)
    await db_session.commit()
    created_second = await reminders.ensure_das_instances_for_user(db_session, test_user, today)
    await db_session.commit()

    assert created_first == 2
    assert created_second == 0

    instances = await _count_obligations(db_session, test_user.id)
    assert len(instances) == 2  # nao duplicou


async def test_ensure_das_instances_skips_when_config_inativa(db_session, test_user, das_config_ativo):
    das_config_ativo.ativo = False
    await db_session.commit()

    created = await reminders.ensure_das_instances_for_user(db_session, test_user, date(2026, 8, 29))
    await db_session.commit()

    assert created == 0
    instances = await _count_obligations(db_session, test_user.id)
    assert len(instances) == 0


async def test_mark_overdue_marks_pendente_past_due_as_atrasado(db_session, test_user):
    today = date(2026, 8, 29)

    vencida = ObligationInstance(
        user_id=test_user.id,
        tipo=TipoObrigacao.DAS,
        competencia=date(2026, 7, 1),
        data_vencimento=date(2026, 7, 20),  # ja passou
        status=StatusObrigacao.PENDENTE,
    )
    futura = ObligationInstance(
        user_id=test_user.id,
        tipo=TipoObrigacao.DAS,
        competencia=date(2026, 9, 1),
        data_vencimento=date(2026, 9, 20),  # ainda nao passou (relativo a today)
        status=StatusObrigacao.PENDENTE,
    )
    db_session.add_all([vencida, futura])
    await db_session.commit()

    updated = await reminders.mark_overdue_for_user(db_session, test_user, today)
    await db_session.commit()

    assert updated == 1

    await db_session.refresh(vencida)
    await db_session.refresh(futura)
    assert vencida.status == StatusObrigacao.ATRASADO
    assert futura.status == StatusObrigacao.PENDENTE


async def test_mark_overdue_is_idempotent(db_session, test_user):
    today = date(2026, 8, 29)
    vencida = ObligationInstance(
        user_id=test_user.id,
        tipo=TipoObrigacao.DAS,
        competencia=date(2026, 7, 1),
        data_vencimento=date(2026, 7, 20),
        status=StatusObrigacao.PENDENTE,
    )
    db_session.add(vencida)
    await db_session.commit()

    first = await reminders.mark_overdue_for_user(db_session, test_user, today)
    await db_session.commit()
    second = await reminders.mark_overdue_for_user(db_session, test_user, today)
    await db_session.commit()

    assert first == 1
    assert second == 0  # ja nao ha mais PENDENTE para marcar de novo


async def test_process_notifications_sends_once_per_instance_and_day(
    db_session, test_user, das_config_ativo, monkeypatch
):
    today = date(2026, 8, 29)
    data_vencimento = today + timedelta(days=5)  # 5 dias de antecedencia, presente na config

    instance = ObligationInstance(
        user_id=test_user.id,
        tipo=TipoObrigacao.DAS,
        competencia=date(2026, 8, 1),
        data_vencimento=data_vencimento,
        status=StatusObrigacao.PENDENTE,
    )
    db_session.add(instance)

    subscription = PushSubscription(
        user_id=test_user.id,
        endpoint="https://push.example.com/abc",
        p256dh="fake-p256dh",
        auth="fake-auth",
    )
    db_session.add(subscription)
    await db_session.commit()

    sent_calls = []

    async def fake_send(db, subscriptions, payload, channel=None):
        sent_calls.append(payload)
        return [(sub, True) for sub in subscriptions]

    monkeypatch.setattr(reminders, "send_push_to_user_subscriptions", fake_send)

    processed_1, sent_1 = await reminders.process_notifications_for_user(db_session, test_user, today)
    await db_session.commit()

    processed_2, sent_2 = await reminders.process_notifications_for_user(db_session, test_user, today)
    await db_session.commit()

    assert processed_1 == 1
    assert sent_1 == 1
    assert processed_2 == 1
    assert sent_2 == 0  # segunda chamada no mesmo dia nao reenvia
    assert len(sent_calls) == 1

    logs_result = await db_session.execute(
        select(NotificationLog).where(NotificationLog.obligation_instance_id == instance.id)
    )
    logs = logs_result.scalars().all()
    assert len(logs) == 1
    assert logs[0].dias_antecedencia == 5
    assert logs[0].status == StatusNotificacao.ENVIADO


async def test_process_notifications_does_not_send_when_days_not_in_reminder_list(
    db_session, test_user, das_config_ativo, monkeypatch
):
    today = date(2026, 8, 29)
    data_vencimento = today + timedelta(days=10)  # 10 nao esta em [5, 3, 1, 0]

    instance = ObligationInstance(
        user_id=test_user.id,
        tipo=TipoObrigacao.DAS,
        competencia=date(2026, 8, 1),
        data_vencimento=data_vencimento,
        status=StatusObrigacao.PENDENTE,
    )
    db_session.add(instance)
    subscription = PushSubscription(
        user_id=test_user.id, endpoint="https://push.example.com/xyz", p256dh="p", auth="a"
    )
    db_session.add(subscription)
    await db_session.commit()

    async def fake_send(db, subscriptions, payload, channel=None):
        raise AssertionError("nao deveria enviar notificacao fora da janela configurada")

    monkeypatch.setattr(reminders, "send_push_to_user_subscriptions", fake_send)

    processed, sent = await reminders.process_notifications_for_user(db_session, test_user, today)
    await db_session.commit()

    assert processed == 1
    assert sent == 0


async def test_process_notifications_sends_daily_while_overdue(db_session, test_user, das_config_ativo, monkeypatch):
    today = date(2026, 8, 29)
    data_vencimento = today - timedelta(days=2)  # ja atrasado ha 2 dias

    instance = ObligationInstance(
        user_id=test_user.id,
        tipo=TipoObrigacao.DAS,
        competencia=date(2026, 7, 1),
        data_vencimento=data_vencimento,
        status=StatusObrigacao.ATRASADO,
    )
    db_session.add(instance)
    subscription = PushSubscription(
        user_id=test_user.id, endpoint="https://push.example.com/atraso", p256dh="p", auth="a"
    )
    db_session.add(subscription)
    await db_session.commit()

    async def fake_send(db, subscriptions, payload, channel=None):
        return [(sub, True) for sub in subscriptions]

    monkeypatch.setattr(reminders, "send_push_to_user_subscriptions", fake_send)

    # dia 1: notifica sobre o atraso de -2 dias
    _, sent_day1 = await reminders.process_notifications_for_user(db_session, test_user, today)
    await db_session.commit()
    # mesma chamada de novo no mesmo dia: nao duplica
    _, sent_day1_repeat = await reminders.process_notifications_for_user(db_session, test_user, today)
    await db_session.commit()
    # dia seguinte: -3 dias de atraso, e um valor novo -> notifica de novo
    _, sent_day2 = await reminders.process_notifications_for_user(db_session, test_user, today + timedelta(days=1))
    await db_session.commit()

    assert sent_day1 == 1
    assert sent_day1_repeat == 0
    assert sent_day2 == 1

    logs_result = await db_session.execute(
        select(NotificationLog).where(NotificationLog.obligation_instance_id == instance.id)
    )
    logs = {log.dias_antecedencia for log in logs_result.scalars().all()}
    assert logs == {-2, -3}


async def test_run_daily_job_full_flow_is_idempotent(db_session, test_user, das_config_ativo, monkeypatch):
    today = date(2026, 8, 29)

    async def fake_send(db, subscriptions, payload, channel=None):
        return [(sub, True) for sub in subscriptions]

    monkeypatch.setattr(reminders, "send_push_to_user_subscriptions", fake_send)

    subscription = PushSubscription(
        user_id=test_user.id, endpoint="https://push.example.com/job", p256dh="p", auth="a"
    )
    db_session.add(subscription)
    await db_session.commit()

    result_1 = await reminders.run_daily_job(db_session, today=today)
    result_2 = await reminders.run_daily_job(db_session, today=today)

    instances = await _count_obligations(db_session, test_user.id)
    assert len(instances) == 2  # nao duplicou instancias na segunda chamada

    assert result_1["processed"] == 2
    assert result_2["processed"] == 2
    # notificacoes ja enviadas na primeira chamada nao sao reenviadas na segunda
    assert result_2["notifications_sent"] == 0
