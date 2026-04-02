ALTER TABLE "Company"
ADD COLUMN IF NOT EXISTS "whatsappMigrationWorkflowStatus" TEXT NOT NULL DEFAULT 'NONE';

ALTER TABLE "Company"
ADD COLUMN IF NOT EXISTS "whatsappMigrationLastContactAt" TIMESTAMP(3);

ALTER TABLE "Company"
ADD COLUMN IF NOT EXISTS "whatsappMigrationInternalNote" TEXT;
