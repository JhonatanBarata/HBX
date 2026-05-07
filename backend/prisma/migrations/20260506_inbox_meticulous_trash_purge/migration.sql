CREATE TABLE "InboxTrashMeticulousPurgeJob" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "startedByUserId" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'idle',
  "dryRun" BOOLEAN NOT NULL DEFAULT true,
  "olderThanHours" INTEGER NOT NULL DEFAULT 24,
  "limit" INTEGER,
  "delayMs" INTEGER NOT NULL DEFAULT 120000,
  "jitterMinMs" INTEGER NOT NULL DEFAULT 5000,
  "jitterMaxMs" INTEGER NOT NULL DEFAULT 20000,
  "candidateIdsJson" TEXT NOT NULL DEFAULT '[]',
  "previewJson" TEXT NOT NULL DEFAULT '[]',
  "totalCandidates" INTEGER NOT NULL DEFAULT 0,
  "currentIndex" INTEGER NOT NULL DEFAULT 0,
  "currentConversationId" INTEGER,
  "currentPhone" TEXT,
  "currentLastCustomerWords" TEXT,
  "currentDetectedReason" TEXT,
  "processed" INTEGER NOT NULL DEFAULT 0,
  "markedNegative" INTEGER NOT NULL DEFAULT 0,
  "purged" INTEGER NOT NULL DEFAULT 0,
  "skipped" INTEGER NOT NULL DEFAULT 0,
  "errorsJson" TEXT NOT NULL DEFAULT '[]',
  "lastError" TEXT,
  "providerStatus" TEXT,
  "nextRunAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InboxTrashMeticulousPurgeJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InboxTrashMeticulousPurgeJob_companyId_status_idx" ON "InboxTrashMeticulousPurgeJob"("companyId", "status");
CREATE INDEX "InboxTrashMeticulousPurgeJob_status_nextRunAt_idx" ON "InboxTrashMeticulousPurgeJob"("status", "nextRunAt");
