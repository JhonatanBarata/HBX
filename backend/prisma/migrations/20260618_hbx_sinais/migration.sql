-- 048-1B: sinais de oportunidade por lead (HORA + intenção).
-- Aditivo: campo nullable, leads antigos sem sinal continuam funcionando.

ALTER TABLE "RadarLeadPool" ADD COLUMN "signalsJson" TEXT;
