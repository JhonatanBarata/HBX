import type { Metadata } from "next";

import { LogisticaConfigClient } from "./page.client";

export const metadata: Metadata = { title: "HBX — Logística · Regras" };

// LOGÍSTICA-MOBILE M5 — regras do admin do módulo Logística.
// Editor do aviso WhatsApp "entregue" (template com variáveis + PREVIEW ao vivo),
// os toggles (avisar global, cobrança na entrega, gerar dia automático) e os
// parâmetros de rota (raio de chegada, velocidade média, tempo de parada).
// Grava em GET/PATCH /logistica/config (ADMIN-only no backend). O toggle "avisar"
// POR CLIENTE vive na ficha do cliente (aba Contatos → drawer Produtos).
export default function LogisticaConfigPage() {
  return <LogisticaConfigClient />;
}
