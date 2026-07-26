-- S7 LEAD-CENTRICO (26/07, docs/PLANEJAMENTOS/PR25072026-LEAD-CENTRICO/07-pool-raiz.md):
-- "marquinha"/supressao GLOBAL por contato (cnpj/telefone/e-mail). ADITIVA PURA: so cria
-- tabela+indices novos, nada existente e tocado. Log de EVENTOS append-only (sem
-- @@unique por chave) — colunas cruas sem FK/back-relation, mesmo padrao de
-- Cadencia/Atividade/VendasComercialConfig (ver comentarios desses models no
-- schema.prisma). SQL escrito a mao (migrate dev local quebrado por drift
-- preexistente, padrao da casa) — shape conferido 1:1 contra o model
-- VendasContactSuppression do schema.prisma.

-- CreateTable
CREATE TABLE IF NOT EXISTS "VendasContactSuppression" (
    "id" TEXT NOT NULL,
    "contactType" TEXT NOT NULL,
    "contactKey" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "suppressedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "originCompanyId" INTEGER,
    "originLeadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendasContactSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "VendasContactSuppression_contactType_contactKey_expiresAt_idx" ON "VendasContactSuppression"("contactType", "contactKey", "expiresAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "VendasContactSuppression_originCompanyId_createdAt_idx" ON "VendasContactSuppression"("originCompanyId", "createdAt");
