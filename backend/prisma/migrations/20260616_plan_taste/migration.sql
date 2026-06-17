-- Degustação temporária de plano (PR16062026035)
-- O master concede um taste de plano superior por N dias; volta automático na data.
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "tastePlanKey" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "tasteRevertsAt" TIMESTAMP(3);
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "tastePreviousPlanKey" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "tasteReason" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "tasteGrantedByUserId" INTEGER;
