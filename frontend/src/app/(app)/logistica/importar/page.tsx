import type { Metadata } from "next";

import { ImportarLogisticaClient } from "./page.client";

export const metadata: Metadata = { title: "HBX — Importar clientes" };

// F4 (27/07, PR27072026-ROTA-3-NIVEIS) — "boca única" de importação: arrastar
// arquivo, colar texto do WhatsApp/caderneta ou enviar foto, tudo numa quarentena
// (verde/vermelho) antes de virar cliente de verdade. Rota PRÓPRIA (mesmo padrão
// de /logistica/config e /logistica/instalar — não é aba do painel principal),
// linkada em /logistica (botão "Importar clientes") e em /clientes
// (substitui a entrada complicada do import genérico de planilha).
export default function ImportarLogisticaPage() {
  return <ImportarLogisticaClient />;
}
