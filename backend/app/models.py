import enum
from datetime import date, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class TipoObrigacao(str, enum.Enum):
    DAS = "DAS"
    NF_EMISSAO = "NF_EMISSAO"
    RT_RECEBIMENTO = "RT_RECEBIMENTO"
    DASN_SIMEI = "DASN_SIMEI"


class StatusObrigacao(str, enum.Enum):
    PENDENTE = "PENDENTE"
    CONCLUIDO = "CONCLUIDO"
    ATRASADO = "ATRASADO"
    CANCELADO = "CANCELADO"


class CanalNotificacao(str, enum.Enum):
    WEB_PUSH = "WEB_PUSH"


class StatusNotificacao(str, enum.Enum):
    ENVIADO = "ENVIADO"
    FALHOU = "FALHOU"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    das_configs: Mapped[list["DasConfig"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    nf_configs: Mapped[list["NfConfig"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    rt_recebimento_configs: Mapped[list["RtRecebimentoConfig"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    dasn_simei_configs: Mapped[list["DasnSimeiConfig"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    obligation_instances: Mapped[list["ObligationInstance"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    push_subscriptions: Mapped[list["PushSubscription"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class DasConfig(Base):
    __tablename__ = "das_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    valor_mensal: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    dia_vencimento: Mapped[int] = mapped_column(Integer, default=20, nullable=False)
    dias_antecedencia_lembrete: Mapped[list[int]] = mapped_column(JSON, default=lambda: [5, 3, 1, 0], nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="das_configs")


class NfConfig(Base):
    """Regra de emissao mensal da NF de servico para o tomador (ex: RT Intelligence).

    Nao automatiza a emissao real no nfse.gov.br (exigiria certificado digital) -
    so guarda os dados prontos para o usuario copiar e o dia de lembrete.
    """

    __tablename__ = "nf_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    tomador_razao_social: Mapped[str | None] = mapped_column(String(255), nullable=True)
    tomador_cnpj: Mapped[str | None] = mapped_column(String(32), nullable=True)
    tomador_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    descricao_servico: Mapped[str | None] = mapped_column(Text, nullable=True)
    valor_mensal: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    dia_emissao: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    dias_antecedencia_lembrete: Mapped[list[int]] = mapped_column(JSON, default=lambda: [5, 3, 1, 0], nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="nf_configs")


class RtRecebimentoConfig(Base):
    """Regra de acompanhamento do recebimento do pagamento do tomador (RT Intelligence).

    Quando uma instancia NF_EMISSAO e marcada como concluida, o app gera (ou
    atualiza) automaticamente uma instancia RT_RECEBIMENTO vinculada, com
    vencimento = data de conclusao da NF + dias_prazo_pagamento (ver
    app/routers/obligations.py).
    """

    __tablename__ = "rt_recebimento_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    dias_prazo_pagamento: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    dias_antecedencia_lembrete: Mapped[list[int]] = mapped_column(JSON, default=lambda: [5, 3, 1, 0], nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="rt_recebimento_configs")


class DasnSimeiConfig(Base):
    """Regra de lembrete da Declaracao Anual do Simples Nacional (DASN-SIMEI).

    Prazo e fixo por lei (31/05, referente ao ano anterior) - por isso nao ha
    campo de dia aqui, so o liga/desliga e a antecedencia do lembrete.
    """

    __tablename__ = "dasn_simei_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    dias_antecedencia_lembrete: Mapped[list[int]] = mapped_column(JSON, default=lambda: [15, 7, 3, 1, 0], nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="dasn_simei_configs")


class ObligationInstance(Base):
    __tablename__ = "obligation_instances"
    # NAO e mais unique: depois de cancelar uma instancia (ex: NF emitida com
    # valor errado), pode existir uma nova para a MESMA competencia. A regra de
    # "so uma instancia ATIVA por competencia" e garantida na aplicacao (ver
    # os `exists_result` em app/services/reminders.py, que ignoram CANCELADO).
    __table_args__ = (Index("ix_obligation_user_tipo_competencia", "user_id", "tipo", "competencia"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    tipo: Mapped[TipoObrigacao] = mapped_column(Enum(TipoObrigacao), nullable=False)
    competencia: Mapped[date] = mapped_column(Date, nullable=False)
    data_vencimento: Mapped[date] = mapped_column(Date, nullable=False)
    valor: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    status: Mapped[StatusObrigacao] = mapped_column(
        Enum(StatusObrigacao), default=StatusObrigacao.PENDENTE, nullable=False
    )
    concluido_em: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    gerado_a_partir_de_id: Mapped[int | None] = mapped_column(
        ForeignKey("obligation_instances.id"), nullable=True
    )
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="obligation_instances")
    notification_logs: Mapped[list["NotificationLog"]] = relationship(
        back_populates="obligation_instance", cascade="all, delete-orphan"
    )


class NotificationLog(Base):
    __tablename__ = "notification_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    obligation_instance_id: Mapped[int] = mapped_column(ForeignKey("obligation_instances.id"), nullable=False)
    dias_antecedencia: Mapped[int] = mapped_column(Integer, nullable=False)
    canal: Mapped[CanalNotificacao] = mapped_column(Enum(CanalNotificacao), default=CanalNotificacao.WEB_PUSH, nullable=False)
    enviado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    status: Mapped[StatusNotificacao] = mapped_column(Enum(StatusNotificacao), nullable=False)

    obligation_instance: Mapped["ObligationInstance"] = relationship(back_populates="notification_logs")


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    endpoint: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    p256dh: Mapped[str] = mapped_column(Text, nullable=False)
    auth: Mapped[str] = mapped_column(Text, nullable=False)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    user: Mapped["User"] = relationship(back_populates="push_subscriptions")
