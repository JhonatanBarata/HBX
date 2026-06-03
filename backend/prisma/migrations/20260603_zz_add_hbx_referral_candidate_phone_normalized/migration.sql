ALTER TABLE "HbxPartnerReferralCandidate"
  ADD COLUMN IF NOT EXISTS "phoneNormalized" TEXT;

UPDATE "HbxPartnerReferralCandidate"
SET "phoneNormalized" = NULLIF(regexp_replace(COALESCE("phone", ''), '\D', '', 'g'), '')
WHERE "phoneNormalized" IS NULL;

CREATE INDEX IF NOT EXISTS "HbxPartnerReferralCandidate_companyId_phoneNormalized_idx"
  ON "HbxPartnerReferralCandidate"("companyId", "phoneNormalized");
