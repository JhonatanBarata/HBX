-- CONTABIL S6 — NFS-e Nacional automática (primeiro braço externo).
-- Aditivo: 2 modelos novos (FiscalInvoice, FiscalAutomationLog). NÃO toca em
-- nenhuma tabela existente e NÃO altera fluxo de pagamento. Tudo atrás de flag
-- HBX_CONTABIL_NFSE_ENABLED (default OFF) — deploy com flag OFF é inerte por
-- design. Certificado A1/senha vivem CRIPTOGRAFADOS no FiscalProfile
-- (certA1Encrypted, já existente desde o S1) — nada de segredo aqui.

-- FiscalInvoice: 1 nota por pagamento MP aprovado. paymentRefId (@unique) =
-- MasterBillingLedgerEntry.id → idempotência (mesmo pagamento nunca vira 2 notas).
-- valorCents é LÍQUIDO de estorno (mesma base do S1/S4). Cancelamento SEMPRE
-- manual pelo portal (não automatizado) — por isso não há campo/rotina de cancel.
CREATE TABLE "FiscalInvoice" (
    "id"           TEXT NOT NULL,
    "paymentRefId" TEXT NOT NULL,
    "competencia"  TEXT NOT NULL,
    "companyId"    INTEGER NOT NULL,
    "tomadorNome"  TEXT,
    "tomadorDoc"   TEXT,
    "valorCents"   INTEGER NOT NULL,
    "status"       TEXT NOT NULL DEFAULT 'PENDENTE',
    "chaveAcesso"  TEXT,
    "numeroDps"    TEXT,
    "xmlGzB64"     TEXT,
    "erroMsg"      TEXT,
    "tentativas"   INTEGER NOT NULL DEFAULT 0,
    "emitidaEm"    TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalInvoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FiscalInvoice_paymentRefId_key" ON "FiscalInvoice"("paymentRefId");
CREATE UNIQUE INDEX "FiscalInvoice_chaveAcesso_key" ON "FiscalInvoice"("chaveAcesso");
CREATE INDEX "FiscalInvoice_competencia_idx" ON "FiscalInvoice"("competencia");
CREATE INDEX "FiscalInvoice_status_idx" ON "FiscalInvoice"("status");

-- FiscalAutomationLog: trilha de auditoria de toda chamada externa oficial
-- (Lei do Contabil nº4). Compartilhado S6 (NFSE) + S7 (SERPRO). requestResumo
-- NUNCA carrega segredo. aprovadoPor = 'auto-flag' | userId do dono.
CREATE TABLE "FiscalAutomationLog" (
    "id"            TEXT NOT NULL,
    "sistema"       TEXT NOT NULL,
    "operacao"      TEXT NOT NULL,
    "requestResumo" TEXT NOT NULL,
    "httpStatus"    INTEGER,
    "sucesso"       BOOLEAN NOT NULL,
    "resultRef"     TEXT,
    "aprovadoPor"   TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiscalAutomationLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FiscalAutomationLog_sistema_operacao_idx" ON "FiscalAutomationLog"("sistema", "operacao");
CREATE INDEX "FiscalAutomationLog_createdAt_idx" ON "FiscalAutomationLog"("createdAt");
