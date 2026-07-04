import type { Metadata } from "next";

import { ProdutosClient } from "./page.client";

export const metadata: Metadata = { title: "HBX — Produtos" };

// NÚCLEO-CRM N5 — catálogo de produtos do tenant (o que o vendedor vende/entrega:
// galão 20L, etc.). Reusa o módulo backend /products (kind='tenant_product') +
// campos novos unidade/usaLogistica. Kill-switch por empresa, não paywall.
export default function ProdutosPage() {
  return <ProdutosClient />;
}
