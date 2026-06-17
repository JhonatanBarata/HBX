-- Afinidade de segmento observada (PR17062026020-3).
-- Contador de ações por segmento. Só vira boost ao atingir 3 ações. Aditivo e idempotente.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "segmentAffinityJson" TEXT;
