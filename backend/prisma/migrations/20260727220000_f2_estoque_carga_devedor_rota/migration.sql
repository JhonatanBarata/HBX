-- PR27072026 F2 (27/07) — ADVANCED COMPLETO: estoque de carga do caminhão +
-- parada amarela de devedor. Migration 100% ADITIVA — nenhuma coluna/tabela
-- existente é tocada além de 1 ADD COLUMN com DEFAULT (nenhuma empresa perde
-- comportamento). Ver os comentários dos models em schema.prisma.
--
-- 1) LogisticaConfig.devedorNaRota — modo do tratamento do devedor na rota de
--    hoje ('COBRANCA' default | 'EXCLUIR' | 'NORMAL'). DEFAULT 'COBRANCA' em
--    TODA linha já existente = grandfathering seguro: quem já tem financeiro
--    real passa a AVISAR ("só cobrar") sem nunca esconder cliente nem cancelar
--    nada sozinho.
-- 2) LogisticaCargaDia / LogisticaCargaDiaItem — conferência de caminhão do dia
--    (carregou/vendeu/voltou), NÃO é almoxarifado/WMS. 2 tabelas NOVAS.

-- AlterTable
ALTER TABLE "LogisticaConfig" ADD COLUMN IF NOT EXISTS "devedorNaRota" VARCHAR(10) NOT NULL DEFAULT 'COBRANCA';

-- CreateTable
CREATE TABLE "LogisticaCargaDia" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "dataISO" VARCHAR(10) NOT NULL,
    "entregadorId" INTEGER,
    "status" VARCHAR(12) NOT NULL DEFAULT 'ABERTA',
    "conferidaAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LogisticaCargaDia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogisticaCargaDiaItem" (
    "id" TEXT NOT NULL,
    "cargaDiaId" TEXT NOT NULL,
    "productId" INTEGER,
    "qtdCarregada" INTEGER NOT NULL DEFAULT 0,
    "qtdVendidaSnapshot" INTEGER,
    "qtdRetorno" INTEGER,
    "resultado" VARCHAR(10),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LogisticaCargaDiaItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LogisticaCargaDia_companyId_dataISO_entregadorId_idx" ON "LogisticaCargaDia"("companyId", "dataISO", "entregadorId");

-- CreateIndex
CREATE INDEX "LogisticaCargaDia_companyId_status_idx" ON "LogisticaCargaDia"("companyId", "status");

-- CreateIndex
CREATE INDEX "LogisticaCargaDiaItem_cargaDiaId_idx" ON "LogisticaCargaDiaItem"("cargaDiaId");

-- CreateIndex
CREATE INDEX "LogisticaCargaDiaItem_productId_idx" ON "LogisticaCargaDiaItem"("productId");

-- AddForeignKey
ALTER TABLE "LogisticaCargaDia" ADD CONSTRAINT "LogisticaCargaDia_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogisticaCargaDiaItem" ADD CONSTRAINT "LogisticaCargaDiaItem_cargaDiaId_fkey" FOREIGN KEY ("cargaDiaId") REFERENCES "LogisticaCargaDia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogisticaCargaDiaItem" ADD CONSTRAINT "LogisticaCargaDiaItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
