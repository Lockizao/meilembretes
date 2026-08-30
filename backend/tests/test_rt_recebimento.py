from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select

from app.models import ObligationInstance, PushSubscription, StatusObrigacao, TipoObrigacao
from app.services import reminders


async def _rt_instances(db_session, user_id):
    result = await db_session.execute(
        select(ObligationInstance).where(
            ObligationInstance.user_id == user_id,
            ObligationInstance.tipo == TipoObrigacao.RT_RECEBIMENTO,
        )
    )
    return list(result.scalars().all())


def _make_nf_instance(user_id, *, competencia, concluido_em, valor=3000.0):
    return ObligationInstance(
        user_id=user_id,
        tipo=TipoObrigacao.NF_EMISSAO,
        competencia=competencia,
        data_vencimento=competencia + timedelta(days=5),
        valor=valor,
        status=StatusObrigacao.CONCLUIDO,
        concluido_em=concluido_em,
    )


async def test_ensure_rt_recebimento_creates_instance_after_nf_concluida(
    db_session, test_user, rt_recebimento_config_ativo
):
    nf = _make_nf_instance(
        test_user.id,
        competencia=date(2026, 8, 1),
        concluido_em=datetime(2026, 8, 5, 12, 0, tzinfo=timezone.utc),
    )
    db_session.add(nf)
    await db_session.commit()
    await db_session.refresh(nf)

    created = await reminders.ensure_rt_recebimento_for_nf(db_session, test_user, nf)
    await db_session.commit()

    assert created is not None
    instances = await _rt_instances(db_session, test_user.id)
    assert len(instances) == 1
    assert instances[0].data_vencimento == date(2026, 8, 5) + timedelta(days=30)
    assert instances[0].valor == 3000.0
    assert instances[0].gerado_a_partir_de_id == nf.id
    assert instances[0].status == StatusObrigacao.PENDENTE


async def test_ensure_rt_recebimento_is_idempotent(db_session, test_user, rt_recebimento_config_ativo):
    nf = _make_nf_instance(
        test_user.id,
        competencia=date(2026, 8, 1),
        concluido_em=datetime(2026, 8, 5, 12, 0, tzinfo=timezone.utc),
    )
    db_session.add(nf)
    await db_session.commit()
    await db_session.refresh(nf)

    await reminders.ensure_rt_recebimento_for_nf(db_session, test_user, nf)
    await db_session.commit()
    await reminders.ensure_rt_recebimento_for_nf(db_session, test_user, nf)
    await db_session.commit()

    instances = await _rt_instances(db_session, test_user.id)
    assert len(instances) == 1  # nao duplicou (constraint unica user+tipo+competencia)


async def test_ensure_rt_recebimento_skips_when_nf_not_concluida(db_session, test_user, rt_recebimento_config_ativo):
    nf = ObligationInstance(
        user_id=test_user.id,
        tipo=TipoObrigacao.NF_EMISSAO,
        competencia=date(2026, 8, 1),
        data_vencimento=date(2026, 8, 5),
        status=StatusObrigacao.PENDENTE,
        concluido_em=None,
    )
    db_session.add(nf)
    await db_session.commit()
    await db_session.refresh(nf)

    created = await reminders.ensure_rt_recebimento_for_nf(db_session, test_user, nf)
    await db_session.commit()

    assert created is None
    assert await _rt_instances(db_session, test_user.id) == []


async def test_ensure_rt_recebimento_skips_when_config_inativa(db_session, test_user, rt_recebimento_config_ativo):
    rt_recebimento_config_ativo.ativo = False
    await db_session.commit()

    nf = _make_nf_instance(
        test_user.id,
        competencia=date(2026, 8, 1),
        concluido_em=datetime(2026, 8, 5, 12, 0, tzinfo=timezone.utc),
    )
    db_session.add(nf)
    await db_session.commit()
    await db_session.refresh(nf)

    created = await reminders.ensure_rt_recebimento_for_nf(db_session, test_user, nf)
    await db_session.commit()

    assert created is None
    assert await _rt_instances(db_session, test_user.id) == []


async def test_ensure_rt_recebimento_skips_for_non_nf_tipo(db_session, test_user, rt_recebimento_config_ativo):
    das = ObligationInstance(
        user_id=test_user.id,
        tipo=TipoObrigacao.DAS,
        competencia=date(2026, 8, 1),
        data_vencimento=date(2026, 8, 20),
        status=StatusObrigacao.CONCLUIDO,
        concluido_em=datetime(2026, 8, 20, 12, 0, tzinfo=timezone.utc),
    )
    db_session.add(das)
    await db_session.commit()
    await db_session.refresh(das)

    created = await reminders.ensure_rt_recebimento_for_nf(db_session, test_user, das)
    await db_session.commit()

    assert created is None
    assert await _rt_instances(db_session, test_user.id) == []


async def test_process_notifications_uses_rt_recebimento_antecedencia(
    db_session, test_user, rt_recebimento_config_ativo, monkeypatch
):
    rt_recebimento_config_ativo.dias_antecedencia_lembrete = [7]
    await db_session.commit()

    today = date(2026, 8, 29)
    instance = ObligationInstance(
        user_id=test_user.id,
        tipo=TipoObrigacao.RT_RECEBIMENTO,
        competencia=date(2026, 8, 1),
        data_vencimento=today + timedelta(days=7),
        valor=3000.0,
        status=StatusObrigacao.PENDENTE,
    )
    db_session.add(instance)
    subscription = PushSubscription(
        user_id=test_user.id, endpoint="https://push.example.com/rt", p256dh="p", auth="a"
    )
    db_session.add(subscription)
    await db_session.commit()

    sent_payloads = []

    async def fake_send(db, subscriptions, payload, channel=None):
        sent_payloads.append(payload)
        return [(sub, True) for sub in subscriptions]

    monkeypatch.setattr(reminders, "send_push_to_user_subscriptions", fake_send)

    processed, sent = await reminders.process_notifications_for_user(db_session, test_user, today)

    assert processed == 1
    assert sent == 1
    assert len(sent_payloads) == 1
    body = sent_payloads[0]["notification"]["body"]
    assert "Recebimento da RT Intelligence" in body
    assert "previsto" in body.lower()
