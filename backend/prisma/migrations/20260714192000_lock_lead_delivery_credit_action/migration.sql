-- A entrega de lead custa sempre 1 crédito. Overrides antigos de modo/custo são removidos;
-- o runtime também ignora e recusa novas tentativas de sobrescrever esta ação.
DELETE FROM "CreditActionConfig"
WHERE "actionKey" = 'lead_delivery';

-- Flags/quotas antigas não podem voltar a criar entrega grátis ou teto por plano.
ALTER TABLE "Company"
  DROP COLUMN IF EXISTS "creditsEnforceEnabled",
  DROP COLUMN IF EXISTS "commercialCardsMonthlyLimitOverride",
  DROP COLUMN IF EXISTS "commercialCardsDailyLimitOverride",
  DROP COLUMN IF EXISTS "dailyDeliveryCapOverride";

ALTER TABLE "CreditGlobalConfig"
  DROP COLUMN IF EXISTS "dailyDeliveryCapDefault";
