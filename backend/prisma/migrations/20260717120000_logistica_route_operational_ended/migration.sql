-- PR17072026 Onda 1 — "encerrada" operacional decoupled do status de cobrança.
-- Coluna nullable: ADD COLUMN sem default é metadata-only no Postgres (sem
-- rewrite de tabela, sem lock longo). Encerrar a rota marca isto; (re)iniciar zera.
ALTER TABLE "LogisticaRoute"
  ADD COLUMN "operationalEndedAt" TIMESTAMP(3);
