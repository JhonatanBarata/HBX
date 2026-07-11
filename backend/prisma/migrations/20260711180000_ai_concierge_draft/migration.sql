-- CONCIERGE IA (Missão F — RELEASE-20X S5): tabela de rascunho da busca guiada.
-- ADITIVA e idempotente (IF NOT EXISTS) — nenhuma tabela existente muda.
CREATE TABLE IF NOT EXISTS "AiConciergeDraft" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'START',
    "slotsJson" TEXT NOT NULL DEFAULT '{}',
    "transcriptJson" TEXT NOT NULL DEFAULT '[]',
    "metaJson" TEXT,
    "costPreviewJson" TEXT,
    "confirmToken" TEXT,
    "confirmExpiresAt" TIMESTAMP(3),
    "slotsHash" TEXT,
    "runId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiConciergeDraft_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AiConciergeDraft_companyId_userId_status_idx"
    ON "AiConciergeDraft"("companyId", "userId", "status");
