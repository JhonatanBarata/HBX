CREATE TABLE IF NOT EXISTS "WhatsappConsentLedger" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "phoneNormalized" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "metadataJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsappConsentLedger_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WhatsappConsentLedger_companyId_fkey'
  ) THEN
    ALTER TABLE "WhatsappConsentLedger"
    ADD CONSTRAINT "WhatsappConsentLedger_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "WhatsappConsentLedger_companyId_phoneNormalized_status_idx"
  ON "WhatsappConsentLedger"("companyId", "phoneNormalized", "status");

CREATE INDEX IF NOT EXISTS "WhatsappConsentLedger_companyId_purpose_status_idx"
  ON "WhatsappConsentLedger"("companyId", "purpose", "status");

CREATE INDEX IF NOT EXISTS "WhatsappConsentLedger_companyId_phoneNormalized_purpose_status_idx"
  ON "WhatsappConsentLedger"("companyId", "phoneNormalized", "purpose", "status");

CREATE INDEX IF NOT EXISTS "WhatsappConsentLedger_companyId_createdAt_idx"
  ON "WhatsappConsentLedger"("companyId", "createdAt");
