ALTER TABLE "WebscrapingSearchRun"
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "failedBatchCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "consecutiveEmptyBatchCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "consecutiveEngineErrorCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastBatchError" TEXT,
  ADD COLUMN "lastBatchStatus" TEXT,
  ADD COLUMN "nextRetryAt" TIMESTAMP(3),
  ADD COLUMN "lastQueryUsed" TEXT,
  ADD COLUMN "lastEngineUrl" TEXT;

CREATE INDEX "WebscrapingSearchRun_status_nextRetryAt_idx" ON "WebscrapingSearchRun"("status", "nextRetryAt");
