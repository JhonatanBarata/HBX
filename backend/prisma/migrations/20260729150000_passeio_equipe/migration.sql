-- MODO PASSEIO (29/07) — liberação do modo pra equipe (funcionário). Aditiva,
-- default false: zero mudança de comportamento pra quem não ligar a chave.
ALTER TABLE "LogisticaConfig" ADD COLUMN IF NOT EXISTS "passeioEquipe" BOOLEAN NOT NULL DEFAULT false;
