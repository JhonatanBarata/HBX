-- Índice de dedup CROSS-campanha em WebscrapingCampaignTask (25/06).
-- A fábrica filtra por (state, city, segment, targetType) SEM campaignId; todos os índices
-- existentes começam por campaignId e não atendem → Seq Scan de ~19k linhas em loop, pregando
-- o Postgres da VPS em ~120% de CPU. Aditivo, reversível (DROP INDEX), não toca dado.
-- IF NOT EXISTS para ser idempotente caso o índice já tenha sido criado manualmente na VPS.
CREATE INDEX IF NOT EXISTS "WebscrapingCampaignTask_state_city_segment_targetType_idx"
  ON "WebscrapingCampaignTask" ("state", "city", "segment", "targetType");
