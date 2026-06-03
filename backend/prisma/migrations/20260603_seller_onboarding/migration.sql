CREATE TABLE IF NOT EXISTS "SellerOnboarding" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "legalName" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "cpf" TEXT,
  "declaredAddress" TEXT,
  "commissionPercent" DOUBLE PRECISION NOT NULL DEFAULT 20,
  "commissionRecurring" BOOLEAN NOT NULL DEFAULT true,
  "commissionDueBusinessDays" INTEGER NOT NULL DEFAULT 3,
  "contractVersion" TEXT NOT NULL DEFAULT 'hbx_partner_v1',
  "contractTextSnapshot" TEXT,
  "contractSha256" TEXT,
  "emailStatus" TEXT NOT NULL DEFAULT 'not_sent',
  "emailMessageId" TEXT,
  "emailSentAt" TIMESTAMP(3),
  "archiveEmail" TEXT,
  "attachmentsDeleteAfter" TIMESTAMP(3),
  "attachmentsDeletedAt" TIMESTAMP(3),
  "createdByUserId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadataJson" TEXT,
  CONSTRAINT "SellerOnboarding_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SellerOnboardingAttachment" (
  "id" TEXT NOT NULL,
  "onboardingId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "originalFilename" TEXT NOT NULL,
  "storedFilename" TEXT NOT NULL,
  "storagePath" TEXT NOT NULL,
  "contentType" TEXT,
  "byteSize" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'temporary',
  "deleteAfter" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SellerOnboardingAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SellerOnboarding_companyId_userId_key" ON "SellerOnboarding"("companyId", "userId");
CREATE INDEX IF NOT EXISTS "SellerOnboarding_companyId_status_idx" ON "SellerOnboarding"("companyId", "status");
CREATE INDEX IF NOT EXISTS "SellerOnboarding_emailStatus_emailSentAt_idx" ON "SellerOnboarding"("emailStatus", "emailSentAt");
CREATE INDEX IF NOT EXISTS "SellerOnboarding_attachmentsDeleteAfter_attachmentsDeletedAt_idx" ON "SellerOnboarding"("attachmentsDeleteAfter", "attachmentsDeletedAt");
CREATE INDEX IF NOT EXISTS "SellerOnboardingAttachment_onboardingId_kind_idx" ON "SellerOnboardingAttachment"("onboardingId", "kind");
CREATE INDEX IF NOT EXISTS "SellerOnboardingAttachment_deleteAfter_status_idx" ON "SellerOnboardingAttachment"("deleteAfter", "status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SellerOnboarding_companyId_fkey'
  ) THEN
    ALTER TABLE "SellerOnboarding"
      ADD CONSTRAINT "SellerOnboarding_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SellerOnboarding_userId_fkey'
  ) THEN
    ALTER TABLE "SellerOnboarding"
      ADD CONSTRAINT "SellerOnboarding_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SellerOnboarding_createdByUserId_fkey'
  ) THEN
    ALTER TABLE "SellerOnboarding"
      ADD CONSTRAINT "SellerOnboarding_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SellerOnboardingAttachment_onboardingId_fkey'
  ) THEN
    ALTER TABLE "SellerOnboardingAttachment"
      ADD CONSTRAINT "SellerOnboardingAttachment_onboardingId_fkey"
      FOREIGN KEY ("onboardingId") REFERENCES "SellerOnboarding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
