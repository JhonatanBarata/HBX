-- Operação de entregas: capacidade por usuário, atribuição, comprovantes
-- combináveis por tenant e auditoria mínima dos atores.

ALTER TABLE "Entrega"
ADD COLUMN "entregadorId" INTEGER,
ADD COLUMN "atribuidoPorUserId" INTEGER,
ADD COLUMN "atribuidoAt" TIMESTAMP(3),
ADD COLUMN "comprovanteCodigoHash" TEXT,
ADD COLUMN "comprovanteCodigoSalt" TEXT,
ADD COLUMN "comprovanteCodigoGeradoAt" TIMESTAMP(3),
ADD COLUMN "comprovanteCodigoGeradoPorUserId" INTEGER,
ADD COLUMN "comprovanteConfirmadoAt" TIMESTAMP(3),
ADD COLUMN "confirmadoPorUserId" INTEGER;

ALTER TABLE "LogisticaConfig"
ADD COLUMN "comprovanteFotoObrigatoria" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "comprovanteAssinaturaObrigatoria" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "comprovanteCodigoObrigatorio" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "EntregaComprovante" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "entregaId" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "originalFilename" TEXT NOT NULL,
  "storedFilename" TEXT NOT NULL,
  "storagePath" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "clientKey" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pendente',
  "enviadoPorUserId" INTEGER,
  "confirmadoAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EntregaComprovante_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Entrega_companyId_entregadorId_status_scheduledAt_idx"
ON "Entrega"("companyId", "entregadorId", "status", "scheduledAt");

CREATE INDEX "EntregaComprovante_companyId_entregaId_tipo_status_idx"
ON "EntregaComprovante"("companyId", "entregaId", "tipo", "status");

CREATE INDEX "EntregaComprovante_enviadoPorUserId_createdAt_idx"
ON "EntregaComprovante"("enviadoPorUserId", "createdAt");

CREATE UNIQUE INDEX "EntregaComprovante_entregaId_tipo_clientKey_key"
ON "EntregaComprovante"("entregaId", "tipo", "clientKey");

ALTER TABLE "Entrega"
ADD CONSTRAINT "Entrega_entregadorId_fkey"
FOREIGN KEY ("entregadorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Entrega"
ADD CONSTRAINT "Entrega_atribuidoPorUserId_fkey"
FOREIGN KEY ("atribuidoPorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Entrega"
ADD CONSTRAINT "Entrega_confirmadoPorUserId_fkey"
FOREIGN KEY ("confirmadoPorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Entrega"
ADD CONSTRAINT "Entrega_comprovanteCodigoGeradoPorUserId_fkey"
FOREIGN KEY ("comprovanteCodigoGeradoPorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EntregaComprovante"
ADD CONSTRAINT "EntregaComprovante_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EntregaComprovante"
ADD CONSTRAINT "EntregaComprovante_entregaId_fkey"
FOREIGN KEY ("entregaId") REFERENCES "Entrega"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EntregaComprovante"
ADD CONSTRAINT "EntregaComprovante_enviadoPorUserId_fkey"
FOREIGN KEY ("enviadoPorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
