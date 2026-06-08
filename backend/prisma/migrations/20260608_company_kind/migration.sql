ALTER TABLE "Company"
  ADD COLUMN IF NOT EXISTS "companyKind" TEXT NOT NULL DEFAULT 'tenant';

ALTER TABLE "Company"
  ALTER COLUMN "companyKind" SET DEFAULT 'tenant';

UPDATE "Company"
SET "companyKind" = 'tenant'
WHERE "companyKind" IS NULL
  OR "companyKind" NOT IN ('tenant', 'platform_infra');

-- MIGRATION_ONLY: legacy slug identifies the internal WhatsApp engine company.
UPDATE "Company"
SET "companyKind" = 'platform_infra'
WHERE lower(coalesce("slug", '')) = 'hbx-master-whatsapp-engine';

-- MIGRATION_ONLY: HBX and HBX2 are tenant companies; no runtime privilege should depend on these slugs.
UPDATE "Company"
SET "companyKind" = 'tenant'
WHERE lower(coalesce("slug", '')) IN ('hbx', 'hbx2')
  OR upper(trim(coalesce("name", ''))) IN ('HBX', 'HBX2');

-- MIGRATION_ONLY: promote a local HBX2 seed to HBX only when no HBX tenant exists.
DO $$
DECLARE
  hbx_id INTEGER;
  hbx2_id INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Company" WHERE lower(coalesce("slug", '')) = 'hbx'
  ) THEN
    SELECT "id"
      INTO hbx_id
    FROM "Company"
    WHERE upper(trim(coalesce("name", ''))) = 'HBX'
    ORDER BY "id"
    LIMIT 1;

    IF hbx_id IS NOT NULL THEN
      UPDATE "Company"
      SET
        "slug" = 'hbx',
        "companyKind" = 'tenant',
        "onboardingStatus" = 'active_paid',
        "isActive" = true,
        "paymentStatus" = 'MANUAL',
        "paymentMethod" = 'MANUAL',
        "subscriptionStatus" = 'manual',
        "billingProvider" = 'manual',
        "premiumAccess" = true
      WHERE "id" = hbx_id;
    END IF;

    SELECT "id"
      INTO hbx2_id
    FROM "Company"
    WHERE lower(coalesce("slug", '')) = 'hbx2'
      OR upper(trim(coalesce("name", ''))) = 'HBX2'
    ORDER BY "id"
    LIMIT 1;

    IF hbx_id IS NULL AND hbx2_id IS NOT NULL THEN
      UPDATE "Company"
      SET
        "name" = 'HBX',
        "slug" = 'hbx',
        "companyKind" = 'tenant',
        "onboardingStatus" = 'active_paid',
        "isActive" = true,
        "paymentStatus" = 'MANUAL',
        "paymentMethod" = 'MANUAL',
        "subscriptionStatus" = 'manual',
        "billingProvider" = 'manual',
        "premiumAccess" = true
      WHERE "id" = hbx2_id;
    END IF;
  END IF;
END $$;

UPDATE "Company"
SET
  "name" = 'HBX',
  "companyKind" = 'tenant',
  "onboardingStatus" = 'active_paid',
  "isActive" = true,
  "paymentStatus" = 'MANUAL',
  "paymentMethod" = 'MANUAL',
  "subscriptionStatus" = 'manual',
  "billingProvider" = 'manual',
  "premiumAccess" = true
WHERE lower(coalesce("slug", '')) = 'hbx';

ALTER TABLE "Company"
  ALTER COLUMN "companyKind" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Company_companyKind_check'
  ) THEN
    ALTER TABLE "Company"
      ADD CONSTRAINT "Company_companyKind_check"
      CHECK ("companyKind" IN ('tenant', 'platform_infra'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Company_companyKind_idx" ON "Company"("companyKind");
