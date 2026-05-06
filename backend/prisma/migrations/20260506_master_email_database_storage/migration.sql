CREATE TABLE IF NOT EXISTS "MasterEmailTemplate" (
  "kind" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "html" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MasterEmailTemplate_pkey" PRIMARY KEY ("kind")
);

CREATE TABLE IF NOT EXISTS "MasterEmailAsset" (
  "key" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT,
  "size" INTEGER NOT NULL,
  "fileData" BYTEA NOT NULL,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MasterEmailAsset_pkey" PRIMARY KEY ("key")
);

CREATE TABLE IF NOT EXISTS "MasterEmailFormState" (
  "key" TEXT NOT NULL,
  "recipientName" TEXT,
  "recipientEmail" TEXT,
  "testEmail" TEXT,
  "sampleName" TEXT,
  "sampleCompany" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MasterEmailFormState_pkey" PRIMARY KEY ("key")
);
