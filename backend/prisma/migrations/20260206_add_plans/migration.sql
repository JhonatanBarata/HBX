-- PostgreSQL baseline generated from the current Prisma schema.

-- CreateTable
CREATE TABLE "Company" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT,
  "primaryContactName" TEXT,
  "contactEmail" TEXT,
  "contactPhone" TEXT,
  "taxDocument" TEXT,
  "whatsappNumber" TEXT,
  "whatsappPhoneNumberId" TEXT,
  "whatsappWabaId" TEXT,
  "whatsappAccessToken" TEXT,
  "whatsappDisplayNumber" TEXT,
  "whatsappStatus" TEXT,
  "whatsappStatusError" TEXT,
  "whatsappStatusUpdatedAt" TIMESTAMP(3),
  "mercadoPagoAccessToken" TEXT,
  "mercadoPagoStatus" TEXT,
  "mercadoPagoStatusError" TEXT,
  "mercadoPagoStatusUpdatedAt" TIMESTAMP(3),
  "mercadoPagoAccountEmail" TEXT,
  "mercadoPagoUserId" TEXT,
  "timezone" TEXT DEFAULT 'America/Sao_Paulo',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "paymentMethod" TEXT NOT NULL DEFAULT 'NONE',
  "subscriptionStatus" TEXT NOT NULL DEFAULT 'trialing',
  "billingProvider" TEXT NOT NULL DEFAULT 'manual',
  "premiumAccess" BOOLEAN NOT NULL DEFAULT false,
  "trialStartsAt" TIMESTAMP(3),
  "trialEndsAt" TIMESTAMP(3),
  "subscriptionCurrentPeriodStart" TIMESTAMP(3),
  "subscriptionCurrentPeriodEnd" TIMESTAMP(3),
  "deactivatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "planId" INTEGER,

  CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HbxRecoveryCustomer" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "clientName" TEXT,
  "whatsappNumber" TEXT NOT NULL,
  "openAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "workdaySaleDay" INTEGER NOT NULL,
  "recurringDelays" INTEGER NOT NULL DEFAULT 0,
  "paymentHistoryScore" INTEGER NOT NULL DEFAULT 5,
  "totalPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "averageDelay" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "automationEnabled" BOOLEAN NOT NULL DEFAULT true,
  "lastContact" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OVERDUE',
  "paymentHistory" TEXT,
  "delayHistory" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "HbxRecoveryCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HbxRecoveryPayment" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "customerId" TEXT NOT NULL,
  "conversationId" INTEGER,
  "amount" DOUBLE PRECISION NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "description" TEXT NOT NULL,
  "chargeType" TEXT NOT NULL DEFAULT 'avista',
  "installmentCount" INTEGER NOT NULL DEFAULT 1,
  "installmentValue" DOUBLE PRECISION,
  "serviceDate" TIMESTAMP(3),
  "serviceDescription" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "lifecycle" TEXT NOT NULL DEFAULT 'in_progress',
  "paymentUrl" TEXT,
  "linkExpiresAt" TIMESTAMP(3),
  "externalReference" TEXT,
  "mpPreferenceId" TEXT,
  "mpPaymentId" TEXT,
  "mpMerchantOrderId" TEXT,
  "notificationUrl" TEXT,
  "paidAt" TIMESTAMP(3),
  "refundedAt" TIMESTAMP(3),
  "refundAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "appliedToCustomerAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "reversedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "providerPayload" TEXT,
  "createdByUserId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "HbxRecoveryPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HbxRecoveryFlowStage" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'WhatsApp API',
  "template" TEXT NOT NULL,
  "daysAfter" INTEGER NOT NULL DEFAULT 0,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "HbxRecoveryFlowStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'whatsapp',
  "contact" TEXT NOT NULL,
  "currentFlow" TEXT NOT NULL DEFAULT 'cobranca_recovery',
  "currentStep" TEXT NOT NULL DEFAULT 'novo',
  "flowResult" TEXT,
  "botActive" BOOLEAN NOT NULL DEFAULT true,
  "humanAssigned" BOOLEAN NOT NULL DEFAULT false,
  "assignedUserId" INTEGER,
  "metadata" TEXT,
  "lastInteractionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "conversationId" INTEGER NOT NULL,
  "contactId" TEXT,
  "direction" TEXT NOT NULL,
  "messageType" TEXT NOT NULL DEFAULT 'text',
  "body" TEXT NOT NULL,
  "senderType" TEXT NOT NULL DEFAULT 'system',
  "isComplaint" BOOLEAN NOT NULL DEFAULT false,
  "variablesJson" TEXT,
  "status" TEXT NOT NULL DEFAULT 'RECEIVED',
  "error" TEXT,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sourceModule" TEXT,
  "provider" TEXT DEFAULT 'WHATSAPP_CLOUD',
  "providerMessageId" TEXT,
  "rawPayload" TEXT,
  "outboundMessageId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
  "id" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "name" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboxConversation" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER,
  "customerId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'new',
  "assignedTo" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "InboxConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboxMessage" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationSession" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'whatsapp',
  "from" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'NEW',
  "context" TEXT,
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ConversationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderDraft" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "sessionId" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "items" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OrderDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
  "id" SERIAL NOT NULL,
  "username" TEXT,
  "email" TEXT,
  "password" TEXT NOT NULL,
  "name" TEXT,
  "companyId" INTEGER,
  "role" TEXT NOT NULL DEFAULT 'USER',
  "isSystemMaster" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "deactivatedAt" TIMESTAMP(3),
  "retentionUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemModule" (
  "id" SERIAL NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "serviceUrl" TEXT,
  "defaultEnabled" BOOLEAN NOT NULL DEFAULT false,
  "companyAssignable" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SystemModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyModule" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "moduleId" INTEGER NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CompanyModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserModuleAccess" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "moduleId" INTEGER NOT NULL,
  "allowed" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserModuleAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeletionRecord" (
  "id" SERIAL NOT NULL,
  "moduleKey" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "companyId" INTEGER,
  "motivo" TEXT,
  "snapshot" TEXT,
  "deletedByUserId" INTEGER,
  "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "permanentlyDeletedById" INTEGER,
  "permanentlyDeletedAt" TIMESTAMP(3),

  CONSTRAINT "DeletionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordReset" (
  "id" SERIAL NOT NULL,
  "token" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "used" BOOLEAN NOT NULL DEFAULT false,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "price" DOUBLE PRECISION NOT NULL,
  "stock" INTEGER NOT NULL DEFAULT 0,
  "companyId" INTEGER,
  "categoryId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoReplyRule" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "matchType" TEXT NOT NULL DEFAULT 'EXACT',
  "pattern" TEXT NOT NULL,
  "caseInsensitive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AutoReplyRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoReplyResponse" (
  "id" SERIAL NOT NULL,
  "ruleId" INTEGER NOT NULL,
  "order" INTEGER NOT NULL,
  "delaySeconds" INTEGER NOT NULL DEFAULT 0,
  "template" TEXT NOT NULL,

  CONSTRAINT "AutoReplyResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboundMessage" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "from" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundMessage" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "contactId" TEXT,
  "to" TEXT NOT NULL,
  "messageType" TEXT NOT NULL DEFAULT 'text',
  "templateName" TEXT,
  "templateLanguage" TEXT,
  "templateComponents" TEXT,
  "sourceModule" TEXT,
  "body" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "provider" TEXT DEFAULT 'WHATSAPP_CLOUD',
  "providerMessageId" TEXT,
  "deliveryStatus" TEXT,
  "deliveredAt" TIMESTAMP(3),
  "readAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "lastWebhookAt" TIMESTAMP(3),
  "lastWebhookPayload" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastError" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OutboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundAttempt" (
  "id" SERIAL NOT NULL,
  "messageId" INTEGER NOT NULL,
  "attemptNo" INTEGER NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "success" BOOLEAN NOT NULL DEFAULT false,
  "httpStatus" INTEGER,
  "requestBody" TEXT,
  "responseBody" TEXT,
  "error" TEXT,

  CONSTRAINT "OutboundAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppWebhookEvent" (
  "id" SERIAL NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "kind" TEXT NOT NULL,
  "companyId" INTEGER,
  "providerMessageId" TEXT,
  "payload" TEXT NOT NULL,

  CONSTRAINT "WhatsAppWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppAuditLog" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "scope" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "level" TEXT NOT NULL DEFAULT 'INFO',
  "message" TEXT NOT NULL,
  "metadata" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WhatsAppAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feature" (
  "id" SERIAL NOT NULL,
  "key" TEXT NOT NULL,
  "description" TEXT,

  CONSTRAINT "Feature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVersion" (
  "id" SERIAL NOT NULL,
  "productId" INTEGER NOT NULL,
  "data" TEXT NOT NULL,
  "authorId" INTEGER,
  "version" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProductVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SatisfactionSurvey" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "rating" INTEGER,
  "feedback" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SatisfactionSurvey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Importacao" (
  "id" SERIAL NOT NULL,
  "empresaId" INTEGER NOT NULL,
  "numeroPedido" TEXT NOT NULL,
  "fornecedorId" TEXT,
  "pais" TEXT,
  "portoOrigem" TEXT,
  "portoDestino" TEXT,
  "dataEmbarque" TIMESTAMP(3),
  "dataAtracacao" TIMESTAMP(3),
  "valorUsd" DOUBLE PRECISION,
  "valorDolar" DOUBLE PRECISION,
  "pesoKg" DOUBLE PRECISION,
  "valorTotalReal" DOUBLE PRECISION,
  "status" TEXT NOT NULL DEFAULT 'EM_CADASTRO',
  "pdfPath" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" INTEGER,
  "finalizedAt" TIMESTAMP(3),
  "finalizedBy" INTEGER,
  "reabertoPor" INTEGER,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "versao" INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT "Importacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportacaoLog" (
  "id" SERIAL NOT NULL,
  "importacaoId" INTEGER NOT NULL,
  "alteracao" TEXT NOT NULL,
  "usuario" TEXT NOT NULL,
  "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "versao" INTEGER,
  "dadosAntes" TEXT,
  "dadosDepois" TEXT,

  CONSTRAINT "ImportacaoLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertaImportacao" (
  "id" SERIAL NOT NULL,
  "importacaoId" INTEGER NOT NULL,
  "empresaId" INTEGER NOT NULL,
  "diasAntes" INTEGER NOT NULL,
  "enviarEmail" BOOLEAN NOT NULL DEFAULT false,
  "enviarWhatsapp" BOOLEAN NOT NULL DEFAULT false,
  "listaEmails" TEXT,
  "listaWhatsapp" TEXT,
  "disparado" BOOLEAN NOT NULL DEFAULT false,
  "disparadoEm" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AlertaImportacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportacaoPermissao" (
  "id" SERIAL NOT NULL,
  "empresaId" INTEGER NOT NULL,
  "role" TEXT NOT NULL,
  "acao" TEXT NOT NULL,
  "allowed" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ImportacaoPermissao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CadastroFornecedor" (
  "id" SERIAL NOT NULL,
  "empresaId" INTEGER NOT NULL,
  "nome" TEXT NOT NULL,
  "paisId" INTEGER,
  "portoOrigemId" INTEGER,
  "portoDestinoId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CadastroFornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CadastroPais" (
  "id" SERIAL NOT NULL,
  "empresaId" INTEGER NOT NULL,
  "nome" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CadastroPais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CadastroPorto" (
  "id" SERIAL NOT NULL,
  "empresaId" INTEGER NOT NULL,
  "nome" TEXT NOT NULL,
  "paisId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CadastroPorto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CadastroTransitTime" (
  "id" SERIAL NOT NULL,
  "empresaId" INTEGER NOT NULL,
  "portoOrigemId" INTEGER NOT NULL,
  "portoDestinoId" INTEGER NOT NULL,
  "dias" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CadastroTransitTime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_PlanFeatures" (
  "A" INTEGER NOT NULL,
  "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Company_whatsappPhoneNumberId_key" ON "Company"("whatsappPhoneNumberId");

-- CreateIndex
CREATE INDEX "HbxRecoveryCustomer_companyId_status_idx" ON "HbxRecoveryCustomer"("companyId", "status");

-- CreateIndex
CREATE INDEX "HbxRecoveryCustomer_companyId_openAmount_idx" ON "HbxRecoveryCustomer"("companyId", "openAmount");

-- CreateIndex
CREATE UNIQUE INDEX "HbxRecoveryPayment_mpPaymentId_key" ON "HbxRecoveryPayment"("mpPaymentId");

-- CreateIndex
CREATE INDEX "HbxRecoveryPayment_companyId_createdAt_idx" ON "HbxRecoveryPayment"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "HbxRecoveryPayment_companyId_lifecycle_createdAt_idx" ON "HbxRecoveryPayment"("companyId", "lifecycle", "createdAt");

-- CreateIndex
CREATE INDEX "HbxRecoveryPayment_companyId_customerId_createdAt_idx" ON "HbxRecoveryPayment"("companyId", "customerId", "createdAt");

-- CreateIndex
CREATE INDEX "HbxRecoveryPayment_companyId_conversationId_createdAt_idx" ON "HbxRecoveryPayment"("companyId", "conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "HbxRecoveryPayment_externalReference_idx" ON "HbxRecoveryPayment"("externalReference");

-- CreateIndex
CREATE INDEX "HbxRecoveryFlowStage_companyId_sortOrder_idx" ON "HbxRecoveryFlowStage"("companyId", "sortOrder");

-- CreateIndex
CREATE INDEX "HbxRecoveryFlowStage_companyId_enabled_idx" ON "HbxRecoveryFlowStage"("companyId", "enabled");

-- CreateIndex
CREATE INDEX "Conversation_companyId_lastMessageAt_idx" ON "Conversation"("companyId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "Conversation_companyId_botActive_humanAssigned_lastInteract_idx" ON "Conversation"("companyId", "botActive", "humanAssigned", "lastInteractionAt");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_companyId_channel_contact_key" ON "Conversation"("companyId", "channel", "contact");

-- CreateIndex
CREATE UNIQUE INDEX "Message_providerMessageId_key" ON "Message"("providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_outboundMessageId_key" ON "Message"("outboundMessageId");

-- CreateIndex
CREATE INDEX "Message_companyId_conversationId_timestamp_idx" ON "Message"("companyId", "conversationId", "timestamp");

-- CreateIndex
CREATE INDEX "Message_conversationId_senderType_timestamp_idx" ON "Message"("conversationId", "senderType", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_phone_key" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "InboxConversation_companyId_status_updatedAt_idx" ON "InboxConversation"("companyId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "InboxConversation_customerId_status_updatedAt_idx" ON "InboxConversation"("customerId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "InboxMessage_conversationId_createdAt_idx" ON "InboxMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "ConversationSession_companyId_from_channel_idx" ON "ConversationSession"("companyId", "from", "channel");

-- CreateIndex
CREATE INDEX "ConversationSession_expiresAt_idx" ON "ConversationSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrderDraft_sessionId_key" ON "OrderDraft"("sessionId");

-- CreateIndex
CREATE INDEX "OrderDraft_companyId_idx" ON "OrderDraft"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "SystemModule_key_key" ON "SystemModule"("key");

-- CreateIndex
CREATE INDEX "CompanyModule_companyId_enabled_idx" ON "CompanyModule"("companyId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyModule_companyId_moduleId_key" ON "CompanyModule"("companyId", "moduleId");

-- CreateIndex
CREATE INDEX "UserModuleAccess_userId_allowed_idx" ON "UserModuleAccess"("userId", "allowed");

-- CreateIndex
CREATE UNIQUE INDEX "UserModuleAccess_userId_moduleId_key" ON "UserModuleAccess"("userId", "moduleId");

-- CreateIndex
CREATE INDEX "DeletionRecord_moduleKey_deletedAt_idx" ON "DeletionRecord"("moduleKey", "deletedAt");

-- CreateIndex
CREATE INDEX "DeletionRecord_companyId_deletedAt_idx" ON "DeletionRecord"("companyId", "deletedAt");

-- CreateIndex
CREATE INDEX "DeletionRecord_entityType_entityId_idx" ON "DeletionRecord"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordReset_token_key" ON "PasswordReset"("token");

-- CreateIndex
CREATE INDEX "PasswordReset_userId_idx" ON "PasswordReset"("userId");

-- CreateIndex
CREATE INDEX "PasswordReset_expiresAt_idx" ON "PasswordReset"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundMessage_providerMessageId_key" ON "OutboundMessage"("providerMessageId");

-- CreateIndex
CREATE INDEX "WhatsAppAuditLog_companyId_createdAt_idx" ON "WhatsAppAuditLog"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "WhatsAppAuditLog_companyId_scope_event_idx" ON "WhatsAppAuditLog"("companyId", "scope", "event");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Feature_key_key" ON "Feature"("key");

-- CreateIndex
CREATE INDEX "Importacao_empresaId_status_idx" ON "Importacao"("empresaId", "status");

-- CreateIndex
CREATE INDEX "Importacao_empresaId_numeroPedido_idx" ON "Importacao"("empresaId", "numeroPedido");

-- CreateIndex
CREATE INDEX "ImportacaoLog_importacaoId_data_idx" ON "ImportacaoLog"("importacaoId", "data");

-- CreateIndex
CREATE INDEX "AlertaImportacao_empresaId_disparado_idx" ON "AlertaImportacao"("empresaId", "disparado");

-- CreateIndex
CREATE INDEX "AlertaImportacao_importacaoId_diasAntes_idx" ON "AlertaImportacao"("importacaoId", "diasAntes");

-- CreateIndex
CREATE INDEX "ImportacaoPermissao_empresaId_role_idx" ON "ImportacaoPermissao"("empresaId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "ImportacaoPermissao_empresaId_role_acao_key" ON "ImportacaoPermissao"("empresaId", "role", "acao");

-- CreateIndex
CREATE INDEX "CadastroFornecedor_empresaId_paisId_idx" ON "CadastroFornecedor"("empresaId", "paisId");

-- CreateIndex
CREATE UNIQUE INDEX "CadastroFornecedor_empresaId_nome_key" ON "CadastroFornecedor"("empresaId", "nome");

-- CreateIndex
CREATE INDEX "CadastroPais_empresaId_idx" ON "CadastroPais"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "CadastroPais_empresaId_nome_key" ON "CadastroPais"("empresaId", "nome");

-- CreateIndex
CREATE INDEX "CadastroPorto_empresaId_paisId_idx" ON "CadastroPorto"("empresaId", "paisId");

-- CreateIndex
CREATE UNIQUE INDEX "CadastroPorto_empresaId_nome_key" ON "CadastroPorto"("empresaId", "nome");

-- CreateIndex
CREATE INDEX "CadastroTransitTime_empresaId_idx" ON "CadastroTransitTime"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "CadastroTransitTime_empresaId_portoOrigemId_portoDestinoId_key" ON "CadastroTransitTime"("empresaId", "portoOrigemId", "portoDestinoId");

-- CreateIndex
CREATE UNIQUE INDEX "_PlanFeatures_AB_unique" ON "_PlanFeatures"("A", "B");

-- CreateIndex
CREATE INDEX "_PlanFeatures_B_index" ON "_PlanFeatures"("B");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HbxRecoveryCustomer" ADD CONSTRAINT "HbxRecoveryCustomer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HbxRecoveryPayment" ADD CONSTRAINT "HbxRecoveryPayment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HbxRecoveryPayment" ADD CONSTRAINT "HbxRecoveryPayment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "HbxRecoveryCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HbxRecoveryFlowStage" ADD CONSTRAINT "HbxRecoveryFlowStage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_outboundMessageId_fkey" FOREIGN KEY ("outboundMessageId") REFERENCES "OutboundMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxConversation" ADD CONSTRAINT "InboxConversation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxConversation" ADD CONSTRAINT "InboxConversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxMessage" ADD CONSTRAINT "InboxMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "InboxConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationSession" ADD CONSTRAINT "ConversationSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderDraft" ADD CONSTRAINT "OrderDraft_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderDraft" ADD CONSTRAINT "OrderDraft_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ConversationSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyModule" ADD CONSTRAINT "CompanyModule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyModule" ADD CONSTRAINT "CompanyModule_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "SystemModule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserModuleAccess" ADD CONSTRAINT "UserModuleAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserModuleAccess" ADD CONSTRAINT "UserModuleAccess_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "SystemModule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeletionRecord" ADD CONSTRAINT "DeletionRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeletionRecord" ADD CONSTRAINT "DeletionRecord_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoReplyRule" ADD CONSTRAINT "AutoReplyRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoReplyResponse" ADD CONSTRAINT "AutoReplyResponse_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutoReplyRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundMessage" ADD CONSTRAINT "InboundMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundAttempt" ADD CONSTRAINT "OutboundAttempt_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "OutboundMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppAuditLog" ADD CONSTRAINT "WhatsAppAuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVersion" ADD CONSTRAINT "ProductVersion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVersion" ADD CONSTRAINT "ProductVersion_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SatisfactionSurvey" ADD CONSTRAINT "SatisfactionSurvey_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "InboxConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Importacao" ADD CONSTRAINT "Importacao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Importacao" ADD CONSTRAINT "Importacao_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Importacao" ADD CONSTRAINT "Importacao_finalizedBy_fkey" FOREIGN KEY ("finalizedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Importacao" ADD CONSTRAINT "Importacao_reabertoPor_fkey" FOREIGN KEY ("reabertoPor") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportacaoLog" ADD CONSTRAINT "ImportacaoLog_importacaoId_fkey" FOREIGN KEY ("importacaoId") REFERENCES "Importacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertaImportacao" ADD CONSTRAINT "AlertaImportacao_importacaoId_fkey" FOREIGN KEY ("importacaoId") REFERENCES "Importacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertaImportacao" ADD CONSTRAINT "AlertaImportacao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportacaoPermissao" ADD CONSTRAINT "ImportacaoPermissao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CadastroFornecedor" ADD CONSTRAINT "CadastroFornecedor_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CadastroFornecedor" ADD CONSTRAINT "CadastroFornecedor_paisId_fkey" FOREIGN KEY ("paisId") REFERENCES "CadastroPais"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CadastroFornecedor" ADD CONSTRAINT "CadastroFornecedor_portoOrigemId_fkey" FOREIGN KEY ("portoOrigemId") REFERENCES "CadastroPorto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CadastroFornecedor" ADD CONSTRAINT "CadastroFornecedor_portoDestinoId_fkey" FOREIGN KEY ("portoDestinoId") REFERENCES "CadastroPorto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CadastroPais" ADD CONSTRAINT "CadastroPais_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CadastroPorto" ADD CONSTRAINT "CadastroPorto_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CadastroPorto" ADD CONSTRAINT "CadastroPorto_paisId_fkey" FOREIGN KEY ("paisId") REFERENCES "CadastroPais"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CadastroTransitTime" ADD CONSTRAINT "CadastroTransitTime_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CadastroTransitTime" ADD CONSTRAINT "CadastroTransitTime_portoOrigemId_fkey" FOREIGN KEY ("portoOrigemId") REFERENCES "CadastroPorto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CadastroTransitTime" ADD CONSTRAINT "CadastroTransitTime_portoDestinoId_fkey" FOREIGN KEY ("portoDestinoId") REFERENCES "CadastroPorto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PlanFeatures" ADD CONSTRAINT "_PlanFeatures_A_fkey" FOREIGN KEY ("A") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PlanFeatures" ADD CONSTRAINT "_PlanFeatures_B_fkey" FOREIGN KEY ("B") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
