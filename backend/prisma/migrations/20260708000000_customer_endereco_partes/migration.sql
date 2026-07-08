-- LOGÍSTICA-MOBILE B3 (08/07) — endereço ESTRUTURADO do cliente (CustomerProfile).
--
--   numero  = número da porta (parte do endereço).
--   bairro  = bairro (parte do endereço).
--
-- Guardam as PARTES do endereço que hoje só existiam dentro do texto composto
-- "endereco" ("Rua X, 123 - Centro"). Com as partes em coluna própria, a reedição
-- da ficha PARA de degradar (o número não é mais reanexado ao texto). DUPLA ESCRITA:
-- o texto "endereco" continua sendo composto e gravado como hoje (rota/deep-link/
-- telas antigas seguem lendo "endereco" inteiro) — estas colunas são aditivas.
--
-- ADITIVO e idempotente: ADD COLUMN IF NOT EXISTS, sem default disruptivo, ZERO
-- drop. Migração escrita à mão (padrão N1/B1/F1): o dono aplica no deploy.

ALTER TABLE "CustomerProfile"
  ADD COLUMN IF NOT EXISTS "numero" TEXT,
  ADD COLUMN IF NOT EXISTS "bairro" TEXT;
