-- DISJUNTOR MENSAL do Brave (30/06 — incidente "estourou o limite de 1000").
-- Contador persistente de chamadas Brave por mês (yearMonth = "YYYY-MM"), lido/gravado pelo
-- searchBrave (radar-web-enrichment.service.ts) pra cortar duro no teto HBX_BRAVE_MONTHLY_CAP.
-- ADITIVA: tabela nova isolada, não toca em nada existente.

-- CreateTable
CREATE TABLE "BraveApiUsage" (
    "yearMonth" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BraveApiUsage_pkey" PRIMARY KEY ("yearMonth")
);
