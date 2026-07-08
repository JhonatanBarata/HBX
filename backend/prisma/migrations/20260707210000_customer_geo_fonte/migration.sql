-- LOGÍSTICA B1 (07/07) — origem da coordenada do cliente (CustomerProfile.lat/lng),
-- pra nunca sobrescrever um pino bom com um ruim.
--
--   geoFonte  = "geocode" (CEP→Nominatim, impreciso no BR — número de casa raro
--               no OSM) | "gps_cadastro" (GPS do "Usar este local" no cadastro —
--               o dono marcou manualmente, NUNCA sobrescrito depois) |
--               "gps_entrega" (GPS de ouro da porta real, gravado pelo confirmar
--               quando accuracy<=60m). null = legado (sem origem registrada).
--
-- ADITIVO e idempotente: ADD COLUMN IF NOT EXISTS, sem default disruptivo, ZERO
-- drop. Migração escrita à mão (padrão N1/R2/F1): o dono aplica no deploy.

ALTER TABLE "CustomerProfile"
  ADD COLUMN IF NOT EXISTS "geoFonte" TEXT;
