-- Sprint 1: structural backbone only.
-- This migration intentionally avoids drops, renames and backfill.

-- AlterTable
ALTER TABLE "AtendimentoCustomer" ADD COLUMN IF NOT EXISTS "customerProfileId" TEXT;

-- AlterTable
ALTER TABLE "HbxRecoveryCustomer" ADD COLUMN IF NOT EXISTS "customerProfileId" TEXT;

-- AlterTable
ALTER TABLE "HbxRecoveryPayment" ADD COLUMN IF NOT EXISTS "debtCaseId" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "IntegrationConnection" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "instanceName" TEXT NOT NULL,
    "secretCiphertext" TEXT,
    "secretPreview" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
    "lastTestedAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CustomerProfile" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "sourceConnectionId" TEXT,
    "name" TEXT,
    "phone" TEXT,
    "phoneNormalized" TEXT,
    "email" TEXT,
    "document" TEXT,
    "externalSource" TEXT,
    "externalCustomerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "DebtCase" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "customerProfileId" TEXT NOT NULL,
    "sourceConnectionId" TEXT,
    "sourceProvider" TEXT NOT NULL,
    "externalDebtId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "rawPayloadJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DebtCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "IntegrationSyncRun" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "connectionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'running',
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "checkpoint" TEXT,
    "errorLog" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AtendimentoCustomer_customerProfileId_idx" ON "AtendimentoCustomer"("customerProfileId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "HbxRecoveryCustomer_customerProfileId_idx" ON "HbxRecoveryCustomer"("customerProfileId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "HbxRecoveryPayment_debtCaseId_createdAt_idx" ON "HbxRecoveryPayment"("debtCaseId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerProfile_companyId_phoneNormalized_idx" ON "CustomerProfile"("companyId", "phoneNormalized");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerProfile_companyId_document_idx" ON "CustomerProfile"("companyId", "document");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerProfile_sourceConnectionId_externalCustomerId_idx" ON "CustomerProfile"("sourceConnectionId", "externalCustomerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerProfile_companyId_status_idx" ON "CustomerProfile"("companyId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DebtCase_companyId_customerProfileId_idx" ON "DebtCase"("companyId", "customerProfileId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DebtCase_companyId_status_idx" ON "DebtCase"("companyId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DebtCase_sourceConnectionId_externalDebtId_idx" ON "DebtCase"("sourceConnectionId", "externalDebtId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IntegrationConnection_companyId_provider_isActive_idx" ON "IntegrationConnection"("companyId", "provider", "isActive");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IntegrationConnection_companyId_status_lastSyncAt_idx" ON "IntegrationConnection"("companyId", "status", "lastSyncAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IntegrationSyncRun_companyId_status_startedAt_idx" ON "IntegrationSyncRun"("companyId", "status", "startedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IntegrationSyncRun_connectionId_startedAt_idx" ON "IntegrationSyncRun"("connectionId", "startedAt");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IntegrationConnection_companyId_fkey') THEN
        ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerProfile_companyId_fkey') THEN
        ALTER TABLE "CustomerProfile" ADD CONSTRAINT "CustomerProfile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerProfile_sourceConnectionId_fkey') THEN
        ALTER TABLE "CustomerProfile" ADD CONSTRAINT "CustomerProfile_sourceConnectionId_fkey" FOREIGN KEY ("sourceConnectionId") REFERENCES "IntegrationConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DebtCase_companyId_fkey') THEN
        ALTER TABLE "DebtCase" ADD CONSTRAINT "DebtCase_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DebtCase_customerProfileId_fkey') THEN
        ALTER TABLE "DebtCase" ADD CONSTRAINT "DebtCase_customerProfileId_fkey" FOREIGN KEY ("customerProfileId") REFERENCES "CustomerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DebtCase_sourceConnectionId_fkey') THEN
        ALTER TABLE "DebtCase" ADD CONSTRAINT "DebtCase_sourceConnectionId_fkey" FOREIGN KEY ("sourceConnectionId") REFERENCES "IntegrationConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IntegrationSyncRun_companyId_fkey') THEN
        ALTER TABLE "IntegrationSyncRun" ADD CONSTRAINT "IntegrationSyncRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IntegrationSyncRun_connectionId_fkey') THEN
        ALTER TABLE "IntegrationSyncRun" ADD CONSTRAINT "IntegrationSyncRun_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AtendimentoCustomer_customerProfileId_fkey') THEN
        ALTER TABLE "AtendimentoCustomer" ADD CONSTRAINT "AtendimentoCustomer_customerProfileId_fkey" FOREIGN KEY ("customerProfileId") REFERENCES "CustomerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HbxRecoveryCustomer_customerProfileId_fkey') THEN
        ALTER TABLE "HbxRecoveryCustomer" ADD CONSTRAINT "HbxRecoveryCustomer_customerProfileId_fkey" FOREIGN KEY ("customerProfileId") REFERENCES "CustomerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HbxRecoveryPayment_debtCaseId_fkey') THEN
        ALTER TABLE "HbxRecoveryPayment" ADD CONSTRAINT "HbxRecoveryPayment_debtCaseId_fkey" FOREIGN KEY ("debtCaseId") REFERENCES "DebtCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;