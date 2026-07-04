ALTER TABLE "VendasLead"
ADD COLUMN IF NOT EXISTS "assignedUserId" INTEGER,
ADD COLUMN IF NOT EXISTS "saleStatus" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN IF NOT EXISTS "saleValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "salePlanKey" TEXT,
ADD COLUMN IF NOT EXISTS "saleConfirmedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "saleCanceledAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "commissionStatus" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN IF NOT EXISTS "commissionBaseAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "commissionAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "commissionDueAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "commissionPaidAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "commissionRecurring" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "commissionNote" TEXT,
ADD COLUMN IF NOT EXISTS "commissionLinkedCompanyId" INTEGER,
ADD COLUMN IF NOT EXISTS "commissionLinkedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "commissionAutoSyncedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "commissionSyncSource" TEXT;

CREATE INDEX IF NOT EXISTS "VendasLead_assignedUserId_commissionStatus_idx" ON "VendasLead"("assignedUserId", "commissionStatus");
CREATE INDEX IF NOT EXISTS "VendasLead_companyId_saleStatus_idx" ON "VendasLead"("companyId", "saleStatus");
CREATE INDEX IF NOT EXISTS "VendasLead_commissionLinkedCompanyId_idx" ON "VendasLead"("commissionLinkedCompanyId");
