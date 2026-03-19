CREATE TABLE "TechAssistantInteraction" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "mode" TEXT NOT NULL,
  "analysisType" TEXT,
  "title" TEXT,
  "route" TEXT,
  "environment" TEXT,
  "expectedBehavior" TEXT,
  "currentBehavior" TEXT,
  "maskedInput" TEXT NOT NULL,
  "responseJson" TEXT NOT NULL,
  "providerLabel" TEXT,
  "providerStatus" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TechAssistantInteraction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TechAssistantInteraction_userId_createdAt_idx"
ON "TechAssistantInteraction"("userId", "createdAt");

CREATE INDEX "TechAssistantInteraction_mode_createdAt_idx"
ON "TechAssistantInteraction"("mode", "createdAt");

ALTER TABLE "TechAssistantInteraction"
ADD CONSTRAINT "TechAssistantInteraction_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;