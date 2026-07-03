-- CONTABIL S4 — Livro Caixa (art. 26 LC 123) + painel de lucro isento.
-- Aditivo: apenas 1 modelo novo (FiscalLedgerEntry). NÃO toca em nenhuma tabela
-- existente e NÃO altera fluxo de pagamento — o Contabil só espelha (LEITURA)
-- o ledger MP e as obrigações fiscais; nada aqui escreve em MasterBillingLedgerEntry
-- nem em FiscalObligation.

CREATE TABLE "FiscalLedgerEntry" (
    "id"          TEXT NOT NULL,
    "data"        TIMESTAMP(3) NOT NULL,
    "competencia" TEXT NOT NULL,
    "tipo"        TEXT NOT NULL,
    "categoria"   TEXT NOT NULL,
    "descricao"   TEXT NOT NULL,
    "valorCents"  INTEGER NOT NULL,
    "origem"      TEXT NOT NULL,
    "refId"       TEXT,
    "motivo"      TEXT,
    "estornaId"   TEXT,
    "anoFechado"  BOOLEAN NOT NULL DEFAULT false,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- Idempotência das entradas automáticas: Postgres trata múltiplos NULL em
-- "refId" como não-colidentes, então lançamentos MANUAL (refId sempre null)
-- nunca esbarram neste índice — só AUTO_MP/AUTO_OBRIGACAO (refId preenchido).
CREATE UNIQUE INDEX "FiscalLedgerEntry_origem_refId_key" ON "FiscalLedgerEntry"("origem", "refId");
CREATE INDEX "FiscalLedgerEntry_competencia_tipo_idx" ON "FiscalLedgerEntry"("competencia", "tipo");
CREATE INDEX "FiscalLedgerEntry_data_idx" ON "FiscalLedgerEntry"("data");
