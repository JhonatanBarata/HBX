/*
  Warnings:

  - You are about to drop the `PlanFeatures` table. If the table is not empty, all the data it contains will be lost.
  - The primary key for the `_PlanFeatures` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "PlanFeatures";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "PasswordReset" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "token" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AutoReplyResponse" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ruleId" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "delaySeconds" INTEGER NOT NULL DEFAULT 0,
    "template" TEXT NOT NULL,
    CONSTRAINT "AutoReplyResponse_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutoReplyRule" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AutoReplyResponse" ("delaySeconds", "id", "order", "ruleId", "template") SELECT "delaySeconds", "id", "order", "ruleId", "template" FROM "AutoReplyResponse";
DROP TABLE "AutoReplyResponse";
ALTER TABLE "new_AutoReplyResponse" RENAME TO "AutoReplyResponse";
CREATE TABLE "new_AutoReplyRule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companyId" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "matchType" TEXT NOT NULL DEFAULT 'EXACT',
    "pattern" TEXT NOT NULL,
    "caseInsensitive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutoReplyRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AutoReplyRule" ("caseInsensitive", "companyId", "createdAt", "enabled", "id", "matchType", "pattern", "priority") SELECT "caseInsensitive", "companyId", "createdAt", "enabled", "id", "matchType", "pattern", "priority" FROM "AutoReplyRule";
DROP TABLE "AutoReplyRule";
ALTER TABLE "new_AutoReplyRule" RENAME TO "AutoReplyRule";
CREATE TABLE "new_Company" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "whatsappNumber" TEXT,
    "whatsappPhoneNumberId" TEXT,
    "timezone" TEXT DEFAULT 'America/Sao_Paulo',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "planId" INTEGER,
    CONSTRAINT "Company_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Company" ("createdAt", "id", "name", "planId", "slug", "timezone", "whatsappNumber", "whatsappPhoneNumberId") SELECT "createdAt", "id", "name", "planId", "slug", "timezone", "whatsappNumber", "whatsappPhoneNumberId" FROM "Company";
DROP TABLE "Company";
ALTER TABLE "new_Company" RENAME TO "Company";
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");
CREATE TABLE "new_ConversationSession" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companyId" INTEGER NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "from" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'NEW',
    "context" TEXT,
    "lastMessageAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ConversationSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ConversationSession" ("channel", "companyId", "context", "createdAt", "expiresAt", "from", "id", "lastMessageAt", "state", "updatedAt") SELECT "channel", "companyId", "context", "createdAt", "expiresAt", "from", "id", "lastMessageAt", "state", "updatedAt" FROM "ConversationSession";
DROP TABLE "ConversationSession";
ALTER TABLE "new_ConversationSession" RENAME TO "ConversationSession";
CREATE INDEX "ConversationSession_companyId_from_channel_idx" ON "ConversationSession"("companyId", "from", "channel");
CREATE INDEX "ConversationSession_expiresAt_idx" ON "ConversationSession"("expiresAt");
CREATE TABLE "new_InboundMessage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companyId" INTEGER NOT NULL,
    "from" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InboundMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_InboundMessage" ("body", "companyId", "from", "id", "receivedAt") SELECT "body", "companyId", "from", "id", "receivedAt" FROM "InboundMessage";
DROP TABLE "InboundMessage";
ALTER TABLE "new_InboundMessage" RENAME TO "InboundMessage";
CREATE TABLE "new_OrderDraft" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companyId" INTEGER NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "items" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrderDraft_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OrderDraft_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ConversationSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_OrderDraft" ("companyId", "createdAt", "id", "items", "sessionId", "status", "updatedAt") SELECT "companyId", "createdAt", "id", "items", "sessionId", "status", "updatedAt" FROM "OrderDraft";
DROP TABLE "OrderDraft";
ALTER TABLE "new_OrderDraft" RENAME TO "OrderDraft";
CREATE UNIQUE INDEX "OrderDraft_sessionId_key" ON "OrderDraft"("sessionId");
CREATE INDEX "OrderDraft_companyId_idx" ON "OrderDraft"("companyId");
CREATE TABLE "new_OutboundAttempt" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "messageId" INTEGER NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "httpStatus" INTEGER,
    "requestBody" TEXT,
    "responseBody" TEXT,
    "error" TEXT,
    CONSTRAINT "OutboundAttempt_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "OutboundMessage" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_OutboundAttempt" ("attemptNo", "error", "finishedAt", "httpStatus", "id", "messageId", "requestBody", "responseBody", "startedAt", "success") SELECT "attemptNo", "error", "finishedAt", "httpStatus", "id", "messageId", "requestBody", "responseBody", "startedAt", "success" FROM "OutboundAttempt";
DROP TABLE "OutboundAttempt";
ALTER TABLE "new_OutboundAttempt" RENAME TO "OutboundAttempt";
CREATE TABLE "new_OutboundMessage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
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
    "nextAttemptAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OutboundMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_OutboundMessage" ("attemptCount", "body", "companyId", "createdAt", "deliveredAt", "deliveryStatus", "failedAt", "id", "lastError", "lastWebhookAt", "lastWebhookPayload", "maxAttempts", "nextAttemptAt", "provider", "providerMessageId", "readAt", "sentAt", "status", "to") SELECT "attemptCount", "body", "companyId", "createdAt", "deliveredAt", "deliveryStatus", "failedAt", "id", "lastError", "lastWebhookAt", "lastWebhookPayload", "maxAttempts", "nextAttemptAt", "provider", "providerMessageId", "readAt", "sentAt", "status", "to" FROM "OutboundMessage";
DROP TABLE "OutboundMessage";
ALTER TABLE "new_OutboundMessage" RENAME TO "OutboundMessage";
CREATE UNIQUE INDEX "OutboundMessage_providerMessageId_key" ON "OutboundMessage"("providerMessageId");
CREATE TABLE "new_Product" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" REAL NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "companyId" INTEGER,
    "categoryId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Product" ("categoryId", "companyId", "createdAt", "description", "id", "name", "price", "stock", "updatedAt") SELECT "categoryId", "companyId", "createdAt", "description", "id", "name", "price", "stock", "updatedAt" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE TABLE "new_ProductVersion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "productId" INTEGER NOT NULL,
    "data" TEXT NOT NULL,
    "authorId" INTEGER,
    "version" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductVersion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProductVersion_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ProductVersion" ("authorId", "createdAt", "data", "id", "productId", "version") SELECT "authorId", "createdAt", "data", "id", "productId", "version" FROM "ProductVersion";
DROP TABLE "ProductVersion";
ALTER TABLE "new_ProductVersion" RENAME TO "ProductVersion";
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT,
    "username" TEXT,
    "password" TEXT NOT NULL,
    "name" TEXT,
    "companyId" INTEGER,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("companyId", "createdAt", "email", "id", "name", "password", "role") SELECT "companyId", "createdAt", "email", "id", "name", "password", "role" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE TABLE "new__PlanFeatures" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,
    CONSTRAINT "_PlanFeatures_A_fkey" FOREIGN KEY ("A") REFERENCES "Feature" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_PlanFeatures_B_fkey" FOREIGN KEY ("B") REFERENCES "Plan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new__PlanFeatures" ("A", "B") SELECT "A", "B" FROM "_PlanFeatures";
DROP TABLE "_PlanFeatures";
ALTER TABLE "new__PlanFeatures" RENAME TO "_PlanFeatures";
CREATE UNIQUE INDEX "_PlanFeatures_AB_unique" ON "_PlanFeatures"("A", "B");
CREATE INDEX "_PlanFeatures_B_index" ON "_PlanFeatures"("B");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PasswordReset_token_key" ON "PasswordReset"("token");

-- RedefineIndex
-- NOTE: SQLite cannot drop "sqlite_autoindex_*" indexes because they back
-- UNIQUE/PRIMARY KEY constraints.
CREATE UNIQUE INDEX IF NOT EXISTS "Category_name_key" ON "Category"("name");

-- RedefineIndex
-- NOTE: SQLite cannot drop "sqlite_autoindex_*" indexes because they back
-- UNIQUE/PRIMARY KEY constraints.
CREATE UNIQUE INDEX IF NOT EXISTS "Feature_key_key" ON "Feature"("key");
