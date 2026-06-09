-- MIGRATION_ONLY: normalize legacy tenant catalog rows from the old generic kind to the canonical tenant_product kind.

ALTER TABLE "Product" ALTER COLUMN "kind" SET DEFAULT 'tenant_product';

UPDATE "Product"
SET "kind" = 'tenant_product'
WHERE "kind" = 'service';
