-- Add GmailConnection table for per-user Gmail OAuth (Bloco A, 22/06/2026)
CREATE TABLE "GmailConnection" (
    "id"                     TEXT NOT NULL,
    "userId"                 INTEGER NOT NULL,
    "companyId"              INTEGER NOT NULL,
    "email"                  TEXT,
    "refreshTokenCiphertext" TEXT,
    "scope"                  TEXT,
    "status"                 TEXT NOT NULL DEFAULT 'connected',
    "lastError"              TEXT,
    "connectedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"              TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GmailConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GmailConnection_userId_key" ON "GmailConnection"("userId");
CREATE INDEX "GmailConnection_companyId_idx" ON "GmailConnection"("companyId");

ALTER TABLE "GmailConnection" ADD CONSTRAINT "GmailConnection_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
