import type { Metadata } from "next";

import { EstoqueCargaClient } from "./page.client";

export const metadata: Metadata = { title: "HBX — Estoque de carga" };

// PR27072026 F2 (27/07, PR27072026-ROTA-3-NIVEIS) — conferência de caminhão do
// dia (carregou/vendeu/voltou). NÃO é almoxarifado/WMS: 1 tela, 2 números por
// produto. Rota PRÓPRIA (mesmo padrão de /logistica/importar e /logistica/config
// — não é aba do painel principal), linkada em /logistica ("Estoque de carga").
// Recurso ADVANCED+: o backend recusa (403) pra empresa BASIC; a tela mostra o
// motivo (ver page.client.tsx) em vez de inventar um estado "bloqueado" novo.
export default function EstoqueCargaPage() {
  return <EstoqueCargaClient />;
}
