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

export function gerarDia(): Promise<GerarDiaResult> {
  return apiFetch<GerarDiaResult>("/logistica/gerar-dia", { method: "POST", body: JSON.stringify({}) });
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
