CREATE TABLE "CompanyCommercialEntitlement" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "key" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "source" TEXT NOT NULL DEFAULT 'system',
  "currentPeriodStart" TIMESTAMP(3),
  "currentPeriodEnd" TIMESTAMP(3),
  "metadataJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CompanyCommercialEntitlement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrialPhoneUsage" (
  "id" TEXT NOT NULL,
  "phoneNormalized" TEXT NOT NULL,
  "companyId" INTEGER,
  "firstTrialStartsAt" TIMESTAMP(3),
  "firstTrialEndsAt" TIMESTAMP(3),
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'qr_pair',
  "metadataJson" TEXT,

  CONSTRAINT "TrialPhoneUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanyCommercialEntitlement_companyId_key_key" ON "CompanyCommercialEntitlement"("companyId", "key");
CREATE INDEX "CompanyCommercialEntitlement_companyId_status_idx" ON "CompanyCommercialEntitlement"("companyId", "status");
CREATE INDEX "CompanyCommercialEntitlement_key_status_idx" ON "CompanyCommercialEntitlement"("key", "status");

CREATE UNIQUE INDEX "TrialPhoneUsage_phoneNormalized_key" ON "TrialPhoneUsage"("phoneNormalized");
CREATE INDEX "TrialPhoneUsage_companyId_idx" ON "TrialPhoneUsage"("companyId");

ALTER TABLE "CompanyCommercialEntitlement"
ADD CONSTRAINT "CompanyCommercialEntitlement_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TrialPhoneUsage"
ADD CONSTRAINT "TrialPhoneUsage_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
