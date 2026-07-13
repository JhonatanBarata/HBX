-- MOBILE DEVICE PAIRING (13/07/2026)
-- Login do APK como extensão da conta web existente. O código é efêmero e
-- descartável; o aparelho recebe uma credencial própria, revogável e armazenada
-- somente como hash no servidor. O ticket web é de uso único e evita colocar a
-- credencial duradoura na URL da WebView.

CREATE TABLE "MobileDevice" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "installationId" TEXT NOT NULL,
    "name" TEXT,
    "platform" TEXT NOT NULL DEFAULT 'android',
    "tokenHash" TEXT NOT NULL,
    "tokenVersion" INTEGER NOT NULL DEFAULT 1,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "webTicketHash" TEXT,
    "webTicketExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MobileDevice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MobilePairingCode" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MobilePairingCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MobileDevice_installationId_key" ON "MobileDevice"("installationId");
CREATE UNIQUE INDEX "MobileDevice_tokenHash_key" ON "MobileDevice"("tokenHash");
CREATE UNIQUE INDEX "MobileDevice_webTicketHash_key" ON "MobileDevice"("webTicketHash");
CREATE INDEX "MobileDevice_userId_revokedAt_idx" ON "MobileDevice"("userId", "revokedAt");
CREATE INDEX "MobileDevice_companyId_revokedAt_idx" ON "MobileDevice"("companyId", "revokedAt");
CREATE UNIQUE INDEX "MobilePairingCode_codeHash_key" ON "MobilePairingCode"("codeHash");
CREATE INDEX "MobilePairingCode_userId_expiresAt_idx" ON "MobilePairingCode"("userId", "expiresAt");
CREATE INDEX "MobilePairingCode_expiresAt_consumedAt_idx" ON "MobilePairingCode"("expiresAt", "consumedAt");

ALTER TABLE "MobileDevice"
    ADD CONSTRAINT "MobileDevice_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MobileDevice"
    ADD CONSTRAINT "MobileDevice_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MobilePairingCode"
    ADD CONSTRAINT "MobilePairingCode_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MobilePairingCode"
    ADD CONSTRAINT "MobilePairingCode_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
