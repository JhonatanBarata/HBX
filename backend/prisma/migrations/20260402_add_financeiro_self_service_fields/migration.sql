ALTER TABLE "Company"
ADD COLUMN IF NOT EXISTS "billingCycle" TEXT NOT NULL DEFAULT 'MONTHLY',
ADD COLUMN IF NOT EXISTS "billingCardBrand" TEXT,
ADD COLUMN IF NOT EXISTS "billingCardLast4" TEXT,
ADD COLUMN IF NOT EXISTS "billingCardHolderName" TEXT,
ADD COLUMN IF NOT EXISTS "billingCardExpMonth" INTEGER,
ADD COLUMN IF NOT EXISTS "billingCardExpYear" INTEGER,
ADD COLUMN IF NOT EXISTS "billingCardUpdatedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "manualDiscountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "freeMonths" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "MasterGlobalIntegrationConfig" (
  "key" TEXT NOT NULL,
  "mercadoPagoAccessToken" TEXT,
  "whatsappAccessToken" TEXT,
  "whatsappPhoneNumberId" TEXT,
  "whatsappWabaId" TEXT,
  "whatsappNumber" TEXT,
  "whatsappDisplayNumber" TEXT,
  "mercadoPagoLibrary" TEXT,
  "whatsappLibrary" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MasterGlobalIntegrationConfig_pkey" PRIMARY KEY ("key")
);

ALTER TABLE "MasterGlobalIntegrationConfig"
ADD COLUMN IF NOT EXISTS "annualPlanDiscountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;
