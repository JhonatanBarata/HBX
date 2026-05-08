CREATE TABLE IF NOT EXISTS "NightFactoryRewardClaim" (
  "id" TEXT NOT NULL,
  "userId" INTEGER,
  "companyId" INTEGER,
  "scopeKey" TEXT NOT NULL,
  "leadIdsJson" TEXT NOT NULL,
  "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "nextAvailableAt" TIMESTAMP(3) NOT NULL,
  "windowKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "metadataJson" TEXT,

  CONSTRAINT "NightFactoryRewardClaim_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "NightFactoryRewardClaim_userId_idx" ON "NightFactoryRewardClaim"("userId");
CREATE INDEX IF NOT EXISTS "NightFactoryRewardClaim_companyId_idx" ON "NightFactoryRewardClaim"("companyId");
CREATE INDEX IF NOT EXISTS "NightFactoryRewardClaim_scopeKey_claimedAt_idx" ON "NightFactoryRewardClaim"("scopeKey", "claimedAt");
CREATE INDEX IF NOT EXISTS "NightFactoryRewardClaim_scopeKey_nextAvailableAt_idx" ON "NightFactoryRewardClaim"("scopeKey", "nextAvailableAt");
CREATE INDEX IF NOT EXISTS "NightFactoryRewardClaim_windowKey_idx" ON "NightFactoryRewardClaim"("windowKey");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'NightFactoryClaim'
  ) THEN
    EXECUTE $migrate$
      INSERT INTO "NightFactoryRewardClaim" (
        "id",
        "userId",
        "companyId",
        "scopeKey",
        "leadIdsJson",
        "claimedAt",
        "nextAvailableAt",
        "windowKey",
        "createdAt",
        "updatedAt",
        "metadataJson"
      )
      SELECT
        "id",
        "userId",
        "companyId",
        "scopeKey",
        "leadIdsJson",
        COALESCE("claimedAt", "createdAt"),
        COALESCE("claimedAt", "createdAt") + INTERVAL '24 hours',
        "scopeKey" || ':' || to_char(COALESCE("claimedAt", "createdAt"), 'YYYYMMDDHH24MISS'),
        "createdAt",
        "updatedAt",
        "metadataJson"
      FROM "NightFactoryClaim"
      ON CONFLICT ("id") DO NOTHING
    $migrate$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'NightFactoryRewardClaim_userId_fkey'
  ) THEN
    ALTER TABLE "NightFactoryRewardClaim"
      ADD CONSTRAINT "NightFactoryRewardClaim_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'NightFactoryRewardClaim_companyId_fkey'
  ) THEN
    ALTER TABLE "NightFactoryRewardClaim"
      ADD CONSTRAINT "NightFactoryRewardClaim_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
