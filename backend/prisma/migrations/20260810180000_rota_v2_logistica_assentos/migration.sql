-- ROTA v2 F2c (10/08, "PICAR A PONTE" — refundação da cobrança) — override de
-- ASSENTOS por empresa. Plano com nível (BASIC/ADVANCED/FULL) virou rota
-- ILIMITADA: o que limita é quantos motoristas rodam AO MESMO TEMPO no mesmo
-- dia, não mais quantas paradas o mês inclui. Migration ADITIVA, coluna
-- NULLABLE (sem DEFAULT): null = herda `assentosInclusos` do nível
-- (logistica-nivel-catalog.ts); nenhuma linha existente muda de comportamento.
ALTER TABLE "LogisticaConfig" ADD COLUMN IF NOT EXISTS "logisticaAssentos" INTEGER;
