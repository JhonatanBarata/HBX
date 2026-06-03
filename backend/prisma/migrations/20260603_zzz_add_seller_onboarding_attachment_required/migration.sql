ALTER TABLE "SellerOnboardingAttachment"
  ADD COLUMN IF NOT EXISTS "required" BOOLEAN NOT NULL DEFAULT false;
