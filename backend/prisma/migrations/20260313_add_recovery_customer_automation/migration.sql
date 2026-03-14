ALTER TABLE "HbxRecoveryCustomer"
ADD COLUMN IF NOT EXISTS "automationEnabled" BOOLEAN NOT NULL DEFAULT true;
