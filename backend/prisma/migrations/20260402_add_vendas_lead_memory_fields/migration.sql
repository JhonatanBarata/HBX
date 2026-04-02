DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'VendasLead'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'VendasLead'
        AND column_name = 'primarySource'
    ) THEN
      ALTER TABLE "VendasLead"
      ADD COLUMN "primarySource" TEXT NOT NULL DEFAULT 'manual';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'VendasLead'
        AND column_name = 'timesSeen'
    ) THEN
      ALTER TABLE "VendasLead"
      ADD COLUMN "timesSeen" INTEGER NOT NULL DEFAULT 1;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'VendasLead'
        AND column_name = 'lastContactAt'
    ) THEN
      ALTER TABLE "VendasLead"
      ADD COLUMN "lastContactAt" TIMESTAMP(3);
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'VendasLead'
        AND column_name = 'attemptCount'
    ) THEN
      ALTER TABLE "VendasLead"
      ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'VendasLead'
        AND column_name = 'lastResult'
    ) THEN
      ALTER TABLE "VendasLead"
      ADD COLUMN "lastResult" TEXT;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'VendasLead'
        AND column_name = 'wasClosedBefore'
    ) THEN
      ALTER TABLE "VendasLead"
      ADD COLUMN "wasClosedBefore" BOOLEAN NOT NULL DEFAULT false;
    END IF;
  END IF;
END $$;
