import type { Metadata } from "next";

import { ContatosClient } from "./page.client";

export const metadata: Metadata = { title: "HBX — Contatos" };

// NÚCLEO-CRM N4 — janela "Contatos" (pessoas da espinha de cadastro) + criar
// cliente manual + view "Clientes" (papel). Mesma base das Empresas, recorte
// por pessoa/papel.
export default function ContatosPage() {
  return <ContatosClient />;
}
