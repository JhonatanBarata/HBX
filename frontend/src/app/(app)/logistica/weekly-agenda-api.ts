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
// S4-AVISO-DE-HORARIO — campos aditivos por parada (estimativa v1, sem OSRM).
export type AgendaAlertaJanela = "CONFLITO" | "APERTADO" | null;

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

export type AgendaCliente = {
  id: string;
  nome: string;
  endereco?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  lat?: number | null;
  lng?: number | null;
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
  cliente: AgendaCliente;
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
  cliente: AgendaCliente;
  local: AgendaAddress | null;
  itens: AgendaItem[];
  janela: AgendaWindow | null;
  tempoParadaMin: number | null;
  instrucoes: string | null;
  acesso: AgendaAccess | null;
  adicional: AgendaAdditional | null;
  origem?: AgendaMode;
  /** S4 — estimativa v1 (soma simples, sem OSRM); null só em estado defensivo, na prática sempre vem preenchido. */
  eta?: string | null;
  /** S4 — null quando a parada não tem janela (nunca inventada) ou quando o horário estimado ainda cabe folgado. */
  alertaJanela?: AgendaAlertaJanela;
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

export type AgendaSequenciaResumo = {
  id: string;
  nome: string;
  diaSemana: AgendaWeekday | null;
  totalParadas: number;
  updatedAt: string;
};

export type AgendaImportarPreview = {
  ordem: Array<{ planoId: string; clienteNome: string; posicao: number }>;
  foraDaSequencia: Array<{ planoId: string; clienteNome: string }>;
  semPlano: Array<{ clienteNome: string; endereco: string | null }>;
  ambiguos: Array<{ planoId: string; clienteNome: string; motivo: string }>;
  aplicavel: boolean;
};

export function getAgendaImportSequences(day: AgendaWeekday): Promise<AgendaSequenciaResumo[]> {
  return apiFetch<AgendaSequenciaResumo[]>(`/logistica/agenda/dias/${day}/sequencias`);
}

export function getAgendaImportPreview(day: AgendaWeekday, modeloId: string): Promise<AgendaImportarPreview> {
  return apiFetch<AgendaImportarPreview>(
    `/logistica/agenda/dias/${day}/importar-preview?modeloId=${encodeURIComponent(modeloId)}`,
  );
}

export type AgendaDivergenciaTipo = "SO_NO_PLANO" | "SO_NA_ROTA" | "DUPLICADO";

export type AgendaDivergenciaItem = {
  tipo: AgendaDivergenciaTipo;
  clienteNome: string;
  endereco: string | null;
  planoId?: string;
  detalhe: string;
};

export type AgendaDivergencias = {
  total: number;
  itens: AgendaDivergenciaItem[];
  semRotaSalva?: boolean;
};

export function getAgendaDivergencias(day: AgendaWeekday): Promise<AgendaDivergencias> {
  return apiFetch<AgendaDivergencias>(`/logistica/agenda/dias/${day}/divergencias`);
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
