-- S6 LEAD-CENTRICO (26/07, docs/PLANEJAMENTOS/PR25072026-LEAD-CENTRICO/06-email-v1.md):
-- perfil do remetente POR USUÁRIO (cargo/telefone/site — nome vem de User.name) pra
-- montar a assinatura sóbria do e-mail comercial, + coluna HTML no outbox pra carregar
-- essa assinatura na cadência (hoje o outbox só manda texto puro). ADITIVA PURA: 1
-- CREATE TABLE + 1 ADD COLUMN nullable, nada existente é alterado. SQL escrito a mão
-- (migrate dev local quebrado por drift preexistente, padrão da casa) — shape conferido
-- 1:1 contra schema.prisma (UserSenderProfile / EmailOutboundMessage.bodyHtml).

-- CreateTable
CREATE TABLE IF NOT EXISTS "UserSenderProfile" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "jobTitle" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSenderProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "UserSenderProfile_userId_key" ON "UserSenderProfile"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserSenderProfile_companyId_idx" ON "UserSenderProfile"("companyId");

-- AlterTable
ALTER TABLE "EmailOutboundMessage" ADD COLUMN IF NOT EXISTS "bodyHtml" TEXT;
