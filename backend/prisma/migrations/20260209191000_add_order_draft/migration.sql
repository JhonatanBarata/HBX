-- Add OrderDraft (minimal business object bridging conversation -> order)

CREATE TABLE IF NOT EXISTS "OrderDraft" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "companyId" INTEGER NOT NULL,
  "sessionId" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "items" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderDraft_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OrderDraft_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ConversationSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrderDraft_sessionId_key" ON "OrderDraft" ("sessionId");
CREATE INDEX IF NOT EXISTS "OrderDraft_companyId_idx" ON "OrderDraft" ("companyId");
