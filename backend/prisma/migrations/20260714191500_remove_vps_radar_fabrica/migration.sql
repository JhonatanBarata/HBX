-- Night Factory is a local-only HBX Owner process (127.0.0.1:3107).
-- The backend/VPS must not keep an executable factory, rewards, orders or run state.
DROP TABLE IF EXISTS "NightOrderDelivery";
DROP TABLE IF EXISTS "NightOrder";
DROP TABLE IF EXISTS "NightFactoryRewardClaim";
DROP TABLE IF EXISTS "RadarFabricaRun";
DROP TABLE IF EXISTS "RadarFactoryWorkLog";
DROP TABLE IF EXISTS "RadarFactoryCursor";
DROP TABLE IF EXISTS "WebscrapingCampaignBatch";
DROP TABLE IF EXISTS "WebscrapingCampaignTask";
ALTER TABLE "RadarLeadPool" DROP COLUMN IF EXISTS "campaignId";
DROP TABLE IF EXISTS "WebscrapingCampaign";
DELETE FROM "RadarMission"
WHERE "stage" IN ('alvo', 'receita', 'base_rica', 'cerebro', 'validacao_zap', 'card');
DROP TABLE IF EXISTS "RadarCoverage";
DELETE FROM "WebscrapingOperationalConfig" WHERE "key" = 'turbo_noturno';
