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
          boxShadow: "0 14px 36px rgba(0,0,0,.28)",
        }}
      >
        Aplicativo móvel
      </Link>
      <ConfiguracoesClient />
    </>
  );
}
