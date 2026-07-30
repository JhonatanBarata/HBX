import type { Metadata } from "next";

import { ContatosClient } from "../contatos/page.client";

export const metadata: Metadata = { title: "HBX — Clientes" };

// Gestão canônica de clientes. O recorte continua usando exatamente a mesma
// fonte, regras e drawers de Contatos, apenas travado no modo clientesOnly.
export default function ClientesPage() {
  return <ContatosClient clientesOnly />;
}
