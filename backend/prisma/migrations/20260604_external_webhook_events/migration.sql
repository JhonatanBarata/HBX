CREATE TABLE IF NOT EXISTS "ExternalWebhookEvent" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER,
  "provider" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "eventType" TEXT,
  "signatureStatus" TEXT NOT NULL DEFAULT 'unknown',
  "payloadHash" TEXT NOT NULL,
  "processedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'received',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExternalWebhookEvent_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ExternalWebhookEvent_companyId_fkey'
  ) THEN
    ALTER TABLE "ExternalWebhookEvent"
    ADD CONSTRAINT "ExternalWebhookEvent_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ExternalWebhookEvent_provider_eventId_key'
  ) THEN
    ALTER TABLE "ExternalWebhookEvent"
    ADD CONSTRAINT "ExternalWebhookEvent_provider_eventId_key" UNIQUE ("provider", "eventId");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ExternalWebhookEvent_companyId_provider_createdAt_idx"
  ON "ExternalWebhookEvent"("companyId", "provider", "createdAt");

CREATE INDEX IF NOT EXISTS "ExternalWebhookEvent_provider_status_createdAt_idx"
  ON "ExternalWebhookEvent"("provider", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "ExternalWebhookEvent_payloadHash_idx"
  ON "ExternalWebhookEvent"("payloadHash");
