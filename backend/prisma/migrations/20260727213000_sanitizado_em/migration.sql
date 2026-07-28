-- 27/07 — "não sanitizar 2x" (ordem do dono): carimbo de quando o SANITIZADOR já tentou
-- curar este endereço, com ou sem sucesso. Enquanto o cadastro não for editado
-- (updatedAt <= sanitizadoEm), o cliente fica FORA da fila e vira item manual na lista.
-- Coluna nova, nullable, sem default: nenhuma linha existente muda de comportamento
-- (null = nunca passou pelo processo, que é a verdade da base de hoje).
ALTER TABLE "CustomerProfile" ADD COLUMN "sanitizadoEm" TIMESTAMP(3);
ALTER TABLE "LocalEntrega" ADD COLUMN "sanitizadoEm" TIMESTAMP(3);
