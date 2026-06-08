CREATE TABLE IF NOT EXISTS "EnrichmentCostLedger" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER,
  "leadId" TEXT,
  "provider" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "estimatedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "estimatedCostBrl" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "cacheHit" BOOLEAN NOT NULL DEFAULT false,
  "reason" TEXT,
  "planKey" TEXT,
  "triggeredBy" TEXT NOT NULL,
  "metadataJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnrichmentCostLedger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EnrichmentCostLedger_companyId_createdAt_idx"
  ON "EnrichmentCostLedger"("companyId", "createdAt");

CREATE INDEX IF NOT EXISTS "EnrichmentCostLedger_provider_createdAt_idx"
  ON "EnrichmentCostLedger"("provider", "createdAt");

CREATE INDEX IF NOT EXISTS "EnrichmentCostLedger_leadId_createdAt_idx"
  ON "EnrichmentCostLedger"("leadId", "createdAt");

CREATE INDEX IF NOT EXISTS "EnrichmentCostLedger_planKey_createdAt_idx"
  ON "EnrichmentCostLedger"("planKey", "createdAt");
