import { PrismaService } from '../prisma/prisma.service';

let masterBillingRuntimeEnsured = false;
let masterBillingRuntimeEnsurePromise: Promise<void> | null = null;

export async function ensureMasterBillingRuntimeSchema(prisma: PrismaService) {
  if (masterBillingRuntimeEnsured) return;
  if (masterBillingRuntimeEnsurePromise) return masterBillingRuntimeEnsurePromise;

  masterBillingRuntimeEnsurePromise = ensureMasterBillingRuntimeSchemaUncached(prisma)
    .then(() => {
      masterBillingRuntimeEnsured = true;
    })
    .finally(() => {
      masterBillingRuntimeEnsurePromise = null;
    });

  return masterBillingRuntimeEnsurePromise;
}

async function ensureMasterBillingRuntimeSchemaUncached(prisma: PrismaService) {
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
    ADD COLUMN IF NOT EXISTS "billingGraceStartedAt" TIMESTAMP(3)
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "billingGraceEndsAt" TIMESTAMP(3)
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "billingGraceReason" TEXT
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "billingGraceEmailStage" INTEGER NOT NULL DEFAULT 0
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "billingGraceLastEmailAt" TIMESTAMP(3)
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "billingGraceLastFailureAt" TIMESTAMP(3)
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "trialNoticeEmailStage" INTEGER NOT NULL DEFAULT 0
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "trialNoticeLastEmailAt" TIMESTAMP(3)
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
    ADD COLUMN IF NOT EXISTS "commercialCardsMonthlyLimitOverride" INTEGER
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "commercialCardsDailyLimitOverride" INTEGER
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
    CREATE TABLE IF NOT EXISTS "WhatsAppConnectionSession" (
      "id" TEXT NOT NULL,
      "companyId" INTEGER NOT NULL,
      "provider" TEXT NOT NULL DEFAULT 'webwhats',
      "tenantKey" TEXT NOT NULL,
      "phoneNormalized" TEXT,
      "displayPhone" TEXT,
      "status" TEXT NOT NULL DEFAULT 'active',
      "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "disconnectedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "metadataJson" TEXT,
      CONSTRAINT "WhatsAppConnectionSession_pkey" PRIMARY KEY ("id")
    )
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "currentWhatsappConnectionSessionId" TEXT
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Conversation"
    ADD COLUMN IF NOT EXISTS "whatsappConnectionSessionId" TEXT,
    ADD COLUMN IF NOT EXISTS "sourcePhoneNormalized" TEXT,
    ADD COLUMN IF NOT EXISTS "sourceTenantKey" TEXT
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Message"
    ADD COLUMN IF NOT EXISTS "whatsappConnectionSessionId" TEXT,
    ADD COLUMN IF NOT EXISTS "sourcePhoneNormalized" TEXT,
    ADD COLUMN IF NOT EXISTS "sourceTenantKey" TEXT
  `);

  await prisma.$executeRawUnsafe(`
    DROP INDEX IF EXISTS "Conversation_companyId_channel_contact_key"
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "Conversation_companyId_channel_contact_whatsappConnectionSessionId_key"
    ON "Conversation"("companyId", "channel", "contact", "whatsappConnectionSessionId")
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "Conversation_companyId_whatsappConnectionSessionId_idx"
    ON "Conversation"("companyId", "whatsappConnectionSessionId")
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "Message_companyId_whatsappConnectionSessionId_timestamp_idx"
    ON "Message"("companyId", "whatsappConnectionSessionId", "timestamp")
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
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "themePreferenceConfig" TEXT
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "User"
    ADD COLUMN IF NOT EXISTS "themePreferenceConfig" TEXT
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
    ALTER TABLE "MasterGlobalIntegrationConfig"
    ADD COLUMN IF NOT EXISTS "themePreferenceConfig" TEXT
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
    CREATE TABLE IF NOT EXISTS "CompanyBillableSeatUsage" (
      "id" TEXT PRIMARY KEY,
      "companyId" INTEGER NOT NULL REFERENCES "Company"("id") ON DELETE CASCADE,
      "userId" INTEGER REFERENCES "User"("id") ON DELETE SET NULL,
      "role" TEXT,
      "startedAt" TIMESTAMP(3) NOT NULL,
      "endedAt" TIMESTAMP(3),
      "startSource" TEXT,
      "endSource" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "CompanyBillableSeatUsage_companyId_startedAt_idx" ON "CompanyBillableSeatUsage"("companyId", "startedAt")',
  );
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "CompanyBillableSeatUsage_companyId_endedAt_idx" ON "CompanyBillableSeatUsage"("companyId", "endedAt")',
  );
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "CompanyBillableSeatUsage_companyId_userId_endedAt_idx" ON "CompanyBillableSeatUsage"("companyId", "userId", "endedAt")',
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

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CommercialPlanProviderMapping" (
      "id" TEXT PRIMARY KEY,
      "planKey" TEXT NOT NULL,
      "billingCycle" TEXT NOT NULL,
      "provider" TEXT NOT NULL DEFAULT 'mercadopago',
      "providerPlanId" TEXT NOT NULL,
      "amount" DOUBLE PRECISION NOT NULL,
      "currency" TEXT NOT NULL DEFAULT 'BRL',
      "active" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(
    'CREATE UNIQUE INDEX IF NOT EXISTS "CommercialPlanProviderMapping_planKey_billingCycle_provider_key" ON "CommercialPlanProviderMapping"("planKey", "billingCycle", "provider")',
  );
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "CommercialPlanProviderMapping_provider_providerPlanId_idx" ON "CommercialPlanProviderMapping"("provider", "providerPlanId")',
  );
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "CommercialPlanProviderMapping_active_provider_idx" ON "CommercialPlanProviderMapping"("active", "provider")',
  );

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CompanySubscription" (
      "id" TEXT PRIMARY KEY,
      "companyId" INTEGER NOT NULL REFERENCES "Company"("id") ON DELETE CASCADE,
      "provider" TEXT NOT NULL DEFAULT 'mercadopago',
      "providerPreapprovalId" TEXT,
      "providerPreapprovalPlanId" TEXT,
      "planKey" TEXT NOT NULL,
      "billingCycle" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'pending',
      "payerEmail" TEXT,
      "billingContactPhone" TEXT,
      "cardBrand" TEXT,
      "cardLast4" TEXT,
      "currentPeriodStart" TIMESTAMP(3),
      "currentPeriodEnd" TIMESTAMP(3),
      "nextBillingAt" TIMESTAMP(3),
      "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
      "canceledAt" TIMESTAMP(3),
      "lastProviderStatus" TEXT,
      "providerPayloadJson" TEXT,
      "createdByUserId" INTEGER,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(
    'CREATE UNIQUE INDEX IF NOT EXISTS "CompanySubscription_providerPreapprovalId_key" ON "CompanySubscription"("providerPreapprovalId")',
  );
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "CompanySubscription_companyId_status_idx" ON "CompanySubscription"("companyId", "status")',
  );
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "CompanySubscription_provider_providerPreapprovalPlanId_idx" ON "CompanySubscription"("provider", "providerPreapprovalPlanId")',
  );
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "CompanySubscription_provider_status_idx" ON "CompanySubscription"("provider", "status")',
  );
}
