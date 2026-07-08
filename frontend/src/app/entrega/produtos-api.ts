"use client";

// ================================================================
// LOGÍSTICA-MOBILE A4 — camada de dados da aba "Produtos" do app.
// Wrappers finos sobre os endpoints QUE JÁ EXISTEM — ZERO endpoint novo:
//   · lista (todos, inclui inativos) .. GET    /products
//   · criar ............................ POST   /products
//   · editar ........................... PATCH  /products/:id
//   · inativar (arquivar) .............. DELETE /products/:id  (status=archived)
// O catálogo do cliente (A3) usa GET /logistica/produtos (só ativos +
// usaLogistica); aqui é o GERENCIADOR do catálogo, então lê TUDO (/products).
// Preço trafega em centavos (priceCents) — a UI mostra em reais.
// ================================================================

import { apiFetch } from "@/lib/api";

// Shape do Product retornado por /products (subconjunto que a UI usa).
export interface ProdutoItem {
  id: number;
  name: string;
  unidade: string | null;
  usaLogistica: boolean;
  price: number | null;
  priceCents: number | null;
  status: string;
}

export type UnidadeProduto = "galao" | "kg" | "un";

// Rótulo curto da unidade pro card/chip (sem jargão).
export function unidadeLabel(u: string | null | undefined): string {
  const v = String(u || "").toLowerCase();
  if (v === "galao" || v === "galão") return "Galão";
  if (v === "kg") return "kg";
  if (v === "un" || v === "unidade") return "Unidade";
  return u ? String(u) : "Unidade";
}

// Preço em reais a partir do que o backend devolve (prioriza centavos).
export function precoReais(p: { price?: number | null; priceCents?: number | null }): number {
  if (typeof p.priceCents === "number") return p.priceCents / 100;
  if (typeof p.price === "number") return p.price;
  return 0;
}

// "R$ 12,00" — mesmo formato do resto do app (vírgula decimal).
export function fmtPreco(reais: number): string {
  return `R$ ${Number(reais || 0).toFixed(2).replace(".", ",")}`;
}

// Lista TODOS os produtos (ativos + arquivados) pro gerenciador do app.
export function listProdutosTodos(): Promise<ProdutoItem[]> {
  return apiFetch<ProdutoItem[]>(`/products`);
}

export interface SalvarProdutoPayload {
  name: string;
  unidade: string;
  priceCents: number;
  usaLogistica: boolean;
}

export function criarProduto(p: SalvarProdutoPayload): Promise<ProdutoItem> {
  return apiFetch<ProdutoItem>(`/products`, {
    method: "POST",
    body: JSON.stringify({ ...p, kind: "tenant_product", status: "active" }),
  });
}

export function editarProduto(id: number, p: SalvarProdutoPayload): Promise<ProdutoItem> {
  return apiFetch<ProdutoItem>(`/products/${id}`, {
    method: "PATCH",
    body: JSON.stringify(p),
  });
}

// Inativar = arquivar (DELETE faz soft-archive no backend: status=archived).
export function inativarProduto(id: number): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/products/${id}`, { method: "DELETE" });
}

// TASK 8 — exclusão PERMANENTE (hard delete de verdade, não arquiva). Rota
// separada do inativar acima; some com o produto e os vínculos de cliente
// (ClienteProduto) junto — entregas já feitas continuam intactas, só perdem a
// referência ao produto apagado.
export function excluirProduto(id: number): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/products/${id}/permanent`, { method: "DELETE" });
}

// Reativar um produto arquivado (PATCH status=active) — o par do inativar.
export function reativarProduto(id: number): Promise<ProdutoItem> {
  return apiFetch<ProdutoItem>(`/products/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "active" }),
  });
}
