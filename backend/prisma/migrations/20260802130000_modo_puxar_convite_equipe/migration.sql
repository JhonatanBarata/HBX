-- MODO PUXAR (02/08/2026) — convite unico de equipe. Aditiva, zero backfill.

ALTER TABLE "Company" ADD COLUMN "dormantAt" TIMESTAMP(3);

ALTER TABLE "User" ADD COLUMN "personalCompanyId" INTEGER;
ALTER TABLE "User" ADD COLUMN "personalRoleSnapshot" TEXT;
ALTER TABLE "User" ADD COLUMN "pulledIntoCompanyAt" TIMESTAMP(3);

CREATE TABLE "CompanyUserInvite" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "invitedByUserId" INTEGER,
    "claimedByUserId" INTEGER,
    "acceptedByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),

    CONSTRAINT "CompanyUserInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanyUserInvite_token_key" ON "CompanyUserInvite"("token");
CREATE INDEX "CompanyUserInvite_companyId_status_createdAt_idx" ON "CompanyUserInvite"("companyId", "status", "createdAt");
CREATE INDEX "CompanyUserInvite_email_status_idx" ON "CompanyUserInvite"("email", "status");
CREATE INDEX "CompanyUserInvite_claimedByUserId_status_idx" ON "CompanyUserInvite"("claimedByUserId", "status");

ALTER TABLE "User" ADD CONSTRAINT "User_personalCompanyId_fkey" FOREIGN KEY ("personalCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CompanyUserInvite" ADD CONSTRAINT "CompanyUserInvite_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyUserInvite" ADD CONSTRAINT "CompanyUserInvite_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CompanyUserInvite" ADD CONSTRAINT "CompanyUserInvite_claimedByUserId_fkey" FOREIGN KEY ("claimedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CompanyUserInvite" ADD CONSTRAINT "CompanyUserInvite_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
