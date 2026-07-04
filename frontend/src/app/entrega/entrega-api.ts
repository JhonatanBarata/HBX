"use client";

// ================================================================
// LOGÍSTICA-MOBILE M4 — camada de dados do app do entregador.
// Tipos do contrato do backend (GET /logistica/rota, /rota/iniciar,
// /entregas/:id/confirmar) + wrappers finos sobre apiFetch. SEM mock:
// o app fala com os endpoints reais (N6/M3). Estados de loading/vazio
// honestos ficam na UI.
// ================================================================

import { apiFetch } from "@/lib/api";

export type FormaPagamento = "aberto" | "mensal" | "na_hora" | "pendura" | string;
export type ReceiptMethod = "pix" | "dinheiro" | "fiado";

export interface RotaProduto {
  id: number;
  nome: string;
  unidade: string | null;
}

export interface RotaEntregaItem {
  id: string;
  qtdPrevista: number;
  qtdEntregue: number | null;
  produto: RotaProduto | null;
}

export interface RotaCliente {
  id: string;
  nome: string | null;
  endereco: string | null;
  cidade: string | null;
  uf: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  formaPagamento: FormaPagamento;
  metodoPadrao: string | null;
}

export interface RotaItem {
  id: string;
  status: string; // agendada | em_rota | entregue | cancelada
  quantidade: number;
  valor: number;
  scheduledAt: string | null;
  deliveredAt: string | null;
  deliveredLat: number | null;
  deliveredLng: number | null;
  cobrancaStatus: string;
  notes: string | null;
  cliente: RotaCliente;
  contato: { id: string; nome: string; whatsapp: string | null; phone: string | null } | null;
  produto: RotaProduto | null;
  itens: RotaEntregaItem[];
  // M3 — ordem/ETA da rota. Podem não vir se a rota não foi planejada ainda.
  rotaOrdem?: number | null;
  etaAt?: string | null;
}

export interface RotaResult {
  date: string;
  total: number;
  effectsEnabled: boolean;
  moduloFinanceiroAtivo: boolean;
  items: RotaItem[];
}

export interface PlanejarRotaResult {
  date: string;
  total: number;
  semCoordenada: number;
  distanciaTotalKm: number;
  terminoPrevisto: string | null;
  velocidadeMediaKmH: number;
  tempoParadaMin: number;
  paradas: Array<{
    id: string;
    rotaOrdem: number;
    etaAt: string | null;
    semCoordenada: boolean;
    lat: number | null;
    lng: number | null;
    status: string;
    nome: string | null;
  }>;
}

export interface ConfirmarPayload {
  lat?: number;
  lng?: number;
  receiptMethod?: ReceiptMethod;
  itens?: Array<{ id: string; qtdEntregue: number }>;
}

export function getRota(date?: string): Promise<RotaResult> {
  const qs = date ? `?date=${encodeURIComponent(date)}` : "";
  return apiFetch<RotaResult>(`/logistica/rota${qs}`);
}

export function iniciarRota(origem?: { lat: number; lng: number }): Promise<PlanejarRotaResult> {
  return apiFetch<PlanejarRotaResult>(`/logistica/rota/iniciar`, {
    method: "POST",
    body: JSON.stringify({ origemLat: origem?.lat, origemLng: origem?.lng }),
  });
}

export function confirmarEntrega(id: string, payload: ConfirmarPayload) {
  return apiFetch(`/logistica/entregas/${encodeURIComponent(id)}/confirmar`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function cancelarEntrega(id: string, motivo?: string) {
  return apiFetch(`/logistica/entregas/${encodeURIComponent(id)}/cancelar`, {
    method: "POST",
    body: JSON.stringify({ motivo }),
  });
}

// ── helpers de exibição / geo ────────────────────────────────────────────────

/** HH:MM (24h, fuso local) de um ISO — usado no ETA/término. */
export function hhmm(iso: string | null | undefined): string {
  if (!iso) return "--:--";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Endereço curto p/ subtítulo da parada. */
export function enderecoCurto(c: RotaCliente): string {
  const partes = [c.endereco, c.cidade].filter(Boolean);
  return partes.join(" — ") || "Sem endereço";
}

/** Deep-link de navegação: por coordenada (preciso) ou por endereço (fallback). */
export function mapsHref(c: RotaCliente): string {
  if (typeof c.lat === "number" && typeof c.lng === "number") {
    return `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`;
  }
  const q = [c.nome, c.endereco, c.cidade, c.uf].filter(Boolean).join(", ");
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q || "")}`;
}

/** Haversine em metros — geofence de chegada (foreground). */
export function distanciaMetros(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Resumo dos itens previstos de uma parada: "4 galões 20L". */
export function resumoItens(item: RotaItem): string {
  const src = item.itens.length > 0 ? item.itens : [];
  if (src.length === 0) {
    const q = item.quantidade || 1;
    const p = item.produto?.nome ? ` ${item.produto.nome}` : "";
    return `${q}${p}`;
  }
  return src
    .map((it) => `${it.qtdPrevista}${it.produto?.nome ? " " + it.produto.nome : ""}`)
    .join(" · ");
}

/** Só as paradas AINDA abertas (agendada|em_rota), na ordem da rota. */
export function paradasAbertas(r: RotaResult): RotaItem[] {
  return [...r.items]
    .filter((i) => i.status === "agendada" || i.status === "em_rota")
    .sort((a, b) => (a.rotaOrdem ?? 999) - (b.rotaOrdem ?? 999));
}
