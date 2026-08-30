from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models import DasConfig, DasnSimeiConfig, NfConfig, RtRecebimentoConfig, User
from app.schemas import (
    DasConfigIn,
    DasConfigOut,
    DasnSimeiConfigIn,
    DasnSimeiConfigOut,
    NfConfigIn,
    NfConfigOut,
    RtRecebimentoConfigIn,
    RtRecebimentoConfigOut,
)

router = APIRouter(prefix="/config", tags=["config"])


async def _get_or_create_config(db: AsyncSession, user: User) -> DasConfig:
    result = await db.execute(select(DasConfig).where(DasConfig.user_id == user.id))
    config = result.scalar_one_or_none()
    if config is None:
        config = DasConfig(
            user_id=user.id,
            dia_vencimento=20,
            dias_antecedencia_lembrete=[5, 3, 1, 0],
            ativo=True,
            valor_mensal=None,
        )
        db.add(config)
        await db.commit()
        await db.refresh(config)
    return config


async def _get_or_create_nf_config(db: AsyncSession, user: User) -> NfConfig:
    result = await db.execute(select(NfConfig).where(NfConfig.user_id == user.id))
    config = result.scalar_one_or_none()
    if config is None:
        config = NfConfig(
            user_id=user.id,
            dia_emissao=5,
            dias_antecedencia_lembrete=[5, 3, 1, 0],
            ativo=True,
        )
        db.add(config)
        await db.commit()
        await db.refresh(config)
    return config


async def _get_or_create_rt_recebimento_config(db: AsyncSession, user: User) -> RtRecebimentoConfig:
    result = await db.execute(select(RtRecebimentoConfig).where(RtRecebimentoConfig.user_id == user.id))
    config = result.scalar_one_or_none()
    if config is None:
        config = RtRecebimentoConfig(
            user_id=user.id,
            dias_prazo_pagamento=30,
            dias_antecedencia_lembrete=[5, 3, 1, 0],
            ativo=True,
        )
        db.add(config)
        await db.commit()
        await db.refresh(config)
    return config


async def _get_or_create_dasn_simei_config(db: AsyncSession, user: User) -> DasnSimeiConfig:
    result = await db.execute(select(DasnSimeiConfig).where(DasnSimeiConfig.user_id == user.id))
    config = result.scalar_one_or_none()
    if config is None:
        config = DasnSimeiConfig(
            user_id=user.id,
            dias_antecedencia_lembrete=[15, 7, 3, 1, 0],
            ativo=True,
        )
        db.add(config)
        await db.commit()
        await db.refresh(config)
    return config


@router.get("/das", response_model=DasConfigOut)
async def get_das_config(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DasConfig:
    return await _get_or_create_config(db, user)


@router.put("/das", response_model=DasConfigOut)
async def update_das_config(
    body: DasConfigIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DasConfig:
    config = await _get_or_create_config(db, user)

    config.valor_mensal = body.valor_mensal
    config.dia_vencimento = body.dia_vencimento
    config.dias_antecedencia_lembrete = body.dias_antecedencia_lembrete
    config.ativo = body.ativo

    await db.commit()
    await db.refresh(config)
    return config


@router.get("/nf", response_model=NfConfigOut)
async def get_nf_config(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> NfConfig:
    return await _get_or_create_nf_config(db, user)


@router.put("/nf", response_model=NfConfigOut)
async def update_nf_config(
    body: NfConfigIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> NfConfig:
    config = await _get_or_create_nf_config(db, user)

    config.tomador_razao_social = body.tomador_razao_social
    config.tomador_cnpj = body.tomador_cnpj
    config.tomador_email = body.tomador_email
    config.descricao_servico = body.descricao_servico
    config.valor_mensal = body.valor_mensal
    config.dia_emissao = body.dia_emissao
    config.dias_antecedencia_lembrete = body.dias_antecedencia_lembrete
    config.ativo = body.ativo

    await db.commit()
    await db.refresh(config)
    return config


@router.get("/rt-recebimento", response_model=RtRecebimentoConfigOut)
async def get_rt_recebimento_config(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RtRecebimentoConfig:
    return await _get_or_create_rt_recebimento_config(db, user)


@router.put("/rt-recebimento", response_model=RtRecebimentoConfigOut)
async def update_rt_recebimento_config(
    body: RtRecebimentoConfigIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RtRecebimentoConfig:
    config = await _get_or_create_rt_recebimento_config(db, user)

    config.dias_prazo_pagamento = body.dias_prazo_pagamento
    config.dias_antecedencia_lembrete = body.dias_antecedencia_lembrete
    config.ativo = body.ativo

    await db.commit()
    await db.refresh(config)
    return config


@router.get("/dasn-simei", response_model=DasnSimeiConfigOut)
async def get_dasn_simei_config(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DasnSimeiConfig:
    return await _get_or_create_dasn_simei_config(db, user)


@router.put("/dasn-simei", response_model=DasnSimeiConfigOut)
async def update_dasn_simei_config(
    body: DasnSimeiConfigIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DasnSimeiConfig:
    config = await _get_or_create_dasn_simei_config(db, user)

    config.dias_antecedencia_lembrete = body.dias_antecedencia_lembrete
    config.ativo = body.ativo

    await db.commit()
    await db.refresh(config)
    return config
