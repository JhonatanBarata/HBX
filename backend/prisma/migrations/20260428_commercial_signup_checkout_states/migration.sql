ALTER TABLE "Company"
ADD COLUMN IF NOT EXISTS "selectedPlanKey" TEXT;

UPDATE "Company"
SET "selectedPlanKey" = CASE
  WHEN EXISTS (
    SELECT 1
    FROM "CompanyCommercialEntitlement" ce
    WHERE ce."companyId" = "Company"."id"
      AND ce."key" = 'bot_ia'
      AND LOWER(COALESCE(ce."status", '')) IN ('active', 'paid', 'manual')
  ) THEN 'hbx_melhor'
  WHEN COALESCE("trialModuleSelection", '') = 'vendas'
    OR EXISTS (
      SELECT 1
      FROM "CompanyCommercialEntitlement" ce
      WHERE ce."companyId" = "Company"."id"
        AND ce."key" = 'vendas'
    ) THEN 'hbx_padrao'
  ELSE "selectedPlanKey"
END
WHERE "selectedPlanKey" IS NULL;

CREATE TABLE IF NOT EXISTS "CompanyCommercialUsageLog" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "userId" INTEGER,
  "planKey" TEXT,
  "eventType" TEXT NOT NULL,
  "source" TEXT,
  "metadataJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CompanyCommercialUsageLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CompanyCommercialUsageLog_companyId_eventType_createdAt_idx"
ON "CompanyCommercialUsageLog"("companyId", "eventType", "createdAt");

CREATE INDEX IF NOT EXISTS "CompanyCommercialUsageLog_planKey_eventType_createdAt_idx"
ON "CompanyCommercialUsageLog"("planKey", "eventType", "createdAt");

ALTER TABLE "CompanyCommercialUsageLog"
DROP CONSTRAINT IF EXISTS "CompanyCommercialUsageLog_companyId_fkey";

ALTER TABLE "CompanyCommercialUsageLog"
ADD CONSTRAINT "CompanyCommercialUsageLog_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
