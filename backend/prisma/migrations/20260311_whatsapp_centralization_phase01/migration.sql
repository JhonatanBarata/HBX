-- Phase 0 + 1: WhatsApp centralization, per-company auditing, and message tracking.

-- Stronger tenant isolation: each Meta phone_number_id can belong to only one company.
CREATE UNIQUE INDEX IF NOT EXISTS "Company_whatsappPhoneNumberId_key"
  ON "Company"("whatsappPhoneNumberId");

-- CompanyMessage (mapped table: "Message") richer tracking fields.
ALTER TABLE "Message" ADD COLUMN "contactId" TEXT;
ALTER TABLE "Message" ADD COLUMN "messageType" TEXT NOT NULL DEFAULT 'text';
ALTER TABLE "Message" ADD COLUMN "error" TEXT;
ALTER TABLE "Message" ADD COLUMN "sourceModule" TEXT;

-- Outbound queue richer tracking for template/window compliance and attribution.
ALTER TABLE "OutboundMessage" ADD COLUMN "contactId" TEXT;
ALTER TABLE "OutboundMessage" ADD COLUMN "messageType" TEXT NOT NULL DEFAULT 'text';
ALTER TABLE "OutboundMessage" ADD COLUMN "templateName" TEXT;
ALTER TABLE "OutboundMessage" ADD COLUMN "templateLanguage" TEXT;
ALTER TABLE "OutboundMessage" ADD COLUMN "templateComponents" TEXT;
ALTER TABLE "OutboundMessage" ADD COLUMN "sourceModule" TEXT;

-- Technical/functional audit trail by company.
CREATE TABLE IF NOT EXISTS "WhatsAppAuditLog" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "scope" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "level" TEXT NOT NULL DEFAULT 'INFO',
  "message" TEXT NOT NULL,
  "metadata" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppAuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "WhatsAppAuditLog_companyId_createdAt_idx"
  ON "WhatsAppAuditLog"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "WhatsAppAuditLog_companyId_scope_event_idx"
  ON "WhatsAppAuditLog"("companyId", "scope", "event");
