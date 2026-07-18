-- PR18072026 W-A (18/07) — módulo Financeiro liga/desliga + painel Avançado.
-- 100% aditivo: novas colunas em LogisticaConfig, todas com default seguro.
-- Nenhuma linha existente muda de comportamento (defaults TRUE preservam o
-- comportamento atual das empresas já em produção; cobrancaAutomatica nasce
-- FALSE por ser feature nova/opt-in). moduloFinanceiroAtivo NÃO é tocado aqui
-- (já existe na tabela com default false desde antes deste pacote).
--
-- LogisticaConfig.aceitaNaHora          BOOLEAN NOT NULL DEFAULT true  — forma
--   "Na hora" (Pix/Dinheiro), unifica os antigos "aberto"+"na_hora".
-- LogisticaConfig.aceitaMensal          BOOLEAN NOT NULL DEFAULT true
-- LogisticaConfig.aceitaFiado           BOOLEAN NOT NULL DEFAULT true
-- LogisticaConfig.precoPorClienteAtivo  BOOLEAN NOT NULL DEFAULT true — controla
--   se o campo precoAcordado aparece no editar cliente.
-- LogisticaConfig.cobrancaAutomatica    BOOLEAN NOT NULL DEFAULT false — painel
--   Avançado (novo), reservado para a frente de cobrança automática.

ALTER TABLE "LogisticaConfig" ADD COLUMN "aceitaNaHora" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "LogisticaConfig" ADD COLUMN "aceitaMensal" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "LogisticaConfig" ADD COLUMN "aceitaFiado" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "LogisticaConfig" ADD COLUMN "precoPorClienteAtivo" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "LogisticaConfig" ADD COLUMN "cobrancaAutomatica" BOOLEAN NOT NULL DEFAULT false;
