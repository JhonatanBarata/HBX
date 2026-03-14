-- Add username for user login (nullable for existing rows)
ALTER TABLE "User" ADD COLUMN "username" TEXT;

-- Unique index (SQLite allows multiple NULLs in UNIQUE index)
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
