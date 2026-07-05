-- CRÉDITOS R1 (docs/PLANEJAMENTOS/CREDITOS/R1-SPEC-GATE-ENFORCE.md) — gate por-empresa do
-- enforcement real de crédito. ADITIVO E NÃO-DESTRUTIVO: adiciona APENAS 1 coluna nova
-- (Company.creditsEnforceEnabled), default false. NÃO altera/dropa nenhuma coluna, tabela ou
-- índice existente. O gate só liga quando esta coluna E o env HBX_CREDITS_ENFORCE (mestre)
-- estão ambos true — default false não muda comportamento em runtime nenhum.

ALTER TABLE "Company" ADD COLUMN "creditsEnforceEnabled" BOOLEAN NOT NULL DEFAULT false;
