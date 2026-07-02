-- WORM-15 (02/07, docs/PLANEJAMENTOS/worm/15-pesquisas-salvas-compartilhar.md):
-- pesquisa SALVA nomeada pelo usuario (filtro do Radar guardado para re-rodar).
-- Diferente do WebscrapingSearchHistory (historico automatico): esta e explicita,
-- nomeada, e pode ser atribuida a um vendedor (assignedSellerId) para virar fonte
-- preferencial da distribuicao daquele vendedor. filtroJson = subset de
-- RadarFiltersInput. ADITIVA: so cria tabela/indices — nada existente e alterado.
-- migrate dev quebrado (banco dev desligado) -> migration a mao, padrao da casa
-- (aplicar com migrate deploy).

-- CreateTable
CREATE TABLE IF NOT EXISTS "SavedSearch" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "filtroJson" TEXT NOT NULL,
    "assignedSellerId" INTEGER,
    "lastRunAt" TIMESTAMP(3),
    "lastCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedSearch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SavedSearch_companyId_ownerId_createdAt_idx" ON "SavedSearch"("companyId", "ownerId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SavedSearch_companyId_assignedSellerId_idx" ON "SavedSearch"("companyId", "assignedSellerId");
