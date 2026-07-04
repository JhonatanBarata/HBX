-- WEBSITE-KIT Sprint 2 (T1, 02/07): promove tabelas SOMBRA pro schema.prisma.
-- CompanyWebsiteConfig e WebsiteAdminEntryToken JA EXISTEM em produção — foram
-- criadas em runtime via $executeRawUnsafe (backend/src/website/website-runtime.ts,
-- função ensureWebsiteRuntimeSchema, chamada no boot do WebsiteService).
-- Esta migration é IDEMPOTENTE (IF NOT EXISTS em tudo) por desenho: no VPS ela
-- roda contra tabelas/índices que já estão lá e não deve fazer nada; em um
-- banco novo (ex.: ambiente local do zero) ela cria do zero. Nenhuma coluna,
-- tipo, default ou nome de índice foi alterado em relação ao runtime original.

-- CreateTable
CREATE TABLE IF NOT EXISTS "CompanyWebsiteConfig" (
    "companyId" INTEGER NOT NULL,
    "websiteEnabled" BOOLEAN NOT NULL DEFAULT false,
    "websitePublicUrl" TEXT,
    "websiteAdminUrl" TEXT,
    "websiteProjectId" TEXT,
    "websiteAdminEnabled" BOOLEAN NOT NULL DEFAULT false,
    "websiteLaunchMode" TEXT NOT NULL DEFAULT 'public',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyWebsiteConfig_pkey" PRIMARY KEY ("companyId")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "WebsiteAdminEntryToken" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "websiteProjectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedByIp" TEXT,

    CONSTRAINT "WebsiteAdminEntryToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CompanyWebsiteConfig_project_idx" ON "CompanyWebsiteConfig"("websiteProjectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WebsiteAdminEntryToken_companyId_expiresAt_idx" ON "WebsiteAdminEntryToken"("companyId", "expiresAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WebsiteAdminEntryToken_userId_expiresAt_idx" ON "WebsiteAdminEntryToken"("userId", "expiresAt");

-- AddForeignKey (só entra se ainda não existir — não dá pra fazer "IF NOT EXISTS"
-- em constraint no Postgres, então usamos DO $$ ... EXCEPTION para tolerar re-run
-- caso a FK já exista de uma aplicação anterior desta mesma migration).
DO $$ BEGIN
    ALTER TABLE "CompanyWebsiteConfig" ADD CONSTRAINT "CompanyWebsiteConfig_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "WebsiteAdminEntryToken" ADD CONSTRAINT "WebsiteAdminEntryToken_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "WebsiteAdminEntryToken" ADD CONSTRAINT "WebsiteAdminEntryToken_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
