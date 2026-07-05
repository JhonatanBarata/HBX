-- CRÉDITOS A3 (docs/PLANEJAMENTOS/CREDITOS/A3-RESULTADO.md) — lote grátis de boas-vindas no
-- signup self-service. Migração ADITIVA: só acrescenta 2 colunas COM DEFAULT em
-- "CreditGlobalConfig" (welcomeCredits/welcomeExpiryDays). Nenhuma tabela/coluna existente é
-- alterada ou removida. Segue atrás de HBX_CREDITS_ENABLED (default OFF) — sem enforcement.

ALTER TABLE "CreditGlobalConfig"
  ADD COLUMN IF NOT EXISTS "welcomeCredits" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS "welcomeExpiryDays" INTEGER NOT NULL DEFAULT 30;
