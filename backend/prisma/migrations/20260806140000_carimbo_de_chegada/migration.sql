-- CARIMBO DE CHEGADA (PR06082026-GPS-FULLSCREEN, etapa B) — a hora em que o
-- entregador CHEGOU na parada. A hora de SAÍDA já existia (deliveredAt, gravada
-- no desfecho da folha); faltava a outra ponta, e sem as duas não dá pra
-- responder "quanto tempo ele ficou nesta parada".
--
-- NÃO é o avisoChegandoAt: aquele é a hora em que o CLIENTE foi avisado a ~500m
-- (mensageria, com claim de idempotência). Este é auditoria da VISITA.
--
-- Aditivo puro: coluna nula, sem default e sem backfill. Entrega antiga fica com
-- NULL — que é a verdade ("não sei quando chegou"), e não uma hora inventada.

ALTER TABLE "Entrega" ADD COLUMN IF NOT EXISTS "arrivedAt" TIMESTAMP(3);
