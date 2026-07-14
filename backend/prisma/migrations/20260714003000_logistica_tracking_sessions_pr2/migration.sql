-- Rota Rastreada PR2: vínculo tenant-safe do aparelho para a sessão.
CREATE UNIQUE INDEX "MobileDevice_id_companyId_key"
  ON "MobileDevice"("id", "companyId");

CREATE TABLE "LogisticaTrackingSession" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "routeId" TEXT NOT NULL,
  "entregadorId" INTEGER NOT NULL,
  "deviceId" TEXT,
  "deviceBoundAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "startedAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  "hasValidPositions" BOOLEAN NOT NULL DEFAULT false,
  "lastPointAt" TIMESTAMP(3),
  "lastLatitude" DOUBLE PRECISION,
  "lastLongitude" DOUBLE PRECISION,
  "lastAccuracyM" DOUBLE PRECISION,
  "lastSpeedMps" DOUBLE PRECISION,
  "lastBearingDeg" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LogisticaTrackingSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LogisticaTrackingPoint" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "sessionId" TEXT NOT NULL,
  "deliveryId" TEXT,
  "clientPointId" VARCHAR(80) NOT NULL,
  "sequence" INTEGER NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "accuracyM" DOUBLE PRECISION NOT NULL,
  "speedMps" DOUBLE PRECISION,
  "bearingDeg" DOUBLE PRECISION,
  "eventType" TEXT NOT NULL DEFAULT 'PERIODIC',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LogisticaTrackingPoint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LogisticaTrackingEvent" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "sessionId" TEXT NOT NULL,
  "deliveryId" TEXT,
  "clientEventId" VARCHAR(80) NOT NULL,
  "type" TEXT NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LogisticaTrackingEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LogisticaTrackingSession_id_companyId_key"
  ON "LogisticaTrackingSession"("id", "companyId");
CREATE UNIQUE INDEX "LogisticaTrackingSession_routeId_companyId_key"
  ON "LogisticaTrackingSession"("routeId", "companyId");
CREATE INDEX "LogisticaTrackingSession_companyId_status_lastPointAt_idx"
  ON "LogisticaTrackingSession"("companyId", "status", "lastPointAt");
CREATE INDEX "LogisticaTrackingSession_companyId_entregadorId_status_idx"
  ON "LogisticaTrackingSession"("companyId", "entregadorId", "status");
CREATE INDEX "LogisticaTrackingSession_companyId_deviceId_status_idx"
  ON "LogisticaTrackingSession"("companyId", "deviceId", "status");

CREATE UNIQUE INDEX "LogisticaTrackingPoint_sessionId_clientPointId_key"
  ON "LogisticaTrackingPoint"("sessionId", "clientPointId");
CREATE UNIQUE INDEX "LogisticaTrackingPoint_sessionId_sequence_key"
  ON "LogisticaTrackingPoint"("sessionId", "sequence");
CREATE INDEX "LogisticaTrackingPoint_companyId_sessionId_capturedAt_idx"
  ON "LogisticaTrackingPoint"("companyId", "sessionId", "capturedAt");
CREATE INDEX "LogisticaTrackingPoint_companyId_deliveryId_idx"
  ON "LogisticaTrackingPoint"("companyId", "deliveryId");

CREATE UNIQUE INDEX "LogisticaTrackingEvent_sessionId_clientEventId_key"
  ON "LogisticaTrackingEvent"("sessionId", "clientEventId");
CREATE INDEX "LogisticaTrackingEvent_companyId_sessionId_capturedAt_idx"
  ON "LogisticaTrackingEvent"("companyId", "sessionId", "capturedAt");
CREATE INDEX "LogisticaTrackingEvent_companyId_deliveryId_idx"
  ON "LogisticaTrackingEvent"("companyId", "deliveryId");

ALTER TABLE "LogisticaTrackingSession"
  ADD CONSTRAINT "LogisticaTrackingSession_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LogisticaTrackingSession"
  ADD CONSTRAINT "LogisticaTrackingSession_routeId_companyId_fkey"
  FOREIGN KEY ("routeId", "companyId") REFERENCES "LogisticaRoute"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LogisticaTrackingSession"
  ADD CONSTRAINT "LogisticaTrackingSession_entregadorId_companyId_fkey"
  FOREIGN KEY ("entregadorId", "companyId") REFERENCES "User"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LogisticaTrackingSession"
  ADD CONSTRAINT "LogisticaTrackingSession_deviceId_companyId_fkey"
  FOREIGN KEY ("deviceId", "companyId") REFERENCES "MobileDevice"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LogisticaTrackingPoint"
  ADD CONSTRAINT "LogisticaTrackingPoint_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LogisticaTrackingPoint"
  ADD CONSTRAINT "LogisticaTrackingPoint_sessionId_companyId_fkey"
  FOREIGN KEY ("sessionId", "companyId") REFERENCES "LogisticaTrackingSession"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LogisticaTrackingPoint"
  ADD CONSTRAINT "LogisticaTrackingPoint_deliveryId_companyId_fkey"
  FOREIGN KEY ("deliveryId", "companyId") REFERENCES "Entrega"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LogisticaTrackingEvent"
  ADD CONSTRAINT "LogisticaTrackingEvent_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LogisticaTrackingEvent"
  ADD CONSTRAINT "LogisticaTrackingEvent_sessionId_companyId_fkey"
  FOREIGN KEY ("sessionId", "companyId") REFERENCES "LogisticaTrackingSession"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LogisticaTrackingEvent"
  ADD CONSTRAINT "LogisticaTrackingEvent_deliveryId_companyId_fkey"
  FOREIGN KEY ("deliveryId", "companyId") REFERENCES "Entrega"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
