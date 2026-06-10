-- MIGRATION_ONLY: isencao de cobranca e decisao explicita do master (PR10062026001 Fase 3).
-- Empresa isenta (ex.: tenant interno HBX) tem acesso pleno, nunca recebe
-- cobranca/aviso e nao e privilegiada por slug/nome em lugar nenhum do codigo.
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "billingExempt" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "billingExemptReason" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "billingExemptAt" TIMESTAMP(3);
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "billingExemptByUserId" INTEGER;
