ALTER TABLE "InboxTrashMeticulousPurgeJob"
ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'dry_run',
ADD COLUMN "providerHealthJson" TEXT;
