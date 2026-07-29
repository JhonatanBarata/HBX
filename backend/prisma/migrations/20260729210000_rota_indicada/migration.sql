-- ROTA PRONTA (29/07) — indicação de rota salva pra alguém da equipe.
-- Aditiva: tabela nova, nenhum dado existente muda. userIds sem FK de
-- propósito (evento operacional; usuário apagado não trava delete).
CREATE TABLE IF NOT EXISTS "LogisticaRotaIndicada" (
  "id"           TEXT NOT NULL,
  "companyId"    INTEGER NOT NULL,
  "rotaModeloId" TEXT NOT NULL,
  "nomeSnapshot" VARCHAR(80) NOT NULL,
  "paraUserId"   INTEGER NOT NULL,
  "porUserId"    INTEGER NOT NULL,
  "status"       VARCHAR(20) NOT NULL DEFAULT 'pendente',
  "respondidaEm" TIMESTAMP(3),
  "aplicadaEm"   TIMESTAMP(3),
  "avisoVistoEm" TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LogisticaRotaIndicada_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "LogisticaRotaIndicada"
  ADD CONSTRAINT "LogisticaRotaIndicada_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LogisticaRotaIndicada"
  ADD CONSTRAINT "LogisticaRotaIndicada_rotaModeloId_companyId_fkey"
  FOREIGN KEY ("rotaModeloId", "companyId") REFERENCES "LogisticaRotaModelo"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "LogisticaRotaIndicada_companyId_paraUserId_status_idx"
  ON "LogisticaRotaIndicada"("companyId", "paraUserId", "status");

CREATE INDEX IF NOT EXISTS "LogisticaRotaIndicada_companyId_status_createdAt_idx"
  ON "LogisticaRotaIndicada"("companyId", "status", "createdAt");
