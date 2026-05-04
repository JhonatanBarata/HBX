-- CreateTable
CREATE TABLE "VendasAutomationCampaign" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "createdByUserId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'running',
    "city" TEXT NOT NULL,
    "state" TEXT,
    "segment" TEXT NOT NULL,
    "engine" TEXT NOT NULL DEFAULT 'hbx',
    "targetType" TEXT NOT NULL DEFAULT 'pj',
    "filtersJson" TEXT,
    "searchSignature" TEXT,
    "messageTemplate" TEXT NOT NULL,
    "intervalMinutes" INTEGER NOT NULL DEFAULT 12,
    "dailyLimit" INTEGER NOT NULL DEFAULT 40,
    "minLeadBuffer" INTEGER NOT NULL DEFAULT 15,
    "desiredLeadBuffer" INTEGER NOT NULL DEFAULT 60,
    "maxAttemptsPerLead" INTEGER NOT NULL DEFAULT 1,
    "workingHoursStart" TEXT NOT NULL DEFAULT '09:00',
    "workingHoursEnd" TEXT NOT NULL DEFAULT '17:30',
    "typingSeconds" INTEGER NOT NULL DEFAULT 8,
    "typingVarianceSeconds" INTEGER NOT NULL DEFAULT 6,
    "positiveIntentKeywordsJson" TEXT,
    "negativeIntentKeywordsJson" TEXT,
    "optOutMessage" TEXT,
    "websiteFallbackEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastScrapeAt" TIMESTAMP(3),
    "lastStatusText" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendasAutomationCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendasAutomationJob" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "leadId" TEXT NOT NULL,
    "conversationId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "repliedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "classification" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendasAutomationJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VendasAutomationCampaign_companyId_status_updatedAt_idx" ON "VendasAutomationCampaign"("companyId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "VendasAutomationCampaign_companyId_createdAt_idx" ON "VendasAutomationCampaign"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "VendasAutomationJob_companyId_status_scheduledAt_idx" ON "VendasAutomationJob"("companyId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "VendasAutomationJob_campaignId_status_scheduledAt_idx" ON "VendasAutomationJob"("campaignId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "VendasAutomationJob_leadId_status_idx" ON "VendasAutomationJob"("leadId", "status");

-- CreateIndex
CREATE INDEX "VendasAutomationJob_conversationId_idx" ON "VendasAutomationJob"("conversationId");

-- AddForeignKey
ALTER TABLE "VendasAutomationCampaign" ADD CONSTRAINT "VendasAutomationCampaign_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendasAutomationJob" ADD CONSTRAINT "VendasAutomationJob_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "VendasAutomationCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendasAutomationJob" ADD CONSTRAINT "VendasAutomationJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendasAutomationJob" ADD CONSTRAINT "VendasAutomationJob_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "VendasLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
