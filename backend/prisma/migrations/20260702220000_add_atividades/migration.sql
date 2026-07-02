-- WORM-12 (02/07, docs/PLANEJAMENTOS/worm/12-tela-atividades-agenda.md): agenda do vendedor.
-- Atividade = tarefa datada amarrada a um card (VendasLead). A tela "Hoje" le por
-- companyId+responsavelId+vencimento. Concluir escreve UM evento na VendasLeadTimelineEvent
-- (reuso; sem timeline nova). WORM-13 cria por automacao via criadaPor='automacao'.
-- ADITIVA: so cria tabela/indices/FK — nada existente e alterado. migrate dev quebrado
-- (banco dev desligado) → migration escrita a mao, padrao da casa (aplicar com migrate deploy).

-- CreateTable
CREATE TABLE IF NOT EXISTS "Atividade" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'ligacao',
    "titulo" TEXT NOT NULL,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "duracao" INTEGER,
    "responsavelId" INTEGER,
    "realizadaEm" TIMESTAMP(3),
    "resultado" TEXT,
    "criadaPor" TEXT NOT NULL DEFAULT 'user',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Atividade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Atividade_companyId_responsavelId_vencimento_idx" ON "Atividade"("companyId", "responsavelId", "vencimento");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Atividade_leadId_idx" ON "Atividade"("leadId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Atividade_companyId_realizadaEm_vencimento_idx" ON "Atividade"("companyId", "realizadaEm", "vencimento");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Atividade" ADD CONSTRAINT "Atividade_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "VendasLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
