ALTER TABLE "VendasLead"
ADD COLUMN IF NOT EXISTS "assignedUserId" INTEGER,
ADD COLUMN IF NOT EXISTS "assignedByUserId" INTEGER,
ADD COLUMN IF NOT EXISTS "assignedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "commissionPercentSnapshot" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "VendasLead_assignedUserId_status_idx" ON "VendasLead"("assignedUserId", "status");
