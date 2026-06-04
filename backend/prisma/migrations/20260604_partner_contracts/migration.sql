CREATE TABLE IF NOT EXISTS "partner_contracts" (
  "id" TEXT NOT NULL,
  "partner_id" INTEGER NOT NULL,
  "contract_pdf_url" TEXT,
  "signed_pdf_url" TEXT,
  "status" TEXT NOT NULL DEFAULT 'generated',
  "sent_at" TIMESTAMP(3),
  "uploaded_at" TIMESTAMP(3),
  "approved_at" TIMESTAMP(3),
  "approved_by" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "partner_contracts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "partner_contracts_partner_id_key" ON "partner_contracts"("partner_id");
CREATE INDEX IF NOT EXISTS "partner_contracts_status_idx" ON "partner_contracts"("status");
CREATE INDEX IF NOT EXISTS "partner_contracts_approved_by_idx" ON "partner_contracts"("approved_by");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'partner_contracts_partner_id_fkey'
  ) THEN
    ALTER TABLE "partner_contracts"
      ADD CONSTRAINT "partner_contracts_partner_id_fkey"
      FOREIGN KEY ("partner_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'partner_contracts_approved_by_fkey'
  ) THEN
    ALTER TABLE "partner_contracts"
      ADD CONSTRAINT "partner_contracts_approved_by_fkey"
      FOREIGN KEY ("approved_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
