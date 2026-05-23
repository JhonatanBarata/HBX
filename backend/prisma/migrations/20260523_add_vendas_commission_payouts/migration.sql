ALTER TABLE "VendasLead"
ADD COLUMN IF NOT EXISTS "commissionPayoutId" TEXT;

CREATE TABLE IF NOT EXISTS "VendasCommissionPayout" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "sellerUserId" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'paid',
  "leadCount" INTEGER NOT NULL DEFAULT 0,
  "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "referenceLabel" TEXT,
  "notes" TEXT,
  "paidAt" TIMESTAMP(3),
  "createdByUserId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VendasCommissionPayout_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'VendasCommissionPayout_companyId_fkey'
  ) THEN
    ALTER TABLE "VendasCommissionPayout"
    ADD CONSTRAINT "VendasCommissionPayout_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "VendasLead_commissionPayoutId_idx" ON "VendasLead"("commissionPayoutId");
CREATE INDEX IF NOT EXISTS "VendasCommissionPayout_companyId_paidAt_idx" ON "VendasCommissionPayout"("companyId", "paidAt");
CREATE INDEX IF NOT EXISTS "VendasCommissionPayout_sellerUserId_paidAt_idx" ON "VendasCommissionPayout"("sellerUserId", "paidAt");
