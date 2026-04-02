ALTER TABLE "Company"
ADD COLUMN IF NOT EXISTS "acquisitionSource" TEXT;

ALTER TABLE "Company"
ADD COLUMN IF NOT EXISTS "acquisitionSourceDetail" TEXT;

ALTER TABLE "Company"
ADD COLUMN IF NOT EXISTS "referralReferrerName" TEXT;

ALTER TABLE "Company"
ADD COLUMN IF NOT EXISTS "referralCode" TEXT;

ALTER TABLE "Company"
ADD COLUMN IF NOT EXISTS "referralDiscountConsumedAt" TIMESTAMP(3);

ALTER TABLE "MasterGlobalIntegrationConfig"
ADD COLUMN IF NOT EXISTS "referralDiscountActive" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "MasterGlobalIntegrationConfig"
ADD COLUMN IF NOT EXISTS "referralDiscountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "MasterGlobalIntegrationConfig"
ADD COLUMN IF NOT EXISTS "referralDiscountMode" TEXT NOT NULL DEFAULT 'ONCE';
