import type { Metadata } from "next";

import { LogisticaClient } from "./page.client";

export const metadata: Metadata = { title: "HBX — Logística" };

// NÚCLEO-CRM N6 — módulo Logística (app de entrega, cliente água). "Rota de hoje"
// mobile-first: lista de entregas → detalhe com Navegar (deep-link Waze/Maps,
// custo R$0) + Confirmar entrega (GPS via navigator.geolocation). WhatsApp
// "entregue" e cobrança rodam SÓ com HBX_LOGISTICA_ENABLED ON (default OFF).
// Kill-switch por empresa, não paywall.
export default function LogisticaPage() {
  return <LogisticaClient />;
}
