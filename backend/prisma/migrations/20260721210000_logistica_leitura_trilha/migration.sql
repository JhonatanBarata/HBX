-- S2 (PR21072026-MONTAR-ROTA-PLAY) — trilha (breadcrumb GPS) da Leitura de
-- Rota: POST /logistica/leitura/:id/trilha grava [{lat,lng,ts}] já
-- simplificado (Douglas-Peucker) no aparelho. Migration ADITIVA: só
-- ALTER TABLE ADD COLUMN, nada destrutivo.

ALTER TABLE "LogisticaLeituraSessao" ADD COLUMN "trilhaJson" JSONB;
