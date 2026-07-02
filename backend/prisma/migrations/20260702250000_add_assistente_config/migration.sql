-- WORM-14 (02/07, docs/PLANEJAMENTOS/worm/14-assistente-ia-wizard.md):
-- Assistente IA: wizard 3 passos + fluxo em lista + sandbox "Teste sua IA".
-- Uma linha por empresa: fluxoJson (passos+condicoes) compilado em prompt-sistema
-- do MESMO pipeline do bot (Ollama local qwen2.5:7b). testCounter numera os testes
-- do sandbox; published = intencao de ligar no chip (so efetiva com a flag
-- HBX_ASSISTENTE_PUBLISH_ENABLED, default OFF). NENHUM disparo real nasce daqui.
-- ADITIVA: cria uma tabela+indice isolados; nada existente e alterado.
-- migrate dev quebrado (banco dev desligado) -> migration a mao, padrao da casa
-- (aplicar com migrate deploy).

-- CreateTable
CREATE TABLE IF NOT EXISTS "AssistenteConfig" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL DEFAULT 'Assistente',
    "tom" TEXT NOT NULL DEFAULT 'normal',
    "perfil" TEXT NOT NULL DEFAULT 'vendas',
    "produtos" TEXT,
    "empresaNome" TEXT,
    "fluxoJson" TEXT NOT NULL DEFAULT '{}',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "testCounter" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistenteConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AssistenteConfig_companyId_updatedAt_idx" ON "AssistenteConfig"("companyId", "updatedAt");
