-- HISTÓRICO DO CLIENTE (22/07, pedido do dono) — log de VISITA por cliente,
-- alimentado pelo desfecho da chegada no APK (entregue / pago / sem atendimento).
-- Tabela NOVA e isolada: apagar histórico apaga só a linha daqui; Entrega e
-- FinanceiroCharge (o dinheiro) nunca são tocados. Migration ADITIVA: só CREATE.

CREATE TABLE "ClienteHistorico" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "customerProfileId" TEXT NOT NULL,
    "entregaId" TEXT,
    "tipo" TEXT NOT NULL,
    "titulo" VARCHAR(120) NOT NULL,
    "itensResumo" VARCHAR(240),
    "valorAnterior" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorEvento" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "receiptMethod" TEXT,
    "motivo" VARCHAR(240),
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "registradoPorUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClienteHistorico_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClienteHistorico_companyId_customerProfileId_createdAt_idx" ON "ClienteHistorico"("companyId", "customerProfileId", "createdAt");

ALTER TABLE "ClienteHistorico" ADD CONSTRAINT "ClienteHistorico_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClienteHistorico" ADD CONSTRAINT "ClienteHistorico_customerProfileId_fkey" FOREIGN KEY ("customerProfileId") REFERENCES "CustomerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SetNull: limpar/apagar a entrega não pode levar embora o registro de que o
-- cliente foi atendido e pagou.
ALTER TABLE "ClienteHistorico" ADD CONSTRAINT "ClienteHistorico_entregaId_fkey" FOREIGN KEY ("entregaId") REFERENCES "Entrega"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClienteHistorico" ADD CONSTRAINT "ClienteHistorico_registradoPorUserId_fkey" FOREIGN KEY ("registradoPorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
