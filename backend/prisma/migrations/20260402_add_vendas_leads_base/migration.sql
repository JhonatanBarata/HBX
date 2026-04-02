CREATE TABLE "VendasLead" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "customerProfileId" TEXT,
  "sourceType" TEXT NOT NULL DEFAULT 'manual',
  "sourceHistoryId" TEXT,
  "sourceSignature" TEXT,
  "primarySource" TEXT NOT NULL DEFAULT 'manual',
  "timesSeen" INTEGER NOT NULL DEFAULT 1,
  "lastContactAt" TIMESTAMP(3),
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastResult" TEXT,
  "wasClosedBefore" BOOLEAN NOT NULL DEFAULT false,
  "name" TEXT,
  "phone" TEXT,
  "phoneNormalized" TEXT,
  "email" TEXT,
  "city" TEXT,
  "segment" TEXT,
  "status" TEXT NOT NULL DEFAULT 'novo',
  "nextAction" TEXT,
  "returnAt" TIMESTAMP(3),
  "shortNote" TEXT,
  "closedAt" TIMESTAMP(3),
  "createdByUserId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "VendasLead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VendasLead_companyId_phoneNormalized_key"
ON "VendasLead"("companyId", "phoneNormalized");

CREATE INDEX "VendasLead_companyId_status_returnAt_idx"
ON "VendasLead"("companyId", "status", "returnAt");

CREATE INDEX "VendasLead_companyId_updatedAt_idx"
ON "VendasLead"("companyId", "updatedAt");

CREATE INDEX "VendasLead_customerProfileId_idx"
ON "VendasLead"("customerProfileId");

ALTER TABLE "VendasLead"
ADD CONSTRAINT "VendasLead_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VendasLead"
ADD CONSTRAINT "VendasLead_customerProfileId_fkey"
FOREIGN KEY ("customerProfileId") REFERENCES "CustomerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
