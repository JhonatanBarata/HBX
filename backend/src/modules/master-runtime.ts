import { PrismaService } from '../prisma/prisma.service';

export async function ensureMasterBillingRuntimeSchema(prisma: PrismaService) {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "useMasterMercadoPagoToken" BOOLEAN NOT NULL DEFAULT false
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "billingCycle" TEXT NOT NULL DEFAULT 'MONTHLY'
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "billingCardBrand" TEXT
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "billingCardLast4" TEXT
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "billingCardHolderName" TEXT
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "billingCardExpMonth" INTEGER
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "billingCardExpYear" INTEGER
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "billingCardUpdatedAt" TIMESTAMP(3)
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "manualDiscountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "freeMonths" INTEGER NOT NULL DEFAULT 0
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "acquisitionSource" TEXT
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "acquisitionSourceDetail" TEXT
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "referralReferrerName" TEXT
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "referralCode" TEXT
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "referralDiscountConsumedAt" TIMESTAMP(3)
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "useMasterWhatsAppToken" BOOLEAN NOT NULL DEFAULT false
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "masterMercadoPagoCredentialKey" TEXT
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "masterWhatsAppCredentialKey" TEXT
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "whatsappConnectionMode" TEXT NOT NULL DEFAULT 'NONE'
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "whatsappTemporaryStatus" TEXT NOT NULL DEFAULT 'NOT_CONNECTED'
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "whatsappTemporaryInstanceKey" TEXT
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "whatsappTemporaryProvider" TEXT
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "whatsappTemporaryPairingCode" TEXT
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "whatsappTemporaryQrCodeData" TEXT
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "whatsappTemporaryDisplayNumber" TEXT
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "whatsappTemporaryLastSyncAt" TIMESTAMP(3)
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "whatsappTemporaryConnectedAt" TIMESTAMP(3)
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "whatsappTemporaryStatusError" TEXT
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "whatsappModalStatus" TEXT
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "whatsappModalProvider" TEXT
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "whatsappModalPhone" TEXT
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "whatsappModalConnectedAt" TIMESTAMP(3)
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "whatsappModalLastError" TEXT
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "whatsappModalUpdatedAt" TIMESTAMP(3)
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "whatsappMigrationInterestStatus" TEXT NOT NULL DEFAULT 'NONE'
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "whatsappMigrationInterestAt" TIMESTAMP(3)
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "whatsappMigrationInterestSource" TEXT
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "whatsappMigrationWorkflowStatus" TEXT NOT NULL DEFAULT 'NONE'
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "whatsappMigrationLastContactAt" TIMESTAMP(3)
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "whatsappMigrationInternalNote" TEXT
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "SystemModule"
    ADD COLUMN IF NOT EXISTS "monthlyPrice" DOUBLE PRECISION NOT NULL DEFAULT 0
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "MasterGlobalIntegrationConfig" (
      "key" TEXT PRIMARY KEY,
      "mercadoPagoAccessToken" TEXT,
      "whatsappAccessToken" TEXT,
      "whatsappPhoneNumberId" TEXT,
      "whatsappWabaId" TEXT,
      "whatsappNumber" TEXT,
      "whatsappDisplayNumber" TEXT,
      "mercadoPagoLibrary" TEXT,
      "whatsappLibrary" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "MasterGlobalIntegrationConfig"
    ADD COLUMN IF NOT EXISTS "mercadoPagoLibrary" TEXT
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "MasterGlobalIntegrationConfig"
    ADD COLUMN IF NOT EXISTS "whatsappLibrary" TEXT
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "MasterGlobalIntegrationConfig"
    ADD COLUMN IF NOT EXISTS "annualPlanDiscountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "MasterGlobalIntegrationConfig"
    ADD COLUMN IF NOT EXISTS "extraSeatMonthlyAmount" DOUBLE PRECISION NOT NULL DEFAULT 0
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "MasterGlobalIntegrationConfig"
    ADD COLUMN IF NOT EXISTS "referralDiscountActive" BOOLEAN NOT NULL DEFAULT false
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "MasterGlobalIntegrationConfig"
    ADD COLUMN IF NOT EXISTS "referralDiscountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "MasterGlobalIntegrationConfig"
    ADD COLUMN IF NOT EXISTS "referralDiscountMode" TEXT NOT NULL DEFAULT 'ONCE'
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "MasterBillingLedgerEntry" (
      "id" TEXT PRIMARY KEY,
      "companyId" INTEGER NOT NULL REFERENCES "Company"("id") ON DELETE CASCADE,
      "entryType" TEXT NOT NULL,
      "entryGroup" TEXT NOT NULL DEFAULT 'revenue',
      "status" TEXT NOT NULL DEFAULT 'PENDING',
      "origin" TEXT,
      "currency" TEXT NOT NULL DEFAULT 'BRL',
      "competence" TEXT,
      "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "dueDate" TIMESTAMP(3),
      "paidAt" TIMESTAMP(3),
      "paymentMethod" TEXT,
      "referenceLabel" TEXT,
      "observation" TEXT,
      "metadata" TEXT,
      "createdByUserId" INTEGER REFERENCES "User"("id") ON DELETE SET NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "MasterBillingLedgerEntry_companyId_createdAt_idx" ON "MasterBillingLedgerEntry"("companyId", "createdAt")',
  );
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "MasterBillingLedgerEntry_companyId_paidAt_idx" ON "MasterBillingLedgerEntry"("companyId", "paidAt")',
  );
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "MasterBillingLedgerEntry_companyId_status_dueDate_idx" ON "MasterBillingLedgerEntry"("companyId", "status", "dueDate")',
  );
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "MasterBillingLedgerEntry_entryGroup_status_createdAt_idx" ON "MasterBillingLedgerEntry"("entryGroup", "status", "createdAt")',
  );

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "FinanceiroCharge" (
      "id" TEXT PRIMARY KEY,
      "companyId" INTEGER NOT NULL REFERENCES "Company"("id") ON DELETE CASCADE,
      "amount" DOUBLE PRECISION NOT NULL,
      "currency" TEXT NOT NULL DEFAULT 'BRL',
      "description" TEXT NOT NULL,
      "billingCycle" TEXT NOT NULL DEFAULT 'MONTHLY',
      "paymentMethod" TEXT NOT NULL DEFAULT 'PIX',
      "status" TEXT NOT NULL DEFAULT 'pending',
      "lifecycle" TEXT NOT NULL DEFAULT 'in_progress',
      "competence" TEXT,
      "externalReference" TEXT,
      "mpPreferenceId" TEXT,
      "mpPaymentId" TEXT,
      "mpMerchantOrderId" TEXT,
      "notificationUrl" TEXT,
      "paymentUrl" TEXT,
      "pixQrCode" TEXT,
      "pixQrCodeBase64" TEXT,
      "pixTicketUrl" TEXT,
      "ledgerEntryId" TEXT,
      "paidAt" TIMESTAMP(3),
      "refundedAt" TIMESTAMP(3),
      "refundAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "providerPayload" TEXT,
      "lastWebhookAt" TIMESTAMP(3),
      "lastWebhookPayload" TEXT,
      "createdByUserId" INTEGER,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(
    'CREATE UNIQUE INDEX IF NOT EXISTS "FinanceiroCharge_externalReference_key" ON "FinanceiroCharge"("externalReference")',
  );
  await prisma.$executeRawUnsafe(
    'CREATE UNIQUE INDEX IF NOT EXISTS "FinanceiroCharge_mpPaymentId_key" ON "FinanceiroCharge"("mpPaymentId")',
  );
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "FinanceiroCharge_companyId_createdAt_idx" ON "FinanceiroCharge"("companyId", "createdAt")',
  );
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "FinanceiroCharge_companyId_lifecycle_createdAt_idx" ON "FinanceiroCharge"("companyId", "lifecycle", "createdAt")',
  );
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "FinanceiroCharge_companyId_status_createdAt_idx" ON "FinanceiroCharge"("companyId", "status", "createdAt")',
  );
}
