CREATE TABLE IF NOT EXISTS "HbxPartnerReferralCandidate" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "referrerUserId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "note" TEXT,
  "preferredSegmentsJson" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "reviewedByUserId" INTEGER,
  "reviewedAt" TIMESTAMP(3),
  "convertedUserId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HbxPartnerReferralCandidate_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'HbxPartnerReferralCandidate_companyId_fkey'
  ) THEN
    ALTER TABLE "HbxPartnerReferralCandidate"
    ADD CONSTRAINT "HbxPartnerReferralCandidate_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'HbxPartnerReferralCandidate_referrerUserId_fkey'
  ) THEN
    ALTER TABLE "HbxPartnerReferralCandidate"
    ADD CONSTRAINT "HbxPartnerReferralCandidate_referrerUserId_fkey"
    FOREIGN KEY ("referrerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'HbxPartnerReferralCandidate_reviewedByUserId_fkey'
  ) THEN
    ALTER TABLE "HbxPartnerReferralCandidate"
    ADD CONSTRAINT "HbxPartnerReferralCandidate_reviewedByUserId_fkey"
    FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'HbxPartnerReferralCandidate_convertedUserId_fkey'
  ) THEN
    ALTER TABLE "HbxPartnerReferralCandidate"
    ADD CONSTRAINT "HbxPartnerReferralCandidate_convertedUserId_fkey"
    FOREIGN KEY ("convertedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "HbxPartnerReferralCandidate_companyId_status_createdAt_idx"
  ON "HbxPartnerReferralCandidate"("companyId", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "HbxPartnerReferralCandidate_referrerUserId_status_idx"
  ON "HbxPartnerReferralCandidate"("referrerUserId", "status");

CREATE INDEX IF NOT EXISTS "HbxPartnerReferralCandidate_reviewedByUserId_idx"
  ON "HbxPartnerReferralCandidate"("reviewedByUserId");

CREATE INDEX IF NOT EXISTS "HbxPartnerReferralCandidate_convertedUserId_idx"
  ON "HbxPartnerReferralCandidate"("convertedUserId");
