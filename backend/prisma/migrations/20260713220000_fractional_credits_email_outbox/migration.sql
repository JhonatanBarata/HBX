-- Crédito fracionado no próprio ledger: mantém FIFO, validade e refund sem
-- acumulador paralelo. A conversão Int -> numeric preserva integralmente o saldo.
ALTER TABLE "CreditWallet"
  ALTER COLUMN "chargebackDebtCredits" TYPE DECIMAL(18,3)
  USING "chargebackDebtCredits"::DECIMAL(18,3),
  ALTER COLUMN "chargebackDebtCredits" SET DEFAULT 0;

ALTER TABLE "CreditLedgerEntry"
  ALTER COLUMN "amount" TYPE DECIMAL(18,3)
  USING "amount"::DECIMAL(18,3),
  ALTER COLUMN "remaining" TYPE DECIMAL(18,3)
  USING "remaining"::DECIMAL(18,3),
  ALTER COLUMN "remaining" SET DEFAULT 0;

-- Overrides antigos de medição não podem virar débito por acidente. Voltam aos
-- novos defaults; o Master pode configurar Grátis/Débito novamente com aviso.
DELETE FROM "CreditActionConfig"
WHERE "configJson" LIKE '%"mode":"track"%'
   OR "configJson" LIKE '%"mode": "track"%';

-- Telemetria antiga nunca afetou saldo e não participa do novo contrato.
DELETE FROM "CreditLedgerEntry" WHERE "kind" = 'debit_shadow';

-- A conversa deixa de presumir Recovery: o fluxo é definido pelo roteamento.
-- O vínculo ao perfil permite interromper a cadência sem depender só do telefone.
ALTER TABLE "Conversation"
  ADD COLUMN "customerProfileId" TEXT,
  ALTER COLUMN "currentFlow" SET DEFAULT 'atendimento';
CREATE INDEX "Conversation_companyId_customerProfileId_idx"
  ON "Conversation"("companyId", "customerProfileId");
ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_customerProfileId_fkey"
  FOREIGN KEY ("customerProfileId") REFERENCES "CustomerProfile"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "RecoveryDebtItem" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "customerProfileId" TEXT NOT NULL,
  "recoveryCustomerId" TEXT,
  "debtCaseId" TEXT,
  "financeiroChargeId" TEXT,
  "sourceType" TEXT NOT NULL,
  "sourceRefId" TEXT NOT NULL,
  "entregaId" TEXT,
  "originalAmount" DOUBLE PRECISION NOT NULL,
  "openAmount" DOUBLE PRECISION NOT NULL,
  "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "dueDate" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'open',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RecoveryDebtItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RecoveryDebtItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RecoveryDebtItem_customerProfileId_fkey" FOREIGN KEY ("customerProfileId") REFERENCES "CustomerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RecoveryDebtItem_recoveryCustomerId_fkey" FOREIGN KEY ("recoveryCustomerId") REFERENCES "HbxRecoveryCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "RecoveryDebtItem_debtCaseId_fkey" FOREIGN KEY ("debtCaseId") REFERENCES "DebtCase"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "RecoveryDebtItem_financeiroChargeId_fkey" FOREIGN KEY ("financeiroChargeId") REFERENCES "FinanceiroCharge"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RecoveryDebtItem_financeiroChargeId_key" ON "RecoveryDebtItem"("financeiroChargeId");
CREATE UNIQUE INDEX "RecoveryDebtItem_companyId_sourceType_sourceRefId_key" ON "RecoveryDebtItem"("companyId", "sourceType", "sourceRefId");
CREATE INDEX "RecoveryDebtItem_companyId_customerProfileId_status_dueDate_idx" ON "RecoveryDebtItem"("companyId", "customerProfileId", "status", "dueDate");
CREATE INDEX "RecoveryDebtItem_recoveryCustomerId_status_idx" ON "RecoveryDebtItem"("recoveryCustomerId", "status");

CREATE TABLE "RecoveryDebtItemProduct" (
  "id" TEXT NOT NULL,
  "debtItemId" TEXT NOT NULL,
  "productId" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "amount" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecoveryDebtItemProduct_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RecoveryDebtItemProduct_debtItemId_fkey" FOREIGN KEY ("debtItemId") REFERENCES "RecoveryDebtItem"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RecoveryDebtItemProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RecoveryDebtItemProduct_debtItemId_productId_key" ON "RecoveryDebtItemProduct"("debtItemId", "productId");
CREATE INDEX "RecoveryDebtItemProduct_productId_idx" ON "RecoveryDebtItemProduct"("productId");

CREATE TABLE "RecoveryDebtAllocation" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "paymentId" TEXT NOT NULL,
  "debtItemId" TEXT NOT NULL,
  "appliedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "reversedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RecoveryDebtAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RecoveryDebtAllocation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RecoveryDebtAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "HbxRecoveryPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RecoveryDebtAllocation_debtItemId_fkey" FOREIGN KEY ("debtItemId") REFERENCES "RecoveryDebtItem"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RecoveryDebtAllocation_paymentId_debtItemId_key" ON "RecoveryDebtAllocation"("paymentId", "debtItemId");
CREATE INDEX "RecoveryDebtAllocation_companyId_debtItemId_idx" ON "RecoveryDebtAllocation"("companyId", "debtItemId");

CREATE TABLE "RecoveryAutomationStepRun" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "customerId" TEXT NOT NULL,
  "stageId" TEXT NOT NULL,
  "cycleKey" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "leaseUntil" TIMESTAMP(3),
  "outboundMessageId" INTEGER,
  "sentAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "cancelReason" TEXT,
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RecoveryAutomationStepRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RecoveryAutomationStepRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RecoveryAutomationStepRun_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "HbxRecoveryCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RecoveryAutomationStepRun_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "HbxRecoveryFlowStage"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RecoveryAutomationStepRun_companyId_customerId_stageId_cycleKey_key" ON "RecoveryAutomationStepRun"("companyId", "customerId", "stageId", "cycleKey");
CREATE INDEX "RecoveryAutomationStepRun_status_dueAt_idx" ON "RecoveryAutomationStepRun"("status", "dueAt");
CREATE INDEX "RecoveryAutomationStepRun_companyId_customerId_status_idx" ON "RecoveryAutomationStepRun"("companyId", "customerId", "status");

CREATE TABLE "EmailOutboundMessage" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "leadId" TEXT,
  "automationStepRunId" TEXT,
  "recoveryStepRunId" TEXT,
  "requestedByUserId" INTEGER,
  "recipient" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "bodyText" TEXT NOT NULL,
  "sourceModule" TEXT NOT NULL,
  "purpose" TEXT NOT NULL DEFAULT 'commercial_contact',
  "idempotencyKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseUntil" TIMESTAMP(3),
  "providerMessageId" TEXT,
  "sentAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "metadataJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmailOutboundMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmailOutboundMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EmailOutboundMessage_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "VendasLead"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EmailOutboundMessage_automationStepRunId_fkey" FOREIGN KEY ("automationStepRunId") REFERENCES "AutomationStepRun"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "EmailOutboundMessage_recoveryStepRunId_fkey" FOREIGN KEY ("recoveryStepRunId") REFERENCES "RecoveryAutomationStepRun"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "EmailOutboundAttempt" (
  "id" TEXT NOT NULL,
  "outboundMessageId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'started',
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "providerMessageId" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "EmailOutboundAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmailOutboundAttempt_outboundMessageId_fkey" FOREIGN KEY ("outboundMessageId") REFERENCES "EmailOutboundMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "EmailOutboundMessage_companyId_idempotencyKey_key"
  ON "EmailOutboundMessage"("companyId", "idempotencyKey");
CREATE UNIQUE INDEX "EmailOutboundMessage_automationStepRunId_key"
  ON "EmailOutboundMessage"("automationStepRunId");
CREATE UNIQUE INDEX "EmailOutboundMessage_recoveryStepRunId_key"
  ON "EmailOutboundMessage"("recoveryStepRunId");
CREATE INDEX "EmailOutboundMessage_status_nextAttemptAt_idx"
  ON "EmailOutboundMessage"("status", "nextAttemptAt");
CREATE INDEX "EmailOutboundMessage_companyId_leadId_createdAt_idx"
  ON "EmailOutboundMessage"("companyId", "leadId", "createdAt");
CREATE INDEX "EmailOutboundAttempt_outboundMessageId_startedAt_idx"
  ON "EmailOutboundAttempt"("outboundMessageId", "startedAt");
