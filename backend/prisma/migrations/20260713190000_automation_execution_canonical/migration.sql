-- Fase 3: execução canônica de automações comerciais.
-- Migração aditiva; Campanha, Job, Cadência e Inscrição permanecem durante o dual-write.

CREATE TABLE "AutomationEnrollment" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "leadId" TEXT NOT NULL,
  "definitionKind" TEXT NOT NULL,
  "definitionId" TEXT NOT NULL,
  "definitionSnapshotJson" TEXT,
  "legacySource" TEXT,
  "legacyExecutionId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "activeCommercialSlot" TEXT,
  "currentStep" INTEGER NOT NULL DEFAULT 0,
  "nextStepAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "pausedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "stopReason" TEXT,
  "lastError" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "metadataJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationEnrollment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AutomationStepRun" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "leadId" TEXT NOT NULL,
  "enrollmentId" TEXT NOT NULL,
  "stepKey" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL DEFAULT 0,
  "attemptNumber" INTEGER NOT NULL DEFAULT 1,
  "channel" TEXT NOT NULL,
  "purpose" TEXT NOT NULL DEFAULT 'commercial_contact',
  "status" TEXT NOT NULL DEFAULT 'scheduled',
  "idempotencyKey" TEXT NOT NULL,
  "scheduledAt" TIMESTAMP(3),
  "claimedAt" TIMESTAMP(3),
  "leaseUntil" TIMESTAMP(3),
  "queuedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "outboundMessageId" INTEGER,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "metadataJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationStepRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AutomationLedgerEvent" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "leadId" TEXT NOT NULL,
  "enrollmentId" TEXT,
  "stepRunId" TEXT,
  "eventType" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "statusFrom" TEXT,
  "statusTo" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadataJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AutomationLedgerEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AutomationEnrollment_companyId_leadId_activeCommercialSlot_key"
ON "AutomationEnrollment"("companyId", "leadId", "activeCommercialSlot");

CREATE INDEX "AutomationEnrollment_companyId_definitionKind_definitionId_leadId_idx"
ON "AutomationEnrollment"("companyId", "definitionKind", "definitionId", "leadId");

CREATE INDEX "AutomationEnrollment_companyId_status_nextStepAt_idx"
ON "AutomationEnrollment"("companyId", "status", "nextStepAt");

CREATE INDEX "AutomationEnrollment_leadId_status_idx"
ON "AutomationEnrollment"("leadId", "status");

CREATE UNIQUE INDEX "AutomationStepRun_outboundMessageId_key"
ON "AutomationStepRun"("outboundMessageId");

CREATE UNIQUE INDEX "AutomationStepRun_companyId_idempotencyKey_key"
ON "AutomationStepRun"("companyId", "idempotencyKey");

CREATE UNIQUE INDEX "AutomationStepRun_enrollmentId_stepKey_attemptNumber_key"
ON "AutomationStepRun"("enrollmentId", "stepKey", "attemptNumber");

CREATE INDEX "AutomationStepRun_companyId_status_scheduledAt_idx"
ON "AutomationStepRun"("companyId", "status", "scheduledAt");

CREATE INDEX "AutomationStepRun_enrollmentId_status_idx"
ON "AutomationStepRun"("enrollmentId", "status");

CREATE UNIQUE INDEX "AutomationLedgerEvent_companyId_idempotencyKey_key"
ON "AutomationLedgerEvent"("companyId", "idempotencyKey");

CREATE INDEX "AutomationLedgerEvent_companyId_leadId_occurredAt_idx"
ON "AutomationLedgerEvent"("companyId", "leadId", "occurredAt");

CREATE INDEX "AutomationLedgerEvent_enrollmentId_occurredAt_idx"
ON "AutomationLedgerEvent"("enrollmentId", "occurredAt");

CREATE INDEX "AutomationLedgerEvent_stepRunId_occurredAt_idx"
ON "AutomationLedgerEvent"("stepRunId", "occurredAt");

ALTER TABLE "AutomationEnrollment"
ADD CONSTRAINT "AutomationEnrollment_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AutomationEnrollment"
ADD CONSTRAINT "AutomationEnrollment_leadId_fkey"
FOREIGN KEY ("leadId") REFERENCES "VendasLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AutomationStepRun"
ADD CONSTRAINT "AutomationStepRun_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AutomationStepRun"
ADD CONSTRAINT "AutomationStepRun_leadId_fkey"
FOREIGN KEY ("leadId") REFERENCES "VendasLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AutomationStepRun"
ADD CONSTRAINT "AutomationStepRun_enrollmentId_fkey"
FOREIGN KEY ("enrollmentId") REFERENCES "AutomationEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AutomationStepRun"
ADD CONSTRAINT "AutomationStepRun_outboundMessageId_fkey"
FOREIGN KEY ("outboundMessageId") REFERENCES "OutboundMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AutomationLedgerEvent"
ADD CONSTRAINT "AutomationLedgerEvent_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AutomationLedgerEvent"
ADD CONSTRAINT "AutomationLedgerEvent_leadId_fkey"
FOREIGN KEY ("leadId") REFERENCES "VendasLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AutomationLedgerEvent"
ADD CONSTRAINT "AutomationLedgerEvent_enrollmentId_fkey"
FOREIGN KEY ("enrollmentId") REFERENCES "AutomationEnrollment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AutomationLedgerEvent"
ADD CONSTRAINT "AutomationLedgerEvent_stepRunId_fkey"
FOREIGN KEY ("stepRunId") REFERENCES "AutomationStepRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ConversationAssistantRun" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "conversationId" INTEGER NOT NULL,
  "inboundMessageId" INTEGER NOT NULL,
  "outboundMessageId" INTEGER,
  "vendasLeadId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'claimed',
  "publicNameSnapshot" TEXT,
  "responseSource" TEXT,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConversationAssistantRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConversationAssistantRun_companyId_inboundMessageId_key"
ON "ConversationAssistantRun"("companyId", "inboundMessageId");

CREATE INDEX "ConversationAssistantRun_companyId_conversationId_createdAt_idx"
ON "ConversationAssistantRun"("companyId", "conversationId", "createdAt");

CREATE INDEX "ConversationAssistantRun_outboundMessageId_idx"
ON "ConversationAssistantRun"("outboundMessageId");

ALTER TABLE "ConversationAssistantRun"
ADD CONSTRAINT "ConversationAssistantRun_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConversationAssistantRun"
ADD CONSTRAINT "ConversationAssistantRun_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Config pública da assistente é exatamente uma por empresa. Em instalações que
-- já tenham duplicatas, preserva a mais recentemente alterada antes do índice.
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "companyId" ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" DESC
  ) AS rn
  FROM "AssistenteConfig"
)
DELETE FROM "AssistenteConfig" a
USING ranked r
WHERE a."id" = r."id" AND r.rn > 1;

DROP INDEX IF EXISTS "AssistenteConfig_companyId_updatedAt_idx";

CREATE UNIQUE INDEX "AssistenteConfig_companyId_key"
ON "AssistenteConfig"("companyId");
