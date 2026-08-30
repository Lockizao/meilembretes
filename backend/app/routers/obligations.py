from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models import NfConfig, ObligationInstance, StatusObrigacao, TipoObrigacao, User
from app.schemas import FaturamentoMesOut, FaturamentoOut, NfDataOut, ObligationOut, ObligationPatch
from app.services.reminders import ensure_nf_instances_for_user, ensure_rt_recebimento_for_nf

router = APIRouter(prefix="/obligations", tags=["obligations"])


@router.get("", response_model=list[ObligationOut])
async def list_obligations(
    tipo: str | None = None,
    status_: str | None = Query(default=None, alias="status"),
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[ObligationInstance]:
    query = select(ObligationInstance).where(ObligationInstance.user_id == user.id)

    if tipo:
        try:
            query = query.where(ObligationInstance.tipo == TipoObrigacao(tipo))
        except ValueError:
            raise HTTPException(status_code=422, detail=f"tipo inválido: {tipo}")

    if status_:
        try:
            query = query.where(ObligationInstance.status == StatusObrigacao(status_))
        except ValueError:
            raise HTTPException(status_code=422, detail=f"status inválido: {status_}")

    if from_:
        query = query.where(ObligationInstance.data_vencimento >= from_)

    if to:
        query = query.where(ObligationInstance.data_vencimento <= to)

    query = query.order_by(ObligationInstance.data_vencimento)

    result = await db.execute(query)
    return list(result.scalars().all())


@router.get("/faturamento", response_model=FaturamentoOut)
async def get_faturamento(
    ano: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FaturamentoOut:
    """Soma o faturamento (NFs emitidas) de um ano, para preencher a DASN-SIMEI.

    So conta instancias NF_EMISSAO com status CONCLUIDO dentro do ano pedido.
    Canceladas nao entram (o usuario reemite outra pra mesma competencia, e
    so a reemitida chega a CONCLUIDO); pendentes/atrasadas tambem nao contam
    ainda, ja que a NF nao foi de fato emitida.

    IMPORTANTE: esta rota precisa ficar ANTES de `/{obligation_id}` no
    arquivo - caso contrario "faturamento" seria interpretado como um
    obligation_id inválido pelo FastAPI (rotas estáticas antes das
    parametrizadas).
    """
    result = await db.execute(
        select(ObligationInstance).where(
            ObligationInstance.user_id == user.id,
            ObligationInstance.tipo == TipoObrigacao.NF_EMISSAO,
            ObligationInstance.competencia >= date(ano, 1, 1),
            ObligationInstance.competencia <= date(ano, 12, 1),
        )
    )
    instances = sorted(result.scalars().all(), key=lambda i: i.competencia)

    meses = [
        FaturamentoMesOut(competencia=i.competencia, valor=i.valor, status=i.status.value) for i in instances
    ]
    total = sum(
        (float(i.valor) for i in instances if i.status == StatusObrigacao.CONCLUIDO and i.valor is not None),
        start=0.0,
    )

    return FaturamentoOut(ano=ano, total=total, meses=meses)


@router.get("/{obligation_id}", response_model=ObligationOut)
async def get_obligation(
    obligation_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ObligationInstance:
    obligation = await _get_owned_obligation(db, user, obligation_id)
    return obligation


@router.patch("/{obligation_id}", response_model=ObligationOut)
async def patch_obligation(
    obligation_id: int,
    body: ObligationPatch,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ObligationInstance:
    obligation = await _get_owned_obligation(db, user, obligation_id)

    if body.status is not None:
        try:
            new_status = StatusObrigacao(body.status)
        except ValueError:
            raise HTTPException(status_code=422, detail=f"status inválido: {body.status}")
        obligation.status = new_status
        if new_status == StatusObrigacao.CONCLUIDO:
            obligation.concluido_em = datetime.now(timezone.utc)
        else:
            # Reverter pra PENDENTE (ex: marcou como recebido/pago por engano) limpa
            # a data de conclusao, pra nao deixar rastro de uma conclusao que foi desfeita.
            obligation.concluido_em = None

    if body.observacoes is not None:
        obligation.observacoes = body.observacoes

    await db.flush()

    # Ao concluir uma emissao de NF, gera/atualiza automaticamente o
    # lembrete de conferir o recebimento do pagamento (Fase 3).
    if obligation.tipo == TipoObrigacao.NF_EMISSAO and obligation.status == StatusObrigacao.CONCLUIDO:
        await ensure_rt_recebimento_for_nf(db, user, obligation)

    await db.commit()
    await db.refresh(obligation)
    return obligation


@router.post("/{obligation_id}/cancelar", response_model=ObligationOut)
async def cancel_obligation(
    obligation_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ObligationInstance:
    """Cancela uma NF emitida com valor/dado errado.

    So permitido para NF_EMISSAO (caso de uso: emitiu errado, cancelou no
    nfse.gov.br, vai emitir outra). Ao cancelar, a competencia fica livre e
    o gerador mensal (`ensure_nf_instances_for_user`) cria imediatamente uma
    nova instancia PENDENTE pra mesma competencia, pronta pra reemissao -
    sem precisar esperar o job diario rodar de novo.
    """
    obligation = await _get_owned_obligation(db, user, obligation_id)
    if obligation.tipo != TipoObrigacao.NF_EMISSAO:
        raise HTTPException(status_code=422, detail="Só é possível cancelar obrigações do tipo NF_EMISSAO.")
    if obligation.status == StatusObrigacao.CANCELADO:
        return obligation

    obligation.status = StatusObrigacao.CANCELADO
    await db.flush()

    await ensure_nf_instances_for_user(db, user, date.today())

    await db.commit()
    await db.refresh(obligation)
    return obligation


@router.get("/{obligation_id}/nf-data", response_model=NfDataOut)
async def get_obligation_nf_data(
    obligation_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> NfDataOut:
    """Dados prontos para copiar na emissao manual da NF (nfse.gov.br).

    Nao emite nada de verdade - so junta o valor da competencia (se ja
    definido na instancia) com os dados do tomador configurados em /config/nf.
    """
    obligation = await _get_owned_obligation(db, user, obligation_id)
    if obligation.tipo != TipoObrigacao.NF_EMISSAO:
        raise HTTPException(
            status_code=422,
            detail="Esta obrigação não é do tipo NF_EMISSAO.",
        )

    result = await db.execute(select(NfConfig).where(NfConfig.user_id == user.id))
    config = result.scalar_one_or_none()

    return NfDataOut(
        competencia=obligation.competencia,
        valor=obligation.valor if obligation.valor is not None else (config.valor_mensal if config else None),
        descricao_servico=config.descricao_servico if config else None,
        tomador_razao_social=config.tomador_razao_social if config else None,
        tomador_cnpj=config.tomador_cnpj if config else None,
        tomador_email=config.tomador_email if config else None,
    )


async def _get_owned_obligation(db: AsyncSession, user: User, obligation_id: int) -> ObligationInstance:
    result = await db.execute(
        select(ObligationInstance).where(
            ObligationInstance.id == obligation_id,
            ObligationInstance.user_id == user.id,
        )
    )
    obligation = result.scalar_one_or_none()
    if obligation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Obrigação não encontrada")
    return obligation
