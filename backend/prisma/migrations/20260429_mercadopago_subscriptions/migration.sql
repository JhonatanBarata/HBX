CREATE TABLE IF NOT EXISTS "CommercialPlanProviderMapping" (
  "id" TEXT NOT NULL,
  "planKey" TEXT NOT NULL,
  "billingCycle" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'mercadopago',
  "providerPlanId" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommercialPlanProviderMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CommercialPlanProviderMapping_planKey_billingCycle_provider_key"
ON "CommercialPlanProviderMapping"("planKey", "billingCycle", "provider");

CREATE INDEX IF NOT EXISTS "CommercialPlanProviderMapping_provider_providerPlanId_idx"
ON "CommercialPlanProviderMapping"("provider", "providerPlanId");

CREATE INDEX IF NOT EXISTS "CommercialPlanProviderMapping_active_provider_idx"
ON "CommercialPlanProviderMapping"("active", "provider");

CREATE TABLE IF NOT EXISTS "CompanySubscription" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'mercadopago',
  "providerPreapprovalId" TEXT,
  "providerPreapprovalPlanId" TEXT,
  "planKey" TEXT NOT NULL,
  "billingCycle" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "payerEmail" TEXT,
  "billingContactPhone" TEXT,
  "cardBrand" TEXT,
  "cardLast4" TEXT,
  "currentPeriodStart" TIMESTAMP(3),
  "currentPeriodEnd" TIMESTAMP(3),
  "nextBillingAt" TIMESTAMP(3),
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "canceledAt" TIMESTAMP(3),
  "lastProviderStatus" TEXT,
  "providerPayloadJson" TEXT,
  "createdByUserId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanySubscription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CompanySubscription_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "CompanySubscription_providerPreapprovalId_key"
ON "CompanySubscription"("providerPreapprovalId");

CREATE INDEX IF NOT EXISTS "CompanySubscription_companyId_status_idx"
ON "CompanySubscription"("companyId", "status");

CREATE INDEX IF NOT EXISTS "CompanySubscription_provider_providerPreapprovalPlanId_idx"
ON "CompanySubscription"("provider", "providerPreapprovalPlanId");

CREATE INDEX IF NOT EXISTS "CompanySubscription_provider_status_idx"
ON "CompanySubscription"("provider", "status");
