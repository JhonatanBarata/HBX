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

// W6 (10/07) — pendências do cadastro que o card mostra como chip vermelho.
export type PendenciaCliente = "endereco" | "numero" | "gps" | "dia" | "whatsapp";
export const PENDENCIA_LABEL: Record<PendenciaCliente, string> = {
  endereco: "Endereço",
  numero: "Número",
  gps: "Localização",
  dia: "Dia",
  whatsapp: "WhatsApp",
};

export interface ClienteListItem {
  id: string;
  name: string | null;
  cnpj: string | null;
  phone: string | null;
  phoneNormalized: string | null;
  endereco: string | null;
  numero: string | null;
  cidade: string | null;
  uf: string | null;
  isLead: boolean;
  isCliente: boolean;
  isFornecedor: boolean;
  origin: string | null;
  contatosCount: number;
  // W6 (10/07) — contrato do W5 (backend em voo, pode aterrissar depois):
  // TODOS opcionais e consumidos fail-soft — campo ausente = comportamento atual.
  pendencias?: PendenciaCliente[];
  diasEntrega?: number[]; // ISO 1=seg … 7=dom
  duplicataDe?: { id: string; nome: string } | null;
  debitoAtual?: number; // só vem com moduloFinanceiroAtivo
  formaPagamento?: FormaPagamento;
  diaFechamento?: number | null;
  entregasCount?: number;
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

// ── MULTILOCAL 10/07 — N telefones (Contato) + N endereços (LocalEntrega) por
// conta; a COBRANÇA continua ÚNICA (por customerProfileId) — isto é só "por
// onde se fala"/"pra onde se entrega", ver docs/PLANEJAMENTOS/MULTILOCAL-10072026/
// CONTRATOS.md. Campos OPCIONAIS no ClienteDetail (fail-soft: backend sem os
// campos novos ainda = undefined, a ficha cai no comportamento de sempre).
export interface TelefoneCliente {
  id: string;
  nome: string | null;
  whatsapp: string | null;
  phone: string | null;
  isPrincipal: boolean;
}

export interface LocalCliente {
  id: string;
  apelido: string | null;
  endereco: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  lat: number | null;
  lng: number | null;
  geoFonte: string | null;
  isPrincipal: boolean;
  ativo?: boolean;
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
  // S2 COBRANÇA-WHATS — opt-out do aviso de cobrança no zap (fail-soft: backend
  // antigo sem o campo = undefined, a ficha assume o default true).
  avisarCobranca?: boolean;
  contatoPrincipalId: string | null;
  // MULTILOCAL 10/07 — principal primeiro; ausente/undefined em backend antigo.
  locais?: LocalCliente[];
  telefones?: TelefoneCliente[];
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
  // TETO DE PRECISÃO (25/07) — precisão do fix em METROS (coords.accuracy do
  // navegador). Quem decide se vira 'gps_cadastro' de verdade é o BACKEND
  // (<=60m); sem isso ele grava 'gps_impreciso' (seguro, corrigível na 1ª entrega).
  gpsAccuracy?: number;
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
  // TETO DE PRECISÃO (25/07) — mesma regra do CriarClientePayload acima.
  gpsAccuracy?: number;
}

export function editarCliente(id: string, p: EditarClientePayload): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`/nucleo/contas/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(p),
  });
}

// ── W6 — Excluir cliente de vez (DELETE /nucleo/contas/:id) ──────────────────
// 409 chega como ApiError com payload { error: 'CLIENTE_COM_DEBITO', saldo }.
export function excluirCliente(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/nucleo/contas/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// ── W6 — Merge de duplicata (POST /nucleo/contas/:id/merge) ──────────────────
// A conta `perdeId` é absorvida pela `into` (admin-only no backend).
export function mergeClientes(perdeId: string, into: string, motivo?: string): Promise<unknown> {
  return apiFetch(`/nucleo/contas/${encodeURIComponent(perdeId)}/merge`, {
    method: "POST",
    body: JSON.stringify({ into, ...(motivo ? { motivo } : {}) }),
  });
}

// ── W6 — Últimas entregas do cliente (GET /logistica/clientes/:id/entregas) ──
// Endpoint do W2 (contrato nº4): histórico paginado por cursor. W4 usa a lista
// completa no extrato do /entrega/financeiro (data/hora + itens + valor +
// desfecho do WhatsApp); a duplicidade continua usando só as 3 primeiras.
export interface ClienteEntrega {
  id: string;
  scheduledAt: string | null;
  deliveredAt: string | null;
  status: string;
  // M4: valor/valorUnit/cobrancaStatus vêm null quando o financeiro do tenant
  // está OFF (o dinheiro some do histórico; data/itens/whatsapp continuam).
  valor: number | null;
  receiptMethod?: string | null;
  cobrancaStatus?: string | null;
  // enviado | falhou | pulado | null (R4 — desfecho persistido do aviso).
  whatsappStatus?: string | null;
  whatsappMotivo?: string | null;
  itens: Array<{ produtoNome: string | null; qtd: number; valorUnit: number | null }>;
}
export function listEntregasCliente(
  id: string,
  limit = 5,
  cursor?: string | null,
): Promise<{ items: ClienteEntrega[]; nextCursor?: string | null }> {
  const qs = `?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
  return apiFetch(`/logistica/clientes/${encodeURIComponent(id)}/entregas${qs}`);
}

// ── Editar o telefone/whatsapp do contato principal (PATCH /nucleo/contatos/:id) ──
export function editarContatoPrincipal(id: string, whatsapp: string): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`/nucleo/contatos/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ whatsapp }),
  });
}

// ── MULTILOCAL 10/07 — Telefones do cliente (Contato), lista completa da ficha ──
// GET /nucleo/clientes/:id já devolve `telefones[]`; aqui só o CRUD (W-C). O
// WhatsApp do topo do editor É o principal (mesmo Contato de sempre, editado por
// editarContatoPrincipal acima) — isto aqui cobre só os OUTROS telefones.
export interface CriarTelefonePayload {
  nome?: string;
  whatsapp?: string;
  phone?: string;
  isPrincipal?: boolean;
}
// Retorno do backend é só {id} (padrão do repo pra mutation de nucleo — igual
// editarContatoPrincipal acima); quem quiser os dados atualizados recarrega a
// ficha (getCliente), não lê campo daqui.
export function criarTelefone(clienteId: string, p: CriarTelefonePayload): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`/nucleo/clientes/${encodeURIComponent(clienteId)}/telefones`, {
    method: "POST",
    body: JSON.stringify(p),
  });
}

export type EditarTelefonePayload = CriarTelefonePayload;
export function editarTelefone(id: string, p: EditarTelefonePayload): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`/nucleo/telefones/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(p),
  });
}

// 400/409 se for o único principal — o chamador mostra a mensagem do backend.
export function excluirTelefone(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/nucleo/telefones/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// ── MULTILOCAL 10/07 — Endereços do cliente (LocalEntrega), N locais/1 conta ──
// GET /nucleo/clientes/:id já devolve `locais[]` (principal primeiro). O bloco
// de endereço único do editor passa a editar o PRINCIPAL (upsert no page.client);
// aqui é o CRUD dos OUTROS locais + trocar qual é o principal (troca atômica
// no backend). A cobrança NUNCA muda — é sempre da CONTA (CONTRATOS.md).
export interface CriarLocalPayload {
  apelido?: string;
  endereco?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
  lat?: number;
  lng?: number;
  geoFonte?: "geocode" | "gps_cadastro";
  // TETO DE PRECISÃO (25/07) — mesma regra do CriarClientePayload acima.
  gpsAccuracy?: number;
  isPrincipal?: boolean;
}
// Retorno do backend é só {id} (mesmo padrão de criarTelefone/editarTelefone
// acima); quem quiser os dados atualizados recarrega a ficha (getCliente).
export function criarLocal(clienteId: string, p: CriarLocalPayload): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`/nucleo/clientes/${encodeURIComponent(clienteId)}/locais`, {
    method: "POST",
    body: JSON.stringify(p),
  });
}

export type EditarLocalPayload = CriarLocalPayload;
export function editarLocal(id: string, p: EditarLocalPayload): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`/nucleo/locais/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(p),
  });
}

// 400 se for o único local ativo com ClienteProduto ativo apontando pra ele —
// o chamador mostra a mensagem do backend.
export function excluirLocal(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/nucleo/locais/${encodeURIComponent(id)}`, {
    method: "DELETE",
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
  // S2 COBRANÇA-WHATS — opt-out do aviso de cobrança no zap (toggle da ficha).
  avisarCobranca?: boolean;
}
export interface FinanceiroResult {
  id: string;
  formaPagamento: string;
  metodoPadrao: string | null;
  contabilizar: boolean;
  diaFechamento: number | null;
  limiteFiado: number | null;
  // S2 COBRANÇA-WHATS — fail-soft: backend antigo não devolve o campo.
  avisarCobranca?: boolean;
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
  // M4: financeiro do tenant OFF → saldos null + charges []; flag no retorno.
  moduloFinanceiroAtivo: boolean;
  // saldoAberto JÁ soma pendências + mensal a fechar (aguardandoFechamento).
  saldoAberto: number | null;
  aguardandoFechamento: number | null;
  charges: ExtratoCharge[];
}

export function getExtrato(clienteId: string): Promise<ExtratoResult> {
  return apiFetch<ExtratoResult>(`/logistica/clientes/${encodeURIComponent(clienteId)}/extrato`);
}

// ── S4 — Score de fiado (GET /logistica/clientes/:id/score) ──────────────────
// DORMENTE no backend (HBX_SCORE_FIADO_ENABLED, default OFF): com a flag
// desligada o endpoint responde 404 — aqui isso vira null em SILÊNCIO (feature
// OFF = ficha sem selo, nunca erro). Admin-only no backend (LEI DO VENDEDOR);
// qualquer outra falha (403 de não-admin, rede) o chamador também engole
// (mesmo best-effort do getExtrato). v1 é informativo: nada bloqueia.
export interface ScoreFiadoInsumos {
  fechadas: number;
  emDia: number;
  atrasoLeve: number;
  atrasoGrave: number;
  vencidasEmAberto: number;
}
export interface ScoreFiadoResult {
  clienteId: string;
  moduloFinanceiroAtivo: boolean;
  // 0–100; null = sem base (historico_insuficiente) ou financeiro OFF.
  score: number | null;
  motivo: "historico_insuficiente" | "financeiro_off" | null;
  insumos: ScoreFiadoInsumos | null;
}

export function getScoreFiado(clienteId: string): Promise<ScoreFiadoResult | null> {
  return apiFetch<ScoreFiadoResult>(`/logistica/clientes/${encodeURIComponent(clienteId)}/score`).catch(
    (e: unknown) => {
      if ((e as { status?: number })?.status === 404) return null; // feature OFF/cliente sem ficha
      throw e;
    },
  );
}

/** Faixa do selo (cor via classe central .ent-score da skin entrega). */
export function faixaScoreFiado(score: number): "bom" | "medio" | "ruim" {
  if (score >= 80) return "bom";
  if (score >= 50) return "medio";
  return "ruim";
}

// ── Catálogo de produtos (GET /logistica/produtos) ───────────────────────────
export interface ProdutoOption {
  id: number;
  nome: string;
  unidade: string | null;
  usaLogistica: boolean;
  precoCatalogo?: number | null;
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
  precoAcordado?: number | null;
  frequenciaDias: number | null;
  diasSemana: string | null;
  proximaData: string | null;
  ativo: boolean;
  // MULTILOCAL 10/07 — "entregar em [local]" (default = local principal do
  // cliente); opcional/fail-soft (backend sem o campo ainda = undefined).
  localId?: string | null;
  produto: { id: number; nome: string; unidade: string | null; precoCatalogo?: number | null } | null;
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
  // MULTILOCAL 10/07 — em qual LocalEntrega do cliente este vínculo entrega.
  localId?: string;
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

// MULTILOCAL 10/07 — "entregar em [local]" de um vínculo JÁ existente (o
// create manda localId no payload de criarClienteProduto acima; isto cobre o
// UPDATE, mesmo endpoint PATCH genérico).
export function editarLocalClienteProduto(id: string, localId: string | null): Promise<ClienteProduto> {
  return apiFetch<ClienteProduto>(`/logistica/cliente-produtos/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ localId }),
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
