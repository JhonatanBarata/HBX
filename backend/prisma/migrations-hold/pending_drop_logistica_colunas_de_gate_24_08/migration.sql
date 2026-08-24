-- SIMPLIFICAÇÃO 24/08/2026 — DDL destrutivo CONDICIONADO. NÃO APLICAR EM BANCO
-- NENHUM nesta sprint. Esta pasta (`prisma/migrations-hold/`) fica FORA de
-- `prisma/migrations/` de propósito — `prisma migrate deploy` nunca enxerga
-- este arquivo. O orquestrador move (renomeia com timestamp real e copia pra
-- `prisma/migrations/`) só no dia do publish final desta frente, DEPOIS do
-- burn-in do deploy que parou de ler estas colunas.
--
-- O QUE CAI, e por quê (decisão do dono, 24/08/2026):
--   · LogisticaConfig.trackingAtivo / modoRotaPadrao — não existe mais escolha
--     de modo: toda rota nasce TRACKED (a preferência salva virou letra morta;
--     o modo congelado por rota vive em LogisticaRoute.mode, que FICA).
--   · LogisticaConfig.moduloFinanceiroAtivo — financeiro é SEMPRE ligado
--     (0,00 é valor legítimo). ⚠️ PRÉ-REQUISITO: a migration viva
--     20260824120000_rota_nasce_rastreada_financeiro_hard_on já fez o
--     `UPDATE ... SET "moduloFinanceiroAtivo"=true` — confira que ela rodou
--     ANTES de mover este arquivo (regra da casa: SET DEFAULT/DROP nunca
--     substituem o UPDATE explícito do hard-on).
--   · LogisticaConfig.cobrancaSimples — zero consumidor no backend.
--   · LogisticaConfig.precoPorClienteAtivo — gate morto (preço por cliente é
--     régua fixa do produto).
--   · LogisticaConfig.prospectorEquipe — prospector é de TODO usuário da
--     empresa quando prospectorAtivo está on (o freio da 1ª vez é o "Ciente"
--     por usuário em User.onboardingStateJson).
--   · LogisticaConfig.prospectorAutomacaoAtiva / prospectorAutomacaoMaxDia —
--     gate Master sem nada atrás (zero consumidor; endpoints removidos).
--
-- Regra de ouro "na dúvida, não dropa" como CÓDIGO: IF EXISTS em tudo — rodar
-- duas vezes (ou num banco que nunca teve a coluna) é no-op, nunca erro.

ALTER TABLE "LogisticaConfig" DROP COLUMN IF EXISTS "trackingAtivo";
ALTER TABLE "LogisticaConfig" DROP COLUMN IF EXISTS "modoRotaPadrao";
ALTER TABLE "LogisticaConfig" DROP COLUMN IF EXISTS "moduloFinanceiroAtivo";
ALTER TABLE "LogisticaConfig" DROP COLUMN IF EXISTS "cobrancaSimples";
ALTER TABLE "LogisticaConfig" DROP COLUMN IF EXISTS "precoPorClienteAtivo";
ALTER TABLE "LogisticaConfig" DROP COLUMN IF EXISTS "prospectorEquipe";
ALTER TABLE "LogisticaConfig" DROP COLUMN IF EXISTS "prospectorAutomacaoAtiva";
ALTER TABLE "LogisticaConfig" DROP COLUMN IF EXISTS "prospectorAutomacaoMaxDia";
