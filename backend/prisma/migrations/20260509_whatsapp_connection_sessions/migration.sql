-- Isola conversas do WebWhats por sessao/celular conectado.

CREATE TABLE IF NOT EXISTS "WhatsAppConnectionSession" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'webwhats',
  "tenantKey" TEXT NOT NULL,
  "phoneNormalized" TEXT,
  "displayPhone" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "disconnectedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadataJson" TEXT,

  CONSTRAINT "WhatsAppConnectionSession_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WhatsAppConnectionSession_companyId_fkey'
  ) THEN
    ALTER TABLE "WhatsAppConnectionSession"
      ADD CONSTRAINT "WhatsAppConnectionSession_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "Company"
  ADD COLUMN IF NOT EXISTS "currentWhatsappConnectionSessionId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Company_currentWhatsappConnectionSessionId_fkey'
  ) THEN
    ALTER TABLE "Company"
      ADD CONSTRAINT "Company_currentWhatsappConnectionSessionId_fkey"
      FOREIGN KEY ("currentWhatsappConnectionSessionId") REFERENCES "WhatsAppConnectionSession"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "Conversation"
  ADD COLUMN IF NOT EXISTS "whatsappConnectionSessionId" TEXT,
  ADD COLUMN IF NOT EXISTS "sourcePhoneNormalized" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceTenantKey" TEXT;

ALTER TABLE "Message"
  ADD COLUMN IF NOT EXISTS "whatsappConnectionSessionId" TEXT,
  ADD COLUMN IF NOT EXISTS "sourcePhoneNormalized" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceTenantKey" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Conversation_whatsappConnectionSessionId_fkey'
  ) THEN
    ALTER TABLE "Conversation"
      ADD CONSTRAINT "Conversation_whatsappConnectionSessionId_fkey"
      FOREIGN KEY ("whatsappConnectionSessionId") REFERENCES "WhatsAppConnectionSession"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Message_whatsappConnectionSessionId_fkey'
  ) THEN
    ALTER TABLE "Message"
      ADD CONSTRAINT "Message_whatsappConnectionSessionId_fkey"
      FOREIGN KEY ("whatsappConnectionSessionId") REFERENCES "WhatsAppConnectionSession"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DROP INDEX IF EXISTS "Conversation_companyId_channel_contact_key";

CREATE UNIQUE INDEX IF NOT EXISTS "Conversation_companyId_channel_contact_whatsappConnectionSessionId_key"
  ON "Conversation"("companyId", "channel", "contact", "whatsappConnectionSessionId");

CREATE INDEX IF NOT EXISTS "Company_currentWhatsappConnectionSessionId_idx"
  ON "Company"("currentWhatsappConnectionSessionId");

CREATE INDEX IF NOT EXISTS "WhatsAppConnectionSession_companyId_status_idx"
  ON "WhatsAppConnectionSession"("companyId", "status");

CREATE INDEX IF NOT EXISTS "WhatsAppConnectionSession_companyId_provider_phoneNormalized_status_idx"
  ON "WhatsAppConnectionSession"("companyId", "provider", "phoneNormalized", "status");

CREATE INDEX IF NOT EXISTS "WhatsAppConnectionSession_companyId_tenantKey_status_idx"
  ON "WhatsAppConnectionSession"("companyId", "tenantKey", "status");

CREATE INDEX IF NOT EXISTS "Conversation_companyId_channel_contact_idx"
  ON "Conversation"("companyId", "channel", "contact");

CREATE INDEX IF NOT EXISTS "Conversation_companyId_whatsappConnectionSessionId_idx"
  ON "Conversation"("companyId", "whatsappConnectionSessionId");

CREATE INDEX IF NOT EXISTS "Message_companyId_whatsappConnectionSessionId_timestamp_idx"
  ON "Message"("companyId", "whatsappConnectionSessionId", "timestamp");
