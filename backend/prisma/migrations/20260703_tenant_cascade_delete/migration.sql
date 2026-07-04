-- Multi-tenancy Sprint 3 (03/07): cascata de delecao DECLARATIVA.
--
-- Converte para ON DELETE CASCADE toda FK de dado de TENANT que hoje e RESTRICT
-- (29 companyId/empresaId + 6 userId de scraping + 11 avo: filhos que travavam a
-- cascata) e muda User.companyId + Product.companyId de SET NULL para CASCADE, para
-- que company.delete() apague a empresa inteira num unico comando (o banco cascateia).
-- Elimina a lista de ~40 deleteMany manuais que ja quebrou 2x em producao (LGPD art.18).
--
-- NAO DESTROI DADO: so troca a REGRA de FK (DROP + ADD CONSTRAINT). Idempotente por
-- constraint (DROP IF EXISTS + ADD). Ordem irrelevante (so metadados de FK).
--
-- Fora de proposito: CompanyModule->SystemModule / OpenaiSetting->OpenaiCreds (RESTRICT
-- protege catalogo GLOBAL, nunca disparado por company.delete); FKs de AUTORIA que
-- sobrevive (DeletionRecord.deletedByUserId, ProductVersion.authorId, etc: ja SET NULL);
-- 21 tabelas com companyId ESCALAR sem FK no banco (apagadas por deleteMany tenant-scoped
-- explicito no permanentlyDeleteCompanyInternal); tabelas runtime-ensure (ja nascem CASCADE).

ALTER TABLE "AutoReplyResponse" DROP CONSTRAINT IF EXISTS "AutoReplyResponse_ruleId_fkey";
ALTER TABLE "AutoReplyResponse" ADD CONSTRAINT "AutoReplyResponse_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutoReplyRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CadastroTransitTime" DROP CONSTRAINT IF EXISTS "CadastroTransitTime_portoDestinoId_fkey";
ALTER TABLE "CadastroTransitTime" ADD CONSTRAINT "CadastroTransitTime_portoDestinoId_fkey" FOREIGN KEY ("portoDestinoId") REFERENCES "CadastroPorto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CadastroTransitTime" DROP CONSTRAINT IF EXISTS "CadastroTransitTime_portoOrigemId_fkey";
ALTER TABLE "CadastroTransitTime" ADD CONSTRAINT "CadastroTransitTime_portoOrigemId_fkey" FOREIGN KEY ("portoOrigemId") REFERENCES "CadastroPorto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AtendimentoAppointment" DROP CONSTRAINT IF EXISTS "AtendimentoAppointment_companyId_fkey";
ALTER TABLE "AtendimentoAppointment" ADD CONSTRAINT "AtendimentoAppointment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AutoReplyRule" DROP CONSTRAINT IF EXISTS "AutoReplyRule_companyId_fkey";
ALTER TABLE "AutoReplyRule" ADD CONSTRAINT "AutoReplyRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuvoExternalRecord" DROP CONSTRAINT IF EXISTS "AuvoExternalRecord_companyId_fkey";
ALTER TABLE "AuvoExternalRecord" ADD CONSTRAINT "AuvoExternalRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CadastroFornecedor" DROP CONSTRAINT IF EXISTS "CadastroFornecedor_empresaId_fkey";
ALTER TABLE "CadastroFornecedor" ADD CONSTRAINT "CadastroFornecedor_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CadastroPais" DROP CONSTRAINT IF EXISTS "CadastroPais_empresaId_fkey";
ALTER TABLE "CadastroPais" ADD CONSTRAINT "CadastroPais_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CadastroPorto" DROP CONSTRAINT IF EXISTS "CadastroPorto_empresaId_fkey";
ALTER TABLE "CadastroPorto" ADD CONSTRAINT "CadastroPorto_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CadastroTransitTime" DROP CONSTRAINT IF EXISTS "CadastroTransitTime_empresaId_fkey";
ALTER TABLE "CadastroTransitTime" ADD CONSTRAINT "CadastroTransitTime_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompanyEmailAsset" DROP CONSTRAINT IF EXISTS "CompanyEmailAsset_companyId_fkey";
ALTER TABLE "CompanyEmailAsset" ADD CONSTRAINT "CompanyEmailAsset_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompanyEmailSettings" DROP CONSTRAINT IF EXISTS "CompanyEmailSettings_companyId_fkey";
ALTER TABLE "CompanyEmailSettings" ADD CONSTRAINT "CompanyEmailSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompanyEmailTemplate" DROP CONSTRAINT IF EXISTS "CompanyEmailTemplate_companyId_fkey";
ALTER TABLE "CompanyEmailTemplate" ADD CONSTRAINT "CompanyEmailTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompanyModule" DROP CONSTRAINT IF EXISTS "CompanyModule_companyId_fkey";
ALTER TABLE "CompanyModule" ADD CONSTRAINT "CompanyModule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompanyWhatsAppEndpoint" DROP CONSTRAINT IF EXISTS "CompanyWhatsAppEndpoint_companyId_fkey";
ALTER TABLE "CompanyWhatsAppEndpoint" ADD CONSTRAINT "CompanyWhatsAppEndpoint_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Conversation" DROP CONSTRAINT IF EXISTS "Conversation_companyId_fkey";
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConversationSession" DROP CONSTRAINT IF EXISTS "ConversationSession_companyId_fkey";
ALTER TABLE "ConversationSession" ADD CONSTRAINT "ConversationSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerProfile" DROP CONSTRAINT IF EXISTS "CustomerProfile_companyId_fkey";
ALTER TABLE "CustomerProfile" ADD CONSTRAINT "CustomerProfile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DebtCase" DROP CONSTRAINT IF EXISTS "DebtCase_companyId_fkey";
ALTER TABLE "DebtCase" ADD CONSTRAINT "DebtCase_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HbxRecoveryCustomer" DROP CONSTRAINT IF EXISTS "HbxRecoveryCustomer_companyId_fkey";
ALTER TABLE "HbxRecoveryCustomer" ADD CONSTRAINT "HbxRecoveryCustomer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HbxRecoveryFlowStage" DROP CONSTRAINT IF EXISTS "HbxRecoveryFlowStage_companyId_fkey";
ALTER TABLE "HbxRecoveryFlowStage" ADD CONSTRAINT "HbxRecoveryFlowStage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HbxRecoveryPayment" DROP CONSTRAINT IF EXISTS "HbxRecoveryPayment_companyId_fkey";
ALTER TABLE "HbxRecoveryPayment" ADD CONSTRAINT "HbxRecoveryPayment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InboundMessage" DROP CONSTRAINT IF EXISTS "InboundMessage_companyId_fkey";
ALTER TABLE "InboundMessage" ADD CONSTRAINT "InboundMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IntegrationConnection" DROP CONSTRAINT IF EXISTS "IntegrationConnection_companyId_fkey";
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IntegrationSyncRun" DROP CONSTRAINT IF EXISTS "IntegrationSyncRun_companyId_fkey";
ALTER TABLE "IntegrationSyncRun" ADD CONSTRAINT "IntegrationSyncRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Message" DROP CONSTRAINT IF EXISTS "Message_companyId_fkey";
ALTER TABLE "Message" ADD CONSTRAINT "Message_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderDraft" DROP CONSTRAINT IF EXISTS "OrderDraft_companyId_fkey";
ALTER TABLE "OrderDraft" ADD CONSTRAINT "OrderDraft_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OutboundMessage" DROP CONSTRAINT IF EXISTS "OutboundMessage_companyId_fkey";
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_companyId_fkey";
ALTER TABLE "Product" ADD CONSTRAINT "Product_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_companyId_fkey";
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VendasLead" DROP CONSTRAINT IF EXISTS "VendasLead_companyId_fkey";
ALTER TABLE "VendasLead" ADD CONSTRAINT "VendasLead_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WebscrapingSearchHistory" DROP CONSTRAINT IF EXISTS "WebscrapingSearchHistory_companyId_fkey";
ALTER TABLE "WebscrapingSearchHistory" ADD CONSTRAINT "WebscrapingSearchHistory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WebscrapingUsageLog" DROP CONSTRAINT IF EXISTS "WebscrapingUsageLog_companyId_fkey";
ALTER TABLE "WebscrapingUsageLog" ADD CONSTRAINT "WebscrapingUsageLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WhatsAppAuditLog" DROP CONSTRAINT IF EXISTS "WhatsAppAuditLog_companyId_fkey";
ALTER TABLE "WhatsAppAuditLog" ADD CONSTRAINT "WhatsAppAuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Message" DROP CONSTRAINT IF EXISTS "Message_conversationId_fkey";
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderDraft" DROP CONSTRAINT IF EXISTS "OrderDraft_sessionId_fkey";
ALTER TABLE "OrderDraft" ADD CONSTRAINT "OrderDraft_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ConversationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DebtCase" DROP CONSTRAINT IF EXISTS "DebtCase_customerProfileId_fkey";
ALTER TABLE "DebtCase" ADD CONSTRAINT "DebtCase_customerProfileId_fkey" FOREIGN KEY ("customerProfileId") REFERENCES "CustomerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HbxRecoveryPayment" DROP CONSTRAINT IF EXISTS "HbxRecoveryPayment_customerId_fkey";
ALTER TABLE "HbxRecoveryPayment" ADD CONSTRAINT "HbxRecoveryPayment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "HbxRecoveryCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuvoExternalRecord" DROP CONSTRAINT IF EXISTS "AuvoExternalRecord_connectionId_fkey";
ALTER TABLE "AuvoExternalRecord" ADD CONSTRAINT "AuvoExternalRecord_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IntegrationSyncRun" DROP CONSTRAINT IF EXISTS "IntegrationSyncRun_connectionId_fkey";
ALTER TABLE "IntegrationSyncRun" ADD CONSTRAINT "IntegrationSyncRun_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OutboundAttempt" DROP CONSTRAINT IF EXISTS "OutboundAttempt_messageId_fkey";
ALTER TABLE "OutboundAttempt" ADD CONSTRAINT "OutboundAttempt_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "OutboundMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductVersion" DROP CONSTRAINT IF EXISTS "ProductVersion_productId_fkey";
ALTER TABLE "ProductVersion" ADD CONSTRAINT "ProductVersion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PasswordReset" DROP CONSTRAINT IF EXISTS "PasswordReset_userId_fkey";
ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TechAssistantInteraction" DROP CONSTRAINT IF EXISTS "TechAssistantInteraction_userId_fkey";
ALTER TABLE "TechAssistantInteraction" ADD CONSTRAINT "TechAssistantInteraction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WebscrapingCampaign" DROP CONSTRAINT IF EXISTS "WebscrapingCampaign_userId_fkey";
ALTER TABLE "WebscrapingCampaign" ADD CONSTRAINT "WebscrapingCampaign_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WebscrapingSearchHistory" DROP CONSTRAINT IF EXISTS "WebscrapingSearchHistory_userId_fkey";
ALTER TABLE "WebscrapingSearchHistory" ADD CONSTRAINT "WebscrapingSearchHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WebscrapingSearchRun" DROP CONSTRAINT IF EXISTS "WebscrapingSearchRun_userId_fkey";
ALTER TABLE "WebscrapingSearchRun" ADD CONSTRAINT "WebscrapingSearchRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WebscrapingUsageLog" DROP CONSTRAINT IF EXISTS "WebscrapingUsageLog_userId_fkey";
ALTER TABLE "WebscrapingUsageLog" ADD CONSTRAINT "WebscrapingUsageLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

