-- Ativação / onboarding (28/06, Camada 1 — Onboarding Vendedor).
-- Carimbos dos marcos da jornada por papel: JSON { events: { "<event>": ISO } }.
-- Aditivo, nullable, reversível (DROP COLUMN). IF NOT EXISTS = idempotente.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "onboardingStateJson" TEXT;
