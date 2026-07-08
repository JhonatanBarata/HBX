"use client";

// ================================================================
// LOGÍSTICA-MOBILE A3 — camada de dados da aba "Clientes" do app.
// Wrappers finos sobre os endpoints QUE JÁ EXISTEM (núcleo + logística) —
// ZERO endpoint novo de escrita. Só o GET de detalhe é aditivo (nucleo/
// clientes/:id, criado no A3) pra a ficha pré-preencher a edição de PF.
//
//   · lista/busca .......... GET  /nucleo/clientes
//   · detalhe (ficha) ...... GET  /nucleo/clientes/:id   (A3, PF ou PJ)
//   · criar cliente ........ POST /nucleo/contas         (lat/lng no payload)
//   · editar dados ......... PATCH /nucleo/contas/:id
//   · forma de pagamento ... PATCH /logistica/clientes/:id/financeiro
//   · catálogo de produto .. GET  /logistica/produtos
//   · produtos do cliente .. GET/POST/PATCH /logistica/cliente-produtos
// Tipos = o contrato dos serviços (nucleo-cadastro / logistica-recorrencia).
// ================================================================

import { apiFetch } from "@/lib/api";

export type FormaPagamento = "aberto" | "mensal" | "na_hora" | "pendura";
export type MetodoPadrao = "pix" | "dinheiro";

// ── Lista (GET /nucleo/clientes) ─────────────────────────────────────────────
export interface ClienteListItem {
  id: string;
  name: string | null;
  cnpj: string | null;
  cidade: string | null;
  uf: string | null;
  isLead: boolean;
  isCliente: boolean;
  isFornecedor: boolean;
  origin: string | null;
  contatosCount: number;
}
export interface ClientesResult {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: ClienteListItem[];
}

export function listClientes(query?: string): Promise<ClientesResult> {
  const qs = query && query.trim() ? `?query=${encodeURIComponent(query.trim())}&pageSize=100` : "?pageSize=100";
  return apiFetch<ClientesResult>(`/nucleo/clientes${qs}`);
}

// ── Detalhe / ficha (GET /nucleo/clientes/:id — A3) ──────────────────────────
export interface ClienteDetail {
  id: string;
  name: string | null;
  tipo: string;
  cnpj: string | null;
  document: string | null;
  endereco: string | null;
  // B3 — partes do endereço em coluna própria (o texto composto vem em `endereco`).
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  lat: number | null;
  lng: number | null;
  // B1 — origem do pino atual (geocode | gps_cadastro | gps_entrega | null).
  geoFonte: string | null;
  whatsapp: string | null;
  email: string | null;
  isLead: boolean;
  isCliente: boolean;
  isFornecedor: boolean;
  formaPagamento: string;
  metodoPadrao: string | null;
  contabilizar: boolean;
  diaFechamento: number | null;
  limiteFiado: number | null;
  contatoPrincipalId: string | null;
}

export function getCliente(id: string): Promise<ClienteDetail> {
  return apiFetch<ClienteDetail>(`/nucleo/clientes/${encodeURIComponent(id)}`);
}

// ── Criar cliente (POST /nucleo/contas) ──────────────────────────────────────
// Só campos aceitos pelo CreateContaDto (whitelist estrito no backend).
export interface CriarClientePayload {
  nome: string;
  tipo?: "pf" | "pj";
  whatsapp?: string;
  endereco?: string;
  // B3 — partes do endereço (dupla escrita: `endereco` composto continua indo tb).
  numero?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
  lat?: number;
  lng?: number;
  // B1 — origem da coordenada acima: "geocode" (CEP→Nominatim) | "gps_cadastro"
  // ("Usar este local"). Sem isso o confirmar da entrega nunca sabe se pode
  // realimentar esse pino com o GPS de ouro da porta.
  geoFonte?: "geocode" | "gps_cadastro";
  isCliente?: boolean;
}
export interface ContaCriada {
  contaId: string;
  contatoId: string;
}

export function criarCliente(p: CriarClientePayload): Promise<ContaCriada> {
  return apiFetch<ContaCriada>(`/nucleo/contas`, {
    method: "POST",
    body: JSON.stringify({ ...p, tipo: p.tipo ?? "pf", isCliente: true }),
  });
}

// ── Editar dados da conta (PATCH /nucleo/contas/:id) ─────────────────────────
export interface EditarClientePayload {
  nome?: string;
  endereco?: string;
  // B3 — partes do endereço (dupla escrita: `endereco` composto continua indo tb).
  numero?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
  lat?: number;
  lng?: number;
  // B1 — mesma regra do CriarClientePayload acima.
  geoFonte?: "geocode" | "gps_cadastro";
}

export function editarCliente(id: string, p: EditarClientePayload): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`/nucleo/contas/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(p),
  });
}

// ── Editar o telefone/whatsapp do contato principal (PATCH /nucleo/contatos/:id) ──
export function editarContatoPrincipal(id: string, whatsapp: string): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`/nucleo/contatos/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ whatsapp }),
  });
}

// ── Forma de pagamento (PATCH /logistica/clientes/:id/financeiro) ────────────
export interface FinanceiroPayload {
  formaPagamento?: FormaPagamento;
  metodoPadrao?: MetodoPadrao | "";
  contabilizar?: boolean;
  diaFechamento?: number;
  // F1 — teto de fiado (R$). null limpa (sem limite).
  limiteFiado?: number | null;
}
export interface FinanceiroResult {
  id: string;
  formaPagamento: string;
  metodoPadrao: string | null;
  contabilizar: boolean;
  diaFechamento: number | null;
  limiteFiado: number | null;
}

export function salvarFinanceiro(id: string, p: FinanceiroPayload): Promise<FinanceiroResult> {
  return apiFetch<FinanceiroResult>(`/logistica/clientes/${encodeURIComponent(id)}/financeiro`, {
    method: "PATCH",
    body: JSON.stringify(p),
  });
}

// ── F1 — Extrato do cliente (GET /logistica/clientes/:id/extrato) ────────────
// Endpoint que JÁ existia (R2) e só era usado no ERP desktop — a ficha do app
// passa a mostrar o "quanto me deve" + as cobranças.
export interface ExtratoCharge {
  id: string;
  amount: number;
  currency: string;
  description: string;
  status: string; // pending | approved | …
  lifecycle: string; // in_progress | paid | …
  dueDate: string | null;
  sourceModule: string | null;
  entregaId: string | null;
  createdAt: string | null;
  paidAt: string | null;
}
export interface ExtratoResult {
  clienteId: string;
  nome: string | null;
  total: number;
  // saldoAberto JÁ soma pendências + mensal a fechar (aguardandoFechamento).
  saldoAberto: number;
  aguardandoFechamento: number;
  charges: ExtratoCharge[];
}

export function getExtrato(clienteId: string): Promise<ExtratoResult> {
  return apiFetch<ExtratoResult>(`/logistica/clientes/${encodeURIComponent(clienteId)}/extrato`);
}

// ── Catálogo de produtos (GET /logistica/produtos) ───────────────────────────
export interface ProdutoOption {
  id: number;
  nome: string;
  unidade: string | null;
  usaLogistica: boolean;
  precoCatalogo: number | null;
}

export function listProdutos(): Promise<ProdutoOption[]> {
  return apiFetch<ProdutoOption[]>(`/logistica/produtos`);
}

// ── Produtos do cliente (GET/POST/PATCH /logistica/cliente-produtos) ─────────
export interface ClienteProduto {
  id: string;
  customerProfileId: string;
  productId: number;
  qtdPadrao: number;
  precoAcordado: number | null;
  frequenciaDias: number | null;
  diasSemana: string | null;
  proximaData: string | null;
  ativo: boolean;
  produto: { id: number; nome: string; unidade: string | null; precoCatalogo: number | null } | null;
}

export function listClienteProdutos(customerProfileId: string): Promise<ClienteProduto[]> {
  return apiFetch<ClienteProduto[]>(`/logistica/cliente-produtos?customerProfileId=${encodeURIComponent(customerProfileId)}`);
}

export interface CriarClienteProdutoPayload {
  customerProfileId: string;
  productId: number;
  qtdPadrao?: number;
  precoAcordado?: number;
  frequenciaDias?: number;
  // Recorrência por dia da semana (convenção ISO do backend: 1=seg … 7=dom),
  // ex.: "1,3,5" = seg/qua/sex. Modo alternativo a frequenciaDias.
  diasSemana?: string;
}

export function criarClienteProduto(p: CriarClienteProdutoPayload): Promise<ClienteProduto> {
  return apiFetch<ClienteProduto>(`/logistica/cliente-produtos`, {
    method: "POST",
    body: JSON.stringify(p),
  });
}

export function toggleClienteProduto(id: string, ativo: boolean): Promise<ClienteProduto> {
  return apiFetch<ClienteProduto>(`/logistica/cliente-produtos/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ ativo }),
  });
}

// TASK 9 — remove o vínculo produto×cliente de VEZ (o "-" da UI), diferente do
// toggle acima (que só pausa com ativo=false). Hard delete no backend
// (DELETE /logistica/cliente-produtos/:id); não toca entregas já geradas.
export function excluirClienteProduto(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/logistica/cliente-produtos/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// ── helpers de exibição ──────────────────────────────────────────────────────

/** Endereço curto pro subtítulo do card (endereço — cidade/UF, sem sobra). */
export function enderecoCurtoCliente(c: { endereco?: string | null; cidade?: string | null; uf?: string | null }): string {
  const local = [c.cidade, c.uf].filter(Boolean).join("/");
  const partes = [c.endereco, local].filter((p) => p && String(p).trim());
  return partes.join(" — ");
}

/** Rótulo curto da forma de pagamento pro badge do card (sem jargão ERP). */
export function formaLabel(forma: string | null | undefined): string {
  switch (forma) {
    case "mensal":
      return "Mensal";
    case "na_hora":
      return "Na hora";
    case "pendura":
      return "Fiado";
    case "aberto":
    default:
      return "Pergunta na hora";
  }
}

/** Frequência em texto simples pro chip do produto ("a cada 3 dias" / "avulso"). */
export function frequenciaLabel(dias: number | null | undefined): string {
  if (!dias || dias <= 0) return "Avulso";
  if (dias === 1) return "Todo dia";
  if (dias === 7) return "Toda semana";
  return `A cada ${dias} dias`;
}

// Rótulos ISO (1=seg … 7=dom) na ordem natural pra exibição ("Seg, Qua, Sex").
const DIA_SEMANA_LABEL: Record<number, string> = {
  1: "Seg",
  2: "Ter",
  3: "Qua",
  4: "Qui",
  5: "Sex",
  6: "Sáb",
  7: "Dom",
};

/** "Seg, Qua, Sex" a partir da string do backend ("1,3,5"), ordenada. */
export function diasSemanaLabel(diasSemana: string | null | undefined): string {
  const dias = String(diasSemana ?? "")
    .split(",")
    .map((s) => Math.trunc(Number(s.trim())))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 7);
  const unicos = Array.from(new Set(dias)).sort((a, b) => a - b);
  return unicos.map((n) => DIA_SEMANA_LABEL[n]).join(", ");
}

/**
 * Rótulo de recorrência do produto do cliente — cobre os 2 modos:
 * dia-da-semana ("Seg, Qua, Sex") tem prioridade; senão, frequência em dias.
 */
export function recorrenciaLabel(p: {
  diasSemana?: string | null;
  frequenciaDias?: number | null;
}): string {
  const porSemana = diasSemanaLabel(p.diasSemana);
  if (porSemana) return porSemana;
  return frequenciaLabel(p.frequenciaDias);
}
