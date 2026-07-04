-- LOGÍSTICA-MOBILE M5 (05/07) — regras do admin: aviso de entrega por WhatsApp.
-- Toggle POR CLIENTE do aviso "entregue": 2 níveis de silêncio somam com o
-- global (LogisticaConfig.avisoWhatsEnabled). O disparo do N6 só sai quando
--   LogisticaConfig.avisoWhatsEnabled = true  E  cliente.avisarEntrega = true.
-- ADITIVO e idempotente: ADD COLUMN IF NOT EXISTS, default seguro (true = mantém
-- o comportamento atual), ZERO drop. NÃO aplicar em banco vivo aqui — segue o
-- padrão N1 (migração à mão; o dono aplica no deploy).

ALTER TABLE "CustomerProfile"
  ADD COLUMN IF NOT EXISTS "avisarEntrega" BOOLEAN NOT NULL DEFAULT true;
