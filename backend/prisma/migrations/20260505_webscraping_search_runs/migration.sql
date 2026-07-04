CREATE TABLE "WebscrapingSearchRun" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "city" TEXT NOT NULL,
  "state" TEXT,
  "segment" TEXT NOT NULL,
  "engine" TEXT NOT NULL DEFAULT 'hbx',
  "targetType" TEXT NOT NULL DEFAULT 'pj',
  "targetQuantity" INTEGER NOT NULL,
  "foundCount" INTEGER NOT NULL DEFAULT 0,
  "importedCount" INTEGER NOT NULL DEFAULT 0,
  "duplicateCount" INTEGER NOT NULL DEFAULT 0,
  "skippedCount" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "assignedEngineId" TEXT,
  "assignedEngineUrl" TEXT,
  "assignedEngineIndex" INTEGER,
  "googleEmergencyUsedCount" INTEGER NOT NULL DEFAULT 0,
  "lastFoundCountChangeAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WebscrapingSearchRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebscrapingSearchRunItem" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "placeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "phoneDigits" TEXT NOT NULL,
  "website" TEXT,
  "websiteKey" TEXT,
  "address" TEXT,
  "city" TEXT,
  "state" TEXT,
  "segment" TEXT,
  "source" TEXT,
  "status" TEXT NOT NULL DEFAULT 'found',
  "duplicateReason" TEXT,
  "rawJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WebscrapingSearchRunItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WebscrapingSearchRun_companyId_createdAt_idx" ON "WebscrapingSearchRun"("companyId", "createdAt");
CREATE INDEX "WebscrapingSearchRun_companyId_status_updatedAt_idx" ON "WebscrapingSearchRun"("companyId", "status", "updatedAt");
CREATE INDEX "WebscrapingSearchRun_userId_createdAt_idx" ON "WebscrapingSearchRun"("userId", "createdAt");
CREATE INDEX "WebscrapingSearchRun_status_createdAt_idx" ON "WebscrapingSearchRun"("status", "createdAt");
CREATE INDEX "WebscrapingSearchRun_assignedEngineId_idx" ON "WebscrapingSearchRun"("assignedEngineId");

CREATE INDEX "WebscrapingSearchRunItem_runId_createdAt_idx" ON "WebscrapingSearchRunItem"("runId", "createdAt");
CREATE INDEX "WebscrapingSearchRunItem_runId_status_idx" ON "WebscrapingSearchRunItem"("runId", "status");
CREATE INDEX "WebscrapingSearchRunItem_companyId_phoneDigits_idx" ON "WebscrapingSearchRunItem"("companyId", "phoneDigits");
CREATE INDEX "WebscrapingSearchRunItem_companyId_websiteKey_idx" ON "WebscrapingSearchRunItem"("companyId", "websiteKey");
CREATE INDEX "WebscrapingSearchRunItem_companyId_placeId_idx" ON "WebscrapingSearchRunItem"("companyId", "placeId");

ALTER TABLE "WebscrapingSearchRun"
  ADD CONSTRAINT "WebscrapingSearchRun_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WebscrapingSearchRun"
  ADD CONSTRAINT "WebscrapingSearchRun_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WebscrapingSearchRunItem"
  ADD CONSTRAINT "WebscrapingSearchRunItem_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "WebscrapingSearchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WebscrapingSearchRunItem"
  ADD CONSTRAINT "WebscrapingSearchRunItem_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
