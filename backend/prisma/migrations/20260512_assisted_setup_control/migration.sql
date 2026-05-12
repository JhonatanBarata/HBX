ALTER TABLE "Company"
  ADD COLUMN IF NOT EXISTS "assistedSetupStatus" TEXT NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS "assistedSetupRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "assistedSetupCompletedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "assistedSetupCompletedByUserId" INTEGER,
  ADD COLUMN IF NOT EXISTS "assistedSetupNote" TEXT;

UPDATE "Company"
SET
  "assistedSetupRequired" = true,
  "assistedSetupStatus" = CASE
    WHEN "assistedSetupStatus" = 'completed' THEN 'completed'
    ELSE 'pending'
  END
WHERE "selectedPlanKey" = 'hbx_melhor'
  AND COALESCE("assistedSetupRequired", false) = false;
