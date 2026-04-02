ALTER TABLE "Company"
ADD COLUMN "entityType" TEXT NOT NULL DEFAULT 'PJ',
ADD COLUMN "trialModuleSelection" TEXT,
ADD COLUMN "signupUsesPublicEmail" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Company"
SET "entityType" = 'PJ'
WHERE COALESCE(NULLIF(TRIM("entityType"), ''), '') = '';
