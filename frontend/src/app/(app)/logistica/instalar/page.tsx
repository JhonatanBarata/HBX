import type { Metadata } from "next";

import { LogisticaInstalarClient } from "./page.client";

export const metadata: Metadata = { title: "HBX — Logística · Instalar app" };

// Página do admin para distribuir o aplicativo do entregador. Mostra um QR
// (gerado no cliente, sem CDN) apontando pra tela pública /baixar + o link
// copiável. O entregador escaneia no celular dele e baixa o APK. Só o admin da
// empresa vê (gate no client via isTenantAdmin).
export default function LogisticaInstalarPage() {
  return <LogisticaInstalarClient />;
}
