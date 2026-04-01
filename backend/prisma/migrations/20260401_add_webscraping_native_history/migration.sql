CREATE TABLE IF NOT EXISTS "WebscrapingSearchHistory" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "city" TEXT NOT NULL,
  "segment" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "filtersJson" TEXT NOT NULL,
  "searchSignature" TEXT NOT NULL,
  "resultCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WebscrapingSearchHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WebscrapingSearchPlace" (
  "id" TEXT NOT NULL,
  "searchHistoryId" TEXT NOT NULL,
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
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WebscrapingSearchPlace_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WebscrapingSearchHistory_companyId_searchSignature_key"
ON "WebscrapingSearchHistory"("companyId", "searchSignature");

CREATE INDEX IF NOT EXISTS "WebscrapingSearchHistory_companyId_lastUsedAt_idx"
ON "WebscrapingSearchHistory"("companyId", "lastUsedAt");

CREATE INDEX IF NOT EXISTS "WebscrapingSearchHistory_companyId_createdAt_idx"
ON "WebscrapingSearchHistory"("companyId", "createdAt");

CREATE INDEX IF NOT EXISTS "WebscrapingSearchHistory_userId_lastUsedAt_idx"
ON "WebscrapingSearchHistory"("userId", "lastUsedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "WebscrapingSearchPlace_searchHistoryId_placeId_key"
ON "WebscrapingSearchPlace"("searchHistoryId", "placeId");

CREATE INDEX IF NOT EXISTS "WebscrapingSearchPlace_searchHistoryId_rank_idx"
ON "WebscrapingSearchPlace"("searchHistoryId", "rank");

CREATE INDEX IF NOT EXISTS "WebscrapingSearchPlace_searchHistoryId_phoneDigits_idx"
ON "WebscrapingSearchPlace"("searchHistoryId", "phoneDigits");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WebscrapingSearchHistory_companyId_fkey') THEN
    ALTER TABLE "WebscrapingSearchHistory"
    ADD CONSTRAINT "WebscrapingSearchHistory_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WebscrapingSearchHistory_userId_fkey') THEN
    ALTER TABLE "WebscrapingSearchHistory"
    ADD CONSTRAINT "WebscrapingSearchHistory_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WebscrapingSearchPlace_searchHistoryId_fkey') THEN
    ALTER TABLE "WebscrapingSearchPlace"
    ADD CONSTRAINT "WebscrapingSearchPlace_searchHistoryId_fkey"
    FOREIGN KEY ("searchHistoryId") REFERENCES "WebscrapingSearchHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
