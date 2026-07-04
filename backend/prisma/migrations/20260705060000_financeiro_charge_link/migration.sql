-- NÚCLEO-CRM R2 (05/07) — LINK da cobrança à espinha (PLANO-ROBUSTEZ, dívidas 2/3/4).
-- "FinanceiroCharge" ganha 4 colunas OPCIONAIS que amarram a cobrança ao cliente
-- (customerProfileId), à data de vencimento (dueDate), à origem (sourceModule) e à
-- entrega que a gerou (entregaId). Isso destrava extrato-por-cliente, fechar-mês e
-- a idempotência da cobrança por entrega.
--
-- 100% ADITIVO E NÃO-DESTRUTIVO: ADD COLUMN IF NOT EXISTS, ZERO drop, nenhuma coluna
-- vira NOT NULL (charge legada — assinatura HBX/recovery — segue com todas null).
-- FK customerProfileId = SET NULL (deletar o cliente NÃO apaga a cobrança, só desliga
-- o link — o histórico financeiro sobrevive). Idempotente (padrão dos aditivos do repo).
-- NÃO aplicar em banco vivo por este worker.

-- 1) Colunas de link (todas opcionais)
ALTER TABLE "FinanceiroCharge" ADD COLUMN IF NOT EXISTS "customerProfileId" TEXT;
ALTER TABLE "FinanceiroCharge" ADD COLUMN IF NOT EXISTS "dueDate"           TIMESTAMP(3);
ALTER TABLE "FinanceiroCharge" ADD COLUMN IF NOT EXISTS "sourceModule"      TEXT;
ALTER TABLE "FinanceiroCharge" ADD COLUMN IF NOT EXISTS "entregaId"         TEXT;

-- 2) Índices de consulta (extrato por cliente + fechar-mês por vencimento + idempotência)
CREATE INDEX IF NOT EXISTS "FinanceiroCharge_companyId_customerProfileId_idx" ON "FinanceiroCharge"("companyId", "customerProfileId");
CREATE INDEX IF NOT EXISTS "FinanceiroCharge_companyId_dueDate_status_idx"    ON "FinanceiroCharge"("companyId", "dueDate", "status");
CREATE INDEX IF NOT EXISTS "FinanceiroCharge_companyId_entregaId_idx"         ON "FinanceiroCharge"("companyId", "entregaId");

-- 3) FK opcional p/ o cliente. SET NULL: o histórico financeiro sobrevive à exclusão
--    do cliente. Guarda de idempotência: só adiciona se ainda não existir.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FinanceiroCharge_customerProfileId_fkey'
  ) THEN
    ALTER TABLE "FinanceiroCharge"
      ADD CONSTRAINT "FinanceiroCharge_customerProfileId_fkey"
      FOREIGN KEY ("customerProfileId") REFERENCES "CustomerProfile"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
