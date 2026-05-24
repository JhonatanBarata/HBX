ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "canRegisterHbxSellers" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "sellerReferralCommissionPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "referredByUserId" INTEGER,
ADD COLUMN IF NOT EXISTS "referredByCommissionPercentSnapshot" DOUBLE PRECISION NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'User_referredByUserId_fkey'
  ) THEN
    ALTER TABLE "User"
    ADD CONSTRAINT "User_referredByUserId_fkey"
    FOREIGN KEY ("referredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "User_referredByUserId_idx" ON "User"("referredByUserId");
CREATE INDEX IF NOT EXISTS "User_canRegisterHbxSellers_idx" ON "User"("canRegisterHbxSellers");
