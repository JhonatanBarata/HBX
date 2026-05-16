CREATE TABLE IF NOT EXISTS "SalesProfile" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "userId" INTEGER,
  "profileName" TEXT NOT NULL DEFAULT 'Perfil de Venda',
  "whatDoYouSell" TEXT,
  "offerCategory" TEXT,
  "targetAudienceJson" TEXT,
  "targetSegmentsJson" TEXT,
  "avoidSegmentsJson" TEXT,
  "preferredCitiesJson" TEXT,
  "preferredStatesJson" TEXT,
  "preferredChannelsJson" TEXT,
  "leadPreferencesJson" TEXT,
  "ticketRange" TEXT,
  "salesGoal" TEXT,
  "negativeRulesJson" TEXT,
  "weeklyAutoUpdateEnabled" BOOLEAN NOT NULL DEFAULT false,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "lastAppliedAt" TIMESTAMP(3),
  "lastSuggestedAt" TIMESTAMP(3),
  "suggestedProfileJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalesProfile_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SalesProfile"
  ADD CONSTRAINT "SalesProfile_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SalesProfile"
  ADD CONSTRAINT "SalesProfile_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "SalesProfile_company_user_key"
  ON "SalesProfile"("companyId", "userId");

CREATE UNIQUE INDEX IF NOT EXISTS "SalesProfile_company_default_key"
  ON "SalesProfile"("companyId")
  WHERE "userId" IS NULL;

CREATE INDEX IF NOT EXISTS "SalesProfile_companyId_idx" ON "SalesProfile"("companyId");
CREATE INDEX IF NOT EXISTS "SalesProfile_userId_idx" ON "SalesProfile"("userId");
CREATE INDEX IF NOT EXISTS "SalesProfile_company_weekly_idx" ON "SalesProfile"("companyId", "weeklyAutoUpdateEnabled");
