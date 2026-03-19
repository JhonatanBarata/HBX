-- Formalize master assumed-context tables and enrich tech assistant history context.

ALTER TABLE "TechAssistantInteraction"
ADD COLUMN IF NOT EXISTS "companyId" INTEGER,
ADD COLUMN IF NOT EXISTS "operationMode" TEXT,
ADD COLUMN IF NOT EXISTS "module" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'TechAssistantInteraction_companyId_fkey'
      AND table_name = 'TechAssistantInteraction'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE "TechAssistantInteraction"
      ADD CONSTRAINT "TechAssistantInteraction_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "TechAssistantInteraction_companyId_createdAt_idx"
  ON "TechAssistantInteraction"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "TechAssistantInteraction_operationMode_createdAt_idx"
  ON "TechAssistantInteraction"("operationMode", "createdAt");
CREATE INDEX IF NOT EXISTS "TechAssistantInteraction_module_createdAt_idx"
  ON "TechAssistantInteraction"("module", "createdAt");

CREATE TABLE IF NOT EXISTS "MasterAssumedContextSession" (
  "id" TEXT PRIMARY KEY,
  "masterUserId" INTEGER NOT NULL,
  "companyId" INTEGER NOT NULL,
  "reason" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "endedByUserId" INTEGER,
  CONSTRAINT "MasterAssumedContextSession_masterUserId_fkey"
    FOREIGN KEY ("masterUserId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MasterAssumedContextSession_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MasterAssumedContextSession_endedByUserId_fkey"
    FOREIGN KEY ("endedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "MasterAssumedContextSession_masterUserId_startedAt_idx"
  ON "MasterAssumedContextSession"("masterUserId", "startedAt");
CREATE INDEX IF NOT EXISTS "MasterAssumedContextSession_companyId_startedAt_idx"
  ON "MasterAssumedContextSession"("companyId", "startedAt");
CREATE INDEX IF NOT EXISTS "MasterAssumedContextSession_masterUserId_endedAt_idx"
  ON "MasterAssumedContextSession"("masterUserId", "endedAt");

CREATE TABLE IF NOT EXISTS "MasterSupportAuditLog" (
  "id" TEXT PRIMARY KEY,
  "masterUserId" INTEGER NOT NULL,
  "companyId" INTEGER,
  "assumedContextSessionId" TEXT,
  "scope" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'INFO',
  "route" TEXT,
  "metadata" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MasterSupportAuditLog_masterUserId_fkey"
    FOREIGN KEY ("masterUserId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MasterSupportAuditLog_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MasterSupportAuditLog_assumedContextSessionId_fkey"
    FOREIGN KEY ("assumedContextSessionId") REFERENCES "MasterAssumedContextSession"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "MasterSupportAuditLog_masterUserId_createdAt_idx"
  ON "MasterSupportAuditLog"("masterUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "MasterSupportAuditLog_companyId_createdAt_idx"
  ON "MasterSupportAuditLog"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "MasterSupportAuditLog_scope_action_createdAt_idx"
  ON "MasterSupportAuditLog"("scope", "action", "createdAt");
