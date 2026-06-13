-- PR12062026005: módulo E-mail por empresa (aditivo).
-- SMTP próprio por tenant; senha criptografada (AES-256-GCM via
-- IntegrationSecretsService). HBX usa o transporte do Master apenas
-- internamente (CompanyMailerService) — nunca via endpoint master.

-- CreateTable
CREATE TABLE "CompanyEmailSettings" (
    "companyId" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT true,
    "smtpUser" TEXT,
    "smtpPassEncrypted" TEXT,
    "fromName" TEXT,
    "fromEmail" TEXT,
    "replyTo" TEXT,
    "testEmail" TEXT,
    "sampleName" TEXT,
    "sampleCompany" TEXT,
    "welcomeTemplateKind" TEXT,
    "onboardingTemplateKind" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyEmailSettings_pkey" PRIMARY KEY ("companyId")
);

-- CreateTable
CREATE TABLE "CompanyEmailTemplate" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "html" TEXT,
    "isSeeded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyEmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyEmailAsset" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER NOT NULL,
    "fileData" BYTEA NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyEmailAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyEmailTemplate_companyId_kind_key" ON "CompanyEmailTemplate"("companyId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyEmailAsset_companyId_key_key" ON "CompanyEmailAsset"("companyId", "key");

-- AddForeignKey
ALTER TABLE "CompanyEmailSettings" ADD CONSTRAINT "CompanyEmailSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyEmailTemplate" ADD CONSTRAINT "CompanyEmailTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyEmailAsset" ADD CONSTRAINT "CompanyEmailAsset_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
