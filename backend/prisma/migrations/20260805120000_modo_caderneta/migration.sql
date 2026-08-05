-- MODO CADERNETA (PR04082026-MODO-CADERNETA) — chave por tenant do modo
-- caderneta do APK (venda por toque sem rota, GPS trancado até o mapa provar).
-- Aditivo puro; default false = plataforma intacta.

ALTER TABLE "LogisticaConfig" ADD COLUMN IF NOT EXISTS "modoCaderneta" BOOLEAN NOT NULL DEFAULT false;
