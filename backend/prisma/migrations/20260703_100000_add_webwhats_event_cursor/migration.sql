-- GATEWAY-WA S2 (docs/PLANEJAMENTOS/GATEWAY-WA/GATEWAY-WA-sprint-2-outbox.md).
-- Cursor persistido do consumer da outbox durável do motor Webwhats. Linha ÚNICA (chave por
-- `name` constante = "webwhats_outbox"): último id do EventOutbox do motor já processado.
-- Sobrevive a restart do backend. Aditiva: tabela nova, nada destrutivo.

-- CreateTable
CREATE TABLE "WebwhatsEventCursor" (
    "name" TEXT NOT NULL,
    "cursor" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebwhatsEventCursor_pkey" PRIMARY KEY ("name")
);
