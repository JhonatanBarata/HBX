-- 28/07 — o PLANO HÍBRIDO (20260728050000) passou a gravar claims com status
-- 'PLAN' (bloco coberto pela franquia, terminal, fora da máquina de débito),
-- acreditando que `status` era TEXT livre. Não era: a migration
-- 20260713233000_logistica_route_modes_pr1 criou a tabela com CHECK fechado em
-- PENDING/PROCESSING/DEBITED/REFUNDED/FAILED. Resultado em prod: TODA rota
-- iniciada dentro da franquia caía em 500 no /logistica/rota/iniciar
-- (constraint 23514 em cobrirBlocoPelaFranquia). 'PLAN' entra na régua.
ALTER TABLE "LogisticaEssentialCreditClaim"
  DROP CONSTRAINT "LogisticaEssentialCreditClaim_status_check";
ALTER TABLE "LogisticaEssentialCreditClaim"
  ADD CONSTRAINT "LogisticaEssentialCreditClaim_status_check"
  CHECK ("status" IN ('PENDING', 'PROCESSING', 'DEBITED', 'REFUNDED', 'FAILED', 'PLAN'));
