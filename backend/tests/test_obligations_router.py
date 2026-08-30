"""Testes de integracao (via HTTP/ASGI) das rotas de cancelar NF e faturamento.

Usa `httpx.AsyncClient` direto contra o `app` do FastAPI, sobrescrevendo as
dependencias `get_db`/`get_current_user` para reutilizar o `db_session` e o
`test_user` dos fixtures, sem precisar passar por login/cookie de verdade.
"""

from datetime import date, datetime, timezone

import pytest
from httpx import ASGITransport, AsyncClient

from app.database import get_db
from app.deps import get_current_user
from app.main import app
from app.models import ObligationInstance, StatusObrigacao, TipoObrigacao
from app.routers import obligations as obligations_router


@pytest.fixture
async def client(db_session, test_user):
    async def _get_db_override():
        yield db_session

    app.dependency_overrides[get_db] = _get_db_override
    app.dependency_overrides[get_current_user] = lambda: test_user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


async def test_cancelar_nf_marca_cancelado_e_regenera_instancia(
    db_session, test_user, nf_config_ativo, client, monkeypatch
):
    instance = ObligationInstance(
        user_id=test_user.id,
        tipo=TipoObrigacao.NF_EMISSAO,
        competencia=date(2026, 8, 1),
        data_vencimento=date(2026, 8, 5),
        valor=3000.0,
        status=StatusObrigacao.PENDENTE,
    )
    db_session.add(instance)
    await db_session.commit()
    await db_session.refresh(instance)

    chamadas = []

    async def fake_ensure_nf(db, user, today):
        chamadas.append((user.id, today))
        return 0

    monkeypatch.setattr(obligations_router, "ensure_nf_instances_for_user", fake_ensure_nf)

    resp = await client.post(f"/obligations/{instance.id}/cancelar")

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "CANCELADO"
    # o endpoint deve ter chamado o gerador de instancias de NF pro mesmo usuario,
    # pra que a competencia liberada gere uma reposicao pendente automaticamente
    assert len(chamadas) == 1
    assert chamadas[0][0] == test_user.id


async def test_patch_status_pendente_limpa_concluido_em(db_session, test_user, client):
    """Reverter uma obrigacao concluida de volta pra PENDENTE (ex: usuario marcou
    como recebida/paga por engano) deve limpar `concluido_em`, pra nao deixar
    rastro de uma conclusao que foi desfeita."""
    instance = ObligationInstance(
        user_id=test_user.id,
        tipo=TipoObrigacao.RT_RECEBIMENTO,
        competencia=date(2026, 8, 1),
        data_vencimento=date(2026, 9, 4),
        valor=3000.0,
        status=StatusObrigacao.CONCLUIDO,
        concluido_em=datetime(2026, 9, 1, 12, 0, tzinfo=timezone.utc),
    )
    db_session.add(instance)
    await db_session.commit()
    await db_session.refresh(instance)
    assert instance.concluido_em is not None

    resp = await client.patch(f"/obligations/{instance.id}", json={"status": "PENDENTE"})

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "PENDENTE"
    assert body["concluido_em"] is None


async def test_cancelar_obrigacao_que_nao_e_nf_da_erro(db_session, test_user, client):
    instance = ObligationInstance(
        user_id=test_user.id,
        tipo=TipoObrigacao.DAS,
        competencia=date(2026, 8, 1),
        data_vencimento=date(2026, 8, 20),
        status=StatusObrigacao.PENDENTE,
    )
    db_session.add(instance)
    await db_session.commit()
    await db_session.refresh(instance)

    resp = await client.post(f"/obligations/{instance.id}/cancelar")

    assert resp.status_code == 422


async def test_faturamento_soma_so_concluidas_do_ano(db_session, test_user, client):
    instances = [
        ObligationInstance(
            user_id=test_user.id,
            tipo=TipoObrigacao.NF_EMISSAO,
            competencia=date(2026, 1, 1),
            data_vencimento=date(2026, 1, 5),
            valor=1000.0,
            status=StatusObrigacao.CONCLUIDO,
        ),
        ObligationInstance(
            user_id=test_user.id,
            tipo=TipoObrigacao.NF_EMISSAO,
            competencia=date(2026, 2, 1),
            data_vencimento=date(2026, 2, 5),
            valor=500.0,
            status=StatusObrigacao.CANCELADO,  # nao deve contar
        ),
        ObligationInstance(
            user_id=test_user.id,
            tipo=TipoObrigacao.NF_EMISSAO,
            competencia=date(2026, 2, 1),
            data_vencimento=date(2026, 2, 6),
            valor=2000.0,
            status=StatusObrigacao.CONCLUIDO,  # reemitida no lugar da cancelada
        ),
        ObligationInstance(
            user_id=test_user.id,
            tipo=TipoObrigacao.NF_EMISSAO,
            competencia=date(2026, 3, 1),
            data_vencimento=date(2026, 3, 5),
            valor=3000.0,
            status=StatusObrigacao.PENDENTE,  # ainda nao emitida, nao conta
        ),
        ObligationInstance(
            user_id=test_user.id,
            tipo=TipoObrigacao.NF_EMISSAO,
            competencia=date(2025, 12, 1),
            data_vencimento=date(2025, 12, 5),
            valor=9999.0,
            status=StatusObrigacao.CONCLUIDO,  # ano errado, nao deve contar
        ),
    ]
    db_session.add_all(instances)
    await db_session.commit()
    # Tira os objetos do identity map (sem I/O, por isso pode ser sincrono) pra
    # forcar a proxima query a reconstruir as instancias a partir do banco de
    # verdade, passando pela conversao Numeric->Decimal - igual acontece fora
    # dos testes, onde cada request usa uma sessao nova. Foi assim que um bug
    # real (soma de Decimal com float) apareceu.
    db_session.expunge_all()

    resp = await client.get("/obligations/faturamento", params={"ano": 2026})

    assert resp.status_code == 200
    body = resp.json()
    assert body["ano"] == 2026
    assert body["total"] == 3000.0  # 1000 (jan) + 2000 (fev reemitida), sem a cancelada nem a pendente
    assert len(body["meses"]) == 4  # todas as instancias de 2026, so o total que filtra
