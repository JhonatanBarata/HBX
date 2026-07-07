import type { Metadata } from "next";

import { ContatosClient } from "../../contatos/page.client";

export const metadata: Metadata = { title: "HBX — Clientes" };

// Logística → "Clientes" (07/07, pedido do dono): a MESMA gestão de clientes de
// entrega que já vive na aba Contatos (view "Só clientes" + drawer Produtos /
// forma de pagamento / extrato / aviso de entrega), agora acessível direto da
// seção Logística do desktop. Zero duplicação: reusa ContatosClient travado em
// clientesOnly. A sidebar acende via META["/logistica/clientes"] (app-shell).
export default function LogisticaClientesPage() {
  return <ContatosClient clientesOnly />;
}
