-- Recado com entrega confirmada pelo aparelho e resposta idempotente.
-- Colunas são aditivas e nullable para manter APKs já instalados compatíveis.
ALTER TABLE "LogisticaRecado"
  ADD COLUMN "clientMessageId" VARCHAR(64),
  ADD COLUMN "respostaAoId" VARCHAR(64);

CREATE UNIQUE INDEX "LogisticaRecado_companyId_motoristaUserId_clientMessageId_key"
  ON "LogisticaRecado"("companyId", "motoristaUserId", "clientMessageId");

CREATE INDEX "LogisticaRecado_companyId_origem_vistoEm_motoristaUserId_idx"
  ON "LogisticaRecado"("companyId", "origem", "vistoEm", "motoristaUserId");
