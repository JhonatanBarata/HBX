-- Drop da taxonomia legada Plan/Feature (prata/ouro/diamante).
-- O catalogo comercial (commercial-plan-catalog: List/Lead Plus/Full) e a unica
-- fonte de plano/preco desde o PR-002. O Plan legado restava plugado so como
-- fallback de preco mensal (modules/financeiro) e como FeatureGuard em 2
-- endpoints de companies — ambos removidos do codigo neste mesmo commit.
-- Sem clientes em producao; banco local recriavel (mesma diretiva do
-- 20260611_drop_legacy_company_state).

-- FK Company.planId -> Plan: o DROP COLUMN remove a constraint junto.
ALTER TABLE "Company" DROP COLUMN IF EXISTS "planId";

-- Join table implicita da relacao M2M PlanFeatures (Feature <-> Plan).
DROP TABLE IF EXISTS "_PlanFeatures";

DROP TABLE IF EXISTS "Feature";
DROP TABLE IF EXISTS "Plan";
