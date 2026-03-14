-- Follow Up Internacional module

CREATE TABLE "Importacao" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "numeroPedido" TEXT NOT NULL,
    "fornecedorId" TEXT,
    "pais" TEXT,
    "portoOrigem" TEXT,
    "portoDestino" TEXT,
    "dataEmbarque" TIMESTAMP(3),
    "dataAtracacao" TIMESTAMP(3),
    "valorUsd" DOUBLE PRECISION,
    "valorDolar" DOUBLE PRECISION,
    "pesoKg" DOUBLE PRECISION,
    "valorTotalReal" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'EM_CADASTRO',
    "pdfPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" INTEGER,
    "finalizedAt" TIMESTAMP(3),
    "finalizedBy" INTEGER,
    "reabertoPor" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Importacao_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImportacaoLog" (
    "id" SERIAL NOT NULL,
    "importacaoId" INTEGER NOT NULL,
    "alteracao" TEXT NOT NULL,
    "usuario" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "versao" INTEGER,
    "dadosAntes" TEXT,
    "dadosDepois" TEXT,

    CONSTRAINT "ImportacaoLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AlertaImportacao" (
    "id" SERIAL NOT NULL,
    "importacaoId" INTEGER NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "diasAntes" INTEGER NOT NULL,
    "enviarEmail" BOOLEAN NOT NULL DEFAULT false,
    "enviarWhatsapp" BOOLEAN NOT NULL DEFAULT false,
    "listaEmails" TEXT,
    "listaWhatsapp" TEXT,
    "disparado" BOOLEAN NOT NULL DEFAULT false,
    "disparadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertaImportacao_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImportacaoPermissao" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportacaoPermissao_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Importacao_empresaId_status_idx" ON "Importacao"("empresaId", "status");
CREATE INDEX "Importacao_empresaId_numeroPedido_idx" ON "Importacao"("empresaId", "numeroPedido");
CREATE INDEX "ImportacaoLog_importacaoId_data_idx" ON "ImportacaoLog"("importacaoId", "data");
CREATE INDEX "AlertaImportacao_empresaId_disparado_idx" ON "AlertaImportacao"("empresaId", "disparado");
CREATE INDEX "AlertaImportacao_importacaoId_diasAntes_idx" ON "AlertaImportacao"("importacaoId", "diasAntes");
CREATE INDEX "ImportacaoPermissao_empresaId_role_idx" ON "ImportacaoPermissao"("empresaId", "role");
CREATE UNIQUE INDEX "ImportacaoPermissao_empresaId_role_acao_key" ON "ImportacaoPermissao"("empresaId", "role", "acao");

ALTER TABLE "Importacao" ADD CONSTRAINT "Importacao_empresaId_fkey"
  FOREIGN KEY ("empresaId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Importacao" ADD CONSTRAINT "Importacao_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Importacao" ADD CONSTRAINT "Importacao_finalizedBy_fkey"
  FOREIGN KEY ("finalizedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Importacao" ADD CONSTRAINT "Importacao_reabertoPor_fkey"
  FOREIGN KEY ("reabertoPor") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ImportacaoLog" ADD CONSTRAINT "ImportacaoLog_importacaoId_fkey"
  FOREIGN KEY ("importacaoId") REFERENCES "Importacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AlertaImportacao" ADD CONSTRAINT "AlertaImportacao_importacaoId_fkey"
  FOREIGN KEY ("importacaoId") REFERENCES "Importacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AlertaImportacao" ADD CONSTRAINT "AlertaImportacao_empresaId_fkey"
  FOREIGN KEY ("empresaId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ImportacaoPermissao" ADD CONSTRAINT "ImportacaoPermissao_empresaId_fkey"
  FOREIGN KEY ("empresaId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Compatibility aliases requested for module tables
CREATE OR REPLACE VIEW "modulos" AS
SELECT
  "id",
  "name" AS "nome",
  "key" AS "chave"
FROM "SystemModule";

CREATE OR REPLACE VIEW "empresa_modulos" AS
SELECT
  "id",
  "companyId" AS "empresa_id",
  "moduleId" AS "modulo_id",
  "enabled" AS "ativo"
FROM "CompanyModule";
