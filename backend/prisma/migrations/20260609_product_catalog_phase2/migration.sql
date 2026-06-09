-- Phase 2: prepare tenant product catalog and Vendas product snapshots.
-- Runtime enforcement and backfill are intentionally handled in later phases.

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'service';
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "sku" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "priceCents" INTEGER;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'BRL';
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "billingCycle" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "saleMode" TEXT NOT NULL DEFAULT 'internal';
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "planKey" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "externalUrl" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "allowDiscount" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "maxDiscountPercent" DOUBLE PRECISION;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "minPriceCents" INTEGER;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "defaultCommissionPercent" DOUBLE PRECISION;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "metadataJson" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "createdByUserId" INTEGER;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "updatedByUserId" INTEGER;

ALTER TABLE "VendasLead" ADD COLUMN IF NOT EXISTS "productId" INTEGER;
ALTER TABLE "VendasLead" ADD COLUMN IF NOT EXISTS "productKindSnapshot" TEXT;
ALTER TABLE "VendasLead" ADD COLUMN IF NOT EXISTS "productNameSnapshot" TEXT;
ALTER TABLE "VendasLead" ADD COLUMN IF NOT EXISTS "productPriceCentsSnapshot" INTEGER;
ALTER TABLE "VendasLead" ADD COLUMN IF NOT EXISTS "productCurrencySnapshot" TEXT;
ALTER TABLE "VendasLead" ADD COLUMN IF NOT EXISTS "productBillingCycleSnapshot" TEXT;
ALTER TABLE "VendasLead" ADD COLUMN IF NOT EXISTS "productCommissionPercentSnapshot" DOUBLE PRECISION;
ALTER TABLE "VendasLead" ADD COLUMN IF NOT EXISTS "productPlanKeySnapshot" TEXT;

DO $$
BEGIN
  ALTER TABLE "Product"
    ADD CONSTRAINT "Product_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "Product"
    ADD CONSTRAINT "Product_updatedByUserId_fkey"
    FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "VendasLead"
    ADD CONSTRAINT "VendasLead_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "Product_companyId_status_sortOrder_idx" ON "Product"("companyId", "status", "sortOrder");
CREATE INDEX IF NOT EXISTS "Product_companyId_kind_status_idx" ON "Product"("companyId", "kind", "status");
CREATE INDEX IF NOT EXISTS "Product_companyId_planKey_idx" ON "Product"("companyId", "planKey");
CREATE INDEX IF NOT EXISTS "Product_companyId_sku_idx" ON "Product"("companyId", "sku");
CREATE INDEX IF NOT EXISTS "Product_createdByUserId_idx" ON "Product"("createdByUserId");
CREATE INDEX IF NOT EXISTS "Product_updatedByUserId_idx" ON "Product"("updatedByUserId");
CREATE INDEX IF NOT EXISTS "VendasLead_productId_idx" ON "VendasLead"("productId");
CREATE INDEX IF NOT EXISTS "VendasLead_companyId_productId_idx" ON "VendasLead"("companyId", "productId");
