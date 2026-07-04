ALTER TABLE IF EXISTS "WebscrapingSearchRun"
  ADD COLUMN IF NOT EXISTS "assignedEngineId" TEXT,
  ADD COLUMN IF NOT EXISTS "assignedEngineUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "assignedEngineIndex" INTEGER,
  ADD COLUMN IF NOT EXISTS "googleEmergencyUsedCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lastFoundCountChangeAt" TIMESTAMP(3);

CREATE TABLE "HbxEngineLock" (
  "id" TEXT NOT NULL,
  "engineIndex" INTEGER NOT NULL,
  "url" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'standby',
  "lastHealthStatus" TEXT,
  "lastError" TEXT,
  "failureCount" INTEGER NOT NULL DEFAULT 0,
  "lockedRunId" TEXT,
  "lockedCompanyId" INTEGER,
  "lockedUserId" INTEGER,
  "lockedAt" TIMESTAMP(3),
  "lockedUntil" TIMESTAMP(3),
  "cooldownUntil" TIMESTAMP(3),
  "lastCheckedAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "HbxEngineLock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HbxEngineLock_engineIndex_key" ON "HbxEngineLock"("engineIndex");
CREATE INDEX "HbxEngineLock_status_lockedUntil_idx" ON "HbxEngineLock"("status", "lockedUntil");
CREATE INDEX "HbxEngineLock_cooldownUntil_idx" ON "HbxEngineLock"("cooldownUntil");
CREATE INDEX "HbxEngineLock_lockedRunId_idx" ON "HbxEngineLock"("lockedRunId");

ALTER TABLE "HbxEngineLock"
  ADD CONSTRAINT "HbxEngineLock_lockedCompanyId_fkey"
  FOREIGN KEY ("lockedCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
