"use client";

// LOGÍSTICA-MOBILE A2 — aba "Clientes" (casca). Header + estado vazio honesto +
// tab bar. A3 troca o miolo por lista de clientes, busca, ficha e cadastro
// app-like (reusando os endpoints do núcleo/logística).
import { EntregaScaffold } from "../EntregaScaffold";

export function EntregaClientes() {
  return <EntregaScaffold title="Clientes" emptyIcon="clientes" emptyTitle="Nenhum cliente ainda" />;
}
