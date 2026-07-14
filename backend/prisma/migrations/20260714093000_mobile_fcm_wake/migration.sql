ALTER TABLE "MobileDevice"
  ADD COLUMN "pushToken" TEXT,
  ADD COLUMN "pushPlatform" TEXT,
  ADD COLUMN "pushUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "appVersion" TEXT;

CREATE INDEX "MobileDevice_companyId_pushToken_idx"
  ON "MobileDevice"("companyId", "pushToken");

CREATE INDEX "MobileDevice_userId_companyId_pushUpdatedAt_idx"
  ON "MobileDevice"("userId", "companyId", "pushUpdatedAt");
