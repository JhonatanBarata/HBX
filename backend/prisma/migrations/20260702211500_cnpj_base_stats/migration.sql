-- HOT-02: contagem por opção de filtro da Base Receita, cacheada 1x/mês pós-import
-- (nunca GROUP BY ao vivo em 28M linhas). Aditiva — não toca CnpjPublicCompany/CnpjPublicCnae.
CREATE TABLE IF NOT EXISTS "CnpjBaseStats" (
    "id" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CnpjBaseStats_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CnpjBaseStats_group_key_key" ON "CnpjBaseStats"("group", "key");

CREATE INDEX IF NOT EXISTS "CnpjBaseStats_group_idx" ON "CnpjBaseStats"("group");
