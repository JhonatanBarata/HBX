-- PERFIL DE ACESSO POR APARELHO (14/07/2026)
-- ADMIN: acesso total. STANDARD: operação completa, exceto financeiro/$$ por padrão.
-- Nesta migração apenas persistimos a intenção; o motor de cortes será introduzido
-- depois. DEFAULT/NOT NULL faz backfill seguro dos aparelhos e códigos existentes.

ALTER TABLE "MobileDevice"
  ADD COLUMN "accessProfile" TEXT NOT NULL DEFAULT 'ADMIN';

ALTER TABLE "MobilePairingCode"
  ADD COLUMN "accessProfile" TEXT NOT NULL DEFAULT 'ADMIN';
