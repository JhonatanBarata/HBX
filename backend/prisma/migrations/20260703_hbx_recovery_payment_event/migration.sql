-- HBX Recovery S2 (arquitetura nº14) — Ledger de eventos de pagamento.
-- ADITIVO E NÃO-DESTRUTIVO: cria APENAS 1 tabela nova (HbxRecoveryPaymentEvent)
-- + 2 índices + 1 FK para HbxRecoveryPayment. NÃO altera/dropa nenhuma coluna,
-- tabela ou índice existente. Não toca em saldo, preferência MP nem no fluxo de
-- pagamento — a escrita do ledger é fire-and-forget no service (try/catch).

CREATE TABLE "HbxRecoveryPaymentEvent" (
    "id"          TEXT NOT NULL,
    "companyId"   INTEGER NOT NULL,
    "paymentId"   TEXT NOT NULL,
    "type"        TEXT NOT NULL,
    "amount"      DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actorUserId" INTEGER,
    "source"      TEXT NOT NULL,
    "payloadJson" TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HbxRecoveryPaymentEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HbxRecoveryPaymentEvent_companyId_paymentId_createdAt_idx" ON "HbxRecoveryPaymentEvent"("companyId", "paymentId", "createdAt");
CREATE INDEX "HbxRecoveryPaymentEvent_companyId_createdAt_idx" ON "HbxRecoveryPaymentEvent"("companyId", "createdAt");

ALTER TABLE "HbxRecoveryPaymentEvent" ADD CONSTRAINT "HbxRecoveryPaymentEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "HbxRecoveryPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
