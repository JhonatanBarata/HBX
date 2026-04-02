ALTER TABLE "Company"
ADD COLUMN "billingCycle" TEXT NOT NULL DEFAULT 'MONTHLY',
ADD COLUMN "billingCardBrand" TEXT,
ADD COLUMN "billingCardLast4" TEXT,
ADD COLUMN "billingCardHolderName" TEXT,
ADD COLUMN "billingCardExpMonth" INTEGER,
ADD COLUMN "billingCardExpYear" INTEGER,
ADD COLUMN "billingCardUpdatedAt" TIMESTAMP(3),
ADD COLUMN "manualDiscountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "freeMonths" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "MasterGlobalIntegrationConfig"
ADD COLUMN "annualPlanDiscountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;
