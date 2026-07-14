-- Destructive by product decision: provider budgets and paid e-mail fallbacks
-- were plan-gated legacy. Google Places and Brave now use SourceApiUsage only.
DROP TABLE IF EXISTS "EnrichmentCostLedger";
