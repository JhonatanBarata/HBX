CREATE TABLE "VendasLeadTimelineEvent" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "sourceType" TEXT,
  "statusFrom" TEXT,
  "statusTo" TEXT,
  "resultLabel" TEXT,
  "returnAt" TIMESTAMP(3),
  "createdByUserId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "VendasLeadTimelineEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VendasLeadTimelineEvent_leadId_createdAt_idx"
ON "VendasLeadTimelineEvent"("leadId", "createdAt");

ALTER TABLE "VendasLeadTimelineEvent"
ADD CONSTRAINT "VendasLeadTimelineEvent_leadId_fkey"
FOREIGN KEY ("leadId") REFERENCES "VendasLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
