-- CRÉDITOS — RECONCILIAÇÃO/HARDENING do ledger (05/07, fusão das 2 implementações de S1).
--
-- Contexto (não repetir o quase-acidente): o publish `20260705_050617` (3a3d9d0d) levou pra
-- prod um S1 provisório com a migration `20260705090000_credits_wallet_ledger` (APLICADA em
-- hbx_prod — tabela inerte, flag OFF, zero linhas). Depois, o merge do `credits/build`
-- (S1 definitivo, Fix A+B da revisão Opus 04/07) substituiu o serviço. Esta migration NÃO
-- recria as tabelas (a 090000 já criou, com IF NOT EXISTS pra bancos novos) — ela só alinha
-- o banco ao schema/serviço DEFINITIVOS. Idempotente; tabela está vazia em prod (sem dedupe).
--
-- 1) Fix B — o cinto de DINHEIRO que faltava em prod: (usageKey, lote) único. Lotes têm
--    parentEntryId NULL (não colidem em unique no Postgres); linhas `debit` apontam o lote →
--    duas ações concorrentes com a MESMA usageKey não debitam o MESMO lote 2x (P2002 tratado
--    no CreditWalletService). SEM este índice o Fix B do serviço é silenciosamente inerte.
CREATE UNIQUE INDEX IF NOT EXISTS "CreditLedgerEntry_usageKey_parentEntryId_key"
  ON "CreditLedgerEntry"("usageKey", "parentEntryId");

-- 2) Sobras do S1 provisório que o schema definitivo NÃO declara (alinhar = zero drift):
--    índice extra e FK companyId→Company (o ledger definitivo denormaliza companyId sem join).
DROP INDEX IF EXISTS "CreditLedgerEntry_walletId_usageKey_idx";
ALTER TABLE "CreditLedgerEntry" DROP CONSTRAINT IF EXISTS "CreditLedgerEntry_companyId_fkey";
