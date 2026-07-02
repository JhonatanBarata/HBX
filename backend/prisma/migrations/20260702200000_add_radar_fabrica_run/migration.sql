-- FÁBRICA DE ENRIQUECIMENTO (F2, 02/07 — docs/PLANEJAMENTOS/ARVORE-MESTRA lane FÁBRICA).
-- Estado durável (crash-safe) de uma corrida da fábrica: linha única key='main'. A fábrica LÊ a lista
-- RFB local (CnpjPublicCompany) e enriquece TUDO via fila `enrich_lead`, SEMPRE grátis no local.
-- `paidAttempts` é a prova viva de R$0 (fica 0 no local pela trava HBX_ROLE).
-- ADITIVA: 1 tabela nova isolada, não toca em nada existente. Aplicar com `prisma migrate deploy`.

-- CreateTable
CREATE TABLE "RadarFabricaRun" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT 'main',
    "running" BOOLEAN NOT NULL DEFAULT false,
    "stopRequested" BOOLEAN NOT NULL DEFAULT false,
    "budget" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "materialized" INTEGER NOT NULL DEFAULT 0,
    "contactsWritten" INTEGER NOT NULL DEFAULT 0,
    "paidAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastLeadId" TEXT,
    "lastError" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RadarFabricaRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RadarFabricaRun_key_key" ON "RadarFabricaRun"("key");
