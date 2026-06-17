-- Sellers Brains (17/06/2026): MasterNotice pessoal + estado de push do usuário.
-- Todas as colunas são nullable/com default → migração não-destrutiva.

ALTER TABLE "MasterNotice"
  ADD COLUMN IF NOT EXISTS "targetUserId" INTEGER,
  ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'master',
  ADD COLUMN IF NOT EXISTS "nudgeKey" TEXT,
  ADD COLUMN IF NOT EXISTS "payloadJson" TEXT;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "brainPushMutedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "MasterNotice_companyId_targetUserId_source_createdAt_idx"
  ON "MasterNotice"("companyId", "targetUserId", "source", "createdAt");
