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
  // F1 — preço unitário (0 = sem preço): o QR Pix da chegada recalcula o valor
  // ao vivo conforme o stepper (mesma conta que o backend faz no confirmar).
  valorUnit?: number;
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
  formaPagamento?: FormaPagamento;
  metodoPadrao?: string | null;
  // F1 — "quanto me deve" + teto de fiado (badge da folha de chegada).
  saldoAberto?: number;
  limiteFiado?: number | null;
}

export interface RotaItem {
  id: string;
  status: string; // agendada | em_rota | entregue | cancelada
  quantidade: number;
  valor?: number;
  scheduledAt: string | null;
  deliveredAt: string | null;
  deliveredLat: number | null;
  deliveredLng: number | null;
  cobrancaStatus?: string;
  notes: string | null;
  cliente: RotaCliente;
  contato: { id: string; nome: string; whatsapp: string | null; phone: string | null } | null;
  produto: RotaProduto | null;
  itens: RotaEntregaItem[];
  // M3 — ordem/ETA da rota. Podem não vir se a rota não foi planejada ainda.
  rotaOrdem?: number | null;
  etaAt?: string | null;
  // MULTILOCAL 10/07 (W-E) — apelido do LocalEntrega da parada (ex. "Loja"),
  // quando a entrega tem localId apontando pra um local com apelido; null/
  // ausente = sem apelido — o card mostra só o endereço de sempre.
  localApelido?: string | null;
  entregador?: { id: number; nome: string | null; email: string | null } | null;
  updatedAt?: string | null;
  comprovante?: {
    fotoId: string | null;
    assinaturaId: string | null;
    fotoEnviada: boolean;
    assinaturaEnviada: boolean;
    codigoGerado: boolean;
    confirmadoAt: string | null;
  } | null;
}

// F1 — Pix direto do tenant (BR Code no app). Só vem com módulo financeiro ON
// e chave configurada em Ajustes; null = nenhum QR aparece na entrega.
export interface RotaPix {
  chave: string;
  nome: string | null;
  cidade: string | null;
}

export interface RotaResult {
  date: string;
  total: number;
  effectsEnabled: boolean;
  // PR2 — o motorista recebe só a necessidade operacional de rastreamento.
  // A escolha comercial da rota permanece restrita à administração.
  routeId?: string | null;
  trackingRequired: boolean;
  trackingSessionId?: string | null;
  trackingStatus?: "ACTIVE" | "ENDED" | null;
  moduloFinanceiroAtivo?: boolean;
  pix?: RotaPix | null;
  // AVISO-CHEGANDO — o app só arma o anel de ~500m quando isto é true (evita POST
  // inútil com o recurso OFF); avisoChegandoDistanciaM é o raio configurado (m).
  avisoChegandoAtivo?: boolean;
  avisoChegandoDistanciaM?: number;
  comprovante?: ComprovanteRequisitos;
  items: RotaItem[];
}

export interface PlanejarRotaResult {
  date: string;
  total: number;
  routeId?: string | null;
  trackingRequired: boolean;
  trackingSessionId?: string | null;
  trackingStatus?: "ACTIVE" | "ENDED" | null;
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
  // B1 — precisão do GPS em metros (coords.accuracy). Decide se o backend usa
  // este ponto pra realimentar o cadastro do cliente (accuracy<=60m).
  accuracy?: number;
  receiptMethod?: ReceiptMethod;
  itens?: Array<{ id: string; qtdEntregue: number }>;
  // F2 (08/07) — produtos NOVOS incluídos/trocados na chegada (productId + qtd).
  // Preço NUNCA vai aqui — o servidor resolve pelo catálogo/ClienteProduto (regra
  // de ouro): mandar preço seria o entregador "definindo" quanto cobrar.
  novosItens?: Array<{ productId: number; qtdEntregue: number }>;
  // M8 (offline-first) — chave de idempotência (uuid). O servidor dedupe por ela:
  // reenviar a MESMA confirmação (fila offline) NÃO dispara efeito 2×.
  idempotencyKey?: string;
  comprovanteFotoId?: string;
  comprovanteAssinaturaId?: string;
  comprovanteCodigo?: string;
  /** Só vive na fila IndexedDB; confirmarEntrega remove antes de serializar. */
  comprovantesLocais?: ComprovantesLocais;
}

export interface ComprovanteRequisitos {
  fotoObrigatoria: boolean;
  assinaturaObrigatoria: boolean;
  codigoObrigatorio: boolean;
}

export interface ComprovantesLocais {
  foto?: Blob;
  assinatura?: Blob;
  codigo?: string;
}

export interface ComprovanteUploadResult { id: string }

export function uploadComprovante(
  entregaId: string,
  tipo: "foto" | "assinatura",
  file: Blob,
  clientKey?: string,
): Promise<ComprovanteUploadResult> {
  const body = new FormData();
  body.append("tipo", tipo);
  if (clientKey) body.append("clientKey", clientKey);
  body.append("file", file, tipo === "foto" ? "comprovante.jpg" : "assinatura.png");
  return apiFetch<ComprovanteUploadResult>(`/logistica/entregas/${encodeURIComponent(entregaId)}/comprovantes`, {
    method: "POST",
    body,
  });
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

// AVULSA — cria UMA entrega fora da recorrência (cliente novo que pediu na
// hora / cliente fora do dia). O POST /logistica/entregas já existia no
// backend (N6) — o app nunca o chamava; o único caminho de criação era o
// bulk gerar-dia. scheduledAt omitido = HOJE (entra na rota do dia); valor
// omitido = o serviço resolve (preço do produto > preço padrão do cliente).
// A entrega nasce com rotaOrdem=null → fim da lista até re-planejar.
export function criarEntregaAvulsa(p: {
  customerProfileId: string;
  productId?: number;
  quantidade?: number;
  localId?: string;
}): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`/logistica/entregas`, { method: "POST", body: JSON.stringify(p) });
}

// AVULSA — re-planeja a rota do dia (mesmo motor NN+2-opt do iniciar; grava
// rotaOrdem/etaAt no backend). Usado pelo "Recalcular rota" pós-avulsa.
export function planejarRota(origem?: { lat: number; lng: number }): Promise<PlanejarRotaResult> {
  return apiFetch<PlanejarRotaResult>(`/logistica/rota/planejar`, {
    method: "POST",
    body: JSON.stringify({ origemLat: origem?.lat, origemLng: origem?.lng }),
  });
}

export function confirmarEntrega(id: string, payload: ConfirmarPayload) {
  const body = { ...payload, comprovantesLocais: undefined };
  return apiFetch(`/logistica/entregas/${encodeURIComponent(id)}/confirmar`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function cancelarEntrega(id: string, motivo?: string) {
  return apiFetch(`/logistica/entregas/${encodeURIComponent(id)}/cancelar`, {
    method: "POST",
    body: JSON.stringify({ motivo }),
  });
}

// AVISO-CHEGANDO — dispara o "tô chegando" (~500m) pelo caminho blindado do
// backend (trava tripla + idempotência por claim, ver logistica.service.ts).
// Fire-and-forget: o app só cruza o anel 1× por parada (useGeofence); o
// backend é quem decide enviar/pular. Engole erro — o app NUNCA reenvia.
export function avisarChegando(id: string): Promise<void> {
  return apiFetch(`/logistica/entregas/${encodeURIComponent(id)}/chegando`, { method: "POST" })
    .then(() => undefined)
    .catch(() => undefined);
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

/**
 * Deep-link de navegação: por coordenada (preciso) ou por endereço (fallback).
 * TASK 10 — o fallback NÃO manda mais o nome do cliente na busca: o nome
 * entrando na query fazia o Google Maps buscar "Dona Maria" como se fosse um
 * lugar/estabelecimento em vez de resolver o endereço.
 */
export function mapsHref(c: RotaCliente): string {
  if (typeof c.lat === "number" && typeof c.lng === "number") {
    return `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`;
  }
  const q = [c.endereco, c.cidade, c.uf].filter(Boolean).join(", ");
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`;
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

// ── dias da semana (convenção ISO 1=seg…7=dom) ───────────────────────────────
// TASKS 4/6/7 — fonte ÚNICA do rótulo/ordem de exibição (Seg..Dom): Ajustes,
// Clientes (ProdutosDoCliente) e o pop-up "Gerar entregas" (GestaoDia)
// importam daqui em vez de reimplementar cada um o seu array.
export const DIAS_SEMANA: Array<{ n: number; label: string }> = [
  { n: 1, label: "Seg" },
  { n: 2, label: "Ter" },
  { n: 3, label: "Qua" },
  { n: 4, label: "Qui" },
  { n: 5, label: "Sex" },
  { n: 6, label: "Sáb" },
  { n: 7, label: "Dom" },
];

/** CSV ISO ("1,2,7") → Set de dias válidos (1..7). CSV vazio/null → Set vazio. */
export function parseDiasTrabalho(csv: string | null | undefined): Set<number> {
  const nums = String(csv ?? "")
    .split(",")
    .map((s) => Math.trunc(Number(s.trim())))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 7);
  return new Set(nums);
}

/** DIAS_SEMANA filtrado pelo CSV de Ajustes — vazio/null (sem restrição) = os 7. */
export function diasPermitidos(diasTrabalho: string | null | undefined): Array<{ n: number; label: string }> {
  const set = parseDiasTrabalho(diasTrabalho);
  return set.size > 0 ? DIAS_SEMANA.filter((d) => set.has(d.n)) : DIAS_SEMANA;
}

/** Dia da semana ISO (1=seg…7=dom) de uma data — converte o 0=dom do JS. */
export function isoDiaSemana(d: Date): number {
  const dow = d.getDay();
  return dow === 0 ? 7 : dow;
}

/** "YYYY-MM-DD" LOCAL (nunca toISOString — foge do fuso horário do aparelho). */
export function dataLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/**
 * TASK 7 — data local (YYYY-MM-DD) do dia da semana ISO `w` (1..7) NA SEMANA
 * CORRENTE, contando a partir de "hoje": offset = (dowHoje - w + 7) % 7; data =
 * hoje - offset dias. w=hoje → hoje; w=segunda numa terça → ontem.
 */
export function dataLocalDoDiaSemana(w: number, hoje: Date = new Date()): string {
  const offset = (isoDiaSemana(hoje) - w + 7) % 7;
  const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - offset);
  return dataLocalISO(d);
}
