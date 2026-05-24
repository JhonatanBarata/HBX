CREATE TABLE "RadarAutoDistributionRule" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'company',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "includeAdmin" BOOLEAN NOT NULL DEFAULT false,
    "adminUserId" INTEGER,
    "adminTargetStock" INTEGER NOT NULL DEFAULT 0,
    "targetStockPerSeller" INTEGER NOT NULL DEFAULT 30,
    "preferredState" TEXT,
    "preferredCity" TEXT,
    "segment" TEXT,
    "categoryKey" TEXT,
    "radiusKm" INTEGER,
    "targetUserIdsJson" TEXT,
    "filtersJson" TEXT,
    "createdByUserId" INTEGER,
    "updatedByUserId" INTEGER,
    "lastActivatedAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RadarAutoDistributionRule_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "RadarAutoDistributionRule"
ADD CONSTRAINT "RadarAutoDistributionRule_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "RadarAutoDistributionRule_companyId_scope_key"
ON "RadarAutoDistributionRule"("companyId", "scope");

CREATE INDEX "RadarAutoDistributionRule_companyId_status_idx"
ON "RadarAutoDistributionRule"("companyId", "status");

CREATE INDEX "RadarAutoDistributionRule_companyId_updatedAt_idx"
ON "RadarAutoDistributionRule"("companyId", "updatedAt");
