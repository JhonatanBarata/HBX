-- AlterTable: grau de calor do lead (frio | morno | quente)
ALTER TABLE "VendasLead" ADD COLUMN "leadTemperature" TEXT;

-- CreateTable: conexão de página Meta → empresa (intake de Lead Ads)
CREATE TABLE "MetaLeadConnection" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "pageId" TEXT NOT NULL,
    "pageName" TEXT,
    "accessTokenCiphertext" TEXT,
    "accessTokenPreview" TEXT,
    "defaultAssignedUserId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastEventAt" TIMESTAMP(3),
    "lastLeadAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaLeadConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MetaLeadConnection_pageId_key" ON "MetaLeadConnection"("pageId");

-- CreateIndex
CREATE INDEX "MetaLeadConnection_companyId_idx" ON "MetaLeadConnection"("companyId");

-- AddForeignKey
ALTER TABLE "MetaLeadConnection" ADD CONSTRAINT "MetaLeadConnection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
