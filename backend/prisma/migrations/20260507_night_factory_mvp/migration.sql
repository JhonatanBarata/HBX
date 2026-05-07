CREATE TABLE IF NOT EXISTS "RadarLeadEnrichment" (
  "id" TEXT NOT NULL,
  "radarLeadId" TEXT NOT NULL,
  "companyId" INTEGER,
  "sourceLeadPoolId" TEXT,
  "enrichmentStatus" TEXT NOT NULL DEFAULT 'queued',
  "enrichmentError" TEXT,
  "checkedAt" TIMESTAMP(3),
  "websiteCheckedAt" TIMESTAMP(3),
  "websiteUrl" TEXT,
  "websiteStatus" TEXT NOT NULL DEFAULT 'unknown',
  "hasWebsite" BOOLEAN NOT NULL DEFAULT false,
  "hasWhatsappOnSite" BOOLEAN NOT NULL DEFAULT false,
  "whatsappFound" TEXT,
  "hasInstagram" BOOLEAN NOT NULL DEFAULT false,
  "instagramUrl" TEXT,
  "hasFacebook" BOOLEAN NOT NULL DEFAULT false,
  "googleMapsUrl" TEXT,
  "pageLoadMs" INTEGER,
  "sslOk" BOOLEAN,
  "hasBookingLink" BOOLEAN NOT NULL DEFAULT false,
  "hasCatalog" BOOLEAN NOT NULL DEFAULT false,
  "hasMenu" BOOLEAN NOT NULL DEFAULT false,
  "hasPaymentLink" BOOLEAN NOT NULL DEFAULT false,
  "hasLeadCaptureForm" BOOLEAN NOT NULL DEFAULT false,
  "formLooksBroken" BOOLEAN NOT NULL DEFAULT false,
  "digitalPresenceScore" INTEGER NOT NULL DEFAULT 0,
  "opportunityScore" INTEGER NOT NULL DEFAULT 0,
  "opportunityLevel" TEXT NOT NULL DEFAULT 'baixo',
  "opportunityReason" TEXT,
  "recommendedOffer" TEXT,
  "suggestedApproach" TEXT,
  "suggestedWhatsappMessage" TEXT,
  "suggestedHumanOpening" TEXT,
  "detectedProblems" TEXT,
  "detectedAssets" TEXT,
  "segmentPlaybookKey" TEXT,
  "cityOpportunityRank" INTEGER,
  "miniAuditTitle" TEXT,
  "miniAuditSummary" TEXT,
  "miniAuditStatus" TEXT NOT NULL DEFAULT 'text_ready',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RadarLeadEnrichment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RadarLeadEnrichment_radarLeadId_key" ON "RadarLeadEnrichment"("radarLeadId");
CREATE INDEX IF NOT EXISTS "RadarLeadEnrichment_companyId_opportunityScore_idx" ON "RadarLeadEnrichment"("companyId", "opportunityScore");
CREATE INDEX IF NOT EXISTS "RadarLeadEnrichment_enrichmentStatus_updatedAt_idx" ON "RadarLeadEnrichment"("enrichmentStatus", "updatedAt");
CREATE INDEX IF NOT EXISTS "RadarLeadEnrichment_websiteStatus_idx" ON "RadarLeadEnrichment"("websiteStatus");
CREATE INDEX IF NOT EXISTS "RadarLeadEnrichment_segmentPlaybookKey_idx" ON "RadarLeadEnrichment"("segmentPlaybookKey");

CREATE TABLE IF NOT EXISTS "RecoveryOpportunity" (
  "id" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "companyId" INTEGER,
  "recoveryReason" TEXT NOT NULL,
  "recoveryScore" INTEGER NOT NULL DEFAULT 0,
  "suggestedFlow" TEXT,
  "suggestedMessage" TEXT,
  "suggestedTemplate" TEXT,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "metadataJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RecoveryOpportunity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RecoveryOpportunity_sourceType_sourceId_companyId_key" ON "RecoveryOpportunity"("sourceType", "sourceId", "companyId");
CREATE INDEX IF NOT EXISTS "RecoveryOpportunity_companyId_status_recoveryScore_idx" ON "RecoveryOpportunity"("companyId", "status", "recoveryScore");
CREATE INDEX IF NOT EXISTS "RecoveryOpportunity_sourceType_createdAt_idx" ON "RecoveryOpportunity"("sourceType", "createdAt");

INSERT INTO "WebscrapingOperationalConfig" (
  "key",
  "enabled",
  "preset",
  "startHour",
  "startMinute",
  "endHour",
  "endMinute",
  "engineCount",
  "intensity",
  "memoryTargetGb",
  "batchSize",
  "maxAttemptsPerTask",
  "engineUrlsJson",
  "metadataJson",
  "createdAt",
  "updatedAt"
) VALUES (
  'night_factory',
  true,
  'night_factory',
  0,
  0,
  6,
  0,
  4,
  'normal',
  12,
  50,
  3,
  '[]',
  '{"maxConcurrency":2,"maxLeadsPerNight":600,"enrichOnlyNewLeads":true,"allowWebsiteFetch":false,"allowScreenshot":false,"allowAiSuggestions":false,"allowRecoveryRevival":true,"allowVendasQueuePush":false,"cpuSoftLimitPercent":75,"memorySoftLimitPercent":78}',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;
