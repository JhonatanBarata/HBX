-- Sprint 2 MOTOR-RFB-FILA: sócios do dump aberto da RFB.
-- Aditiva: só adiciona colunas/tabela/índice — nenhum dado existente é alterado.

-- Sócio-administrador denormalizado na empresa (leitura rápida no L4, sem join).
ALTER TABLE "CnpjPublicCompany" ADD COLUMN IF NOT EXISTS "ownerName" TEXT;
ALTER TABLE "CnpjPublicCompany" ADD COLUMN IF NOT EXISTS "ownerQualification" TEXT;

-- Busca cidade x CNAE direto no índice (fonte cnpj_public do Radar).
CREATE INDEX IF NOT EXISTS "CnpjPublicCompany_normalizedCity_cnae_idx"
  ON "CnpjPublicCompany"("normalizedCity", "cnae");

-- Quadro societário completo (arquivo Socios*.zip do dump).
CREATE TABLE IF NOT EXISTS "CnpjPublicPartner" (
  "id" BIGSERIAL NOT NULL,
  "cnpjBasico" TEXT NOT NULL,
  "identificador" TEXT,
  "nome" TEXT NOT NULL,
  "documento" TEXT,
  "qualificationCode" TEXT,
  "qualificationDescription" TEXT,
  "entradaAt" TIMESTAMP(3),
  "faixaEtaria" TEXT,
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CnpjPublicPartner_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CnpjPublicPartner_cnpjBasico_idx"
  ON "CnpjPublicPartner"("cnpjBasico");
