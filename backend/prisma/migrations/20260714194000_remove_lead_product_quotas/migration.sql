-- Remove toda a política count-based de leads. Crédito por aquisição permanece
-- no ledger e os filtros de acesso/território continuam em UserTeamPolicy.
UPDATE "Company"
SET "selectedPlanKey" = 'hbx_melhor'
WHERE LOWER(COALESCE("selectedPlanKey", '')) = 'hbx_vendas_ia';

DROP TABLE IF EXISTS "RadarDistributionDailyUsage";
DROP TABLE IF EXISTS "RadarAutoDistributionRule";

ALTER TABLE "User"
  DROP COLUMN IF EXISTS "sellerDistributionDailyLimitOverride",
  DROP COLUMN IF EXISTS "sellerDistributionMode",
  DROP COLUMN IF EXISTS "sellerDistributionPausedUntil",
  DROP COLUMN IF EXISTS "sellerDistributionNote",
  DROP COLUMN IF EXISTS "sellerDistributionUpdatedAt",
  DROP COLUMN IF EXISTS "radarSellerStandingOrderJson";

ALTER TABLE "UserTeamPolicy"
  DROP COLUMN IF EXISTS "legacySellerDistributionDailyLimitOverride",
  DROP COLUMN IF EXISTS "enrichmentDailyMode",
  DROP COLUMN IF EXISTS "enrichmentDailyLimit",
  DROP COLUMN IF EXISTS "cardDeliveryDailyMode",
  DROP COLUMN IF EXISTS "cardDeliveryDailyLimit",
  DROP COLUMN IF EXISTS "activeCardsMode",
  DROP COLUMN IF EXISTS "activeCardsLimit",
  DROP COLUMN IF EXISTS "monthlyCardsMode",
  DROP COLUMN IF EXISTS "monthlyCardsLimit",
  DROP COLUMN IF EXISTS "vendasPullQuantityMode",
  DROP COLUMN IF EXISTS "vendasPullQuantityLimit";

-- O dump da RFB traz fax em coluna própria. Ele não é phone3 nem LeadContact.
ALTER TABLE "CnpjPublicCompany"
  ADD COLUMN IF NOT EXISTS "fax" TEXT,
  ADD COLUMN IF NOT EXISTS "faxDigits" TEXT;
