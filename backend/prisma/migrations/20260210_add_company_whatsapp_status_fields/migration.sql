-- Add WhatsApp onboarding/status fields to Company

PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;

ALTER TABLE "Company" ADD COLUMN "whatsappDisplayNumber" TEXT;
ALTER TABLE "Company" ADD COLUMN "whatsappStatus" TEXT;
ALTER TABLE "Company" ADD COLUMN "whatsappStatusError" TEXT;
ALTER TABLE "Company" ADD COLUMN "whatsappStatusUpdatedAt" DATETIME;

COMMIT;
PRAGMA foreign_keys=ON;
