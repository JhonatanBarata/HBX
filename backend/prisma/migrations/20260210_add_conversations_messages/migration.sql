-- Add Conversation + Message models (minimal chat history)
-- Also add per-company WhatsApp Cloud API access token storage.

PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;

-- Add column to Company for tenant-specific Cloud API token
-- (SQLite compatibility: avoid IF NOT EXISTS; Prisma migrate/reset should run once per DB)
ALTER TABLE "Company" ADD COLUMN "whatsappAccessToken" TEXT;

CREATE TABLE IF NOT EXISTS "Conversation" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "companyId" INTEGER NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'whatsapp',
  "contact" TEXT NOT NULL,
  "lastMessageAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Conversation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Conversation_companyId_channel_contact_key" ON "Conversation" ("companyId", "channel", "contact");
CREATE INDEX IF NOT EXISTS "Conversation_companyId_lastMessageAt_idx" ON "Conversation" ("companyId", "lastMessageAt");

CREATE TABLE IF NOT EXISTS "Message" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "companyId" INTEGER NOT NULL,
  "conversationId" INTEGER NOT NULL,
  "direction" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RECEIVED',
  "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "provider" TEXT DEFAULT 'WHATSAPP_CLOUD',
  "providerMessageId" TEXT,
  "rawPayload" TEXT,
  "outboundMessageId" INTEGER,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Message_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Message_outboundMessageId_fkey" FOREIGN KEY ("outboundMessageId") REFERENCES "OutboundMessage" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Message_providerMessageId_key" ON "Message" ("providerMessageId");
CREATE UNIQUE INDEX IF NOT EXISTS "Message_outboundMessageId_key" ON "Message" ("outboundMessageId");
CREATE INDEX IF NOT EXISTS "Message_companyId_conversationId_timestamp_idx" ON "Message" ("companyId", "conversationId", "timestamp");

COMMIT;
PRAGMA foreign_keys=ON;
