import { PrismaService } from '../prisma/prisma.service';

export async function ensureMasterBillingRuntimeSchema(prisma: PrismaService) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "MasterBillingLedgerEntry" (
      "id" TEXT PRIMARY KEY,
      "companyId" INTEGER NOT NULL REFERENCES "Company"("id") ON DELETE CASCADE,
      "entryType" TEXT NOT NULL,
      "entryGroup" TEXT NOT NULL DEFAULT 'revenue',
      "status" TEXT NOT NULL DEFAULT 'PENDING',
      "origin" TEXT,
      "currency" TEXT NOT NULL DEFAULT 'BRL',
      "competence" TEXT,
      "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "dueDate" TIMESTAMP(3),
      "paidAt" TIMESTAMP(3),
      "paymentMethod" TEXT,
      "referenceLabel" TEXT,
      "observation" TEXT,
      "metadata" TEXT,
      "createdByUserId" INTEGER REFERENCES "User"("id") ON DELETE SET NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "MasterBillingLedgerEntry_companyId_createdAt_idx" ON "MasterBillingLedgerEntry"("companyId", "createdAt")',
  );
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "MasterBillingLedgerEntry_companyId_paidAt_idx" ON "MasterBillingLedgerEntry"("companyId", "paidAt")',
  );
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "MasterBillingLedgerEntry_companyId_status_dueDate_idx" ON "MasterBillingLedgerEntry"("companyId", "status", "dueDate")',
  );
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "MasterBillingLedgerEntry_entryGroup_status_createdAt_idx" ON "MasterBillingLedgerEntry"("entryGroup", "status", "createdAt")',
  );
}
