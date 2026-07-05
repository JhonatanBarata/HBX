-- CRÉDITOS S1 (05/07 — docs/PLANEJAMENTOS/CREDITOS/S1-SPEC.md). Carteira pré-paga
-- (1 crédito = 1 lead) que vai SUBSTITUIR o paywall por tier. Migração ADITIVA:
-- só cria 2 tabelas novas, NÃO toca Company nem nada existente. Tudo inerte até
-- HBX_CREDITS_ENABLED ligar; ninguém debita ainda (S2/S3). Idempotente
-- (IF NOT EXISTS). NÃO aplicar em banco vivo por este worker — Postgres está down;
-- o que importa é o SQL estar CERTO e casar com o schema.prisma.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) CreditWallet — 1:1 com Company. É a LINHA DE LOCK do débito atômico
--    (SELECT ... FOR UPDATE): dois "puxar lead" concorrentes serializam aqui.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "CreditWallet" (
  "id"        TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CreditWallet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CreditWallet_companyId_key"
  ON "CreditWallet"("companyId");

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) CreditLedgerEntry — ledger append-only. Lotes (grant/recharge/promo) carregam
--    remaining + expiresAt; movimentos (debit/refund/expire/adjust) têm remaining 0.
--    Saldo = Σ(lotes remaining>0 e não expirados). usageKey é INDEXADO e NÃO unique
--    (um débito que cruza 2 lotes escreve 2 linhas com a MESMA usageKey).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "CreditLedgerEntry" (
  "id"              TEXT NOT NULL,
  "walletId"        TEXT NOT NULL,
  "companyId"       INTEGER NOT NULL,
  "kind"            TEXT NOT NULL,
  "amount"          INTEGER NOT NULL,
  "remaining"       INTEGER NOT NULL DEFAULT 0,
  "expiresAt"       TIMESTAMP(3),
  "grantType"       TEXT,
  "actionKey"       TEXT,
  "usageKey"        TEXT,
  "sourceRef"       TEXT,
  "parentEntryId"   TEXT,
  "createdByUserId" INTEGER,
  "metadataJson"    TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreditLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CreditLedgerEntry_companyId_kind_idx"
  ON "CreditLedgerEntry"("companyId", "kind");
CREATE INDEX IF NOT EXISTS "CreditLedgerEntry_walletId_expiresAt_idx"
  ON "CreditLedgerEntry"("walletId", "expiresAt");
CREATE INDEX IF NOT EXISTS "CreditLedgerEntry_walletId_usageKey_idx"
  ON "CreditLedgerEntry"("walletId", "usageKey");
CREATE INDEX IF NOT EXISTS "CreditLedgerEntry_usageKey_idx"
  ON "CreditLedgerEntry"("usageKey");

-- FKs (Cascade no delete da empresa/wallet, igual ao resto do schema).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CreditWallet_companyId_fkey') THEN
    ALTER TABLE "CreditWallet"
      ADD CONSTRAINT "CreditWallet_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CreditLedgerEntry_walletId_fkey') THEN
    ALTER TABLE "CreditLedgerEntry"
      ADD CONSTRAINT "CreditLedgerEntry_walletId_fkey"
      FOREIGN KEY ("walletId") REFERENCES "CreditWallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CreditLedgerEntry_companyId_fkey') THEN
    ALTER TABLE "CreditLedgerEntry"
      ADD CONSTRAINT "CreditLedgerEntry_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
