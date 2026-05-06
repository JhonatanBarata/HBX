ALTER TABLE "RadarLeadPool"
  ADD COLUMN "companyId" INTEGER,
  ADD COLUMN "ddd" TEXT,
  ADD COLUMN "expectedDddsJson" TEXT,
  ADD COLUMN "source" TEXT,
  ADD COLUMN "sourceEngine" TEXT,
  ADD COLUMN "sourceUrl" TEXT,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'clean',
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "complaintReason" TEXT,
  ADD COLUMN "deniedReason" TEXT,
  ADD COLUMN "noAnswerCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "contactedCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastContactAt" TIMESTAMP(3),
  ADD COLUMN "campaignId" TEXT,
  ADD COLUMN "metadataJson" TEXT;

ALTER TABLE "RadarLeadCompanyState"
  ADD COLUMN "noAnswerCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "contactedCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastContactAt" TIMESTAMP(3),
  ADD COLUMN "complaintReason" TEXT,
  ADD COLUMN "deniedReason" TEXT;

CREATE TABLE "RadarLeadEvent" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "companyId" INTEGER,
  "eventType" TEXT NOT NULL,
  "note" TEXT,
  "statusFrom" TEXT,
  "statusTo" TEXT,
  "createdByUserId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RadarLeadEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebscrapingCampaign" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "mode" TEXT NOT NULL DEFAULT 'radar_database',
  "city" TEXT NOT NULL,
  "state" TEXT,
  "segment" TEXT NOT NULL,
  "targetType" TEXT NOT NULL DEFAULT 'pj',
  "targetTotal" INTEGER NOT NULL,
  "batchSize" INTEGER NOT NULL DEFAULT 25,
  "foundCount" INTEGER NOT NULL DEFAULT 0,
  "approvedCount" INTEGER NOT NULL DEFAULT 0,
  "duplicateCount" INTEGER NOT NULL DEFAULT 0,
  "rejectedCount" INTEGER NOT NULL DEFAULT 0,
  "complaintCount" INTEGER NOT NULL DEFAULT 0,
  "deniedCount" INTEGER NOT NULL DEFAULT 0,
  "noAnswerCount" INTEGER NOT NULL DEFAULT 0,
  "currentAttempt" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 400,
  "consecutiveEmptyBatchCount" INTEGER NOT NULL DEFAULT 0,
  "consecutiveErrorCount" INTEGER NOT NULL DEFAULT 0,
  "lastQueryUsed" TEXT,
  "lastEngineUrl" TEXT,
  "lastErrorMessage" TEXT,
  "nextRunAt" TIMESTAMP(3),
  "nightOnly" BOOLEAN NOT NULL DEFAULT true,
  "allowedStartHour" INTEGER NOT NULL DEFAULT 0,
  "allowedEndHour" INTEGER NOT NULL DEFAULT 6,
  "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  "startedAt" TIMESTAMP(3),
  "pausedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WebscrapingCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebscrapingCampaignBatch" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'running',
  "attemptNumber" INTEGER NOT NULL,
  "engineId" TEXT,
  "engineUrl" TEXT,
  "queryUsed" TEXT,
  "batchSize" INTEGER NOT NULL,
  "fetchedUrlCount" INTEGER NOT NULL DEFAULT 0,
  "parsedCount" INTEGER NOT NULL DEFAULT 0,
  "approvedCount" INTEGER NOT NULL DEFAULT 0,
  "duplicateCount" INTEGER NOT NULL DEFAULT 0,
  "rejectedCount" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WebscrapingCampaignBatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RadarLeadPool_companyId_status_idx" ON "RadarLeadPool"("companyId", "status");
CREATE INDEX "RadarLeadPool_ddd_state_idx" ON "RadarLeadPool"("ddd", "state");
CREATE INDEX "RadarLeadPool_campaignId_idx" ON "RadarLeadPool"("campaignId");
CREATE INDEX "RadarLeadEvent_leadId_createdAt_idx" ON "RadarLeadEvent"("leadId", "createdAt");
CREATE INDEX "RadarLeadEvent_companyId_eventType_createdAt_idx" ON "RadarLeadEvent"("companyId", "eventType", "createdAt");
CREATE INDEX "WebscrapingCampaign_companyId_status_updatedAt_idx" ON "WebscrapingCampaign"("companyId", "status", "updatedAt");
CREATE INDEX "WebscrapingCampaign_status_nextRunAt_idx" ON "WebscrapingCampaign"("status", "nextRunAt");
CREATE INDEX "WebscrapingCampaign_companyId_createdAt_idx" ON "WebscrapingCampaign"("companyId", "createdAt");
CREATE INDEX "WebscrapingCampaignBatch_campaignId_attemptNumber_idx" ON "WebscrapingCampaignBatch"("campaignId", "attemptNumber");
CREATE INDEX "WebscrapingCampaignBatch_campaignId_status_idx" ON "WebscrapingCampaignBatch"("campaignId", "status");

ALTER TABLE "RadarLeadPool"
  ADD CONSTRAINT "RadarLeadPool_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RadarLeadPool"
  ADD CONSTRAINT "RadarLeadPool_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "WebscrapingCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RadarLeadEvent"
  ADD CONSTRAINT "RadarLeadEvent_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "RadarLeadPool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RadarLeadEvent"
  ADD CONSTRAINT "RadarLeadEvent_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RadarLeadEvent"
  ADD CONSTRAINT "RadarLeadEvent_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WebscrapingCampaign"
  ADD CONSTRAINT "WebscrapingCampaign_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WebscrapingCampaign"
  ADD CONSTRAINT "WebscrapingCampaign_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WebscrapingCampaignBatch"
  ADD CONSTRAINT "WebscrapingCampaignBatch_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "WebscrapingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
