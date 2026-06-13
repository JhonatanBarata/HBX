-- Atendimento: respostas prontas ("Inserir mensagem rápida"), por empresa.
-- Aditivo e isolado (companyId escalar, sem FK declarada). Ordem do dono 12/06/2026.

-- CreateTable
CREATE TABLE "AtendimentoQuickReply" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "createdByUserId" INTEGER,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AtendimentoQuickReply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AtendimentoQuickReply_companyId_sortOrder_idx" ON "AtendimentoQuickReply"("companyId", "sortOrder");

-- CreateIndex
CREATE INDEX "AtendimentoQuickReply_companyId_createdAt_idx" ON "AtendimentoQuickReply"("companyId", "createdAt");
