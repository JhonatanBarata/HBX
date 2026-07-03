-- CONTABIL S2 — calendário fiscal + alertas (obligation-scheduler).
-- Aditivo: 1 modelo novo (FiscalObligation). NÃO toca em nenhuma tabela
-- existente e NÃO altera fluxo de pagamento — o Contabil só GERA obrigações
-- e MARCA transições manuais (dono aperta o botão, nunca transmite sozinho).

CREATE TABLE "FiscalObligation" (
    "id"              TEXT NOT NULL,
    "competencia"     TEXT NOT NULL,
    "tipo"            TEXT NOT NULL,
    "dueDate"         TIMESTAMP(3) NOT NULL,
    "estado"          TEXT NOT NULL DEFAULT 'AGUARDANDO_DADOS',
    "payloadJson"     TEXT,
    "resultJson"      TEXT,
    "naoAplicavel"    BOOLEAN NOT NULL DEFAULT false,
    "alertasEnviados" TEXT NOT NULL DEFAULT '[]',
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiscalObligation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FiscalObligation_competencia_tipo_key" ON "FiscalObligation"("competencia", "tipo");
CREATE INDEX "FiscalObligation_dueDate_idx" ON "FiscalObligation"("dueDate");
CREATE INDEX "FiscalObligation_estado_idx" ON "FiscalObligation"("estado");
