ALTER TABLE "Entrega"
  ADD COLUMN IF NOT EXISTS "cancelIdempotencyKey" VARCHAR(100);

CREATE UNIQUE INDEX IF NOT EXISTS "Entrega_companyId_cancelIdempotencyKey_key"
  ON "Entrega"("companyId", "cancelIdempotencyKey");
