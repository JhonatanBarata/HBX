-- Lei do dono (26/07): entregar é entregar LIGADO. AGENDA-SEMANAL e
-- ROTA-CONFERIDA já estavam publicadas e ficaram no escuro atrás de flag;
-- este deploy cria a coluna que faltava e liga as duas pra TODAS as empresas
-- no mesmo ato (sem passo manual depois). Empresa nova nasce ligada (default).
ALTER TABLE "LogisticaConfig" ADD COLUMN IF NOT EXISTS "rotaConferidaAtiva" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "LogisticaConfig" ALTER COLUMN "agendaV2Ativa" SET DEFAULT true;
UPDATE "LogisticaConfig" SET "agendaV2Ativa" = true, "rotaConferidaAtiva" = true;
