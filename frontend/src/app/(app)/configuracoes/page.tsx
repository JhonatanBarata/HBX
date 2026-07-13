import type { Metadata } from "next";
import Link from "next/link";

import { ConfiguracoesClient } from "./page.client";

export const metadata: Metadata = { title: "HBX — Configurações" };

export default function ConfiguracoesPage() {
  return (
    <>
      <Link
        href="/configuracoes/aplicativo"
        className="btn-teal"
        style={{
          position: "fixed",
          right: 22,
          bottom: 22,
          zIndex: 30,
          textDecoration: "none",
        }}
      >
        Aplicativo móvel
      </Link>
      <ConfiguracoesClient />
    </>
  );
}
