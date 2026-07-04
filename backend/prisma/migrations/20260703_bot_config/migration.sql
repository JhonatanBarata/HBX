-- INTENTENGINE S3 (docs/PLANEJAMENTOS/INTENTENGINE/INTENTENGINE-sprint3.md):
-- BotConfig versionada e auditada — tira a config do bot da tabela emprestada
-- (HbxRecoveryFlowStage reaproveitada como chave-valor, sem histórico/autor/rollback).
-- Domains: atendimento_bot | atendimento_agenda | bot_master_switch | recovery_bot.
-- Leitura = MAIOR version por (companyId, domain); escrita = SEMPRE INSERT de nova
-- version (nunca update) → histórico de graça + rollback = regravar versão anterior
-- como nova versão. updatedByUserId nullable (o master-switch pode ser gravado sem
-- usuário identificado em algum fluxo legado). ADITIVA: cria só tabela+índices; nada
-- existente é alterado, canais mágicos legados continuam intactos como fallback
-- (dual-read no BotConfigStoreService). migrate dev quebrado (banco dev desligado) ->
-- migration à mão, padrão da casa (aplicar com migrate deploy).

-- CreateTable
CREATE TABLE IF NOT EXISTS "BotConfig" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "domain" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "payload" TEXT NOT NULL,
    "updatedByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (leitura = maior version por empresa+domínio)
CREATE UNIQUE INDEX IF NOT EXISTS "BotConfig_companyId_domain_version_key" ON "BotConfig"("companyId", "domain", "version");

-- CreateIndex (listar histórico/rollback ordenado sem scan)
CREATE INDEX IF NOT EXISTS "BotConfig_companyId_domain_createdAt_idx" ON "BotConfig"("companyId", "domain", "createdAt");
