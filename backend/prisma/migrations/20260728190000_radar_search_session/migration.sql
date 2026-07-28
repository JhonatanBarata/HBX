-- REFUNDAÇÃO F1 (28/07): fila multi-cidade sai do navegador — o "trabalho do vendedor"
-- (N cidades, 1 segmento, teto e pausa automática) vira linha de banco e sobrevive a
-- F5, troca de tela, deploy e restart. Tabela ADITIVA (sem FK): revert de código não
-- exige rollback de schema.
CREATE TABLE "RadarSearchSession" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "pauseReason" TEXT,
    "segment" TEXT NOT NULL,
    "citiesJson" TEXT NOT NULL,
    "cursorIndex" INTEGER NOT NULL DEFAULT 0,
    "currentRunId" TEXT,
    "targetTotal" INTEGER NOT NULL DEFAULT 0,
    "pauseAfterLeads" INTEGER NOT NULL DEFAULT 0,
    "foundTotal" INTEGER NOT NULL DEFAULT 0,
    "foundSinceResume" INTEGER NOT NULL DEFAULT 0,
    "filtersJson" TEXT,
    "message" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RadarSearchSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RadarSearchSession_companyId_status_updatedAt_idx" ON "RadarSearchSession"("companyId", "status", "updatedAt");
CREATE INDEX "RadarSearchSession_status_updatedAt_idx" ON "RadarSearchSession"("status", "updatedAt");
