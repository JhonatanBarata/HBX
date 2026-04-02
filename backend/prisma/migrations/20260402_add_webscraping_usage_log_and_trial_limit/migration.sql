CREATE TABLE "WebscrapingUsageLog" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "eventType" TEXT NOT NULL DEFAULT 'EXECUTED',
  "city" TEXT,
  "segment" TEXT,
  "quantity" INTEGER,
  "resultCount" INTEGER NOT NULL DEFAULT 0,
  "searchSignature" TEXT,
  "message" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WebscrapingUsageLog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WebscrapingUsageLog"
ADD CONSTRAINT "WebscrapingUsageLog_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WebscrapingUsageLog"
ADD CONSTRAINT "WebscrapingUsageLog_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "WebscrapingUsageLog_companyId_createdAt_idx"
ON "WebscrapingUsageLog"("companyId", "createdAt");

CREATE INDEX "WebscrapingUsageLog_companyId_eventType_createdAt_idx"
ON "WebscrapingUsageLog"("companyId", "eventType", "createdAt");

CREATE INDEX "WebscrapingUsageLog_userId_createdAt_idx"
ON "WebscrapingUsageLog"("userId", "createdAt");
