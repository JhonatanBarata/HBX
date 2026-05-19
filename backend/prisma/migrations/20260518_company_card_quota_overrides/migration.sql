ALTER TABLE "Company"
ADD COLUMN IF NOT EXISTS "commercialCardsMonthlyLimitOverride" INTEGER;

ALTER TABLE "Company"
ADD COLUMN IF NOT EXISTS "commercialCardsDailyLimitOverride" INTEGER;
