-- PR10062026002 (DROP final): morre o estado comercial sobreposto.
-- O estado unico (Company.status + datas) e a unica fonte desde as Fases A-D;
-- o dual-write e a derivacao legada sairam do codigo neste mesmo commit.
-- Backup dispensado pelo dono (10/06): sem clientes em producao, banco local
-- recriavel do zero.

-- Backfill defensivo final: qualquer linha que ainda nao fale o estado unico
-- (statusChangedAt nulo) e convertida uma ultima vez antes do drop.
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

-- Cortesia preserva o motivo da isencao legada antes do drop.
UPDATE "Company"
SET "courtesyReason" = coalesce(
  nullif("billingExemptReason", ''),
  'Migração: liberação manual/sem leitura financeira — revisar'
)
WHERE "companyKind" = 'tenant'
  AND "status" = 'courtesy'
  AND ("courtesyReason" IS NULL OR "courtesyReason" = '');

-- DROP dos 4 campos sobrepostos + isencao legada (cortesia os substituiu).
ALTER TABLE "Company" DROP COLUMN IF EXISTS "onboardingStatus";
ALTER TABLE "Company" DROP COLUMN IF EXISTS "paymentStatus";
ALTER TABLE "Company" DROP COLUMN IF EXISTS "subscriptionStatus";
ALTER TABLE "Company" DROP COLUMN IF EXISTS "premiumAccess";
ALTER TABLE "Company" DROP COLUMN IF EXISTS "billingExempt";
ALTER TABLE "Company" DROP COLUMN IF EXISTS "billingExemptReason";
ALTER TABLE "Company" DROP COLUMN IF EXISTS "billingExemptAt";
ALTER TABLE "Company" DROP COLUMN IF EXISTS "billingExemptByUserId";

-- Tabela legada de permissao por usuario: team policy e a unica fonte (A.5).
DROP TABLE IF EXISTS "UserModuleAccess";
