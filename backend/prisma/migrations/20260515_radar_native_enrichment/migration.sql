ALTER TABLE "RadarLeadPool"
  ADD COLUMN IF NOT EXISTS "email" TEXT,
  ADD COLUMN IF NOT EXISTS "emailStatus" TEXT DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS "emailSource" TEXT,
  ADD COLUMN IF NOT EXISTS "emailConfidence" INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "instagramUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "facebookUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "socialStatus" TEXT DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS "socialConfidence" INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "googleMapsUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "businessCategory" TEXT,
  ADD COLUMN IF NOT EXISTS "openingHoursStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "recommendedChannel" TEXT,
  ADD COLUMN IF NOT EXISTS "painType" TEXT,
  ADD COLUMN IF NOT EXISTS "painLabel" TEXT,
  ADD COLUMN IF NOT EXISTS "painPitch" TEXT,
  ADD COLUMN IF NOT EXISTS "enrichmentJson" TEXT,
  ADD COLUMN IF NOT EXISTS "enrichmentScore" INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "enrichmentConfidence" INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lastEnrichedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "enrichmentVersion" TEXT;

CREATE INDEX IF NOT EXISTS "RadarLeadPool_recommendedChannel_idx"
  ON "RadarLeadPool"("recommendedChannel");

CREATE INDEX IF NOT EXISTS "RadarLeadPool_painType_idx"
  ON "RadarLeadPool"("painType");

CREATE INDEX IF NOT EXISTS "RadarLeadPool_enrichmentScore_idx"
  ON "RadarLeadPool"("enrichmentScore");
