-- RAIO-X DE CNPJ EM LOTE (HOT-04, 02/07 — docs/PLANEJAMENTOS/hot/04-enriquecimento-lote.md).
-- Histórico/estado de job de lote colado no painel Owner (:3107). ADITIVA: tabela nova isolada,
-- não toca em CnpjPublicCompany/CnpjPublicPartner nem em RadarFabricaRun/RadarMission.
-- Aplicar com `prisma migrate deploy`.

-- CreateTable
CREATE TABLE "CnpjXrayJob" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "layers" TEXT NOT NULL,
    "requestedCount" INTEGER NOT NULL DEFAULT 0,
    "validCount" INTEGER NOT NULL DEFAULT 0,
    "invalidCount" INTEGER NOT NULL DEFAULT 0,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "missionsQueued" INTEGER NOT NULL DEFAULT 0,
    "missionsDone" INTEGER NOT NULL DEFAULT 0,
    "aiDone" INTEGER NOT NULL DEFAULT 0,
    "invalidReportJson" JSONB,
    "resultFileName" TEXT,
    "resultPath" TEXT,
    "lastError" TEXT,
    "requestedByUserId" INTEGER,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CnpjXrayJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CnpjXrayJob_status_createdAt_idx" ON "CnpjXrayJob"("status", "createdAt");
