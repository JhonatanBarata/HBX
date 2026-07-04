-- NÚCLEO-CRM N5 (05/07) — catálogo de produtos do tenant.
-- 100% ADITIVO E NÃO-DESTRUTIVO: adiciona 2 colunas OPCIONAIS/com DEFAULT em
-- "Product" (o catálogo já existente, kind='tenant_product'):
--   - "unidade"      TEXT      → unidade de venda ("galão 20L", "kg", "unidade")
--   - "usaLogistica" BOOLEAN   → item entra no módulo Logística (roteiro de entrega)
-- NÃO altera/dropa nenhuma coluna, tabela ou índice existente. Os defaults
-- preservam o comportamento legado (planos do HBX / checkout seguem intactos).
-- "IF NOT EXISTS" p/ idempotência (padrão dos aditivos do repo).

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "unidade"      TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "usaLogistica" BOOLEAN NOT NULL DEFAULT false;
