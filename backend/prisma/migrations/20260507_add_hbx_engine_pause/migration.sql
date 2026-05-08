ALTER TABLE "HbxEngineLock"
  ADD COLUMN IF NOT EXISTS "manualPaused" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "pausedUntil" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "HbxEngineLock_manualPaused_pausedUntil_idx"
  ON "HbxEngineLock"("manualPaused", "pausedUntil");
