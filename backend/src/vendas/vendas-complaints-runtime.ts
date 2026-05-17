import { PrismaService } from '../prisma/prisma.service';

let vendasComplaintsRuntimeEnsured = false;
let vendasComplaintsRuntimeEnsurePromise: Promise<void> | null = null;

export async function ensureVendasComplaintsRuntimeSchema(prisma: PrismaService) {
  if (vendasComplaintsRuntimeEnsured) return;
  if (vendasComplaintsRuntimeEnsurePromise) return vendasComplaintsRuntimeEnsurePromise;

  vendasComplaintsRuntimeEnsurePromise = ensureVendasComplaintsRuntimeSchemaUncached(prisma)
    .then(() => {
      vendasComplaintsRuntimeEnsured = true;
    })
    .finally(() => {
      vendasComplaintsRuntimeEnsurePromise = null;
    });

  return vendasComplaintsRuntimeEnsurePromise;
}

async function ensureVendasComplaintsRuntimeSchemaUncached(prisma: PrismaService) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "VendasCardComplaint" (
      "id" TEXT PRIMARY KEY,
      "companyId" INTEGER NOT NULL REFERENCES "Company"("id") ON DELETE CASCADE,
      "userId" INTEGER REFERENCES "User"("id") ON DELETE SET NULL,
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
      "resolvedByUserId" INTEGER REFERENCES "User"("id") ON DELETE SET NULL,
      "resolvedAt" TIMESTAMP(3),
      "internalNote" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "VendasCardComplaint"
    ADD COLUMN IF NOT EXISTS "refundedCards" INTEGER NOT NULL DEFAULT 0
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "VendasCardComplaint"
    ADD COLUMN IF NOT EXISTS "resolvedByUserId" INTEGER REFERENCES "User"("id") ON DELETE SET NULL
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "VendasCardComplaint"
    ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3)
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "VendasCardComplaint"
    ADD COLUMN IF NOT EXISTS "internalNote" TEXT
  `);

  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "VendasCardComplaint_status_createdAt_idx" ON "VendasCardComplaint"("status", "createdAt")',
  );
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "VendasCardComplaint_companyId_createdAt_idx" ON "VendasCardComplaint"("companyId", "createdAt")',
  );
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "VendasCardComplaint_radarLeadId_idx" ON "VendasCardComplaint"("radarLeadId")',
  );
}
