ALTER TABLE "Company"
ADD COLUMN IF NOT EXISTS "whatsappModalStatus" TEXT;

ALTER TABLE "Company"
ADD COLUMN IF NOT EXISTS "whatsappModalProvider" TEXT;

ALTER TABLE "Company"
ADD COLUMN IF NOT EXISTS "whatsappModalPhone" TEXT;

ALTER TABLE "Company"
ADD COLUMN IF NOT EXISTS "whatsappModalConnectedAt" TIMESTAMP(3);

ALTER TABLE "Company"
ADD COLUMN IF NOT EXISTS "whatsappModalLastError" TEXT;

ALTER TABLE "Company"
ADD COLUMN IF NOT EXISTS "whatsappModalUpdatedAt" TIMESTAMP(3);