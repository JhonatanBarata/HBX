-- S09 (MOTOR-ÚNICO, docs/PLANEJAMENTOS/PR20072026-MOTOR-UNICO/S09-schema-automation-agent.md).
-- Lar definitivo do Atendente: funde AssistenteConfig (cérebro 'ia') + BotConfig
-- domain='atendimento_bot' (cérebro 'roteiro') numa tabela só, 1 linha POR EMPRESA
-- (companyId unique — regra de produto 20/07, README linhas 89-98: Admin configura,
-- todos herdam). ADITIVA PURA: só cria tabela+índice novos, NADA existente é tocado
-- (nenhum ALTER/DROP em AssistenteConfig ou BotConfig). Populada só pelo backfill
-- idempotente (backend/scripts/automation-agent-backfill.js), nunca no boot; os
-- stores antigos continuam sendo lidos em runtime até a S10 trocar a leitura.
-- SQL escrito à mão (não gerado por `prisma migrate dev`, sem Postgres local
-- disponível neste boot) — conferido contra `prisma migrate diff
-- --from-schema-datamodel <schema pré-S09> --to-schema-datamodel prisma/schema.prisma
-- --script`, que devolveu exatamente este CREATE TABLE + CREATE UNIQUE INDEX, sem
-- nenhuma alteração de tabela existente arrastada junto.

-- CreateTable
CREATE TABLE "AutomationAgent" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL DEFAULT 'Assistente',
    "tom" TEXT NOT NULL DEFAULT 'normal',
    "perfil" TEXT NOT NULL DEFAULT 'vendas',
    "produtos" TEXT,
    "empresaNome" TEXT,
    "brain" TEXT NOT NULL DEFAULT 'roteiro',
    "roteiroJson" TEXT NOT NULL DEFAULT '{}',
    "fluxoJson" TEXT NOT NULL DEFAULT '{}',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "testCounter" INTEGER NOT NULL DEFAULT 0,
    "migratedFrom" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationAgent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AutomationAgent_companyId_key" ON "AutomationAgent"("companyId");
