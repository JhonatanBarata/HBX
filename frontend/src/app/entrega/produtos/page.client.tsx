"use client";

// LOGÍSTICA-MOBILE A2 — aba "Produtos" (casca). Header + estado vazio honesto +
// tab bar. A4 troca o miolo por lista de produtos e form simples (nome, unidade,
// preço, usa na logística), reusando os endpoints existentes.
import { EntregaScaffold } from "../EntregaScaffold";

export function EntregaProdutos() {
  return <EntregaScaffold title="Produtos" emptyIcon="produtos" emptyTitle="Nenhum produto ainda" />;
}
