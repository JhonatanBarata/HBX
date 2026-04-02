-- Historical alias kept so Prisma migrate status stays aligned with the local dev database.
-- The AUVO scaffold landed in two close iterations; this file preserves the migration name
-- already recorded in _prisma_migrations without changing the current schema shape.

ALTER TABLE "IntegrationConnection" ADD COLUMN IF NOT EXISTS "lastTestStatus" TEXT;
ALTER TABLE "IntegrationConnection" ADD COLUMN IF NOT EXISTS "lastTestMessage" TEXT;

ALTER TABLE "IntegrationSyncRun" ADD COLUMN IF NOT EXISTS "provider" TEXT;
ALTER TABLE "IntegrationSyncRun" ADD COLUMN IF NOT EXISTS "triggerType" TEXT;
ALTER TABLE "IntegrationSyncRun" ADD COLUMN IF NOT EXISTS "triggeredByUserId" INTEGER;
ALTER TABLE "IntegrationSyncRun" ADD COLUMN IF NOT EXISTS "skippedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "IntegrationSyncRun" ADD COLUMN IF NOT EXISTS "errorCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "IntegrationSyncRun" ADD COLUMN IF NOT EXISTS "errorSummary" TEXT;
ALTER TABLE "IntegrationSyncRun" ALTER COLUMN "status" SET DEFAULT 'RUNNING';

UPDATE "IntegrationSyncRun"
SET "status" = UPPER("status")
WHERE "status" IN ('running', 'success', 'error', 'partial');

CREATE TABLE IF NOT EXISTS "AuvoExternalRecord" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "connectionId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT,
    "status" TEXT,
    "scheduledStart" TIMESTAMP(3),
    "scheduledEnd" TIMESTAMP(3),
    "technicianName" TEXT,
    "customerName" TEXT,
    "sourceUpdatedAt" TIMESTAMP(3),
    "rawPayloadJson" TEXT,
    "rawPayloadSummaryJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuvoExternalRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AuvoExternalRecord_companyId_externalId_key" ON "AuvoExternalRecord"("companyId", "externalId");
CREATE INDEX IF NOT EXISTS "AuvoExternalRecord_connectionId_sourceUpdatedAt_idx" ON "AuvoExternalRecord"("connectionId", "sourceUpdatedAt");
CREATE INDEX IF NOT EXISTS "AuvoExternalRecord_companyId_status_idx" ON "AuvoExternalRecord"("companyId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "IntegrationSyncRun_connectionId_running_key" ON "IntegrationSyncRun"("connectionId") WHERE "status" = 'RUNNING';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AuvoExternalRecord_companyId_fkey') THEN
        ALTER TABLE "AuvoExternalRecord" ADD CONSTRAINT "AuvoExternalRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AuvoExternalRecord_connectionId_fkey') THEN
        ALTER TABLE "AuvoExternalRecord" ADD CONSTRAINT "AuvoExternalRecord_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
