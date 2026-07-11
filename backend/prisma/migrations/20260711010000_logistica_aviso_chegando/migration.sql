-- AVISO-CHEGANDO (11/07) — "tô chegando" no WhatsApp do cliente a ~500m. Reusa o
-- MESMO motor/consentimento do aviso "entregue" (dispararWhatsappChegando espelha
-- dispararWhatsappEntregue: MESMO queueOutboundForCompany, MESMA normalização
-- E.164, MESMO template engine) — é um aviso INDEPENDENTE (a empresa pode ligar
-- só um dos dois: avisoWhatsEnabled e avisoChegandoEnabled são toggles separados).
--
--   Entrega.avisoChegandoAt         = trava de idempotência (null = ainda não
--                                      avisou; claim RACE-SAFE via updateMany
--                                      WHERE avisoChegandoAt IS NULL — 2 chamadas
--                                      simultâneas do app não disparam 2 WhatsApp).
--   LogisticaConfig.avisoChegandoEnabled    = toggle global, DEFAULT FALSE (ao
--                                      contrário do avisoWhatsEnabled/entregue,
--                                      que nasce true — "chegando" é feature nova,
--                                      opt-in; sem config ainda = OFF).
--   LogisticaConfig.avisoChegandoTemplate   = texto do admin; null = fallback fixo.
--   LogisticaConfig.avisoChegandoDistanciaM = raio do "tô chegando" em metros
--                                      (default 500m; clamp 100–2000 no serviço).
--
-- 100% ADITIVO: colunas novas, opcionais/com default seguro, ZERO drop/rename.
-- IF NOT EXISTS p/ idempotência (padrão dos aditivos do repo). Migração escrita
-- à mão (padrão N1/R2/R3/M2/M5): o dono aplica no deploy.

ALTER TABLE "Entrega"
  ADD COLUMN IF NOT EXISTS "avisoChegandoAt" TIMESTAMP(3);

ALTER TABLE "LogisticaConfig"
  ADD COLUMN IF NOT EXISTS "avisoChegandoEnabled"    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "avisoChegandoTemplate"   TEXT,
  ADD COLUMN IF NOT EXISTS "avisoChegandoDistanciaM" INTEGER NOT NULL DEFAULT 500;
