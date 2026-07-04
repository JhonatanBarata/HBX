-- Sellers Brains (17/06/2026): MasterNotice pessoal + estado de push do usuário.
-- Todas as colunas são nullable/com default → migração não-destrutiva.

CREATE TABLE IF NOT EXISTS "MasterNotice" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "audience" TEXT NOT NULL DEFAULT 'seller',
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "tone" TEXT NOT NULL DEFAULT 'info',
  "forceSeconds" INTEGER NOT NULL DEFAULT 0,
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "createdByUserId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MasterNotice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MasterNoticeAck" (
  "id" TEXT NOT NULL,
  "noticeId" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MasterNoticeAck_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MasterNotice_companyId_fkey') THEN
    ALTER TABLE "MasterNotice"
      ADD CONSTRAINT "MasterNotice_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MasterNotice_createdByUserId_fkey') THEN
    ALTER TABLE "MasterNotice"
      ADD CONSTRAINT "MasterNotice_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MasterNoticeAck_noticeId_fkey') THEN
    ALTER TABLE "MasterNoticeAck"
      ADD CONSTRAINT "MasterNoticeAck_noticeId_fkey"
      FOREIGN KEY ("noticeId") REFERENCES "MasterNotice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MasterNoticeAck_userId_fkey') THEN
    ALTER TABLE "MasterNoticeAck"
      ADD CONSTRAINT "MasterNoticeAck_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "MasterNotice_companyId_audience_startsAt_expiresAt_idx"
  ON "MasterNotice"("companyId", "audience", "startsAt", "expiresAt");
CREATE INDEX IF NOT EXISTS "MasterNotice_companyId_createdAt_idx"
  ON "MasterNotice"("companyId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "MasterNoticeAck_noticeId_userId_key"
  ON "MasterNoticeAck"("noticeId", "userId");
CREATE INDEX IF NOT EXISTS "MasterNoticeAck_userId_acknowledgedAt_idx"
  ON "MasterNoticeAck"("userId", "acknowledgedAt");

ALTER TABLE "MasterNotice"
  ADD COLUMN IF NOT EXISTS "targetUserId" INTEGER,
  ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'master',
  ADD COLUMN IF NOT EXISTS "nudgeKey" TEXT,
  ADD COLUMN IF NOT EXISTS "payloadJson" TEXT;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "brainPushMutedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "MasterNotice_companyId_targetUserId_source_createdAt_idx"
  ON "MasterNotice"("companyId", "targetUserId", "source", "createdAt");
