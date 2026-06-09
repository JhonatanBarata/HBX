-- MIGRATION_ONLY: canais de comunicacao sao configuracoes comuns do tenant.
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "supportEmail" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "replyToEmail" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "supportWhatsapp" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "communicationSettingsJson" TEXT;

UPDATE "Company"
SET "supportEmail" = COALESCE(NULLIF("supportEmail", ''), NULLIF("contactEmail", ''))
WHERE "companyKind" = 'tenant'
  AND ("supportEmail" IS NULL OR "supportEmail" = '')
  AND "contactEmail" IS NOT NULL
  AND "contactEmail" <> '';

UPDATE "Company"
SET "supportWhatsapp" = COALESCE(NULLIF("supportWhatsapp", ''), NULLIF("contactPhone", ''))
WHERE "companyKind" = 'tenant'
  AND ("supportWhatsapp" IS NULL OR "supportWhatsapp" = '')
  AND "contactPhone" IS NOT NULL
  AND "contactPhone" <> '';

UPDATE "Company"
SET "replyToEmail" = COALESCE(NULLIF("replyToEmail", ''), NULLIF("supportEmail", ''), NULLIF("contactEmail", ''))
WHERE "companyKind" = 'tenant'
  AND ("replyToEmail" IS NULL OR "replyToEmail" = '')
  AND (
    ("supportEmail" IS NOT NULL AND "supportEmail" <> '')
    OR ("contactEmail" IS NOT NULL AND "contactEmail" <> '')
  );
