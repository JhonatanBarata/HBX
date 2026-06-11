-- Base local de dados abertos do CNPJ (Receita Federal) alimentando a fonte cnpj_public do Radar.
-- Aditiva: nenhuma tabela existente é alterada.
CREATE TABLE IF NOT EXISTS "CnpjPublicCompany" (
  "id" TEXT NOT NULL,
  "cnpj" TEXT NOT NULL,
  "razaoSocial" TEXT NOT NULL,
  "nomeFantasia" TEXT,
  "situacao" TEXT NOT NULL DEFAULT 'ativa',
  "cnae" TEXT,
  "cnaeDescription" TEXT,
  "porte" TEXT,
  "matrizFilial" TEXT,
  "openedAt" TIMESTAMP(3),
  "phone" TEXT,
  "phoneDigits" TEXT,
  "email" TEXT,
  "website" TEXT,
  "address" TEXT,
  "city" TEXT,
  "state" TEXT,
  "normalizedCity" TEXT NOT NULL DEFAULT '',
  "searchText" TEXT NOT NULL DEFAULT '',
  "rawJson" TEXT,
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CnpjPublicCompany_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CnpjPublicCompany_cnpj_key"
  ON "CnpjPublicCompany"("cnpj");

CREATE INDEX IF NOT EXISTS "CnpjPublicCompany_normalizedCity_state_idx"
  ON "CnpjPublicCompany"("normalizedCity", "state");

CREATE INDEX IF NOT EXISTS "CnpjPublicCompany_state_cnae_idx"
  ON "CnpjPublicCompany"("state", "cnae");

CREATE INDEX IF NOT EXISTS "CnpjPublicCompany_phoneDigits_idx"
  ON "CnpjPublicCompany"("phoneDigits");
