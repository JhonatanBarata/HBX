CREATE TABLE IF NOT EXISTS "RadarFactoryCursor" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL DEFAULT 'main',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "forcedOn" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'idle',
  "currentState" TEXT,
  "currentCity" TEXT,
  "currentSegment" TEXT,
  "currentTargetType" TEXT NOT NULL DEFAULT 'pj',
  "currentStateIndex" INTEGER NOT NULL DEFAULT 0,
  "currentCityIndex" INTEGER NOT NULL DEFAULT 0,
  "currentSegmentIndex" INTEGER NOT NULL DEFAULT 0,
  "currentTargetTypeIndex" INTEGER NOT NULL DEFAULT 0,
  "lastCampaignId" TEXT,
  "lastRunId" TEXT,
  "lastSavedCount" INTEGER NOT NULL DEFAULT 0,
  "lastDuplicateCount" INTEGER NOT NULL DEFAULT 0,
  "lastRejectedCount" INTEGER NOT NULL DEFAULT 0,
  "consecutiveEmptyCount" INTEGER NOT NULL DEFAULT 0,
  "consecutiveFailureCount" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "reasonStopped" TEXT,
  "lastWorkedAt" TIMESTAMP(3),
  "nextRunAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RadarFactoryCursor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RadarFactoryCursor_key_key" ON "RadarFactoryCursor"("key");

CREATE TABLE IF NOT EXISTS "RadarFactoryWorkLog" (
  "id" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "segment" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "campaignId" TEXT,
  "runId" TEXT,
  "status" TEXT NOT NULL,
  "savedCount" INTEGER NOT NULL DEFAULT 0,
  "duplicateCount" INTEGER NOT NULL DEFAULT 0,
  "rejectedCount" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RadarFactoryWorkLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RadarFactoryWorkLog_state_city_segment_targetType_idx"
  ON "RadarFactoryWorkLog"("state", "city", "segment", "targetType");

CREATE INDEX IF NOT EXISTS "RadarFactoryWorkLog_status_createdAt_idx"
  ON "RadarFactoryWorkLog"("status", "createdAt");
