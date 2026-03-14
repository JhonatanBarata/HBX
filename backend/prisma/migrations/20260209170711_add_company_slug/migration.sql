-- SQLite-safe baseline migration patch:
-- Keep this migration minimal and order-independent for dev.

PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;

-- Add Company.slug (nullable) for tenant login by slug
ALTER TABLE "Company" ADD COLUMN "slug" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Company_slug_key" ON "Company"("slug");

-- Ensure implicit many-to-many join table exists for Plan.features <-> Feature.plans
CREATE TABLE IF NOT EXISTS "_PlanFeatures" (
  "A" INTEGER NOT NULL,
  "B" INTEGER NOT NULL,
  PRIMARY KEY ("A", "B"),
  FOREIGN KEY ("A") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("B") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "_PlanFeatures_B_index" ON "_PlanFeatures"("B");

COMMIT;
PRAGMA foreign_keys=ON;
