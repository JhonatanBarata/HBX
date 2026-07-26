-- Baseline do drift: "VendasCardComplaint" existe em prod (criada fora do fluxo
-- de migrations) mas nenhuma migration a criava — isso travava `prisma migrate dev`
-- pra qualquer coluna nova do sistema. Arquivo 100% idempotente: em prod é no-op;
-- em banco novo cria a tabela exatamente como o schema manda.
CREATE TABLE IF NOT EXISTS "VendasCardComplaint" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER,
    "vendasLeadId" TEXT,
    "radarLeadId" TEXT,
    "leadName" TEXT,
    "leadPhone" TEXT,
    "leadCity" TEXT,
    "leadState" TEXT,
    "leadSegment" TEXT,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "refundedCards" INTEGER NOT NULL DEFAULT 0,
    "resolvedByUserId" INTEGER,
    "resolvedAt" TIMESTAMP(3),
    "internalNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendasCardComplaint_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "VendasCardComplaint_status_createdAt_idx" ON "VendasCardComplaint"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "VendasCardComplaint_companyId_createdAt_idx" ON "VendasCardComplaint"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "VendasCardComplaint_radarLeadId_idx" ON "VendasCardComplaint"("radarLeadId");

-- FK não tem IF NOT EXISTS — guarda por nome (db push usa a mesma convenção de nomes).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VendasCardComplaint_companyId_fkey') THEN
    ALTER TABLE "VendasCardComplaint" ADD CONSTRAINT "VendasCardComplaint_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VendasCardComplaint_userId_fkey') THEN
    ALTER TABLE "VendasCardComplaint" ADD CONSTRAINT "VendasCardComplaint_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
