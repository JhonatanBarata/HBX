-- Vendas cockpit: vínculo canônico conversa↔lead e projeção reconstruível do engajamento.
-- A migração é aditiva. Leads existentes permanecem com pipelineStage/outcome nulos;
-- os defaults passam a valer somente para novos registros.

ALTER TABLE "Conversation"
  ADD COLUMN "vendasLeadId" TEXT,
  ADD COLUMN "vendasLeadLinkedAt" TIMESTAMP(3),
  ADD COLUMN "vendasLeadLinkSource" TEXT;

ALTER TABLE "VendasLead"
  ADD COLUMN "pipelineStage" TEXT,
  ADD COLUMN "outcome" TEXT;

ALTER TABLE "VendasLead"
  ALTER COLUMN "pipelineStage" SET DEFAULT 'prospeccao',
  ALTER COLUMN "outcome" SET DEFAULT 'open';

ALTER TABLE "VendasLeadTimelineEvent"
  ADD COLUMN "idempotencyKey" TEXT;

CREATE TABLE "VendasLeadCockpitState" (
  "leadId" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "conversationId" INTEGER,
  "engagementState" TEXT NOT NULL DEFAULT 'no_conversation',
  "hasInboundMessage" BOOLEAN NOT NULL DEFAULT false,
  "hasInboundReply" BOOLEAN NOT NULL DEFAULT false,
  "firstSuccessfulOutboundAt" TIMESTAMP(3),
  "lastSuccessfulOutboundAt" TIMESTAMP(3),
  "lastOutboundAt" TIMESTAMP(3),
  "lastOutboundStatus" TEXT,
  "lastInboundAt" TIMESTAMP(3),
  "lastMessageId" INTEGER,
  "lastMessageAt" TIMESTAMP(3),
  "lastMessageDirection" TEXT,
  "lastMessageStatus" TEXT,
  "lastMessagePreview" TEXT,
  "lastFailureAt" TIMESTAMP(3),
  "lastFailureReason" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VendasLeadCockpitState_pkey" PRIMARY KEY ("leadId")
);

CREATE INDEX "Conversation_companyId_vendasLeadId_idx"
ON "Conversation"("companyId", "vendasLeadId");

CREATE INDEX "VendasLeadCockpitState_companyId_engagementState_idx"
ON "VendasLeadCockpitState"("companyId", "engagementState");

CREATE INDEX "VendasLeadCockpitState_companyId_conversationId_idx"
ON "VendasLeadCockpitState"("companyId", "conversationId");

CREATE UNIQUE INDEX "VendasLeadTimelineEvent_leadId_idempotencyKey_key"
ON "VendasLeadTimelineEvent"("leadId", "idempotencyKey");

ALTER TABLE "Conversation"
ADD CONSTRAINT "Conversation_vendasLeadId_fkey"
FOREIGN KEY ("vendasLeadId") REFERENCES "VendasLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "VendasLeadCockpitState"
ADD CONSTRAINT "VendasLeadCockpitState_leadId_fkey"
FOREIGN KEY ("leadId") REFERENCES "VendasLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
