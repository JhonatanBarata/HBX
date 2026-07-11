-- S3 RESUMO-DIÁRIO (11/07, docs/PLANEJAMENTOS/VISAO-FUTURO/S3-resumo-diario-dono.md)
-- Resumo diário do negócio no WhatsApp do DONO do tenant (entregas de hoje/ontem +
-- recebido/em aberto quando o financeiro do tenant está ativo), enviado pelo chip
-- da própria empresa pro Company.contactPhone VERIFICADO.
-- Feature DORMENTE nos 2 níveis: env HBX_RESUMO_DIARIO_ENABLED (default OFF, o
-- scheduler nem arma) + LogisticaConfig.resumoDiarioAtivo (default false).
--
--   LogisticaConfig.resumoDiarioAtivo       = toggle POR TENANT. Default false.
--   LogisticaConfig.resumoDiarioHora        = hora LOCAL do envio (0-23). Default 7.
--   LogisticaConfig.resumoDiarioUltimoEnvio = marca de IDEMPOTÊNCIA (1 envio/dia:
--                                             só envia se < hoje 00:00; restart não reenvia).
--
-- 100% ADITIVO e idempotente: ADD COLUMN IF NOT EXISTS, zero drop, defaults seguros.
-- Migração escrita à mão (padrão S2/F1): NÃO aplicar em banco vivo por este worker —
-- o dono aplica no deploy do VPS.

ALTER TABLE "LogisticaConfig"
  ADD COLUMN IF NOT EXISTS "resumoDiarioAtivo" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "LogisticaConfig"
  ADD COLUMN IF NOT EXISTS "resumoDiarioHora" INTEGER NOT NULL DEFAULT 7;

ALTER TABLE "LogisticaConfig"
  ADD COLUMN IF NOT EXISTS "resumoDiarioUltimoEnvio" TIMESTAMP(3);
