-- S2 COBRANÇA-WHATS (11/07, docs/PLANEJAMENTOS/VISAO-FUTURO/S2-cobranca-whatsapp.md)
-- "O sistema que cobra por você": aviso de WhatsApp quando o FinanceiroCharge da
-- logística nasce 'pending' + lembrete no dia do vencimento, com Pix copia-e-cola.
-- Feature DORMENTE nos 2 níveis: env HBX_COBRANCA_WHATS_ENABLED (default OFF) +
-- LogisticaConfig.cobrancaWhatsAtiva (default false). Nada muda sem ligar os dois.
--
--   CustomerProfile.avisarCobranca   = opt-out POR CLIENTE do aviso de cobrança
--                                      (independente do avisarEntrega). Default true —
--                                      inofensivo enquanto a feature está dormente.
--   LogisticaConfig.cobrancaWhatsAtiva = toggle POR TENANT. Default false.
--   LogisticaCobrancaAviso           = marca de IDEMPOTÊNCIA (1 aviso por chargeId×tipo,
--                                      tipo 'lancamento'|'vencimento') à prova de restart.
--
-- 100% ADITIVO e idempotente: ADD COLUMN IF NOT EXISTS + CREATE TABLE/INDEX IF NOT
-- EXISTS, zero drop, defaults seguros. Migração escrita à mão (padrão F1/MULTILOCAL):
-- NÃO aplicar em banco vivo por este worker — o dono aplica no deploy do VPS.

-- 1) Opt-out por cliente + toggle por tenant (colunas aditivas)
ALTER TABLE "CustomerProfile"
  ADD COLUMN IF NOT EXISTS "avisarCobranca" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "LogisticaConfig"
  ADD COLUMN IF NOT EXISTS "cobrancaWhatsAtiva" BOOLEAN NOT NULL DEFAULT false;

-- 2) Marca de idempotência do aviso (tabela nova, pequena)
CREATE TABLE IF NOT EXISTS "LogisticaCobrancaAviso" (
    "id"        TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "chargeId"  TEXT NOT NULL,
    "tipo"      TEXT NOT NULL,
    "sentAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogisticaCobrancaAviso_pkey" PRIMARY KEY ("id")
);

-- 1 aviso por (charge, tipo) — a idempotência dura vive AQUI (restart não reenvia).
CREATE UNIQUE INDEX IF NOT EXISTS "LogisticaCobrancaAviso_chargeId_tipo_key" ON "LogisticaCobrancaAviso"("chargeId", "tipo");
CREATE INDEX IF NOT EXISTS "LogisticaCobrancaAviso_companyId_sentAt_idx" ON "LogisticaCobrancaAviso"("companyId", "sentAt");

-- 3) FK — aviso pertence à company (CASCADE). chargeId fica SEM FK de propósito
--    (trilha do aviso sobrevive a limpeza de charge; ver comentário no schema).
ALTER TABLE "LogisticaCobrancaAviso"
  ADD CONSTRAINT "LogisticaCobrancaAviso_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
