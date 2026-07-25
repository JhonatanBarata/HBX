"use client";

import { apiFetch } from "@/lib/api";

export type AgendaWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type AgendaFrequency = "SEMANAL" | "QUINZENAL" | "INTERVALO";
export type AgendaWindowType = "RIGIDA" | "PREFERENCIAL";
export type AgendaAccessType = "TERREO" | "ESCADA" | "ELEVADOR" | "OUTRO";
export type AgendaAdditionalType = "FIXO" | "POR_UNIDADE";
export type AgendaDayAction = "PAUSAR" | "MOVER";
export type AgendaOpenDeliveriesAction = "MANTER" | "MOVER" | "CANCELAR";
export type AgendaMode = "LEGADO" | "AGENDA_V2";

export type AgendaNotice =
  | string
  | {
      codigo?: string;
      code?: string;
      mensagem?: string;
      message?: string;
      nivel?: string;
    };

export type AgendaRoute = {
  id: string;
  nome: string;
  tipo: "SEMANAL";
  ativo: boolean;
  versao: number;
};

export type AgendaAddress = {
  id: string;
  apelido: string | null;
  endereco: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  lat?: number | null;
  lng?: number | null;
  geoFonte?: string | null;
};

export type AgendaWindow = {
  inicio: string | null;
  fim: string | null;
  tipo: AgendaWindowType;
};

export type AgendaAccess = {
  tipo: AgendaAccessType;
  andares: number | null;
  temElevador: boolean | null;
  observacao: string | null;
};

export type AgendaAdditional = {
  tipo: AgendaAdditionalType;
  valor: number;
  motivo: string | null;
};

export type AgendaItem = {
  id?: string;
  productId: number;
  nome: string;
  qtd: number;
  valorUnit: number;
};

export type AgendaPlan = {
  id: string;
  revisao: number;
  ativo: boolean;
  customerProfileId: string;
  localId: string | null;
  diaSemana: AgendaWeekday;
  frequencia: AgendaFrequency;
  intervaloDias: number | null;
  proximaData: string | null;
  cliente: { id: string; nome: string };
  local: AgendaAddress | null;
  itens: AgendaItem[];
  janela: AgendaWindow | null;
  tempoParadaMin: number | null;
  instrucoes: string | null;
  acesso: AgendaAccess | null;
  adicional: AgendaAdditional | null;
  origem?: AgendaMode;
};

export type AgendaStop = {
  id: string;
  ordem: number;
  ordemTravada: boolean;
  planoEntregaId: string;
  customerProfileId: string;
  localId: string | null;
  cliente: { id: string; nome: string };
  local: AgendaAddress | null;
  itens: AgendaItem[];
  janela: AgendaWindow | null;
  tempoParadaMin: number | null;
  instrucoes: string | null;
  acesso: AgendaAccess | null;
  adicional: AgendaAdditional | null;
  origem?: AgendaMode;
};

export type AgendaMigrationStatus = {
  necessaria: boolean;
  totalVinculos: number;
  totalPlanosProjetados: number;
  avisos: AgendaNotice[];
};

export type AgendaDaySummary = {
  diaSemana: AgendaWeekday;
  nome: string;
  ativo: boolean;
  rota: AgendaRoute | null;
  totalPlanos: number;
  totalParadas: number;
  totalClientes: number;
  avisos: AgendaNotice[];
};

export type AgendaSummary = {
  modo: AgendaMode;
  agendaV2Ativa: boolean;
  migracao: AgendaMigrationStatus;
  dias: AgendaDaySummary[];
};

export type AgendaDayDetail = {
  modo: AgendaMode;
  agendaV2Ativa: boolean;
  migracao: AgendaMigrationStatus;
  diaSemana: AgendaWeekday;
  nome: string;
  ativo: boolean;
  rota: AgendaRoute | null;
  planos: AgendaPlan[];
  paradas: AgendaStop[];
  totais: {
    planos: number;
    paradas: number;
    clientes: number;
    itens: number;
  };
  avisos: AgendaNotice[];
};

export type AgendaCatalogs = {
  clientes: Array<{
    id: string;
    nome: string;
    locais: Array<AgendaAddress & { acesso: AgendaAccess | null }>;
  }>;
  produtos: Array<{
    id: number;
    nome: string;
    unidade: string | null;
    preco: number;
  }>;
};

export type AgendaPlanPayload = {
  customerProfileId: string;
  localId?: string | null;
  diaSemana: AgendaWeekday;
  frequencia: AgendaFrequency;
  intervaloDias?: number | null;
  proximaData?: string | null;
  ativo?: boolean;
  janela?: AgendaWindow | null;
  tempoParadaMin?: number | null;
  instrucoes?: string | null;
  acesso?: AgendaAccess | null;
  adicional?: AgendaAdditional | null;
  itens: Array<{
    productId: number;
    qtd: number;
    valorUnit: number;
  }>;
};

export type AgendaPlanUpdatePayload = Omit<AgendaPlanPayload, "customerProfileId">;

export type AgendaOrderPayload =
  | { planoIds: string[] }
  | { planoId: string; posicao: number }
  | { planoId: string; depoisDePlanoId: string | null };

export type AgendaActionPreview = {
  acao: AgendaDayAction;
  diaOrigem: AgendaWeekday;
  diaDestino: AgendaWeekday | null;
  dataInicio: string | null;
  planosAfetados: number;
  paradasAfetadas: number;
  entregasAgendadasAfetadas: number;
  entregasEmRotaPreservadas: number;
  entregasConcluidasPreservadas: number;
  financeiroPreservado: true;
  avisos: AgendaNotice[];
};

export type AgendaDayActionPayload = {
  idempotencyKey: string;
  acao: AgendaDayAction;
  destinoDiaSemana?: AgendaWeekday;
  dataInicio?: string;
  entregasAbertas: AgendaOpenDeliveriesAction;
};

export type AgendaDayActionResult = {
  acaoId: string;
  idempotencyKey: string;
  replayed: boolean;
  [key: string]: unknown;
};

export type AgendaLegacyPreview = {
  agendaV2Ativa: boolean;
  totalVinculos: number;
  totalPlanos: number;
  totalItens: number;
  dias: Array<{
    diaSemana: AgendaWeekday;
    totalPlanos: number;
    totalItens: number;
  }>;
  avisos: AgendaNotice[];
  podeAplicar: boolean;
};

export type AgendaLegacyApplyResult = {
  acaoId: string;
  idempotencyKey: string;
  replayed: boolean;
  planosCriados: number;
  itensCriados: number;
  rotasCriadas: number;
  rotasAproveitadas: number;
  agendaV2Ativa: true;
  avisos: AgendaNotice[];
};

export type AgendaDayPreview = {
  date: string;
  diaSemana: AgendaWeekday;
  rota: AgendaRoute | null;
  paradas: Array<AgendaStop & { ocorreNaData: boolean; avisos: AgendaNotice[] }>;
  totais: {
    paradas: number;
    itens: number;
    valor: number;
    comRestricaoHorario: number;
    comEscada: number;
  };
  avisos: AgendaNotice[];
};

export function agendaNoticeText(notice: AgendaNotice): string {
  if (typeof notice === "string") return notice;
  return notice.mensagem || notice.message || notice.codigo || notice.code || "Revise esta agenda.";
}

export function getWeeklyAgenda(): Promise<AgendaSummary> {
  return apiFetch<AgendaSummary>("/logistica/agenda");
}

export function getAgendaDay(day: AgendaWeekday): Promise<AgendaDayDetail> {
  return apiFetch<AgendaDayDetail>(`/logistica/agenda/dias/${day}`);
}

export function getAgendaCatalogs(): Promise<AgendaCatalogs> {
  return apiFetch<AgendaCatalogs>("/logistica/agenda/catalogos");
}

export function createAgendaPlan(payload: AgendaPlanPayload): Promise<AgendaPlan> {
  return apiFetch<AgendaPlan>("/logistica/agenda/planos", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAgendaPlan(id: string, payload: AgendaPlanUpdatePayload): Promise<AgendaPlan> {
  return apiFetch<AgendaPlan>(`/logistica/agenda/planos/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function updateAgendaOrder(day: AgendaWeekday, payload: AgendaOrderPayload): Promise<AgendaDayDetail> {
  return apiFetch<AgendaDayDetail>(`/logistica/agenda/dias/${day}/ordem`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function getAgendaActionPreview(
  day: AgendaWeekday,
  input: {
    acao: AgendaDayAction;
    destinoDiaSemana?: AgendaWeekday;
    dataInicio?: string;
  },
): Promise<AgendaActionPreview> {
  const params = new URLSearchParams({ acao: input.acao });
  if (input.destinoDiaSemana) params.set("destinoDiaSemana", String(input.destinoDiaSemana));
  if (input.dataInicio) params.set("dataInicio", input.dataInicio);
  return apiFetch<AgendaActionPreview>(`/logistica/agenda/dias/${day}/acao-preview?${params.toString()}`);
}

export function executeAgendaDayAction(
  day: AgendaWeekday,
  payload: AgendaDayActionPayload,
): Promise<AgendaDayActionResult> {
  return apiFetch<AgendaDayActionResult>(`/logistica/agenda/dias/${day}/acao`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getAgendaDayPreview(day: AgendaWeekday, date: string): Promise<AgendaDayPreview> {
  return apiFetch<AgendaDayPreview>(
    `/logistica/agenda/dias/${day}/previa?date=${encodeURIComponent(date)}`,
  );
}

export function getAgendaLegacyPreview(): Promise<AgendaLegacyPreview> {
  return apiFetch<AgendaLegacyPreview>("/logistica/agenda/legado/preview");
}

export function applyAgendaLegacy(idempotencyKeyValue: string): Promise<AgendaLegacyApplyResult> {
  return apiFetch<AgendaLegacyApplyResult>("/logistica/agenda/legado/aplicar", {
    method: "POST",
    body: JSON.stringify({ idempotencyKey: idempotencyKeyValue }),
  });
}
