// MOBILE-CASCA/W2 — tipos e mapeadores compartilhados entre o modo Funil e o
// modo Buscar da tela mobile de Vendas/Leads. Espelha os tipos locais (não
// exportados) de vendas/page.client.tsx e leads/page.client.tsx — MESMO
// contrato de API, zero mudança no desktop. Mapear aqui (em vez de importar a
// função fechada dentro do componente desktop) evita qualquer acoplamento com
// o estado interno do VendasClient/LeadsClient.

import type { NegocioDetail } from "@/components/hbx/detalhes-negocio";

export type VendasBlockKey = "today" | "overdue" | "scheduled" | "closed";

export type VendasLeadMobile = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  cnpj?: string | null;
  cnae?: string | null;
  razaoSocial?: string | null;
  city: string | null;
  state: string | null;
  segment: string | null;
  opportunityScore?: number | null;
  leadTemperature?: string | null;
  status: string;
  statusLabel: string;
  returnAt: string | null;
  shortNote: string | null;
  attemptCount: number;
  closedAt: string | null;
  saleStatus?: string | null;
  saleStatusLabel?: string | null;
  saleValue: number | null;
  product: { name: string | null; priceLabel: string | null } | null;
  owner: { name: string | null } | null;
  block: VendasBlockKey;
};

export type VendasBoardResponse = {
  summary: { total: number; today: number; overdue: number; scheduled: number; closed: number };
  blocks: { today: VendasLeadMobile[]; overdue: VendasLeadMobile[]; scheduled: VendasLeadMobile[]; closed: VendasLeadMobile[] };
  canViewValues?: boolean;
} | null;

export const BLOCK_ORDER_MOBILE: { key: VendasBlockKey; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "overdue", label: "Atrasados" },
  { key: "scheduled", label: "Agendados" },
  { key: "closed", label: "Fechados" },
];

// Vista "Quadro": agrupa pela ETAPA real (status), espelhando STAGE_ORDER/
// normalizeStage do desktop (vendas/page.client.tsx) — mesmos 5 status.
export type VendasStageMobile = "novo" | "contato" | "retorno" | "qualificado" | "encerrado";
export const STAGE_ORDER_MOBILE: { key: VendasStageMobile; label: string }[] = [
  { key: "novo", label: "Prospecção" },
  { key: "contato", label: "Qualificação" },
  { key: "retorno", label: "Proposta" },
  { key: "qualificado", label: "Negociação" },
  { key: "encerrado", label: "Fechamento" },
];
export function normalizeStageMobile(status: string | null | undefined): VendasStageMobile {
  const s = String(status || "").trim().toLowerCase();
  if (s === "contato" || s === "retorno" || s === "qualificado" || s === "encerrado") return s;
  return "novo";
}

export function fmtMoneyMobile(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function vendasLeadValueLabel(lead: VendasLeadMobile, canViewValues: boolean): string {
  if (!canViewValues) return "";
  return lead.product?.priceLabel || fmtMoneyMobile(lead.saleValue) || "R$ 0";
}

/** VendasLead (board) → NegocioDetail — mesmo shape que toNegocioDetail() do
 * desktop (vendas/page.client.tsx), reduzido aos campos que o board mobile lê. */
export function vendasLeadToDetail(d: VendasLeadMobile): NegocioDetail {
  return {
    id: d.id,
    name: d.name,
    phone: d.phone,
    email: d.email,
    cnpj: d.cnpj ?? null,
    cnae: d.cnae ?? null,
    razaoSocial: d.razaoSocial ?? null,
    city: d.city,
    state: d.state,
    segment: d.segment,
    statusLabel: d.statusLabel,
    leadTemperature: d.leadTemperature,
    opportunityScore: d.opportunityScore,
    valueLabel: fmtMoneyMobile(d.saleValue) || d.product?.priceLabel || null,
    productName: d.product?.name ?? null,
    returnAt: d.returnAt,
    shortNote: d.shortNote,
    attemptCount: d.attemptCount,
    owner: d.owner ? { name: d.owner.name } : null,
    sale: d.saleStatus && d.saleStatus !== "none"
      ? { status: d.saleStatus, statusLabel: d.saleStatusLabel ?? null, valueLabel: fmtMoneyMobile(d.saleValue) }
      : null,
  };
}
