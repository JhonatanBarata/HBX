CREATE TABLE "WebscrapingCampaignTask" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "segment" TEXT NOT NULL,
  "targetType" TEXT NOT NULL DEFAULT 'pj',
  "query" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "foundCount" INTEGER NOT NULL DEFAULT 0,
  "duplicateCount" INTEGER NOT NULL DEFAULT 0,
  "rejectedCount" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "lockedByEngineId" TEXT,
  "lockedUntil" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WebscrapingCampaignTask_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WebscrapingCampaignBatch"
  ADD COLUMN "taskId" TEXT;

CREATE UNIQUE INDEX "WebscrapingCampaignTask_campaignId_state_city_segment_targetType_key"
  ON "WebscrapingCampaignTask"("campaignId", "state", "city", "segment", "targetType");

CREATE INDEX "WebscrapingCampaignTask_campaignId_status_updatedAt_idx"
  ON "WebscrapingCampaignTask"("campaignId", "status", "updatedAt");

CREATE INDEX "WebscrapingCampaignTask_status_lockedUntil_idx"
  ON "WebscrapingCampaignTask"("status", "lockedUntil");

CREATE INDEX "WebscrapingCampaignTask_campaignId_city_status_idx"
  ON "WebscrapingCampaignTask"("campaignId", "city", "status");

CREATE INDEX "WebscrapingCampaignBatch_taskId_attemptNumber_idx"
  ON "WebscrapingCampaignBatch"("taskId", "attemptNumber");

ALTER TABLE "WebscrapingCampaignTask"
  ADD CONSTRAINT "WebscrapingCampaignTask_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "WebscrapingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WebscrapingCampaignBatch"
  ADD CONSTRAINT "WebscrapingCampaignBatch_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "WebscrapingCampaignTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "WebscrapingOperationalConfig" (
  "key" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "preset" TEXT NOT NULL DEFAULT 'turbo_noturno',
  "startHour" INTEGER NOT NULL DEFAULT 20,
  "startMinute" INTEGER NOT NULL DEFAULT 0,
  "endHour" INTEGER NOT NULL DEFAULT 8,
  "endMinute" INTEGER NOT NULL DEFAULT 0,
  "engineCount" INTEGER NOT NULL DEFAULT 4,
  "intensity" TEXT NOT NULL DEFAULT 'turbo',
  "memoryTargetGb" INTEGER NOT NULL DEFAULT 16,
  "batchSize" INTEGER NOT NULL DEFAULT 20,
  "maxAttemptsPerTask" INTEGER NOT NULL DEFAULT 3,
  "engineUrlsJson" TEXT NOT NULL DEFAULT '[]',
  "metadataJson" TEXT,
  "createdByUserId" INTEGER,
  "updatedByUserId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WebscrapingOperationalConfig_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "WebscrapingOperationalConfig_enabled_preset_idx"
  ON "WebscrapingOperationalConfig"("enabled", "preset");
