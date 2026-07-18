ALTER TABLE "MobileDevice" ADD COLUMN "hardwareId" TEXT;
CREATE INDEX "MobileDevice_userId_hardwareId_idx" ON "MobileDevice"("userId", "hardwareId");
