ALTER TABLE "Company"
ADD COLUMN IF NOT EXISTS "onboardingStatus" TEXT NOT NULL DEFAULT 'active_paid';

ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "emailConfirmedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "emailConfirmationToken" TEXT,
ADD COLUMN IF NOT EXISTS "emailConfirmationSentAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "emailConfirmationExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "User_emailConfirmationToken_key"
ON "User"("emailConfirmationToken");

UPDATE "Company"
SET "onboardingStatus" = CASE
  WHEN COALESCE("isActive", true) = false THEN 'suspended'
  WHEN UPPER(COALESCE("paymentStatus", '')) = 'TRIAL' OR LOWER(COALESCE("subscriptionStatus", '')) = 'trialing' THEN 'active_trial'
  ELSE 'active_paid'
END;

UPDATE "User"
SET "emailConfirmedAt" = COALESCE("emailConfirmedAt", "createdAt", NOW())
WHERE "email" IS NOT NULL
  AND "emailConfirmedAt" IS NULL;
