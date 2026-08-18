-- PARADA PRIORITÁRIA (17/08/2026) — ordens 3b e 5 do dono.
--
-- "3b comportamento Prioridade: coloca na prioridade, comum encaixa na rota."
-- "5 (...) Reorganizar = Reorganiza por distancia, porém o q foi adicionado
--  como prioridade fica em vermelho, e não entra nesse filtro."
--
-- POR QUE UMA COLUNA E NÃO `rotaOrdem`: `rotaOrdem` é o RETRATO do último
-- plano. Todo `POST /rota/planejar` sem `ordemManual` roda NN+2-opt e reescreve
-- a sequência inteira — ou seja, a decisão do motorista ("esta aqui é urgente")
-- morreria no primeiro Reorganizar, no primeiro Montar de amanhã, ou quando
-- outro motorista replanejasse o dia. Prioridade é SELO da parada, não posição
-- na fila; selo mora em coluna.
--
-- 100% ADITIVO E NÃO-DESTRUTIVO: 1 coluna booleana com DEFAULT false. Aqui o
-- default NÃO mente sobre o passado (diferente do vasilhame, em que 0 e NULL
-- diziam coisas diferentes): nenhuma entrega da história foi marcada como
-- prioritária, então `false` é literalmente o que aconteceu.
-- "IF NOT EXISTS" (padrão dos aditivos do repo, migration idempotente).

ALTER TABLE "Entrega" ADD COLUMN IF NOT EXISTS "prioridade" BOOLEAN NOT NULL DEFAULT false;
