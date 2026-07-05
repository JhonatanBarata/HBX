-- CRÉDITOS S1 (docs/PLANEJAMENTOS/CREDITOS/S1-SPEC.md) — fundação da carteira de crédito.
-- ADITIVO E NÃO-DESTRUTIVO: cria APENAS 2 tabelas novas (CreditWallet, CreditLedgerEntry)
-- + índices + 2 FKs. NÃO altera/dropa nenhuma coluna, tabela ou índice existente da Company.
-- Módulo nasce atrás de HBX_CREDITS_ENABLED (default OFF) — sem enforcement neste sprint.

CREATE TABLE "CreditWallet" (
    "id"        TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditWallet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CreditWallet_companyId_key" ON "CreditWallet"("companyId");

ALTER TABLE "CreditWallet" ADD CONSTRAINT "CreditWallet_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CreditLedgerEntry" (
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

-- Fix B (revisão Opus S1): trava de idempotência de dinheiro no banco. Lotes têm
-- parentEntryId NULL (não colidem em unique no Postgres); linhas `debit` têm o lote em
-- parentEntryId, então (usageKey, lote) é único → sem débito dobrado sob concorrência.
CREATE UNIQUE INDEX "CreditLedgerEntry_usageKey_parentEntryId_key" ON "CreditLedgerEntry"("usageKey", "parentEntryId");
CREATE INDEX "CreditLedgerEntry_companyId_kind_idx" ON "CreditLedgerEntry"("companyId", "kind");
CREATE INDEX "CreditLedgerEntry_walletId_expiresAt_idx" ON "CreditLedgerEntry"("walletId", "expiresAt");
CREATE INDEX "CreditLedgerEntry_usageKey_idx" ON "CreditLedgerEntry"("usageKey");

ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "CreditWallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
