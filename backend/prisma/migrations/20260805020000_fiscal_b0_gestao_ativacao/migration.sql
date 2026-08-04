-- B0 BALCÃO (decisão 12 do PR04082026-BALCAO-DISTRIBUIDORA) — rito de ativação
-- do modo HBX Gestão Fiscal. Aditivo puro.
ALTER TABLE "FiscalTenantProfile" ADD COLUMN IF NOT EXISTS "tipoEmpresa" TEXT;
ALTER TABLE "FiscalTenantProfile" ADD COLUMN IF NOT EXISTS "gestaoPoliticaVersao" TEXT;
ALTER TABLE "FiscalTenantProfile" ADD COLUMN IF NOT EXISTS "gestaoPoliticaAceiteEm" TIMESTAMP(3);
ALTER TABLE "FiscalTenantProfile" ADD COLUMN IF NOT EXISTS "gestaoPoliticaAceitePor" TEXT;
ALTER TABLE "FiscalTenantProfile" ADD COLUMN IF NOT EXISTS "gestaoAtivadaEm" TIMESTAMP(3);
ALTER TABLE "FiscalTenantProfile" ADD COLUMN IF NOT EXISTS "gestaoAtivadaPor" TEXT;
ALTER TABLE "FiscalTenantProfile" ADD COLUMN IF NOT EXISTS "cnpjConferidoEm" TIMESTAMP(3);
ALTER TABLE "FiscalTenantProfile" ADD COLUMN IF NOT EXISTS "cnpjSituacaoRfb" TEXT;
ALTER TABLE "FiscalTenantProfile" ADD COLUMN IF NOT EXISTS "cnpjRfbAviso" TEXT;
