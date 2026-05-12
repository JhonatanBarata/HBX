CREATE TABLE IF NOT EXISTS "CommercialEmailMessageLog" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER,
  "userId" INTEGER,
  "radarLeadId" TEXT,
  "vendasLeadId" TEXT,
  "recipientEmail" TEXT NOT NULL,
  "recipientName" TEXT,
  "subject" TEXT NOT NULL,
  "text" TEXT,
  "html" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "transport" TEXT,
  "messageId" TEXT,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "attachmentName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  CONSTRAINT "CommercialEmailMessageLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CommercialEmailMessageLog_companyId_vendasLeadId_idx" ON "CommercialEmailMessageLog"("companyId", "vendasLeadId");
CREATE INDEX IF NOT EXISTS "CommercialEmailMessageLog_companyId_radarLeadId_idx" ON "CommercialEmailMessageLog"("companyId", "radarLeadId");
CREATE INDEX IF NOT EXISTS "CommercialEmailMessageLog_recipientEmail_status_idx" ON "CommercialEmailMessageLog"("recipientEmail", "status");
CREATE INDEX IF NOT EXISTS "CommercialEmailMessageLog_status_createdAt_idx" ON "CommercialEmailMessageLog"("status", "createdAt");
