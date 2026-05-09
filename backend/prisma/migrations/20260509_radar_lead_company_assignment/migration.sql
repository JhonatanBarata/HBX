ALTER TABLE "RadarLeadCompanyState"
ADD COLUMN IF NOT EXISTS "assignedUserId" INTEGER,
ADD COLUMN IF NOT EXISTS "assignedByUserId" INTEGER,
ADD COLUMN IF NOT EXISTS "assignedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "RadarLeadCompanyState_assignedUserId_status_idx"
ON "RadarLeadCompanyState"("assignedUserId", "status");
