-- GATEWAY-WA S1/S2: telemetria do disjuntor + event outbox (aditivo).

-- CreateTable
CREATE TABLE "ConnectionEvent" (
    "id" SERIAL NOT NULL,
    "instanceName" VARCHAR(255) NOT NULL,
    "event" VARCHAR(50) NOT NULL,
    "statusCode" INTEGER,
    "attempt" INTEGER,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConnectionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventOutbox" (
    "id" SERIAL NOT NULL,
    "instanceName" VARCHAR(255) NOT NULL,
    "eventName" VARCHAR(100) NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConnectionEvent_instanceName_idx" ON "ConnectionEvent"("instanceName");

-- CreateIndex
CREATE INDEX "ConnectionEvent_instanceName_createdAt_idx" ON "ConnectionEvent"("instanceName", "createdAt");

-- CreateIndex
CREATE INDEX "EventOutbox_instanceName_idx" ON "EventOutbox"("instanceName");

-- CreateIndex
CREATE INDEX "EventOutbox_createdAt_idx" ON "EventOutbox"("createdAt");
