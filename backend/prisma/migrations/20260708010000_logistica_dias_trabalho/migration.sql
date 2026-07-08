-- LOGÍSTICA-MOBILE TASK 4 (08/07) — dias da semana em que a empresa trabalha.
--
--   LogisticaConfig.diasTrabalho = CSV ISO "1,2,3,4,5,6,7" (1=segunda…7=domingo,
--   mesma convenção de ClienteProduto.diasSemana). null = default (sem restrição
--   configurada ainda). Usado pelo pop-up "Gerar entregas" do app pra sugerir só
--   os dias úteis do tenant.
--
-- 100% ADITIVO: coluna nova, opcional, sem default disruptivo, ZERO drop.
-- IF NOT EXISTS p/ idempotência (padrão dos aditivos do repo).

ALTER TABLE "LogisticaConfig"
  ADD COLUMN IF NOT EXISTS "diasTrabalho" TEXT;
