-- CONTABIL S5 — copiloto "Fechar o mês".
-- Aditivo: 2 modelos novos (FiscalComprovante, FiscalMonthlyReport). NÃO toca em
-- nenhuma tabela existente e NÃO altera fluxo de pagamento. O fechamento do mês
-- só grava estado do dono (fechadoEm em FiscalRevenueMonth já existe; obrigações
-- viram CONFERIDO via o marcarObrigacao já existente) e guarda comprovantes/
-- relatório. Nenhuma transmissão automática (Lei do Contabil nº1).

-- Comprovantes por obrigação (recibo PGDAS-D, guia/comprovante DAS, print e-CAC).
-- Storage em disco (padrão SellerOnboardingAttachment): arquivo em disco, metadados aqui.
CREATE TABLE "FiscalComprovante" (
    "id"               TEXT NOT NULL,
    "obligationId"     TEXT NOT NULL,
    "competencia"      TEXT NOT NULL,
    "tipo"             TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "storedFilename"   TEXT NOT NULL,
    "storagePath"      TEXT NOT NULL,
    "contentType"      TEXT,
    "byteSize"         INTEGER NOT NULL,
    "sha256"           TEXT NOT NULL,
    "status"           TEXT NOT NULL DEFAULT 'permanent',
    "deletedAt"        TIMESTAMP(3),
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiscalComprovante_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FiscalComprovante_obligationId_status_idx" ON "FiscalComprovante"("obligationId", "status");
CREATE INDEX "FiscalComprovante_competencia_idx" ON "FiscalComprovante"("competencia");

-- Histórico do relatório mensal narrativo (determinístico, gerado no fechamento).
-- 1 por competência (upsert: o último fechamento sobrescreve).
CREATE TABLE "FiscalMonthlyReport" (
    "id"          TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "texto"       TEXT NOT NULL,
    "payloadJson" TEXT,
    "enviadoZap"  BOOLEAN NOT NULL DEFAULT false,
    "geradoViaIa" BOOLEAN NOT NULL DEFAULT false,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalMonthlyReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FiscalMonthlyReport_competencia_key" ON "FiscalMonthlyReport"("competencia");
CREATE INDEX "FiscalMonthlyReport_competencia_idx" ON "FiscalMonthlyReport"("competencia");
