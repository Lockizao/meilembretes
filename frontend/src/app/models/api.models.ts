// Tipos que espelham EXATAMENTE o contrato de API do backend (DAS-MEI, Fase 1).

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  email: string;
}

export interface ErrorResponse {
  detail: string;
}

export interface DasConfig {
  valor_mensal: number | null;
  dia_vencimento: number;
  dias_antecedencia_lembrete: number[];
  ativo: boolean;
}

export interface NfConfig {
  tomador_razao_social: string | null;
  tomador_cnpj: string | null;
  tomador_email: string | null;
  descricao_servico: string | null;
  valor_mensal: number | null;
  dia_emissao: number;
  dias_antecedencia_lembrete: number[];
  ativo: boolean;
}

export interface NfData {
  competencia: string; // YYYY-MM-DD
  valor: number | null;
  descricao_servico: string | null;
  tomador_razao_social: string | null;
  tomador_cnpj: string | null;
  tomador_email: string | null;
  portal_url: string;
}

export interface RtRecebimentoConfig {
  dias_prazo_pagamento: number;
  dias_antecedencia_lembrete: number[];
  ativo: boolean;
}

export interface DasnSimeiConfig {
  dias_antecedencia_lembrete: number[];
  ativo: boolean;
}

export interface FaturamentoMes {
  competencia: string; // YYYY-MM-DD
  valor: number | null;
  status: ObligationStatus;
}

export interface Faturamento {
  ano: number;
  total: number;
  meses: FaturamentoMes[];
}

export type ObligationTipo = 'DAS' | 'NF_EMISSAO' | 'RT_RECEBIMENTO' | 'DASN_SIMEI';

export type ObligationStatus = 'PENDENTE' | 'CONCLUIDO' | 'ATRASADO' | 'CANCELADO';

export interface Obligation {
  id: number;
  tipo: ObligationTipo;
  competencia: string; // YYYY-MM-DD
  data_vencimento: string; // YYYY-MM-DD
  valor: number | null;
  status: ObligationStatus;
  concluido_em: string | null;
  observacoes: string | null;
}

export interface ObligationPatch {
  status?: 'CONCLUIDO' | 'PENDENTE';
  observacoes?: string;
}

export interface ObligationsQuery {
  tipo?: ObligationTipo;
  status?: ObligationStatus;
  from?: string;
  to?: string;
}

export interface VapidPublicKeyResponse {
  public_key: string;
}

export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface PushSubscriptionRequest {
  endpoint: string;
  keys: PushSubscriptionKeys;
}

export interface PushUnsubscribeRequest {
  endpoint: string;
}

export interface HealthResponse {
  status: string;
}
