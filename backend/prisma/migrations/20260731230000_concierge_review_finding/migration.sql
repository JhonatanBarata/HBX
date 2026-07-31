-- REVISOR NOTURNO DO CONCIERGE (31/07/2026)
--
-- Nasceu do print do dono: o cliente perguntou "teria como pesquisar em outro
-- estado?" e levou 3x o MESMO resumo de volta. Ninguém no sistema sabia que
-- aquilo tinha acontecido — a conversa já estava gravada em
-- AiConciergeDraft.transcriptJson e nunca era lida por ninguém.
--
-- Esta tabela é o caderno do revisor: de madrugada, o modelo em faixa BATCH
-- relê as conversas do dia e anota onde a máquina falhou com o cliente. O valor
-- não é o relatório — é o DATASET: cada linha aqui é uma frase real que o
-- extrator errou, munição para corrigir prompt e virar teste de regressão.
--
-- Aditiva pura: tabela nova, nenhuma coluna existente tocada, nenhum backfill.
-- Sem FK para AiConciergeDraft de propósito — o achado sobrevive ao rascunho,
-- que expira em 24h; a evidência é justamente o que precisa durar.
CREATE TABLE "AiConciergeReviewFinding" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "reviewedFor" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "failureKind" TEXT,
    "evidence" TEXT,
    "suggestion" TEXT,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiConciergeReviewFinding_pkey" PRIMARY KEY ("id")
);

-- Leitura típica: "o que falhou no dia X" e "esse rascunho já foi revisado?"
-- (o segundo é a trava de idempotência — revisar 2x a mesma conversa é gastar
-- IA à toa e inflar o número de falhas do relatório).
CREATE INDEX "AiConciergeReviewFinding_reviewedFor_verdict_idx" ON "AiConciergeReviewFinding"("reviewedFor", "verdict");
CREATE UNIQUE INDEX "AiConciergeReviewFinding_draftId_key" ON "AiConciergeReviewFinding"("draftId");
