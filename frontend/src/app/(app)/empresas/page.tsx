import type { Metadata } from "next";

import { EmpresasClient } from "./page.client";

export const metadata: Metadata = { title: "HBX — Empresas" };

// NÚCLEO-CRM N3 — janela "Empresas" (contas PJ da espinha de cadastro).
// Read-only: lista as contas PJ (puxadas do Radar) + ficha com dados e contatos.
export default function EmpresasPage() {
  return <EmpresasClient />;
}
