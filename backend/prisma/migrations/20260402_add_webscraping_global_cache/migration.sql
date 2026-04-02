CREATE TABLE "WebscrapingGlobalCacheEntry" (
  "id" TEXT NOT NULL,
  "cacheSignature" TEXT NOT NULL,
  "normalizedCity" TEXT NOT NULL,
  "normalizedSegment" TEXT NOT NULL,
  "filtersJson" TEXT NOT NULL,
  "resultCount" INTEGER NOT NULL DEFAULT 0,
  "cacheValidUntil" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "lastFetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastServedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WebscrapingGlobalCacheEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebscrapingGlobalCachePlace" (
  "id" TEXT NOT NULL,
  "cacheEntryId" TEXT NOT NULL,
  "placeId" TEXT NOT NULL,
  "rank" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "phoneDigits" TEXT NOT NULL,
  "probableWhatsApp" BOOLEAN NOT NULL DEFAULT false,
  "rating" DOUBLE PRECISION,
  "reviews" INTEGER NOT NULL DEFAULT 0,
  "address" TEXT NOT NULL,
  "website" TEXT NOT NULL,
  "googleMapsUrl" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WebscrapingGlobalCachePlace_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WebscrapingGlobalCacheEntry_cacheSignature_key" ON "WebscrapingGlobalCacheEntry"("cacheSignature");
CREATE INDEX "WebscrapingGlobalCacheEntry_normalizedCity_normalizedSegment_cacheValidUntil_idx" ON "WebscrapingGlobalCacheEntry"("normalizedCity", "normalizedSegment", "cacheValidUntil");
CREATE INDEX "WebscrapingGlobalCacheEntry_lastServedAt_idx" ON "WebscrapingGlobalCacheEntry"("lastServedAt");
CREATE UNIQUE INDEX "WebscrapingGlobalCachePlace_cacheEntryId_placeId_key" ON "WebscrapingGlobalCachePlace"("cacheEntryId", "placeId");
CREATE INDEX "WebscrapingGlobalCachePlace_cacheEntryId_rank_idx" ON "WebscrapingGlobalCachePlace"("cacheEntryId", "rank");
CREATE INDEX "WebscrapingGlobalCachePlace_cacheEntryId_phoneDigits_idx" ON "WebscrapingGlobalCachePlace"("cacheEntryId", "phoneDigits");

ALTER TABLE "WebscrapingGlobalCachePlace"
ADD CONSTRAINT "WebscrapingGlobalCachePlace_cacheEntryId_fkey"
FOREIGN KEY ("cacheEntryId") REFERENCES "WebscrapingGlobalCacheEntry"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
