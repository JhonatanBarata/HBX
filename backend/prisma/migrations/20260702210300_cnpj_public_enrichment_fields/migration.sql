-- HOT-01: campos de enriquecimento aditivos do dump aberto da RFB (Empresas/Simples/
-- Estabelecimentos) + catálogo de CNAE. Nenhuma coluna existente é alterada ou removida.

ALTER TABLE "CnpjPublicCompany" ADD COLUMN IF NOT EXISTS "capitalSocial" DECIMAL(18,2);
ALTER TABLE "CnpjPublicCompany" ADD COLUMN IF NOT EXISTS "naturezaJuridica" TEXT;
ALTER TABLE "CnpjPublicCompany" ADD COLUMN IF NOT EXISTS "simples" BOOLEAN;
ALTER TABLE "CnpjPublicCompany" ADD COLUMN IF NOT EXISTS "mei" BOOLEAN;
ALTER TABLE "CnpjPublicCompany" ADD COLUMN IF NOT EXISTS "regimeTributario" TEXT;
ALTER TABLE "CnpjPublicCompany" ADD COLUMN IF NOT EXISTS "phone2" TEXT;
ALTER TABLE "CnpjPublicCompany" ADD COLUMN IF NOT EXISTS "cnaeSecundarias" TEXT;
ALTER TABLE "CnpjPublicCompany" ADD COLUMN IF NOT EXISTS "phoneShareCount" INTEGER;
ALTER TABLE "CnpjPublicCompany" ADD COLUMN IF NOT EXISTS "emailShareCount" INTEGER;
ALTER TABLE "CnpjPublicCompany" ADD COLUMN IF NOT EXISTS "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Catálogo de CNAE (dump Cnaes.zip) — código→descrição, usado pelo HOT-02 (picker por texto).
CREATE TABLE IF NOT EXISTS "CnpjPublicCnae" (
  "codigo" TEXT NOT NULL,
  "descricao" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CnpjPublicCnae_pkey" PRIMARY KEY ("codigo")
);

-- HOT-02: picker de CNAE por texto livre (ex. "salao de beleza" → lista de códigos).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "CnpjPublicCnae_descricao_trgm_idx"
  ON "CnpjPublicCnae" USING gin ("descricao" gin_trgm_ops);
