"use client";

// ================================================================
// LOGÍSTICA-MOBILE A4 — camada de dados da GESTÃO do app (skin entrega).
// Wrappers finos sobre os endpoints QUE JÁ EXISTEM (mesmos do dashboard ERP) —
// ZERO endpoint novo:
//   · gerar entregas do dia .. POST  /logistica/gerar-dia   → { criadas, ... }
//   · resumo do dia .......... GET   /logistica/resumo-dia  → { entregues, ... }
//   · fechar o mês ........... POST  /logistica/fechar-mes  → { chargesCriados }
//   · regras (config) ........ GET/PATCH /logistica/config  → LogisticaConfig
// PATCH /config e /fechar-mes são ADMIN-only no backend; o dono do negócio de
// água loga como tenant-admin (USERMASTER), então passa. Nada aqui dispara
// WhatsApp/cobrança — isso vive no confirmar, atrás de flag.
// ================================================================

import { apiFetch } from "@/lib/api";

// ── Gerar entregas do dia ────────────────────────────────────────────────────
export interface GerarDiaResult {
  date: string;
  criadas: number;
  puladas: number;
  avancados: number;
  candidatos: number;
}

// TASK 7 — data agora é OPCIONAL: sem argumento gera hoje (comportamento antigo
// preservado), com argumento gera o dia escolhido no pop-up "Gerar entregas".
export function gerarDia(date?: string): Promise<GerarDiaResult> {
  return apiFetch<GerarDiaResult>("/logistica/gerar-dia", { method: "POST", body: JSON.stringify({ date }) });
}

// ── Preview do dia (pop-up "Gerar entregas", read-only) ──────────────────────
export interface DiaPreviewItem {
  productId: number;
  nome: string;
  qtd: number;
}

export interface DiaPreviewCliente {
  customerProfileId: string;
  nome: string;
  itens: DiaPreviewItem[];
}

export interface DiaPreview {
  date: string;
  clientes: DiaPreviewCliente[];
}

// READ-ONLY: não cria nada. Mostra quem cairia na rota daquele dia ANTES do
// dono clicar "Começar Rota" (que chama gerarDia de verdade).
export function getDiaPreview(date: string): Promise<DiaPreview> {
  return apiFetch<DiaPreview>(`/logistica/dia-preview?date=${encodeURIComponent(date)}`);
}

// ── Resumo financeiro do dia ─────────────────────────────────────────────────
export interface ResumoDia {
  date: string;
  entregues: number;
  recebidoHoje: number;
  aReceber: number;
}

export function getResumoDia(): Promise<ResumoDia> {
  return apiFetch<ResumoDia>("/logistica/resumo-dia");
}

// ── Fechar o mês (modelo mensal) ─────────────────────────────────────────────
export interface FecharMesResult {
  companyId: number;
  mesRef: string;
  faturas: unknown[];
  chargesCriados: number;
}

export function fecharMes(): Promise<FecharMesResult> {
  return apiFetch<FecharMesResult>("/logistica/fechar-mes", { method: "POST", body: JSON.stringify({}) });
}

// ── Regras (LogisticaConfig) ─────────────────────────────────────────────────
export interface LogisticaConfig {
  avisoWhatsEnabled: boolean;
  templateAviso: string | null;
  raioChegadaM: number;
  velocidadeMediaKmH: number;
  tempoParadaMin: number;
  cobrancaNaEntrega: boolean;
  moduloFinanceiroAtivo: boolean;
  moduloRecoveryAtivo: boolean;
  gerarDiaAutomatico: boolean;
  // TASK 4 — dias da semana em que a empresa trabalha. CSV ISO "1,2,3,4,5,6,7"
  // (1=segunda…7=domingo); null = sem restrição configurada ainda.
  diasTrabalho: string | null;
  // F1 — Pix direto do tenant (BR Code no app, taxa zero). Chave vazia = desligado.
  pixChave: string | null;
  pixNome: string | null;
  pixCidade: string | null;
}

export function getConfig(): Promise<LogisticaConfig> {
  return apiFetch<LogisticaConfig>("/logistica/config");
}

export function patchConfig(partial: Partial<LogisticaConfig>): Promise<LogisticaConfig> {
  return apiFetch<LogisticaConfig>("/logistica/config", {
    method: "PATCH",
    body: JSON.stringify(partial),
  });
}

// "R$ 12,00" — mesmo formato do resto do app (vírgula decimal).
export function fmtMoney(v: number): string {
  return `R$ ${Number(v || 0).toFixed(2).replace(".", ",")}`;
}
