-- MATA OS 2 BLOQUEIOS DO BOT — SEM LEGADO (31/07/2026, ordem do dono)
--
-- Bloqueio 1: "Armar bot" do /master. O pino Company.botArm* fazia todo bot
-- novo nascer morto atrás de um 402 "Acione o suporte" — atrito que o dono
-- mandou remover. Bloqueio 2: a chave geral do header (BotConfig domain
-- 'bot_master_switch'), que desligava tudo por cima de tudo.
--
-- O substituto já está no ar ANTES desta migration (ordem importa — nunca uma
-- janela sem gate nenhum): a ENTREVISTA FORÇADA fail-closed em
-- VendasComercialConfig (empresaFazTexto + catálogo + persona) — commit
-- "identidade unica da IA + entrevista forcada". Chip conectado e config por
-- tipo continuam sendo pré-voo. O freio anti-ban por env segue intocado.
--
-- Sem legado: colunas dropadas e linhas da chave geral apagadas. Coluna morta
-- mente — enquanto existir, alguém volta a lê-la.

ALTER TABLE "Company"
  DROP COLUMN IF EXISTS "botArmedAt",
  DROP COLUMN IF EXISTS "botArmChannel",
  DROP COLUMN IF EXISTS "botArmedByUserId",
  DROP COLUMN IF EXISTS "botArmReason";

DELETE FROM "BotConfig" WHERE "domain" = 'bot_master_switch';
