from datetime import date

from sqlalchemy import select

from app.models import ObligationInstance, StatusObrigacao, TipoObrigacao
from app.services import reminders


async def _nf_instances(db_session, user_id):
    result = await db_session.execute(
        select(ObligationInstance).where(
            ObligationInstance.user_id == user_id,
            ObligationInstance.tipo == TipoObrigacao.NF_EMISSAO,
        )
    )
    return list(result.scalars().all())


async def test_ensure_nf_instances_creates_current_and_next_month(db_session, test_user, nf_config_ativo):
    today = date(2026, 8, 29)

    created = await reminders.ensure_nf_instances_for_user(db_session, test_user, today)
    await db_session.commit()

    assert created == 2
    instances = await _nf_instances(db_session, test_user.id)
    assert len(instances) == 2

    competencias = sorted(i.competencia for i in instances)
    assert competencias == [date(2026, 8, 1), date(2026, 9, 1)]

    for instance in instances:
        assert instance.data_vencimento.day == 5
        assert instance.status == StatusObrigacao.PENDENTE
        assert instance.valor == 5000.00


async def test_ensure_nf_instances_is_idempotent(db_session, test_user, nf_config_ativo):
    today = date(2026, 8, 29)

    created_first = await reminders.ensure_nf_instances_for_user(db_session, test_user, today)
    await db_session.commit()
    created_second = await reminders.ensure_nf_instances_for_user(db_session, test_user, today)
    await db_session.commit()

    assert created_first == 2
    assert created_second == 0
    assert len(await _nf_instances(db_session, test_user.id)) == 2


async def test_ensure_nf_instances_skips_when_config_inativa(db_session, test_user, nf_config_ativo):
    nf_config_ativo.ativo = False
    await db_session.commit()

    created = await reminders.ensure_nf_instances_for_user(db_session, test_user, date(2026, 8, 29))
    await db_session.commit()

    assert created == 0
    assert await _nf_instances(db_session, test_user.id) == []


async def test_run_daily_job_generates_das_and_nf_independently(
    db_session, test_user, das_config_ativo, nf_config_ativo, monkeypatch
):
    today = date(2026, 8, 29)

    async def fake_send(db, subscriptions, payload, channel=None):
        return [(sub, True) for sub in subscriptions]

    monkeypatch.setattr(reminders, "send_push_to_user_subscriptions", fake_send)

    result = await reminders.run_daily_job(db_session, today=today)

    # 2 instancias de DAS + 2 de NF = 4 processadas, sem subscription cadastrada
    assert result["processed"] == 4
    assert result["notifications_sent"] == 0

    result = await db_session.execute(select(ObligationInstance).where(ObligationInstance.user_id == test_user.id))
    instances = list(result.scalars().all())
    tipos = sorted(i.tipo.value for i in instances)
    assert tipos == ["DAS", "DAS", "NF_EMISSAO", "NF_EMISSAO"]
