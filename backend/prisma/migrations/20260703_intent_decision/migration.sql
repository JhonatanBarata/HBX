-- INTENTENGINE S1 (docs/PLANEJAMENTOS/INTENTENGINE/INTENTENGINE-sprint1.md):
-- log estruturado de CADA decisão do motor de intenção único (IntentEngineService).
-- Cria o dataset real texto → rótulo → fonte (ia/keyword) que decide upgrade de
-- modelo/GPU com dados em vez de achismo. Gravado BEST-EFFORT pelo backend (falha
-- no insert nunca quebra a classificação). flow = prospeccao|atendimento|simulador;
-- source = ai|keyword; label = kind do ProspectingIntentClassification. textPreview
-- limitado a 200 chars no código. ADITIVA: só cria tabela/índice — nada existente é
-- alterado. migrate dev quebrado (banco dev desligado) -> migration à mão, padrão da
-- casa (aplicar com migrate deploy).

-- CreateTable
CREATE TABLE IF NOT EXISTS "IntentDecision" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "conversationId" INTEGER,
    "flow" TEXT NOT NULL,
    "textPreview" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "latencyMs" INTEGER,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntentDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IntentDecision_companyId_createdAt_idx" ON "IntentDecision"("companyId", "createdAt");
