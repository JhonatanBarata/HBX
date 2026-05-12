CREATE INDEX IF NOT EXISTS "CompanyCommercialUsageLog_companyId_userId_eventType_createdAt_idx"
ON "CompanyCommercialUsageLog"("companyId", "userId", "eventType", "createdAt");
