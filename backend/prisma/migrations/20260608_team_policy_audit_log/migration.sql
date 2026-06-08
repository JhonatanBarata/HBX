CREATE TABLE IF NOT EXISTS "TeamPolicyAuditLog" (
  "id" TEXT NOT NULL,
  "actorUserId" INTEGER,
  "companyId" INTEGER,
  "targetUserId" INTEGER,
  "action" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'INFO',
  "route" TEXT,
  "metadata" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TeamPolicyAuditLog_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TeamPolicyAuditLog_actorUserId_fkey'
  ) THEN
    ALTER TABLE "TeamPolicyAuditLog"
      ADD CONSTRAINT "TeamPolicyAuditLog_actorUserId_fkey"
      FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TeamPolicyAuditLog_companyId_fkey'
  ) THEN
    ALTER TABLE "TeamPolicyAuditLog"
      ADD CONSTRAINT "TeamPolicyAuditLog_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TeamPolicyAuditLog_targetUserId_fkey'
  ) THEN
    ALTER TABLE "TeamPolicyAuditLog"
      ADD CONSTRAINT "TeamPolicyAuditLog_targetUserId_fkey"
      FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "TeamPolicyAuditLog_actorUserId_createdAt_idx" ON "TeamPolicyAuditLog"("actorUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "TeamPolicyAuditLog_companyId_createdAt_idx" ON "TeamPolicyAuditLog"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "TeamPolicyAuditLog_targetUserId_createdAt_idx" ON "TeamPolicyAuditLog"("targetUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "TeamPolicyAuditLog_action_createdAt_idx" ON "TeamPolicyAuditLog"("action", "createdAt");
