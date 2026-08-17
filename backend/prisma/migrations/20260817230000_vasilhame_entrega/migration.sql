-- VASILHAME / CASCO — ONDA 2 (17/08/2026): a ENTREGA passa a mover o saldo.
--
-- A onda 1 (20260817220000_vasilhame_casco) criou o saldo e o extrato; o casco
-- só andava pela MÃO, no cadastro. Falta o número que só existe na porta:
-- quantos VAZIOS o entregador recolheu naquele item. Com ele o desfecho fecha a
-- conta sozinho — saldo += entregue − recolhido.
--
-- 100% ADITIVO E NÃO-DESTRUTIVO: 1 coluna NULA em "EntregaItem". Nula de
-- propósito, e é a diferença que segura a onda inteira:
--   NULL = a folha nunca falou de casco (entrega legada, produto sem vasilhame,
--          APK velho) → NÃO move saldo nenhum;
--   0    = o entregador conferiu e não voltou nada → MOVE (entregou 2, voltou 0
--          = +2 na casa do cliente).
-- Se os dois fossem "zero", o primeiro deploy injetaria casco retroativo em toda
-- entrega da história do tenant.
-- "IF NOT EXISTS" (padrão dos aditivos do repo, migration idempotente).

ALTER TABLE "EntregaItem" ADD COLUMN IF NOT EXISTS "vasilhameRetornado" INTEGER;
