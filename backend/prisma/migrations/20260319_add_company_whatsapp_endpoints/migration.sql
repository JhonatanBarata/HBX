CREATE TABLE "CompanyWhatsAppEndpoint" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "label" TEXT,
  "moduleKey" TEXT,
  "whatsappNumber" TEXT,
  "whatsappPhoneNumberId" TEXT,
  "whatsappWabaId" TEXT,
  "whatsappAccessToken" TEXT,
  "whatsappDisplayNumber" TEXT,
  "whatsappStatus" TEXT,
  "whatsappStatusError" TEXT,
  "whatsappStatusUpdatedAt" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CompanyWhatsAppEndpoint_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "OutboundMessage"
ADD COLUMN "whatsappEndpointId" TEXT;

CREATE UNIQUE INDEX "CompanyWhatsAppEndpoint_whatsappPhoneNumberId_key"
ON "CompanyWhatsAppEndpoint"("whatsappPhoneNumberId");

CREATE INDEX "CompanyWhatsAppEndpoint_companyId_moduleKey_idx"
ON "CompanyWhatsAppEndpoint"("companyId", "moduleKey");

CREATE INDEX "CompanyWhatsAppEndpoint_companyId_isActive_sortOrder_idx"
ON "CompanyWhatsAppEndpoint"("companyId", "isActive", "sortOrder");

CREATE INDEX "OutboundMessage_companyId_whatsappEndpointId_nextAttemptAt_idx"
ON "OutboundMessage"("companyId", "whatsappEndpointId", "nextAttemptAt");

ALTER TABLE "CompanyWhatsAppEndpoint"
ADD CONSTRAINT "CompanyWhatsAppEndpoint_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OutboundMessage"
ADD CONSTRAINT "OutboundMessage_whatsappEndpointId_fkey"
FOREIGN KEY ("whatsappEndpointId") REFERENCES "CompanyWhatsAppEndpoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
