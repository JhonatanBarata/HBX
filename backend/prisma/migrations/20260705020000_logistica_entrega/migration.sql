-- NÚCLEO-CRM N6 (05/07) — módulo LOGÍSTICA (app de entrega, cliente água).
-- 100% ADITIVO E NÃO-DESTRUTIVO: adiciona 3 colunas OPCIONAIS de CONTRATO em
-- "CustomerProfile" (config de cobrança por cliente) + cria 1 tabela nova
-- "Entrega" (o ciclo agendada→em_rota→entregue) com 2 índices + 3 FKs.
-- NÃO altera/dropa nenhuma coluna, tabela ou índice existente. Todos os defaults
-- preservam o comportamento legado. Usa "IF NOT EXISTS" p/ ser idempotente
-- (padrão dos aditivos do repo). NÃO aplicar em banco vivo por este worker.

-- 1) CustomerProfile ganha o CONTRATO de cobrança por cliente (colunas aditivas)
ALTER TABLE "CustomerProfile" ADD COLUMN IF NOT EXISTS "modeloCobranca" TEXT;
ALTER TABLE "CustomerProfile" ADD COLUMN IF NOT EXISTS "diaFechamento"  INTEGER;
ALTER TABLE "CustomerProfile" ADD COLUMN IF NOT EXISTS "precoPadrao"    DOUBLE PRECISION;

-- 2) Entrega = uma entrega (Conta + Produto? + Contato?) — tabela nova
CREATE TABLE IF NOT EXISTS "Entrega" (
    "id"                TEXT NOT NULL,
    "companyId"         INTEGER NOT NULL,
    "customerProfileId" TEXT NOT NULL,
    "contatoId"         TEXT,
    "productId"         INTEGER,
    "quantidade"        INTEGER NOT NULL DEFAULT 1,
    "valor"             DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status"            TEXT NOT NULL DEFAULT 'agendada',
    "scheduledAt"       TIMESTAMP(3),
    "startedAt"         TIMESTAMP(3),
    "deliveredAt"       TIMESTAMP(3),
    "deliveredLat"      DOUBLE PRECISION,
    "deliveredLng"      DOUBLE PRECISION,
    "cobrancaStatus"    TEXT NOT NULL DEFAULT 'pendente',
    "notes"             TEXT,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entrega_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Entrega_companyId_status_scheduledAt_idx" ON "Entrega"("companyId", "status", "scheduledAt");
CREATE INDEX IF NOT EXISTS "Entrega_companyId_customerProfileId_idx"  ON "Entrega"("companyId", "customerProfileId");

-- FKs (company + conta = CASCADE; contato + product = SET NULL, entrega sobrevive).
ALTER TABLE "Entrega" ADD CONSTRAINT "Entrega_companyId_fkey"         FOREIGN KEY ("companyId")         REFERENCES "Company"("id")         ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "Entrega" ADD CONSTRAINT "Entrega_customerProfileId_fkey" FOREIGN KEY ("customerProfileId") REFERENCES "CustomerProfile"("id") ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "Entrega" ADD CONSTRAINT "Entrega_contatoId_fkey"         FOREIGN KEY ("contatoId")         REFERENCES "Contato"("id")         ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Entrega" ADD CONSTRAINT "Entrega_productId_fkey"         FOREIGN KEY ("productId")         REFERENCES "Product"("id")         ON DELETE SET NULL ON UPDATE CASCADE;
