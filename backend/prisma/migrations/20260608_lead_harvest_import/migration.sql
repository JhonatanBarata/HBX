CREATE TABLE IF NOT EXISTS "HarvestImportBatch" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "companyId" INTEGER,
  "requestedByUserId" INTEGER,
  "sourceMode" TEXT NOT NULL,
  "sourceName" TEXT NOT NULL,
  "requestedBy" TEXT,
  "city" TEXT,
  "state" TEXT,
  "segment" TEXT,
  "targetEmails" INTEGER,
  "providersJson" TEXT NOT NULL DEFAULT '[]',
  "statsJson" TEXT,
  "status" TEXT NOT NULL DEFAULT 'received',
  "receivedCount" INTEGER NOT NULL DEFAULT 0,
  "acceptedCount" INTEGER NOT NULL DEFAULT 0,
  "rejectedCount" INTEGER NOT NULL DEFAULT 0,
  "duplicateCount" INTEGER NOT NULL DEFAULT 0,
  "negativeCount" INTEGER NOT NULL DEFAULT 0,
  "optOutCount" INTEGER NOT NULL DEFAULT 0,
  "resultJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HarvestImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "HarvestImportItem" (
  "id" TEXT NOT NULL,
  "importBatchId" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "normalizedEmail" TEXT,
  "normalizedPhone" TEXT,
  "normalizedDomain" TEXT,
  "companyName" TEXT,
  "website" TEXT,
  "sourceUrl" TEXT NOT NULL,
  "sourceProvider" TEXT NOT NULL,
  "confidence" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'accepted',
  "rejectReason" TEXT,
  "payloadJson" TEXT,
  "importedRadarLeadId" TEXT,
  "importedVendasLeadId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HarvestImportItem_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'HarvestImportItem_importBatchId_fkey'
  ) THEN
    ALTER TABLE "HarvestImportItem"
      ADD CONSTRAINT "HarvestImportItem_importBatchId_fkey"
      FOREIGN KEY ("importBatchId") REFERENCES "HarvestImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "HarvestImportBatch_batchId_key" ON "HarvestImportBatch"("batchId");
CREATE INDEX IF NOT EXISTS "HarvestImportBatch_companyId_createdAt_idx" ON "HarvestImportBatch"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "HarvestImportBatch_status_createdAt_idx" ON "HarvestImportBatch"("status", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "HarvestImportItem_importBatchId_externalId_kind_key" ON "HarvestImportItem"("importBatchId", "externalId", "kind");
CREATE INDEX IF NOT EXISTS "HarvestImportItem_normalizedEmail_idx" ON "HarvestImportItem"("normalizedEmail");
CREATE INDEX IF NOT EXISTS "HarvestImportItem_normalizedPhone_idx" ON "HarvestImportItem"("normalizedPhone");
CREATE INDEX IF NOT EXISTS "HarvestImportItem_normalizedDomain_idx" ON "HarvestImportItem"("normalizedDomain");
CREATE INDEX IF NOT EXISTS "HarvestImportItem_status_createdAt_idx" ON "HarvestImportItem"("status", "createdAt");
