import { Suspense } from "react";

import { EntregaFinanceiro } from "./page.client";

// W4 (PR10072026) — Financeiro fase 1 do app de entrega: "quem me deve"
// (saldos por cliente) + detalhe com extrato de entregas e baixa manual.
// Suspense por causa do useSearchParams (?cliente=ID vindo da ficha).
export default function EntregaFinanceiroPage() {
  return (
    <Suspense fallback={null}>
      <EntregaFinanceiro />
    </Suspense>
  );
}
