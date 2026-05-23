CREATE TABLE IF NOT EXISTS "VendasCommissionReceivable" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "leadId" TEXT NOT NULL,
  "sellerUserId" INTEGER,
  "linkedCompanyId" INTEGER,
  "cycleKey" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'recurring',
  "status" TEXT NOT NULL DEFAULT 'payable',
  "baseAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "commissionPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "dueAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "payoutId" TEXT,
  "source" TEXT NOT NULL DEFAULT 'hbx_recurring',
  "createdByUserId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VendasCommissionReceivable_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'VendasCommissionReceivable_companyId_fkey'
  ) THEN
    ALTER TABLE "VendasCommissionReceivable"
    ADD CONSTRAINT "VendasCommissionReceivable_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'VendasCommissionReceivable_leadId_fkey'
  ) THEN
    ALTER TABLE "VendasCommissionReceivable"
    ADD CONSTRAINT "VendasCommissionReceivable_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "VendasLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "VendasCommissionReceivable_leadId_cycleKey_kind_key" ON "VendasCommissionReceivable"("leadId", "cycleKey", "kind");
CREATE INDEX IF NOT EXISTS "VendasCommissionReceivable_companyId_status_dueAt_idx" ON "VendasCommissionReceivable"("companyId", "status", "dueAt");
CREATE INDEX IF NOT EXISTS "VendasCommissionReceivable_sellerUserId_status_dueAt_idx" ON "VendasCommissionReceivable"("sellerUserId", "status", "dueAt");
CREATE INDEX IF NOT EXISTS "VendasCommissionReceivable_linkedCompanyId_idx" ON "VendasCommissionReceivable"("linkedCompanyId");
CREATE INDEX IF NOT EXISTS "VendasCommissionReceivable_payoutId_idx" ON "VendasCommissionReceivable"("payoutId");
CREATE INDEX IF NOT EXISTS "VendasCommissionReceivable_cycleKey_idx" ON "VendasCommissionReceivable"("cycleKey");
