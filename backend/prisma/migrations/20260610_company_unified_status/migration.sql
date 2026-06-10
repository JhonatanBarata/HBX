-- MIGRATION_ONLY: estado unico da empresa (PR10062026002 Fase A.1).
-- Company.status (pending_checkout | trial | active | courtesy | overdue | suspended)
-- passa a ser a unica fonte persistida; os campos legados viram fallback de
-- transicao e serao removidos na fase A.4. Backfill idempotente (statusChangedAt
-- marca linhas ja convertidas).
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'pending_checkout';
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "statusChangedAt" TIMESTAMP(3);
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "statusChangedByUserId" INTEGER;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "courtesyEndsAt" TIMESTAMP(3);
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "courtesyReason" TEXT;

UPDATE "Company" SET
  "status" = CASE
    WHEN "isActive" = true AND (
        coalesce("billingExempt", false) = true
        OR upper(coalesce("paymentStatus", '')) = 'MANUAL'
        OR lower(coalesce("subscriptionStatus", '')) = 'manual'
        OR coalesce("premiumAccess", false) = true
      ) THEN 'courtesy'
    WHEN "isActive" = true AND (
        upper(coalesce("paymentStatus", '')) = 'PAID'
        OR lower(coalesce("subscriptionStatus", '')) IN ('active', 'authorized')
      ) THEN 'active'
    WHEN "isActive" = true
      AND (
        upper(coalesce("paymentStatus", '')) = 'TRIAL'
        OR lower(coalesce("subscriptionStatus", '')) = 'trialing'
        OR lower(coalesce("onboardingStatus", '')) = 'active_trial'
      )
      AND ("trialEndsAt" IS NULL OR "trialEndsAt" >= now())
      THEN 'trial'
    WHEN upper(coalesce("paymentStatus", '')) IN ('DISABLED', 'EXPIRED')
      OR lower(coalesce("subscriptionStatus", '')) IN ('canceled', 'expired')
      OR lower(coalesce("onboardingStatus", '')) = 'suspended'
      THEN 'suspended'
    WHEN "billingGraceEndsAt" IS NOT NULL AND "billingGraceEndsAt" >= now() THEN 'overdue'
    WHEN upper(coalesce("paymentStatus", '')) = 'OVERDUE'
      OR lower(coalesce("subscriptionStatus", '')) = 'past_due'
      THEN 'overdue'
    WHEN upper(coalesce("paymentStatus", '')) = 'PENDING'
      OR lower(coalesce("subscriptionStatus", '')) = 'pending_checkout'
      OR lower(coalesce("onboardingStatus", '')) = 'pending_checkout'
      THEN 'pending_checkout'
    WHEN "trialEndsAt" IS NOT NULL AND "trialEndsAt" < now() THEN 'suspended'
    WHEN "isActive" = false THEN 'suspended'
    ELSE 'courtesy'
  END,
  "statusChangedAt" = now()
WHERE "companyKind" = 'tenant'
  AND "statusChangedAt" IS NULL;

-- Motivo das cortesias migradas: preserva o motivo da isencao quando existir;
-- demais casos ficam marcados para revisao do master em Planos & Regras.
UPDATE "Company"
SET "courtesyReason" = coalesce(
  nullif("billingExemptReason", ''),
  'Migração: liberação manual/sem leitura financeira — revisar'
)
WHERE "companyKind" = 'tenant'
  AND "status" = 'courtesy'
  AND ("courtesyReason" IS NULL OR "courtesyReason" = '');

CREATE INDEX IF NOT EXISTS "Company_status_idx" ON "Company"("status");
