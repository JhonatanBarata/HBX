-- FREIO ÚNICO POR FONTE (Sprint 3 MOTOR-RFB-FILA, 02/07) — generaliza o disjuntor mensal do Brave.
-- Contador persistente por fonte × período: source ("brave", "brasilapi", "google_places", "ddg",
-- "bing", "searxng"...) e yearMonth = período ("YYYY-MM" mensal; "YYYY-MM-DD" p/ fonte de cap DIÁRIO
-- como google_places — a coluna guarda a CHAVE DO PERÍODO, não só ano-mês).
-- Lido/gravado pelo SourceBudgetService (backend/src/webscraping/source-budget/).
-- ADITIVA: tabela nova; BraveApiUsage fica de pé (compat até cutover) e o histórico é copiado
-- pra cá pro teto do mês corrente NÃO zerar na virada de mecanismo.

-- CreateTable
CREATE TABLE "SourceApiUsage" (
    "source" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceApiUsage_pkey" PRIMARY KEY ("source","yearMonth")
);

-- Semeia o histórico do disjuntor Brave: o contador do mês corrente continua valendo
-- (sem isso o cutover no meio do mês zeraria a cota já consumida).
INSERT INTO "SourceApiUsage" ("source", "yearMonth", "count", "updatedAt")
SELECT 'brave', "yearMonth", "count", "updatedAt" FROM "BraveApiUsage"
ON CONFLICT ("source", "yearMonth") DO NOTHING;
