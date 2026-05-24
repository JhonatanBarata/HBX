CREATE TABLE IF NOT EXISTS "CompanyBillableSeatUsage" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "userId" INTEGER,
  "role" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  "startSource" TEXT,
  "endSource" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyBillableSeatUsage_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CompanyBillableSeatUsage_companyId_fkey'
  ) THEN
    ALTER TABLE "CompanyBillableSeatUsage"
    ADD CONSTRAINT "CompanyBillableSeatUsage_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CompanyBillableSeatUsage_userId_fkey'
  ) THEN
    ALTER TABLE "CompanyBillableSeatUsage"
    ADD CONSTRAINT "CompanyBillableSeatUsage_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "CompanyBillableSeatUsage_companyId_startedAt_idx"
  ON "CompanyBillableSeatUsage"("companyId", "startedAt");

CREATE INDEX IF NOT EXISTS "CompanyBillableSeatUsage_companyId_endedAt_idx"
  ON "CompanyBillableSeatUsage"("companyId", "endedAt");

CREATE INDEX IF NOT EXISTS "CompanyBillableSeatUsage_companyId_userId_endedAt_idx"
  ON "CompanyBillableSeatUsage"("companyId", "userId", "endedAt");

INSERT INTO "CompanyBillableSeatUsage"
  ("id", "companyId", "userId", "role", "startedAt", "endedAt", "startSource", "endSource", "createdAt", "updatedAt")
SELECT
  CONCAT('legacy-user-seat-', u."id") AS "id",
  u."companyId",
  u."id",
  u."role",
  u."createdAt",
  CASE
    WHEN u."isActive" = true AND u."deactivatedAt" IS NULL THEN NULL
    ELSE COALESCE(u."deactivatedAt", u."retentionUntil", u."createdAt")
  END AS "endedAt",
  'migration_backfill',
  CASE
    WHEN u."isActive" = true AND u."deactivatedAt" IS NULL THEN NULL
    ELSE 'migration_backfill'
  END AS "endSource",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User" u
JOIN "Company" c ON c."id" = u."companyId"
WHERE u."companyId" IS NOT NULL
  AND COALESCE(u."isSystemMaster", false) = false
  AND UPPER(COALESCE(u."role", 'USER')) <> 'USERMASTER'
  AND COALESCE(c."slug", '') <> 'hbx-master-whatsapp-engine'
ON CONFLICT ("id") DO NOTHING;
