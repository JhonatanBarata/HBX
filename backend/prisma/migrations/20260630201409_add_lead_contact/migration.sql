-- PR1 (30/06, docs/PLANEJAMENTOS/PR30062026/arvore-final-owner-enriquecimento.md)
-- Tabela normalizada de contatos descobertos (email/phone/whatsapp/instagram/facebook) p/ BUSCA EM
-- LOTE. ADITIVA: não altera nem remove nada do RadarLeadPool; é populada a partir do metadataJson
-- existente (backfill) + escrita dupla nos pontos que descobrem contato novo.

-- CreateTable
CREATE TABLE "LeadContact" (
    "id" TEXT NOT NULL,
    "radarLeadId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "valueNormalized" TEXT NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 1,
    "source" TEXT,
    "confidence" INTEGER DEFAULT 0,
    "claimedByCompanyId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadContact_radarLeadId_kind_rank_idx" ON "LeadContact"("radarLeadId", "kind", "rank");

-- CreateIndex
CREATE INDEX "LeadContact_kind_valueNormalized_idx" ON "LeadContact"("kind", "valueNormalized");

-- CreateIndex
CREATE INDEX "LeadContact_claimedByCompanyId_idx" ON "LeadContact"("claimedByCompanyId");

-- AddForeignKey
ALTER TABLE "LeadContact" ADD CONSTRAINT "LeadContact_radarLeadId_fkey" FOREIGN KEY ("radarLeadId") REFERENCES "RadarLeadPool"("id") ON DELETE CASCADE ON UPDATE CASCADE;
