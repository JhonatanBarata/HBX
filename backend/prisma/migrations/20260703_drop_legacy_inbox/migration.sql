-- Multi-tenancy Sprint 2 (03/07): aposenta o Inbox LEGADO.
--
-- O trio Customer (global, phone @unique, SEM companyId) / Conversation@InboxConversation /
-- Message@InboxMessage + SatisfactionSurvey NUNCA teve escrita viva no código — o
-- atendimento real roda em CompanyConversation / CompanyMessage (@@map "Message") /
-- AtendimentoCustomer / CustomerProfile, todos com companyId. Censo LOCAL: as 4
-- tabelas estavam VAZIAS (0 linhas). São passivo LGPD parado (PII global sem
-- finalidade, art. 15/16) e alongam a cascata de deleção sem motivo.
--
-- ⚠️ Censo de PRODUÇÃO NÃO foi feito (exige rodar dentro do container hbx-backend).
-- CONFERIR contagem/última data das 4 tabelas na VPS ANTES de aplicar em prod; se
-- houver dado, exportar antes. Migration DESTRUTIVA — só roda LOCAL/produção com
-- ordem explícita do dono.
-- Idempotente (IF EXISTS + CASCADE). O CASCADE aqui só derruba as FKs internas do
-- próprio trio legado (InboxConversation->Customer, InboxMessage/SatisfactionSurvey->
-- InboxConversation); NENHUMA tabela viva referencia essas 4 (verificado no schema).

DROP TABLE IF EXISTS "SatisfactionSurvey" CASCADE;
DROP TABLE IF EXISTS "InboxMessage" CASCADE;
DROP TABLE IF EXISTS "InboxConversation" CASCADE;
DROP TABLE IF EXISTS "Customer" CASCADE;
