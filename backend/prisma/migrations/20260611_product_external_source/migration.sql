-- Produtos de verdade: vinculo de origem externa (ERP) no catalogo de produtos.
-- Espelha o padrao ja usado em CustomerProfile (externalSource / externalCustomerId / sourceConnectionId).
-- Aditivo: nenhuma coluna existente e alterada ou removida.

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "sourceConnectionId" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "externalSource" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "externalProductId" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "sourceUpdatedAt" TIMESTAMP(3);

DO $$
BEGIN
  ALTER TABLE "Product"
    ADD CONSTRAINT "Product_sourceConnectionId_fkey"
    FOREIGN KEY ("sourceConnectionId") REFERENCES "IntegrationConnection"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "Product_sourceConnectionId_externalProductId_idx"
  ON "Product"("sourceConnectionId", "externalProductId");

CREATE INDEX IF NOT EXISTS "Product_companyId_externalSource_externalProductId_idx"
  ON "Product"("companyId", "externalSource", "externalProductId");
