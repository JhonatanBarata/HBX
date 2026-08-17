import type { Metadata } from "next";

import { PatrimonioNaRuaClient } from "./page.client";

export const metadata: Metadata = { title: "HBX — Patrimônio na rua" };

// VASILHAME onda 2 (17/08) — "quanto casco (e quanto dinheiro) está espalhado
// pela cidade". Rota PRÓPRIA (mesmo padrão de /logistica/estoque e
// /logistica/config — não é aba do painel principal), linkada no "⋯" de
// /logistica. Leitura pura: quem MOVE casco é a ficha do cliente (injetar/
// devolver) e a entrega confirmada; esta tela só mostra o retrato.
export default function PatrimonioNaRuaPage() {
  return <PatrimonioNaRuaClient />;
}
