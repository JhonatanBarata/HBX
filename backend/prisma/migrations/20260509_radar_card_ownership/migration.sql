ALTER TABLE "RadarLeadPool"
ADD COLUMN IF NOT EXISTS "ownerCompanyId" INTEGER,
ADD COLUMN IF NOT EXISTS "claimedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "RadarLeadPool_ownerCompanyId_status_idx"
ON "RadarLeadPool"("ownerCompanyId", "status");

CREATE INDEX IF NOT EXISTS "RadarLeadPool_claimedAt_idx"
ON "RadarLeadPool"("claimedAt");
