-- Add ConversationSession entity (minimal conversation state tracking)

CREATE TABLE IF NOT EXISTS "ConversationSession" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "companyId" INTEGER NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'whatsapp',
  "from" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'NEW',
  "context" TEXT,
  "lastMessageAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConversationSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ConversationSession_companyId_from_channel_idx" ON "ConversationSession" ("companyId", "from", "channel");
CREATE INDEX IF NOT EXISTS "ConversationSession_expiresAt_idx" ON "ConversationSession" ("expiresAt");
