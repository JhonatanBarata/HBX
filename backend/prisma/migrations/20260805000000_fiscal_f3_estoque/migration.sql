-- FISCAL F3 — estoque de produto único: EstoqueProduto + trilha imutável
-- EstoqueMovimento. Saldos 100% derivados (nunca coluna editável). ADITIVO puro.
CREATE TABLE "EstoqueProduto" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "unidade" TEXT,
    "ncm" TEXT,
    "cest" TEXT,
    "cfopSaida" TEXT,
    "csosn" TEXT,
    "logisticaProductId" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EstoqueProduto_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EstoqueProduto_companyId_logisticaProductId_key" ON "EstoqueProduto"("companyId", "logisticaProductId");
CREATE INDEX "EstoqueProduto_companyId_ativo_idx" ON "EstoqueProduto"("companyId", "ativo");

CREATE TABLE "EstoqueMovimento" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "produtoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "quantidade" DOUBLE PRECISION NOT NULL,
    "refDocumentoId" TEXT,
    "refEntregaId" TEXT,
    "refChaveNfe" TEXT,
    "refCargaDia" TEXT,
    "motivo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EstoqueMovimento_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EstoqueMovimento_companyId_tipo_refChaveNfe_produtoId_key" ON "EstoqueMovimento"("companyId", "tipo", "refChaveNfe", "produtoId");
CREATE UNIQUE INDEX "EstoqueMovimento_companyId_tipo_refEntregaId_produtoId_key" ON "EstoqueMovimento"("companyId", "tipo", "refEntregaId", "produtoId");
CREATE INDEX "EstoqueMovimento_companyId_produtoId_createdAt_idx" ON "EstoqueMovimento"("companyId", "produtoId", "createdAt");
