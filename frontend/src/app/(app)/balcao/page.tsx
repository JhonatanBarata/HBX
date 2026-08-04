import type { Metadata } from "next";

import { BalcaoClient } from "./page.client";

export const metadata: Metadata = { title: "HBX — Balcão" };

// B1 BALCÃO (PR04082026-BALCAO-DISTRIBUIDORA) — frente de caixa da vertical:
// bip + botões grandes + 4 pagamentos + baixa imediata no estoque + fiado.
export default function BalcaoPage() {
  return <BalcaoClient />;
}
