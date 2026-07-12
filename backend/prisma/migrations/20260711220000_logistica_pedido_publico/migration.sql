-- S6 PORTAL-PEDIDO (11/07, docs/PLANEJAMENTOS/VISAO-FUTURO/S6-portal-pedido-publico.md)
-- Pedido PÚBLICO pelo link /pedido/<token>: o cliente da distribuidora pede sem
-- login e o pedido cai como Entrega 'agendada' na operação do dia.
-- Feature DORMENTE nos 2 níveis: env HBX_PEDIDO_PUBLICO_ENABLED (default OFF —
-- GET/POST /public/pedido/:token respondem 404 seco) + LogisticaConfig.
-- pedidoPublicoAtivo (default false). Nada muda sem ligar os dois.
--
--   LogisticaConfig.pedidoPublicoAtivo = toggle POR TENANT. Default false.
--   LogisticaConfig.pedidoPublicoToken = token OPACO rotacionável do link público
--                                        (molde websiteCaptureToken; UNIQUE p/ o
--                                        lookup reverso token→empresa). null =
--                                        link nunca gerado.
--
-- 100% ADITIVO e idempotente: ADD COLUMN IF NOT EXISTS + CREATE UNIQUE INDEX IF
-- NOT EXISTS, zero drop, defaults seguros. Migração escrita à mão (padrão S2/S3):
-- NÃO aplicar em banco vivo por este worker — o dono aplica no deploy do VPS.

ALTER TABLE "LogisticaConfig"
  ADD COLUMN IF NOT EXISTS "pedidoPublicoAtivo" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "LogisticaConfig"
  ADD COLUMN IF NOT EXISTS "pedidoPublicoToken" TEXT;

-- Lookup reverso da rota pública (token → empresa) + garantia de unicidade.
CREATE UNIQUE INDEX IF NOT EXISTS "LogisticaConfig_pedidoPublicoToken_key"
  ON "LogisticaConfig"("pedidoPublicoToken");
