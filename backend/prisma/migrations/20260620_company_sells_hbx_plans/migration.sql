-- MIGRATION_ONLY: opt-in de revenda de planos HBX (Fechar venda — seletor de plano).
-- Tenant com sellsHbxPlans=true pode gerar link de contratação escolhendo o plano
-- (List/Lead Plus/Pro). Cliente comum nasce false e NUNCA vê o seletor. Sem
-- privilégio por slug/nome — este flag é a fonte única (mesmo padrão do billingExempt).
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "sellsHbxPlans" BOOLEAN NOT NULL DEFAULT false;
