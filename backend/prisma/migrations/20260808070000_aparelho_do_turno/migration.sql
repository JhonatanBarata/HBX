-- APARELHO DO TURNO (08/08) — recado deixa de ser "da pessoa" e passa a ter
-- aparelho alvo. Celular de entrega é ferramenta da empresa: um por turno.
--
-- Aditiva e idempotente: nenhuma linha existente muda de comportamento.
--   recebeOperacao nasce TRUE  → todo aparelho já pareado continua recebendo.
--   principalDesde nasce NULL  → ninguém fixado, alvo resolvido pelo último sinal.
--   LogisticaRecado.deviceId nasce NULL → recado antigo entra no primeiro
--   aparelho elegível que puxar, exatamente como era antes desta migration.

ALTER TABLE "MobileDevice"
  ADD COLUMN IF NOT EXISTS "recebeOperacao" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "principalDesde" TIMESTAMP(3);

ALTER TABLE "LogisticaRecado"
  ADD COLUMN IF NOT EXISTS "deviceId" VARCHAR(64);
