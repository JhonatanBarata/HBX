-- FISCAL — 3 frentes aditivas num pacote:
-- (1) Endereço do prestador (checklist 6b — a DPS real pode exigir; entra no
--     XML só quando completo).
-- (2) SEMÁFORO DE LIBERAÇÃO (B4): produção abre pela tela com trilha de
--     usuário/data + aprovação do contador — mata o UPDATE manual no banco.
-- (3) FiscalCompraXml: o XML da NF-e de compra fica GUARDADO pro malote do
--     contador (decisão 10 — "sem perder nada").
ALTER TABLE "FiscalTenantProfile" ADD COLUMN "endCep" TEXT;
ALTER TABLE "FiscalTenantProfile" ADD COLUMN "endLogradouro" TEXT;
ALTER TABLE "FiscalTenantProfile" ADD COLUMN "endNumero" TEXT;
ALTER TABLE "FiscalTenantProfile" ADD COLUMN "endComplemento" TEXT;
ALTER TABLE "FiscalTenantProfile" ADD COLUMN "endBairro" TEXT;
ALTER TABLE "FiscalTenantProfile" ADD COLUMN "contadorAprovou" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FiscalTenantProfile" ADD COLUMN "contadorAprovouEm" TIMESTAMP(3);
ALTER TABLE "FiscalTenantProfile" ADD COLUMN "producaoAtivadaEm" TIMESTAMP(3);
ALTER TABLE "FiscalTenantProfile" ADD COLUMN "producaoAtivadaPor" TEXT;

CREATE TABLE "FiscalCompraXml" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "chaveAcesso" TEXT NOT NULL,
    "emitenteNome" TEXT,
    "emitenteCnpj" TEXT,
    "competencia" TEXT NOT NULL,
    "xmlGzB64" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FiscalCompraXml_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FiscalCompraXml_companyId_chaveAcesso_key" ON "FiscalCompraXml"("companyId", "chaveAcesso");
CREATE INDEX "FiscalCompraXml_companyId_competencia_idx" ON "FiscalCompraXml"("companyId", "competencia");
