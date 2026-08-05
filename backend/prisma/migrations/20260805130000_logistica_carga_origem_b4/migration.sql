-- B4 BALCÃO (PR04082026-BALCAO-DISTRIBUIDORA) — reserva amarrada ao ciclo da
-- rota: a carga do dia ganha ORIGEM (MANUAL = contagem do operador, a rota não
-- sobrescreve; ROTA = declarada sozinha pelo iniciar/encerrar). Aditivo puro.

ALTER TABLE "LogisticaCargaDia" ADD COLUMN IF NOT EXISTS "origem" VARCHAR(8) NOT NULL DEFAULT 'MANUAL';
