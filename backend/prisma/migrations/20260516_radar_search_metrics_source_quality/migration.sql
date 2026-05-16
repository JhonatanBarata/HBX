-- Add optional Radar/HBX observability without changing existing API contracts.
ALTER TABLE "WebscrapingSearchRun"
  ADD COLUMN IF NOT EXISTS "metricsJson" TEXT;

CREATE TABLE IF NOT EXISTS "WebscrapingSourceQuality" (
  "id" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "sourceEngine" TEXT NOT NULL DEFAULT '',
  "discoveredCount" INTEGER NOT NULL DEFAULT 0,
  "fetchedCount" INTEGER NOT NULL DEFAULT 0,
  "approvedCount" INTEGER NOT NULL DEFAULT 0,
  "rejectedCount" INTEGER NOT NULL DEFAULT 0,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebscrapingSourceQuality_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WebscrapingSourceQuality_domain_sourceEngine_key"
  ON "WebscrapingSourceQuality"("domain", "sourceEngine");

CREATE INDEX IF NOT EXISTS "WebscrapingSourceQuality_lastSeenAt_idx"
  ON "WebscrapingSourceQuality"("lastSeenAt");

CREATE INDEX IF NOT EXISTS "WebscrapingSourceQuality_sourceEngine_idx"
  ON "WebscrapingSourceQuality"("sourceEngine");
