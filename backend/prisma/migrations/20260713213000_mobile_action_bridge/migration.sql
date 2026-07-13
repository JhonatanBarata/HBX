-- HBX Mobile: ponte web -> celular para ligação/WhatsApp, push e histórico.
-- Aditiva: nenhuma tabela/coluna existente é removida ou reinterpretada.

ALTER TABLE "MobileDevice"
  ADD COLUMN IF NOT EXISTS "pushToken" TEXT,
  ADD COLUMN IF NOT EXISTS "pushPlatform" TEXT,
  ADD COLUMN IF NOT EXISTS "pushUpdatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "appVersion" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "MobileDevice_pushToken_key"
  ON "MobileDevice"("pushToken")
  WHERE "pushToken" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "MobileDevice_user_company_push_idx"
  ON "MobileDevice"("userId", "companyId", "pushUpdatedAt");

CREATE TABLE IF NOT EXISTS "MobileAction" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "deviceId" TEXT,
  "leadId" TEXT,
  "kind" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "contactName" TEXT,
  "message" TEXT,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "pushSentAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "openedAt" TIMESTAMP(3),
  "externalStartedAt" TIMESTAMP(3),
  "returnedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "estimatedDurationSeconds" INTEGER,
  "result" TEXT,
  "note" TEXT,
  "errorMessage" TEXT,
  "expiresAt" TIMESTAMP(3),
  "metadataJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MobileAction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MobileAction_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MobileAction_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MobileAction_deviceId_fkey"
    FOREIGN KEY ("deviceId") REFERENCES "MobileDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "MobileAction_user_status_requested_idx"
  ON "MobileAction"("companyId", "userId", "status", "requestedAt");

CREATE INDEX IF NOT EXISTS "MobileAction_device_status_requested_idx"
  ON "MobileAction"("deviceId", "status", "requestedAt");

CREATE INDEX IF NOT EXISTS "MobileAction_lead_requested_idx"
  ON "MobileAction"("companyId", "leadId", "requestedAt");

CREATE TABLE IF NOT EXISTS "MobileActionEvent" (
  "id" TEXT NOT NULL,
  "actionId" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "elapsedSeconds" INTEGER,
  "result" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MobileActionEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MobileActionEvent_actionId_fkey"
    FOREIGN KEY ("actionId") REFERENCES "MobileAction"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "MobileActionEvent_action_created_idx"
  ON "MobileActionEvent"("actionId", "createdAt");
