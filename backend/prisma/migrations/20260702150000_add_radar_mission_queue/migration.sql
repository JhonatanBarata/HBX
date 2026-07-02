-- SPRINT 4 MOTOR-RFB-FILA (02/07) — fila de missões real + plano de cobertura.
-- RadarMission: lease com TTL/heartbeat, retry com backoff (nextAttemptAt), dead-letter (status 'dead').
-- RadarCoverage: combo esgotado reabre sozinho no nextRevisitAt (evolui o freio combo-morto permanente).
-- ADITIVA: 2 tabelas novas isoladas, não toca em nada existente. Aplicar com `prisma migrate deploy`
-- (migrate dev quebrado — migration escrita à mão, padrão da casa).

-- CreateTable
CREATE TABLE "RadarMission" (
    "id" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "payloadVersion" INTEGER NOT NULL DEFAULT 1,
    "payloadJson" JSONB NOT NULL,
    "dedupeKey" TEXT,
    "correlationId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseId" TEXT,
    "leasedBy" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "lastError" TEXT,
    "resultJson" JSONB,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RadarMission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadarCoverage" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "targetType" TEXT NOT NULL DEFAULT 'pj',
    "status" TEXT NOT NULL DEFAULT 'fresh',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "approvedTotal" INTEGER NOT NULL DEFAULT 0,
    "duplicateTotal" INTEGER NOT NULL DEFAULT 0,
    "lastResultAt" TIMESTAMP(3),
    "nextRevisitAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RadarCoverage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RadarMission_stage_dedupeKey_key" ON "RadarMission"("stage", "dedupeKey");

-- CreateIndex
CREATE INDEX "RadarMission_stage_status_nextAttemptAt_idx" ON "RadarMission"("stage", "status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "RadarMission_status_leaseExpiresAt_idx" ON "RadarMission"("status", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "RadarMission_correlationId_status_idx" ON "RadarMission"("correlationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RadarCoverage_state_city_segment_targetType_key" ON "RadarCoverage"("state", "city", "segment", "targetType");

-- CreateIndex
CREATE INDEX "RadarCoverage_status_nextRevisitAt_idx" ON "RadarCoverage"("status", "nextRevisitAt");
