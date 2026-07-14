-- Rota Rastreada PR3: débito por entrega válida e bônus mensal idempotentes.
CREATE TABLE "LogisticaTrackedCreditClaim" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "trackingSessionId" TEXT NOT NULL,
  "routeId" TEXT NOT NULL,
  "deliveryId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "billingAttempt" INTEGER NOT NULL DEFAULT 0,
  "debitUsageKey" TEXT,
  "processingToken" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "paidCreditsConsumed" INTEGER NOT NULL DEFAULT 0,
  "sourceMonth" VARCHAR(7),
  "debitedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "refundedAt" TIMESTAMP(3),
  "lastError" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LogisticaTrackedCreditClaim_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LogisticaTrackingBonusGrant" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "sourceMonth" VARCHAR(7) NOT NULL,
  "eligiblePaidCredits" INTEGER NOT NULL DEFAULT 0,
  "bonusCredits" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "usageKey" TEXT,
  "processingToken" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "grantedAt" TIMESTAMP(3),
  "lastError" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LogisticaTrackingBonusGrant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LogisticaTrackedCreditClaim_debitUsageKey_key"
  ON "LogisticaTrackedCreditClaim"("debitUsageKey");
CREATE UNIQUE INDEX "LogisticaTrackedCreditClaim_processingToken_key"
  ON "LogisticaTrackedCreditClaim"("processingToken");
CREATE UNIQUE INDEX "LogisticaTrackedCreditClaim_companyId_trackingSessionId_deliveryId_key"
  ON "LogisticaTrackedCreditClaim"("companyId", "trackingSessionId", "deliveryId");
CREATE INDEX "LogisticaTrackedCreditClaim_companyId_routeId_status_idx"
  ON "LogisticaTrackedCreditClaim"("companyId", "routeId", "status");
CREATE INDEX "LogisticaTrackedCreditClaim_companyId_deliveryId_idx"
  ON "LogisticaTrackedCreditClaim"("companyId", "deliveryId");
CREATE INDEX "LogisticaTrackedCreditClaim_companyId_sourceMonth_status_idx"
  ON "LogisticaTrackedCreditClaim"("companyId", "sourceMonth", "status");
CREATE INDEX "LogisticaTrackedCreditClaim_companyId_status_leaseUntil_idx"
  ON "LogisticaTrackedCreditClaim"("companyId", "status", "leaseUntil");

CREATE UNIQUE INDEX "LogisticaTrackingBonusGrant_usageKey_key"
  ON "LogisticaTrackingBonusGrant"("usageKey");
CREATE UNIQUE INDEX "LogisticaTrackingBonusGrant_processingToken_key"
  ON "LogisticaTrackingBonusGrant"("processingToken");
CREATE UNIQUE INDEX "LogisticaTrackingBonusGrant_companyId_sourceMonth_key"
  ON "LogisticaTrackingBonusGrant"("companyId", "sourceMonth");
CREATE INDEX "LogisticaTrackingBonusGrant_companyId_status_sourceMonth_idx"
  ON "LogisticaTrackingBonusGrant"("companyId", "status", "sourceMonth");
CREATE INDEX "LogisticaTrackingBonusGrant_status_leaseUntil_idx"
  ON "LogisticaTrackingBonusGrant"("status", "leaseUntil");

ALTER TABLE "LogisticaTrackedCreditClaim"
  ADD CONSTRAINT "LogisticaTrackedCreditClaim_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LogisticaTrackedCreditClaim"
  ADD CONSTRAINT "LogisticaTrackedCreditClaim_trackingSessionId_companyId_fkey"
  FOREIGN KEY ("trackingSessionId", "companyId") REFERENCES "LogisticaTrackingSession"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LogisticaTrackedCreditClaim"
  ADD CONSTRAINT "LogisticaTrackedCreditClaim_routeId_companyId_fkey"
  FOREIGN KEY ("routeId", "companyId") REFERENCES "LogisticaRoute"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LogisticaTrackedCreditClaim"
  ADD CONSTRAINT "LogisticaTrackedCreditClaim_deliveryId_companyId_fkey"
  FOREIGN KEY ("deliveryId", "companyId") REFERENCES "Entrega"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LogisticaTrackingBonusGrant"
  ADD CONSTRAINT "LogisticaTrackingBonusGrant_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
