ALTER TABLE "SellerOnboarding"
  ADD COLUMN IF NOT EXISTS "partnerType" TEXT NOT NULL DEFAULT 'hbx_partner',
  ADD COLUMN IF NOT EXISTS "canRegisterHbxSellers" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "sellerReferralCommissionPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "referredByUserId" INTEGER,
  ADD COLUMN IF NOT EXISTS "referredByNameSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "referredByCommissionPercentSnapshot" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "SellerOnboarding_partnerType_idx" ON "SellerOnboarding"("partnerType");
CREATE INDEX IF NOT EXISTS "SellerOnboarding_referredByUserId_idx" ON "SellerOnboarding"("referredByUserId");
