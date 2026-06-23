-- Flags de ativação por tipo de bot (22/06):
-- Atendimento NÃO ganha coluna — usa routingRules.globalBotEnabled (já existe no config JSON).
-- Recovery e Prospecção ganham colunas de timestamp (null = desligado) + auditoria de quem ligou.
-- Aditivo e nullable: não quebra dados existentes.
ALTER TABLE "Company" ADD COLUMN "recoveryBotLiveAt" TIMESTAMP(3);
ALTER TABLE "Company" ADD COLUMN "recoveryBotLiveByUserId" INTEGER;
ALTER TABLE "Company" ADD COLUMN "prospectingBotLiveAt" TIMESTAMP(3);
ALTER TABLE "Company" ADD COLUMN "prospectingBotLiveByUserId" INTEGER;
