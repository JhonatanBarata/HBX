-- HBX Radar Digital: permanent global lead pool plus per-company private state.
CREATE TABLE IF NOT EXISTS "RadarLeadPool" (
  "id" TEXT NOT NULL,
  "placeId" TEXT,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "phoneDigits" TEXT,
  "address" TEXT,
  "city" TEXT,
  "state" TEXT NOT NULL DEFAULT '',
  "normalizedCity" TEXT NOT NULL,
  "segment" TEXT,
  "normalizedSegment" TEXT NOT NULL,
  "website" TEXT,
  "websiteStatus" TEXT NOT NULL DEFAULT 'unknown',
  "rating" DOUBLE PRECISION,
  "reviews" INTEGER NOT NULL DEFAULT 0,
  "sourceEngines" TEXT NOT NULL DEFAULT '[]',
  "opportunityScore" INTEGER NOT NULL DEFAULT 0,
  "opportunityReason" TEXT,
  "globalNegativeCount" INTEGER NOT NULL DEFAULT 0,
  "globalImportedCount" INTEGER NOT NULL DEFAULT 0,
  "globalContactedCount" INTEGER NOT NULL DEFAULT 0,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RadarLeadPool_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RadarLeadCompanyState" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "radarLeadId" TEXT NOT NULL,
  "vendasLeadId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'new',
  "lastActionAt" TIMESTAMP(3),
  "negativeReason" TEXT,
  "privateNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RadarLeadCompanyState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RadarStockConfig" (
  "id" TEXT NOT NULL,
  "normalizedCity" TEXT NOT NULL,
  "state" TEXT,
  "normalizedSegment" TEXT NOT NULL,
  "desiredStock" INTEGER NOT NULL DEFAULT 300,
  "minimumStock" INTEGER NOT NULL DEFAULT 80,
  "engine" TEXT NOT NULL DEFAULT 'hbx',
  "targetType" TEXT NOT NULL DEFAULT 'pj',
  "filtersJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RadarStockConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RadarLeadPool_placeId_key" ON "RadarLeadPool"("placeId");
CREATE UNIQUE INDEX IF NOT EXISTS "RadarLeadPool_phoneDigits_key" ON "RadarLeadPool"("phoneDigits");
CREATE INDEX IF NOT EXISTS "RadarLeadPool_normalizedCity_normalizedSegment_opportunityScore_idx" ON "RadarLeadPool"("normalizedCity", "normalizedSegment", "opportunityScore");
CREATE INDEX IF NOT EXISTS "RadarLeadPool_normalizedCity_state_normalizedSegment_idx" ON "RadarLeadPool"("normalizedCity", "state", "normalizedSegment");
CREATE INDEX IF NOT EXISTS "RadarLeadPool_websiteStatus_idx" ON "RadarLeadPool"("websiteStatus");
CREATE INDEX IF NOT EXISTS "RadarLeadPool_lastSeenAt_idx" ON "RadarLeadPool"("lastSeenAt");

CREATE UNIQUE INDEX IF NOT EXISTS "RadarLeadCompanyState_companyId_radarLeadId_key" ON "RadarLeadCompanyState"("companyId", "radarLeadId");
CREATE INDEX IF NOT EXISTS "RadarLeadCompanyState_companyId_status_idx" ON "RadarLeadCompanyState"("companyId", "status");
CREATE INDEX IF NOT EXISTS "RadarLeadCompanyState_radarLeadId_status_idx" ON "RadarLeadCompanyState"("radarLeadId", "status");
CREATE INDEX IF NOT EXISTS "RadarLeadCompanyState_vendasLeadId_idx" ON "RadarLeadCompanyState"("vendasLeadId");

CREATE UNIQUE INDEX IF NOT EXISTS "RadarStockConfig_normalizedCity_state_normalizedSegment_key" ON "RadarStockConfig"("normalizedCity", "state", "normalizedSegment");
CREATE INDEX IF NOT EXISTS "RadarStockConfig_normalizedCity_normalizedSegment_idx" ON "RadarStockConfig"("normalizedCity", "normalizedSegment");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RadarLeadCompanyState_companyId_fkey'
  ) THEN
    ALTER TABLE "RadarLeadCompanyState"
      ADD CONSTRAINT "RadarLeadCompanyState_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RadarLeadCompanyState_radarLeadId_fkey'
  ) THEN
    ALTER TABLE "RadarLeadCompanyState"
      ADD CONSTRAINT "RadarLeadCompanyState_radarLeadId_fkey"
      FOREIGN KEY ("radarLeadId") REFERENCES "RadarLeadPool"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RadarLeadCompanyState_vendasLeadId_fkey'
  ) THEN
    ALTER TABLE "RadarLeadCompanyState"
      ADD CONSTRAINT "RadarLeadCompanyState_vendasLeadId_fkey"
      FOREIGN KEY ("vendasLeadId") REFERENCES "VendasLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
