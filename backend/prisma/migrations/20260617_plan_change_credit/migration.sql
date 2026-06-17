-- Troca de plano com proração/crédito (PR17062026043 bloco B6).
-- Saldo de crédito (centavos) gerado por DOWNGRADE: sobra proporcional do plano
-- maior já pago, abatida na próxima fatura. Aditivo e idempotente.
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "billingCreditCents" INTEGER NOT NULL DEFAULT 0;
