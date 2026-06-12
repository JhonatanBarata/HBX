CREATE TABLE IF NOT EXISTS "NightOrder" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "createdByUserId" INTEGER,
  "segment" TEXT NOT NULL,
  "normalizedSegment" TEXT NOT NULL,
  "city" TEXT,
  "state" TEXT,
  "normalizedCity" TEXT,
  "requireEmail" BOOLEAN NOT NULL DEFAULT true,
  "requireWhatsapp" BOOLEAN NOT NULL DEFAULT false,
  "onlyWithoutWebsite" BOOLEAN NOT NULL DEFAULT false,
  "dailyQuota" INTEGER NOT NULL DEFAULT 10,
  "status" TEXT NOT NULL DEFAULT 'open',
  "deliveredTotal" INTEGER NOT NULL DEFAULT 0,
  "lastDeliveryDate" TEXT,
  "idempotencyKey" TEXT,
  "metadataJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NightOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NightOrder_idempotencyKey_key" ON "NightOrder"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "NightOrder_companyId_status_idx" ON "NightOrder"("companyId", "status");
CREATE INDEX IF NOT EXISTS "NightOrder_status_updatedAt_idx" ON "NightOrder"("status", "updatedAt");

CREATE TABLE IF NOT EXISTS "NightOrderDelivery" (
  "id" TEXT NOT NULL,
  "nightOrderId" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "reportDate" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "leadIdsJson" TEXT NOT NULL,
  "statsJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NightOrderDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NightOrderDelivery_nightOrderId_reportDate_key" ON "NightOrderDelivery"("nightOrderId", "reportDate");
CREATE INDEX IF NOT EXISTS "NightOrderDelivery_companyId_reportDate_idx" ON "NightOrderDelivery"("companyId", "reportDate");
