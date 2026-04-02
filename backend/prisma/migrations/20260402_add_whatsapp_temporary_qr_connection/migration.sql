ALTER TABLE "Company"
ADD COLUMN IF NOT EXISTS "whatsappTemporaryInstanceKey" TEXT,
ADD COLUMN IF NOT EXISTS "whatsappTemporaryProvider" TEXT,
ADD COLUMN IF NOT EXISTS "whatsappTemporaryPairingCode" TEXT,
ADD COLUMN IF NOT EXISTS "whatsappTemporaryQrCodeData" TEXT,
ADD COLUMN IF NOT EXISTS "whatsappTemporaryDisplayNumber" TEXT,
ADD COLUMN IF NOT EXISTS "whatsappTemporaryLastSyncAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "whatsappTemporaryConnectedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "whatsappTemporaryStatusError" TEXT;
