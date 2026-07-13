-- OOBE de prospecção: estado e cidade são coletados junto dos segmentos.
-- Migração aditiva e não destrutiva: ambas as colunas são nullable,
-- sem default e sem backfill para preservar todas as empresas existentes.

ALTER TABLE "Company"
  ADD COLUMN IF NOT EXISTS "prospectingEstado" TEXT;

ALTER TABLE "Company"
  ADD COLUMN IF NOT EXISTS "prospectingCidade" TEXT;
