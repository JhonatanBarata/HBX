-- B1 BALCÃO (PR04082026-BALCAO-DISTRIBUIDORA) — venda de balcão + código de
-- barras (gtin) + preço de balcão + dedup de movimento por venda. Aditivo puro.

ALTER TABLE "EstoqueProduto" ADD COLUMN IF NOT EXISTS "gtin" TEXT;
ALTER TABLE "EstoqueProduto" ADD COLUMN IF NOT EXISTS "precoBalcaoCents" INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS "EstoqueProduto_companyId_gtin_key"
  ON "EstoqueProduto"("companyId", "gtin");

ALTER TABLE "EstoqueMovimento" ADD COLUMN IF NOT EXISTS "refVendaId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "EstoqueMovimento_companyId_tipo_refVendaId_produtoId_key"
  ON "EstoqueMovimento"("companyId", "tipo", "refVendaId", "produtoId");

CREATE TABLE IF NOT EXISTS "BalcaoVenda" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "clienteId" TEXT,
  "byUserId" INTEGER,
  "pagamento" TEXT NOT NULL,
  "totalCents" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CONCLUIDA',
  "canceladaEm" TIMESTAMP(3),
  "canceladaPorId" INTEGER,
  "motivoCancelamento" TEXT,
  "financeChargeId" TEXT,
  "idempotencyKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BalcaoVenda_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "BalcaoVenda_companyId_idempotencyKey_key"
  ON "BalcaoVenda"("companyId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "BalcaoVenda_companyId_createdAt_idx"
  ON "BalcaoVenda"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "BalcaoVenda_companyId_status_createdAt_idx"
  ON "BalcaoVenda"("companyId", "status", "createdAt");

CREATE TABLE IF NOT EXISTS "BalcaoVendaItem" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "vendaId" TEXT NOT NULL,
  "produtoId" TEXT NOT NULL,
  "produtoNome" TEXT NOT NULL,
  "quantidade" DOUBLE PRECISION NOT NULL,
  "precoCents" INTEGER NOT NULL,
  "subtotalCents" INTEGER NOT NULL,
  CONSTRAINT "BalcaoVendaItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BalcaoVendaItem_vendaId_fkey" FOREIGN KEY ("vendaId")
    REFERENCES "BalcaoVenda"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "BalcaoVendaItem_companyId_vendaId_idx"
  ON "BalcaoVendaItem"("companyId", "vendaId");
