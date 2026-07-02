-- WORM-13 (02/07, docs/PLANEJAMENTOS/worm/13-automacoes-modelos-nomeados.md):
-- Automacoes: cadencia com PERSONA (Conservador/Moderado/Agressivo) + gatilhos
-- reativos + rotinas recorrentes. TUDO que auto-dispara fica atras da flag
-- HBX_CADENCIA_RUNNER_ENABLED (default OFF). O canal WhatsApp reusa o caminho
-- ja provado do bot de prospeccao (queueOutboundForCompany), com disjuntor/teto;
-- nunca API crua. ADITIVA: so cria tabelas/indices — nada existente e alterado.
-- migrate dev quebrado (banco dev desligado) -> migration a mao, padrao da casa
-- (aplicar com migrate deploy).

-- CreateTable
CREATE TABLE IF NOT EXISTS "Cadencia" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "ownerId" INTEGER,
    "nome" TEXT NOT NULL,
    "persona" TEXT NOT NULL DEFAULT 'conservador',
    "descricao" TEXT,
    "passosJson" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "isSeed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cadencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CadenciaInscricao" (
    "id" TEXT NOT NULL,
    "cadenciaId" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "leadId" TEXT NOT NULL,
    "responsavelId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ativa',
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextStepAt" TIMESTAMP(3) NOT NULL,
    "lastStepAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CadenciaInscricao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CadenciaGatilho" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "ownerId" INTEGER,
    "nome" TEXT NOT NULL,
    "evento" TEXT NOT NULL DEFAULT 'lead_respondeu_whatsapp',
    "acoesJson" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "lastFiredAt" TIMESTAMP(3),
    "fireCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CadenciaGatilho_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CadenciaRotina" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "ownerId" INTEGER,
    "nome" TEXT NOT NULL,
    "savedSearchId" TEXT NOT NULL,
    "assignedSellerId" INTEGER,
    "everyWeeks" INTEGER NOT NULL DEFAULT 1,
    "weekdaysJson" TEXT NOT NULL DEFAULT '[1]',
    "maxLeads" INTEGER NOT NULL DEFAULT 50,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "visibleOnlyToOwner" BOOLEAN NOT NULL DEFAULT false,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "lastRunCount" INTEGER,
    "lastRunStatus" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CadenciaRotina_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Cadencia_companyId_ativa_createdAt_idx" ON "Cadencia"("companyId", "ativa", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CadenciaInscricao_cadenciaId_leadId_key" ON "CadenciaInscricao"("cadenciaId", "leadId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CadenciaInscricao_companyId_status_nextStepAt_idx" ON "CadenciaInscricao"("companyId", "status", "nextStepAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CadenciaInscricao_leadId_status_idx" ON "CadenciaInscricao"("leadId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CadenciaGatilho_companyId_evento_ativo_idx" ON "CadenciaGatilho"("companyId", "evento", "ativo");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CadenciaRotina_companyId_ativa_lastRunAt_idx" ON "CadenciaRotina"("companyId", "ativa", "lastRunAt");

-- AddForeignKey
ALTER TABLE "CadenciaInscricao" ADD CONSTRAINT "CadenciaInscricao_cadenciaId_fkey" FOREIGN KEY ("cadenciaId") REFERENCES "Cadencia"("id") ON DELETE CASCADE ON UPDATE CASCADE;
