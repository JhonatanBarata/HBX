-- LEADS-FINAL/06 (docs/PLANEJAMENTOS/LEADS-FINAL/06-EMAIL-V1.md) — E-mail v1:
-- conta SMTP PESSOAL do usuário + histórico de envio da timeline do lead.
-- ADITIVO E NÃO-DESTRUTIVO: cria APENAS 2 tabelas novas. NÃO altera/dropa
-- coluna, tabela ou índice existente. `credentialsEnc` guarda a senha cifrada
-- (AES-256-GCM, HBX_EMAIL_CRED_SECRET); sem o secret o módulo fica OFF gracioso.

CREATE TABLE "EmailAccount" (
    "id"             TEXT NOT NULL,
    "companyId"      INTEGER NOT NULL,
    "userId"         INTEGER NOT NULL,
    "address"        TEXT NOT NULL,
    "senderName"     TEXT,
    "provider"       TEXT NOT NULL DEFAULT 'outro',
    "smtpHost"       TEXT NOT NULL,
    "smtpPort"       INTEGER NOT NULL,
    "smtpSecure"     BOOLEAN NOT NULL DEFAULT true,
    "username"       TEXT NOT NULL,
    "credentialsEnc" TEXT,
    "status"         TEXT NOT NULL DEFAULT 'draft',
    "lastError"      TEXT,
    "lastTestedAt"   TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailAccount_companyId_userId_key" ON "EmailAccount"("companyId", "userId");
CREATE INDEX "EmailAccount_companyId_idx" ON "EmailAccount"("companyId");

CREATE TABLE "EmailMessage" (
    "id"        TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "leadId"    TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId"    INTEGER,
    "direction" TEXT NOT NULL DEFAULT 'out',
    "to"        TEXT NOT NULL,
    "subject"   TEXT NOT NULL,
    "bodyText"  TEXT,
    "bodyHtml"  TEXT,
    "status"    TEXT NOT NULL DEFAULT 'sent',
    "error"     TEXT,
    "sentAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailMessage_companyId_leadId_idx" ON "EmailMessage"("companyId", "leadId");
CREATE INDEX "EmailMessage_accountId_sentAt_idx" ON "EmailMessage"("accountId", "sentAt");
