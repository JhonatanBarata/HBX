-- Rota Essencial/Rastreada PR1: estado comercial congelado, snapshot único e
-- claims de bloco idempotentes. Migração somente aditiva, exceto pelo hardening
-- do índice de idempotência de Entrega (global -> company-scoped).

ALTER TABLE "LogisticaConfig"
  ADD COLUMN "trackingAtivo" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "modoRotaPadrao" TEXT NOT NULL DEFAULT 'ESSENTIAL';

ALTER TABLE "LogisticaConfig"
  ADD CONSTRAINT "LogisticaConfig_modoRotaPadrao_check"
  CHECK ("modoRotaPadrao" IN ('ESSENTIAL', 'TRACKED'));

DROP INDEX IF EXISTS "Entrega_idempotencyKey_key";
CREATE UNIQUE INDEX "Entrega_companyId_idempotencyKey_key"
  ON "Entrega"("companyId", "idempotencyKey");

-- Chaves compostas redundantes ao PK, mas necessárias para que todas as FKs
-- abaixo carreguem também o tenant e rejeitem relações cruzadas no próprio DB.
CREATE UNIQUE INDEX "User_id_companyId_key" ON "User"("id", "companyId");
CREATE UNIQUE INDEX "Entrega_id_companyId_key" ON "Entrega"("id", "companyId");

CREATE TABLE "LogisticaRoute" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "entregadorId" INTEGER NOT NULL,
  "routeDate" VARCHAR(10) NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'ESSENTIAL',
  "status" TEXT NOT NULL DEFAULT 'PLANNED',
  "billingRevision" INTEGER NOT NULL DEFAULT 0,
  "initializationToken" TEXT,
  "initializationLeaseUntil" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "lastError" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LogisticaRoute_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LogisticaRoute_routeDate_check"
    CHECK ("routeDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  CONSTRAINT "LogisticaRoute_mode_check"
    CHECK ("mode" IN ('ESSENTIAL', 'TRACKED')),
  CONSTRAINT "LogisticaRoute_billingRevision_check" CHECK ("billingRevision" >= 0),
  CONSTRAINT "LogisticaRoute_status_check"
    CHECK ("status" IN ('PLANNED', 'INITIALIZING', 'ACTIVE', 'COMPLETED', 'REFUNDING', 'FAILED'))
);

CREATE UNIQUE INDEX "LogisticaRoute_companyId_entregadorId_routeDate_key"
  ON "LogisticaRoute"("companyId", "entregadorId", "routeDate");
CREATE UNIQUE INDEX "LogisticaRoute_id_companyId_key"
  ON "LogisticaRoute"("id", "companyId");
CREATE UNIQUE INDEX "LogisticaRoute_initializationToken_key"
  ON "LogisticaRoute"("initializationToken");
CREATE INDEX "LogisticaRoute_companyId_status_routeDate_idx"
  ON "LogisticaRoute"("companyId", "status", "routeDate");
CREATE INDEX "LogisticaRoute_companyId_entregadorId_routeDate_idx"
  ON "LogisticaRoute"("companyId", "entregadorId", "routeDate");

ALTER TABLE "LogisticaRoute"
  ADD CONSTRAINT "LogisticaRoute_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LogisticaRoute"
  ADD CONSTRAINT "LogisticaRoute_entregadorId_companyId_fkey"
  FOREIGN KEY ("entregadorId", "companyId") REFERENCES "User"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "LogisticaRouteStop" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "routeId" TEXT NOT NULL,
  "deliveryId" TEXT NOT NULL,
  "snapshotOrder" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LogisticaRouteStop_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LogisticaRouteStop_snapshotOrder_check" CHECK ("snapshotOrder" >= 0)
);

CREATE UNIQUE INDEX "LogisticaRouteStop_deliveryId_companyId_key"
  ON "LogisticaRouteStop"("deliveryId", "companyId");
CREATE UNIQUE INDEX "LogisticaRouteStop_routeId_snapshotOrder_key"
  ON "LogisticaRouteStop"("routeId", "snapshotOrder");
CREATE INDEX "LogisticaRouteStop_companyId_routeId_idx"
  ON "LogisticaRouteStop"("companyId", "routeId");
CREATE INDEX "LogisticaRouteStop_companyId_deliveryId_idx"
  ON "LogisticaRouteStop"("companyId", "deliveryId");

ALTER TABLE "LogisticaRouteStop"
  ADD CONSTRAINT "LogisticaRouteStop_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LogisticaRouteStop"
  ADD CONSTRAINT "LogisticaRouteStop_routeId_companyId_fkey"
  FOREIGN KEY ("routeId", "companyId") REFERENCES "LogisticaRoute"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LogisticaRouteStop"
  ADD CONSTRAINT "LogisticaRouteStop_deliveryId_companyId_fkey"
  FOREIGN KEY ("deliveryId", "companyId") REFERENCES "Entrega"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "LogisticaEssentialCreditClaim" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "routeId" TEXT NOT NULL,
  "entregadorId" INTEGER NOT NULL,
  "routeDate" VARCHAR(10) NOT NULL,
  "blockIndex" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "billingRevision" INTEGER NOT NULL DEFAULT 0,
  "billingAttempt" INTEGER NOT NULL DEFAULT 0,
  "debitUsageKey" TEXT,
  "processingToken" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "debitedAt" TIMESTAMP(3),
  "refundedAt" TIMESTAMP(3),
  "lastError" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LogisticaEssentialCreditClaim_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LogisticaEssentialCreditClaim_routeDate_check"
    CHECK ("routeDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  CONSTRAINT "LogisticaEssentialCreditClaim_blockIndex_check" CHECK ("blockIndex" > 0),
  CONSTRAINT "LogisticaEssentialCreditClaim_billingRevision_check" CHECK ("billingRevision" >= 0),
  CONSTRAINT "LogisticaEssentialCreditClaim_billingAttempt_check" CHECK ("billingAttempt" >= 0),
  CONSTRAINT "LogisticaEssentialCreditClaim_status_check"
    CHECK ("status" IN ('PENDING', 'PROCESSING', 'DEBITED', 'REFUNDED', 'FAILED'))
);

CREATE UNIQUE INDEX "LogisticaEssentialCreditClaim_company_driver_date_block_key"
  ON "LogisticaEssentialCreditClaim"("companyId", "entregadorId", "routeDate", "blockIndex");
CREATE UNIQUE INDEX "LogisticaEssentialCreditClaim_debitUsageKey_key"
  ON "LogisticaEssentialCreditClaim"("debitUsageKey");
CREATE UNIQUE INDEX "LogisticaEssentialCreditClaim_processingToken_key"
  ON "LogisticaEssentialCreditClaim"("processingToken");
CREATE INDEX "LogisticaEssentialCreditClaim_companyId_routeId_status_idx"
  ON "LogisticaEssentialCreditClaim"("companyId", "routeId", "status");
CREATE INDEX "LogisticaEssentialCreditClaim_company_driver_date_idx"
  ON "LogisticaEssentialCreditClaim"("companyId", "entregadorId", "routeDate");

ALTER TABLE "LogisticaEssentialCreditClaim"
  ADD CONSTRAINT "LogisticaEssentialCreditClaim_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LogisticaEssentialCreditClaim"
  ADD CONSTRAINT "LogisticaEssentialCreditClaim_routeId_companyId_fkey"
  FOREIGN KEY ("routeId", "companyId") REFERENCES "LogisticaRoute"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LogisticaEssentialCreditClaim"
  ADD CONSTRAINT "LogisticaEssentialCreditClaim_entregadorId_companyId_fkey"
  FOREIGN KEY ("entregadorId", "companyId") REFERENCES "User"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
