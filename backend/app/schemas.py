from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr


# ---------- Auth ----------
class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    email: str


# ---------- DAS Config ----------
class DasConfigOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    valor_mensal: float | None = None
    dia_vencimento: int
    dias_antecedencia_lembrete: list[int]
    ativo: bool


class DasConfigIn(BaseModel):
    valor_mensal: float | None = None
    dia_vencimento: int
    dias_antecedencia_lembrete: list[int]
    ativo: bool


# ---------- NF Config ----------
class NfConfigOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    tomador_razao_social: str | None = None
    tomador_cnpj: str | None = None
    tomador_email: str | None = None
    descricao_servico: str | None = None
    valor_mensal: float | None = None
    dia_emissao: int
    dias_antecedencia_lembrete: list[int]
    ativo: bool


class NfConfigIn(BaseModel):
    tomador_razao_social: str | None = None
    tomador_cnpj: str | None = None
    tomador_email: str | None = None
    descricao_servico: str | None = None
    valor_mensal: float | None = None
    dia_emissao: int
    dias_antecedencia_lembrete: list[int]
    ativo: bool


# ---------- RT Recebimento Config ----------
class RtRecebimentoConfigOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    dias_prazo_pagamento: int
    dias_antecedencia_lembrete: list[int]
    ativo: bool


class RtRecebimentoConfigIn(BaseModel):
    dias_prazo_pagamento: int
    dias_antecedencia_lembrete: list[int]
    ativo: bool


# ---------- DASN-SIMEI Config ----------
class DasnSimeiConfigOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    dias_antecedencia_lembrete: list[int]
    ativo: bool


class DasnSimeiConfigIn(BaseModel):
    dias_antecedencia_lembrete: list[int]
    ativo: bool


# ---------- Faturamento anual (soma das NFs concluídas, para a DASN-SIMEI) ----------
class FaturamentoMesOut(BaseModel):
    competencia: date
    valor: float | None = None
    status: str


class FaturamentoOut(BaseModel):
    ano: int
    total: float
    meses: list[FaturamentoMesOut]


# ---------- NF data (assistente de emissão, sem automatizar o envio) ----------
class NfDataOut(BaseModel):
    competencia: date
    valor: float | None = None
    descricao_servico: str | None = None
    tomador_razao_social: str | None = None
    tomador_cnpj: str | None = None
    tomador_email: str | None = None
    portal_url: str = "https://www.nfse.gov.br"


# ---------- Obligations ----------
class ObligationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tipo: str
    competencia: date
    data_vencimento: date
    valor: float | None = None
    status: str
    concluido_em: datetime | None = None
    observacoes: str | None = None


class ObligationPatch(BaseModel):
    status: str | None = None
    observacoes: str | None = None


# ---------- Push ----------
class PushKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscribeRequest(BaseModel):
    endpoint: str
    keys: PushKeys


class PushUnsubscribeRequest(BaseModel):
    endpoint: str


class VapidPublicKeyOut(BaseModel):
    public_key: str


# ---------- Jobs ----------
class JobRunResult(BaseModel):
    processed: int
    notifications_sent: int


# ---------- Health ----------
class HealthOut(BaseModel):
    status: str
