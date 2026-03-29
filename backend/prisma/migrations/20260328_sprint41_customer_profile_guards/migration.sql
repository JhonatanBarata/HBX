DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "CustomerProfile"
        WHERE "phoneNormalized" IS NOT NULL
        GROUP BY "companyId", "phoneNormalized"
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Cannot enforce CustomerProfile companyId + phoneNormalized uniqueness while duplicates still exist.';
    END IF;
END $$;

DROP INDEX IF EXISTS "CustomerProfile_companyId_phoneNormalized_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerProfile_companyId_phoneNormalized_key"
ON "CustomerProfile"("companyId", "phoneNormalized");