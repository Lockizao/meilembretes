import os
from pathlib import Path

# Usa um sqlite temporario e isolado para os testes, sem tocar no dev.db real
# e sem depender de rede. Precisa ser definido ANTES de importar `app.*`.
_TEST_DB_PATH = Path(__file__).resolve().parent / "test_reminders.db"
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_TEST_DB_PATH.as_posix()}"
os.environ["ENV"] = "development"
os.environ["JOB_SECRET_TOKEN"] = "test-job-token"

import pytest_asyncio  # noqa: E402

from app.database import AsyncSessionLocal, Base, engine  # noqa: E402
from app.models import DasConfig, DasnSimeiConfig, NfConfig, RtRecebimentoConfig, User  # noqa: E402
from app.security import hash_password  # noqa: E402


@pytest_asyncio.fixture(autouse=True)
async def _setup_database():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def db_session():
    async with AsyncSessionLocal() as session:
        yield session


@pytest_asyncio.fixture
async def test_user(db_session):
    user = User(email="teste@example.com", hashed_password=hash_password("senha123"))
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def das_config_ativo(db_session, test_user):
    config = DasConfig(
        user_id=test_user.id,
        dia_vencimento=20,
        dias_antecedencia_lembrete=[5, 3, 1, 0],
        ativo=True,
        valor_mensal=75.90,
    )
    db_session.add(config)
    await db_session.commit()
    await db_session.refresh(config)
    return config


@pytest_asyncio.fixture
async def rt_recebimento_config_ativo(db_session, test_user):
    config = RtRecebimentoConfig(
        user_id=test_user.id,
        dias_prazo_pagamento=30,
        dias_antecedencia_lembrete=[5, 3, 1, 0],
        ativo=True,
    )
    db_session.add(config)
    await db_session.commit()
    await db_session.refresh(config)
    return config


@pytest_asyncio.fixture
async def dasn_simei_config_ativo(db_session, test_user):
    config = DasnSimeiConfig(
        user_id=test_user.id,
        dias_antecedencia_lembrete=[15, 7, 3, 1, 0],
        ativo=True,
    )
    db_session.add(config)
    await db_session.commit()
    await db_session.refresh(config)
    return config


@pytest_asyncio.fixture
async def nf_config_ativo(db_session, test_user):
    config = NfConfig(
        user_id=test_user.id,
        tomador_razao_social="RT Intelligence Ltda",
        tomador_cnpj="00.000.000/0001-00",
        tomador_email="financeiro@rtintelligence.example",
        descricao_servico="Serviços de desenvolvimento de software - competência {mes}/{ano}",
        dia_emissao=5,
        dias_antecedencia_lembrete=[5, 3, 1, 0],
        ativo=True,
        valor_mensal=5000.00,
    )
    db_session.add(config)
    await db_session.commit()
    await db_session.refresh(config)
    return config
