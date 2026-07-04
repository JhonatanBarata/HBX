import type { Metadata } from "next";

import { LogisticaInstalarClient } from "./page.client";

export const metadata: Metadata = { title: "HBX — Logística · Instalar app" };

// LOGÍSTICA-MOBILE M9 — página do admin para distribuir o app do entregador.
// Mostra um QR (gerado no cliente, sem CDN) apontando pra URL do /entrega + o
// link copiável. O entregador escaneia no celular dele e instala o PWA na tela
// inicial. Só o admin da empresa vê (gate no client via isTenantAdmin).
export default function LogisticaInstalarPage() {
  return <LogisticaInstalarClient />;
}
