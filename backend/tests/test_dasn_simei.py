from datetime import date

from sqlalchemy import select

from app.models import ObligationInstance, TipoObrigacao
from app.services import reminders


async def _dasn_instances(db_session, user_id):
    result = await db_session.execute(
        select(ObligationInstance).where(
            ObligationInstance.user_id == user_id,
            ObligationInstance.tipo == TipoObrigacao.DASN_SIMEI,
        )
    )
    return list(result.scalars().all())


async def test_ensure_dasn_instance_created_with_correct_year_and_deadline(
    db_session, test_user, dasn_simei_config_ativo
):
    today = date(2026, 8, 29)

    created = await reminders.ensure_dasn_instances_for_user(db_session, test_user, today)
    await db_session.commit()

    assert created == 1
    instances = await _dasn_instances(db_session, test_user.id)
    assert len(instances) == 1
    # competencia = ano de referencia do faturamento (2025), vencimento = 31/05/2026
    assert instances[0].competencia == date(2025, 1, 1)
    assert instances[0].data_vencimento == date(2026, 5, 31)


async def test_ensure_dasn_instance_is_idempotent(db_session, test_user, dasn_simei_config_ativo):
    today = date(2026, 8, 29)

    created_first = await reminders.ensure_dasn_instances_for_user(db_session, test_user, today)
    await db_session.commit()
    created_second = await reminders.ensure_dasn_instances_for_user(db_session, test_user, today)
    await db_session.commit()

    assert created_first == 1
    assert created_second == 0
    assert len(await _dasn_instances(db_session, test_user.id)) == 1


async def test_ensure_dasn_instance_skips_when_config_inativa(db_session, test_user, dasn_simei_config_ativo):
    dasn_simei_config_ativo.ativo = False
    await db_session.commit()

    created = await reminders.ensure_dasn_instances_for_user(db_session, test_user, date(2026, 8, 29))
    await db_session.commit()

    assert created == 0
    assert await _dasn_instances(db_session, test_user.id) == []


async def test_ensure_dasn_instance_rolls_over_to_new_year(db_session, test_user, dasn_simei_config_ativo):
    # No ano corrente (2026), gera a declaracao do ano-base 2025
    await reminders.ensure_dasn_instances_for_user(db_session, test_user, date(2026, 8, 29))
    await db_session.commit()

    # Virando o ano (2027), gera uma NOVA instancia pro ano-base 2026 (nao reaproveita a de 2025)
    created = await reminders.ensure_dasn_instances_for_user(db_session, test_user, date(2027, 1, 5))
    await db_session.commit()

    assert created == 1
    instances = await _dasn_instances(db_session, test_user.id)
    competencias = sorted(i.competencia for i in instances)
    assert competencias == [date(2025, 1, 1), date(2026, 1, 1)]
