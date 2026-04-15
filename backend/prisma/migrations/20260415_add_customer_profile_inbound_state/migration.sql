-- Sprint 2: shared inbound state on CustomerProfile.
-- Manual/idempotent migration to avoid destructive Prisma drift flows.

ALTER TABLE "CustomerProfile" ADD COLUMN IF NOT EXISTS "profileName" TEXT;
ALTER TABLE "CustomerProfile" ADD COLUMN IF NOT EXISTS "nameSource" TEXT;
ALTER TABLE "CustomerProfile" ADD COLUMN IF NOT EXISTS "nameConfirmed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CustomerProfile" ADD COLUMN IF NOT EXISTS "firstInboundAt" TIMESTAMP(3);
ALTER TABLE "CustomerProfile" ADD COLUMN IF NOT EXISTS "lastInboundAt" TIMESTAMP(3);
ALTER TABLE "CustomerProfile" ADD COLUMN IF NOT EXISTS "botOff" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CustomerProfile" ADD COLUMN IF NOT EXISTS "botOffReason" TEXT;
ALTER TABLE "CustomerProfile" ADD COLUMN IF NOT EXISTS "botOffAt" TIMESTAMP(3);