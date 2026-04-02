CREATE TABLE "FinanceiroCharge" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
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
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceiroCharge_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "FinanceiroCharge"
ADD CONSTRAINT "FinanceiroCharge_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "FinanceiroCharge_externalReference_key" ON "FinanceiroCharge"("externalReference");
CREATE UNIQUE INDEX "FinanceiroCharge_mpPaymentId_key" ON "FinanceiroCharge"("mpPaymentId");
CREATE INDEX "FinanceiroCharge_companyId_createdAt_idx" ON "FinanceiroCharge"("companyId", "createdAt");
CREATE INDEX "FinanceiroCharge_companyId_lifecycle_createdAt_idx" ON "FinanceiroCharge"("companyId", "lifecycle", "createdAt");
CREATE INDEX "FinanceiroCharge_companyId_status_createdAt_idx" ON "FinanceiroCharge"("companyId", "status", "createdAt");
