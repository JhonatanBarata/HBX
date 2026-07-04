ALTER TABLE "Company"
ADD COLUMN IF NOT EXISTS "commissionDueBusinessDays" INTEGER NOT NULL DEFAULT 3;

ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "sellerDistributionDailyLimitOverride" INTEGER;

CREATE TABLE IF NOT EXISTS "TeamPolicyPreset" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "scope" TEXT NOT NULL DEFAULT 'company',
  "status" TEXT NOT NULL DEFAULT 'active',
  "policyJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TeamPolicyPreset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "UserTeamPolicy" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "companyId" INTEGER,
  "presetId" TEXT,
  "referredByUserId" INTEGER,
  "policyVersion" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'active',
  "source" TEXT NOT NULL DEFAULT 'legacy_backfill',
  "roleSnapshot" TEXT,
  "subjectKind" TEXT,
  "modulesJson" TEXT,
  "commissionPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "commissionDueBusinessDays" INTEGER,
  "canRegisterHbxSellers" BOOLEAN NOT NULL DEFAULT false,
  "sellerReferralCommissionPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "referredByCommissionPercentSnapshot" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "legacySellerDistributionDailyLimitOverride" INTEGER,
  "enrichmentDailyMode" TEXT NOT NULL DEFAULT 'inherit',
  "enrichmentDailyLimit" INTEGER,
  "cardDeliveryDailyMode" TEXT NOT NULL DEFAULT 'inherit',
  "cardDeliveryDailyLimit" INTEGER,
  "activeCardsMode" TEXT NOT NULL DEFAULT 'inherit',
  "activeCardsLimit" INTEGER,
  "monthlyCardsMode" TEXT NOT NULL DEFAULT 'inherit',
  "monthlyCardsLimit" INTEGER,
  "vendasPullQuantityMode" TEXT NOT NULL DEFAULT 'inherit',
  "vendasPullQuantityLimit" INTEGER,
  "allowedSegmentsJson" TEXT,
  "blockedSegmentsJson" TEXT,
  "allowedCitiesJson" TEXT,
  "allowedStatesJson" TEXT,
  "requiresLocation" BOOLEAN,
  "requiredChannelsJson" TEXT,
  "visibilityJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserTeamPolicy_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TeamPolicyPreset_companyId_fkey'
  ) THEN
    ALTER TABLE "TeamPolicyPreset"
      ADD CONSTRAINT "TeamPolicyPreset_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UserTeamPolicy_userId_fkey'
  ) THEN
    ALTER TABLE "UserTeamPolicy"
      ADD CONSTRAINT "UserTeamPolicy_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UserTeamPolicy_companyId_fkey'
  ) THEN
    ALTER TABLE "UserTeamPolicy"
      ADD CONSTRAINT "UserTeamPolicy_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UserTeamPolicy_presetId_fkey'
  ) THEN
    ALTER TABLE "UserTeamPolicy"
      ADD CONSTRAINT "UserTeamPolicy_presetId_fkey"
      FOREIGN KEY ("presetId") REFERENCES "TeamPolicyPreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UserTeamPolicy_referredByUserId_fkey'
  ) THEN
    ALTER TABLE "UserTeamPolicy"
      ADD CONSTRAINT "UserTeamPolicy_referredByUserId_fkey"
      FOREIGN KEY ("referredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "TeamPolicyPreset_companyId_key_key" ON "TeamPolicyPreset"("companyId", "key");
CREATE INDEX IF NOT EXISTS "TeamPolicyPreset_companyId_status_idx" ON "TeamPolicyPreset"("companyId", "status");
CREATE INDEX IF NOT EXISTS "TeamPolicyPreset_scope_status_idx" ON "TeamPolicyPreset"("scope", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "UserTeamPolicy_userId_key" ON "UserTeamPolicy"("userId");
CREATE INDEX IF NOT EXISTS "UserTeamPolicy_companyId_status_idx" ON "UserTeamPolicy"("companyId", "status");
CREATE INDEX IF NOT EXISTS "UserTeamPolicy_presetId_idx" ON "UserTeamPolicy"("presetId");
CREATE INDEX IF NOT EXISTS "UserTeamPolicy_referredByUserId_idx" ON "UserTeamPolicy"("referredByUserId");
CREATE INDEX IF NOT EXISTS "UserTeamPolicy_subjectKind_status_idx" ON "UserTeamPolicy"("subjectKind", "status");

INSERT INTO "UserTeamPolicy" (
  "id",
  "userId",
  "companyId",
  "referredByUserId",
  "policyVersion",
  "status",
  "source",
  "roleSnapshot",
  "subjectKind",
  "modulesJson",
  "commissionPercent",
  "commissionDueBusinessDays",
  "canRegisterHbxSellers",
  "sellerReferralCommissionPercent",
  "referredByCommissionPercentSnapshot",
  "legacySellerDistributionDailyLimitOverride",
  "enrichmentDailyMode",
  "enrichmentDailyLimit",
  "cardDeliveryDailyMode",
  "activeCardsMode",
  "monthlyCardsMode",
  "vendasPullQuantityMode",
  "requiresLocation",
  "requiredChannelsJson",
  "createdAt",
  "updatedAt"
)
SELECT
  'legacy_user_policy_' || u."id"::TEXT,
  u."id",
  u."companyId",
  u."referredByUserId",
  1,
  CASE WHEN u."isActive" = true AND u."deactivatedAt" IS NULL THEN 'active' ELSE 'inactive' END,
  'legacy_backfill',
  u."role",
  CASE
    WHEN u."isSystemMaster" = true THEN 'system_master'
    WHEN c."slug" = 'hbx-master-whatsapp-engine' AND upper(coalesce(u."role", '')) = 'USER' THEN 'hbx_partner_seller'
    WHEN upper(coalesce(u."role", '')) = 'ADMIN' THEN 'company_admin'
    WHEN upper(coalesce(u."role", '')) = 'USER' THEN 'common_seller'
    ELSE 'unknown'
  END,
  COALESCE((
    SELECT json_agg(
      json_build_object(
        'key', sm."key",
        'allowed', uma."allowed"
      )
      ORDER BY sm."key"
    )::TEXT
    FROM "UserModuleAccess" uma
    JOIN "SystemModule" sm ON sm."id" = uma."moduleId"
    WHERE uma."userId" = u."id"
  ), '[]'),
  COALESCE(u."commissionPercent", 0),
  c."commissionDueBusinessDays",
  COALESCE(u."canRegisterHbxSellers", false),
  COALESCE(u."sellerReferralCommissionPercent", 0),
  COALESCE(u."referredByCommissionPercentSnapshot", 0),
  u."sellerDistributionDailyLimitOverride",
  CASE
    WHEN c."slug" = 'hbx-master-whatsapp-engine' AND u."sellerDistributionDailyLimitOverride" = 0 THEN 'unlimited'
    WHEN c."slug" = 'hbx-master-whatsapp-engine' AND u."sellerDistributionDailyLimitOverride" > 0 THEN 'limited'
    ELSE 'inherit'
  END,
  CASE
    WHEN c."slug" = 'hbx-master-whatsapp-engine' AND u."sellerDistributionDailyLimitOverride" > 0
      THEN LEAST(500, GREATEST(0, u."sellerDistributionDailyLimitOverride"))
    ELSE NULL
  END,
  'inherit',
  'inherit',
  'inherit',
  'inherit',
  CASE WHEN c."slug" = 'hbx-master-whatsapp-engine' AND upper(coalesce(u."role", '')) = 'USER' THEN true ELSE NULL END,
  '{"whatsapp":false,"instagram":false,"facebook":false,"email":false,"website":false}',
  u."createdAt",
  CURRENT_TIMESTAMP
FROM "User" u
LEFT JOIN "Company" c ON c."id" = u."companyId"
WHERE u."isActive" = true
  AND u."deactivatedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "UserTeamPolicy" p WHERE p."userId" = u."id"
  );
