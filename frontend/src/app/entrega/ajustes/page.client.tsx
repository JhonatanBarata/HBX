"use client";

// LOGÍSTICA-MOBILE A2 — aba "Ajustes" (casca). Header + estado vazio honesto +
// tab bar. A4 traz pra cá "Fechar mês", "Regras" e a gestão do dia (hoje card
// ERP da /logistica), com cara de app.
import { EntregaScaffold } from "../EntregaScaffold";

export function EntregaAjustes() {
  return <EntregaScaffold title="Ajustes" emptyIcon="ajustes" emptyTitle="Nada para ajustar ainda" />;
}
