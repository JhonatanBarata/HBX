-- LOGÍSTICA F1 (07/07) — financeiro do cliente NA FICHA do app de entrega.
--
--   CustomerProfile.limiteFiado  = teto de fiado POR CLIENTE (controle de risco).
--                                  null = sem limite (comportamento atual). O app
--                                  AVISA o entregador quando o saldo em aberto
--                                  estoura o teto — nunca bloqueia a entrega.
--   LogisticaConfig.pixChave     = chave Pix do TENANT p/ o BR Code EMV gerado
--                                  100% no app (taxa ZERO, sem MercadoPago).
--                                  null = recurso desligado (nenhum QR aparece).
--   LogisticaConfig.pixNome      = nome do recebedor (obrigatório no payload EMV).
--   LogisticaConfig.pixCidade    = cidade do recebedor (obrigatório no payload EMV).
--
-- ADITIVO e idempotente: ADD COLUMN IF NOT EXISTS, sem default disruptivo, ZERO
-- drop. Migração escrita à mão (padrão N1/R2/R4): o dono aplica no deploy.

ALTER TABLE "CustomerProfile"
  ADD COLUMN IF NOT EXISTS "limiteFiado" DOUBLE PRECISION;

ALTER TABLE "LogisticaConfig"
  ADD COLUMN IF NOT EXISTS "pixChave" TEXT,
  ADD COLUMN IF NOT EXISTS "pixNome" TEXT,
  ADD COLUMN IF NOT EXISTS "pixCidade" TEXT;
