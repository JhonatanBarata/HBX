-- Baseline migration for SQLite (order-independent)
-- Note: Existing migration folders were created with names that sort before init.
-- To keep the repository stable while enabling prisma migrate dev/reset, this file
-- creates the full schema using IF NOT EXISTS and later migrations are no-ops.

PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS "Company" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "name" TEXT NOT NULL,
  "whatsappNumber" TEXT,
  "whatsappPhoneNumberId" TEXT,
  "timezone" TEXT DEFAULT 'America/Sao_Paulo',
  "createdAt" DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  "planId" INTEGER
);

CREATE TABLE IF NOT EXISTS "User" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "email" TEXT NOT NULL,
  "password" TEXT NOT NULL,
  "name" TEXT,
  "companyId" INTEGER,
  "role" TEXT NOT NULL DEFAULT 'USER',
  "createdAt" DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  CONSTRAINT "User_email_key" UNIQUE ("email"),
  FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Category" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  CONSTRAINT "Category_name_key" UNIQUE ("name")
);

CREATE TABLE IF NOT EXISTS "Product" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "price" REAL NOT NULL,
  "stock" INTEGER NOT NULL DEFAULT 0,
  "companyId" INTEGER,
  "categoryId" INTEGER,
  "createdAt" DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  "updatedAt" DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Plan" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "name" TEXT NOT NULL,
  "price" REAL NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS "Feature" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "key" TEXT NOT NULL,
  "description" TEXT,
  CONSTRAINT "Feature_key_key" UNIQUE ("key")
);

CREATE TABLE IF NOT EXISTS "PlanFeatures" (
  "planId" INTEGER NOT NULL,
  "featureId" INTEGER NOT NULL,
  PRIMARY KEY ("planId","featureId"),
  FOREIGN KEY ("planId") REFERENCES "Plan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("featureId") REFERENCES "Feature" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ProductVersion" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "productId" INTEGER NOT NULL,
  "data" TEXT NOT NULL,
  "authorId" INTEGER,
  "version" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "AutoReplyRule" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "companyId" INTEGER NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT 1,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "matchType" TEXT NOT NULL DEFAULT 'EXACT',
  "pattern" TEXT NOT NULL,
  "caseInsensitive" BOOLEAN NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "AutoReplyResponse" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "ruleId" INTEGER NOT NULL,
  "order" INTEGER NOT NULL,
  "delaySeconds" INTEGER NOT NULL DEFAULT 0,
  "template" TEXT NOT NULL,
  FOREIGN KEY ("ruleId") REFERENCES "AutoReplyRule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "InboundMessage" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "companyId" INTEGER NOT NULL,
  "from" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "receivedAt" DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "OutboundMessage" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "companyId" INTEGER NOT NULL,
  "to" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "provider" TEXT DEFAULT 'WHATSAPP_CLOUD',
  "providerMessageId" TEXT,
  "deliveryStatus" TEXT,
  "deliveredAt" DATETIME,
  "readAt" DATETIME,
  "failedAt" DATETIME,
  "lastWebhookAt" DATETIME,
  "lastWebhookPayload" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "nextAttemptAt" DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  "lastError" TEXT,
  "sentAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "OutboundMessage_providerMessageId_key" ON "OutboundMessage" ("providerMessageId");

CREATE TABLE IF NOT EXISTS "OutboundAttempt" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "messageId" INTEGER NOT NULL,
  "attemptNo" INTEGER NOT NULL,
  "startedAt" DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  "finishedAt" DATETIME,
  "success" BOOLEAN NOT NULL DEFAULT 0,
  "httpStatus" INTEGER,
  "requestBody" TEXT,
  "responseBody" TEXT,
  "error" TEXT,
  FOREIGN KEY ("messageId") REFERENCES "OutboundMessage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "WhatsAppWebhookEvent" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "receivedAt" DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  "kind" TEXT NOT NULL,
  "companyId" INTEGER,
  "providerMessageId" TEXT,
  "payload" TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "User_companyId_index" ON "User" ("companyId");
CREATE INDEX IF NOT EXISTS "Product_companyId_index" ON "Product" ("companyId");
CREATE INDEX IF NOT EXISTS "Product_categoryId_index" ON "Product" ("categoryId");
CREATE INDEX IF NOT EXISTS "Company_planId_index" ON "Company" ("planId");

COMMIT;
PRAGMA foreign_keys=ON;
