-- Execução persistente da busca/puxada do Radar.
-- A tabela guarda somente telemetria/snapshot; dados de contato continuam nas
-- fontes canônicas do lead. Migração aditiva, sem backfill ou alteração de legado.

CREATE TABLE "RadarLeadProcessRun" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "radarLeadId" TEXT,
  "mode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "idempotencyKey" TEXT,
  "stagesJson" TEXT NOT NULL DEFAULT '[]',
  "eventsJson" TEXT NOT NULL DEFAULT '[]',
  "snapshotJson" TEXT NOT NULL DEFAULT '{}',
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RadarLeadProcessRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RadarLeadProcessRun_companyId_idempotencyKey_key"
ON "RadarLeadProcessRun"("companyId", "idempotencyKey");

CREATE INDEX "RadarLeadProcessRun_companyId_status_updatedAt_idx"
ON "RadarLeadProcessRun"("companyId", "status", "updatedAt");

CREATE INDEX "RadarLeadProcessRun_companyId_userId_createdAt_idx"
ON "RadarLeadProcessRun"("companyId", "userId", "createdAt");

CREATE INDEX "RadarLeadProcessRun_companyId_radarLeadId_createdAt_idx"
ON "RadarLeadProcessRun"("companyId", "radarLeadId", "createdAt");

ALTER TABLE "RadarLeadProcessRun"
ADD CONSTRAINT "RadarLeadProcessRun_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RadarLeadProcessRun"
ADD CONSTRAINT "RadarLeadProcessRun_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RadarLeadProcessRun"
ADD CONSTRAINT "RadarLeadProcessRun_radarLeadId_fkey"
FOREIGN KEY ("radarLeadId") REFERENCES "RadarLeadPool"("id") ON DELETE SET NULL ON UPDATE CASCADE;
