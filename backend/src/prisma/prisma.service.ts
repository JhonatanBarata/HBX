import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

function buildRuntimeDatabaseUrl() {
  return String(process.env.DATABASE_URL || '').trim();
}

function describeDatabaseTarget(databaseUrl: string) {
  if (!databaseUrl) {
    return 'DATABASE_URL not configured';
  }

  try {
    const parsed = new URL(databaseUrl);
    const databaseName = String(parsed.pathname || '').replace(/^\//, '') || null;
    const connectionLimit = parsed.searchParams.get('connection_limit');
    const poolTimeout = parsed.searchParams.get('pool_timeout');
    return [
      `host=${parsed.hostname || 'unknown'}`,
      parsed.port ? `port=${parsed.port}` : null,
      databaseName ? `database=${databaseName}` : null,
      connectionLimit ? `connection_limit=${connectionLimit}` : null,
      poolTimeout ? `pool_timeout=${poolTimeout}` : null,
    ]
      .filter(Boolean)
      .join(' ');
  } catch {
    return 'DATABASE_URL configured';
  }
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly schemaCapabilityCache = new Map<string, boolean>();
  private readonly runtimeDatabaseUrl: string;

  constructor() {
    const runtimeDatabaseUrl = buildRuntimeDatabaseUrl();
    super(
      runtimeDatabaseUrl
        ? {
            datasources: {
              db: {
                url: runtimeDatabaseUrl,
              },
            },
          }
        : undefined,
    );
    this.runtimeDatabaseUrl = runtimeDatabaseUrl;
  }

  async onModuleInit() {
    try {
      // eslint-disable-next-line no-console
      console.log('Prisma runtime target:', describeDatabaseTarget(this.runtimeDatabaseUrl || String(process.env.DATABASE_URL || '').trim()));
    } catch (e) {}
    await this.$connect();
    await this.ensureCompanyCommissionSettingsColumns();
    await this.ensureUserSalesProfileColumns();
    await this.ensureVendasLeadAssignmentColumns();
    await this.ensureVendasCommissionPayoutTables();
    await this.ensureVendasCommissionReceivableTables();
    await this.ensureRadarAutoDistributionRuleTables();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  private isSqliteUrl() {
    const databaseUrl = String(this.runtimeDatabaseUrl || process.env.DATABASE_URL || '').trim().toLowerCase();
    return databaseUrl.startsWith('file:') || databaseUrl.endsWith('.db');
  }

  private async ensureCompanyCommissionSettingsColumns() {
    await this.$executeRawUnsafe(`
      ALTER TABLE "Company"
      ADD COLUMN IF NOT EXISTS "commissionDueBusinessDays" INTEGER NOT NULL DEFAULT 3
    `);
  }

  async hasTable(tableName: string) {
    const normalizedTableName = String(tableName || '').trim();
    if (!normalizedTableName) return false;
    const cacheKey = `table:${normalizedTableName}`;
    if (this.schemaCapabilityCache.has(cacheKey)) {
      return Boolean(this.schemaCapabilityCache.get(cacheKey));
    }

    try {
      let exists = false;
      if (this.isSqliteUrl()) {
        const escapedTableName = normalizedTableName.replace(/'/g, "''");
        const rows = (await this.$queryRawUnsafe(
          `SELECT name FROM sqlite_master WHERE type = 'table' AND name = '${escapedTableName}' LIMIT 1`,
        )) as Array<{ name?: string }>;
        exists = Array.isArray(rows) && rows.length > 0;
      } else {
        const escapedTableName = normalizedTableName.replace(/'/g, "''");
        const rows = (await this.$queryRawUnsafe(
          `SELECT 1 AS present FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${escapedTableName}' LIMIT 1`,
        )) as Array<{ present?: number }>;
        exists = Array.isArray(rows) && rows.length > 0;
      }
      this.schemaCapabilityCache.set(cacheKey, exists);
      return exists;
    } catch {
      this.schemaCapabilityCache.set(cacheKey, false);
      return false;
    }
  }

  async hasColumn(tableName: string, columnName: string) {
    const normalizedTableName = String(tableName || '').trim();
    const normalizedColumnName = String(columnName || '').trim();
    if (!normalizedTableName || !normalizedColumnName) return false;
    const cacheKey = `column:${normalizedTableName}:${normalizedColumnName}`;
    if (this.schemaCapabilityCache.has(cacheKey)) {
      return Boolean(this.schemaCapabilityCache.get(cacheKey));
    }

    try {
      let exists = false;
      if (this.isSqliteUrl()) {
        const escapedTableName = normalizedTableName.replace(/"/g, '""');
        const rows = (await this.$queryRawUnsafe(
          `PRAGMA table_info("${escapedTableName}")`,
        )) as Array<{ name?: string }>;
        exists = Array.isArray(rows)
          ? rows.some((row) => String(row?.name || '').trim() === normalizedColumnName)
          : false;
      } else {
        const escapedTableName = normalizedTableName.replace(/'/g, "''");
        const escapedColumnName = normalizedColumnName.replace(/'/g, "''");
        const rows = (await this.$queryRawUnsafe(
          `SELECT 1 AS present FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${escapedTableName}' AND column_name = '${escapedColumnName}' LIMIT 1`,
        )) as Array<{ present?: number }>;
        exists = Array.isArray(rows) && rows.length > 0;
      }
      this.schemaCapabilityCache.set(cacheKey, exists);
      return exists;
    } catch {
      this.schemaCapabilityCache.set(cacheKey, false);
      return false;
    }
  }

  private async ensureUserSalesProfileColumns() {
    await this.$executeRawUnsafe(`
      ALTER TABLE "User"
      ADD COLUMN IF NOT EXISTS "phone" TEXT
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "User"
      ADD COLUMN IF NOT EXISTS "commissionPercent" DOUBLE PRECISION NOT NULL DEFAULT 0
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "User"
      ADD COLUMN IF NOT EXISTS "canRegisterHbxSellers" BOOLEAN NOT NULL DEFAULT false
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "User"
      ADD COLUMN IF NOT EXISTS "sellerReferralCommissionPercent" DOUBLE PRECISION NOT NULL DEFAULT 0
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "User"
      ADD COLUMN IF NOT EXISTS "referredByUserId" INTEGER
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "User"
      ADD COLUMN IF NOT EXISTS "referredByCommissionPercentSnapshot" DOUBLE PRECISION NOT NULL DEFAULT 0
    `);

    await this.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "User_referredByUserId_idx" ON "User"("referredByUserId")',
    );

    await this.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "User_canRegisterHbxSellers_idx" ON "User"("canRegisterHbxSellers")',
    );
  }

  private async ensureVendasLeadAssignmentColumns() {
    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "assignedUserId" INTEGER
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "assignedByUserId" INTEGER
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "assignedAt" TIMESTAMP(3)
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "commissionPercentSnapshot" DOUBLE PRECISION NOT NULL DEFAULT 0
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "saleStatus" TEXT NOT NULL DEFAULT 'none'
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "saleValue" DOUBLE PRECISION NOT NULL DEFAULT 0
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "salePlanKey" TEXT
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "saleConfirmedAt" TIMESTAMP(3)
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "saleCanceledAt" TIMESTAMP(3)
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "commissionStatus" TEXT NOT NULL DEFAULT 'none'
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "commissionBaseAmount" DOUBLE PRECISION NOT NULL DEFAULT 0
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "commissionAmount" DOUBLE PRECISION NOT NULL DEFAULT 0
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "commissionDueAt" TIMESTAMP(3)
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "commissionPaidAt" TIMESTAMP(3)
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "commissionRecurring" BOOLEAN NOT NULL DEFAULT false
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "commissionNote" TEXT
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "commissionLinkedCompanyId" INTEGER
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "commissionLinkedAt" TIMESTAMP(3)
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "commissionAutoSyncedAt" TIMESTAMP(3)
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "commissionSyncSource" TEXT
    `);

    await this.$executeRawUnsafe(`
      ALTER TABLE "VendasLead"
      ADD COLUMN IF NOT EXISTS "commissionPayoutId" TEXT
    `);

    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "VendasLead_assignedUserId_status_idx" ON "VendasLead"("assignedUserId", "status")
    `);

    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "VendasLead_assignedUserId_commissionStatus_idx" ON "VendasLead"("assignedUserId", "commissionStatus")
    `);

    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "VendasLead_companyId_saleStatus_idx" ON "VendasLead"("companyId", "saleStatus")
    `);

    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "VendasLead_commissionLinkedCompanyId_idx" ON "VendasLead"("commissionLinkedCompanyId")
    `);

    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "VendasLead_commissionPayoutId_idx" ON "VendasLead"("commissionPayoutId")
    `);
  }

  private async ensureVendasCommissionPayoutTables() {
    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "VendasCommissionPayout" (
        "id" TEXT NOT NULL,
        "companyId" INTEGER NOT NULL,
        "sellerUserId" INTEGER,
        "status" TEXT NOT NULL DEFAULT 'paid',
        "leadCount" INTEGER NOT NULL DEFAULT 0,
        "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "referenceLabel" TEXT,
        "notes" TEXT,
        "paidAt" TIMESTAMP(3),
        "createdByUserId" INTEGER,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "VendasCommissionPayout_pkey" PRIMARY KEY ("id")
      )
    `);

    await this.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'VendasCommissionPayout_companyId_fkey'
        ) THEN
          ALTER TABLE "VendasCommissionPayout"
          ADD CONSTRAINT "VendasCommissionPayout_companyId_fkey"
          FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$
    `);

    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "VendasCommissionPayout_companyId_paidAt_idx" ON "VendasCommissionPayout"("companyId", "paidAt")
    `);

    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "VendasCommissionPayout_sellerUserId_paidAt_idx" ON "VendasCommissionPayout"("sellerUserId", "paidAt")
    `);
  }

  private async ensureVendasCommissionReceivableTables() {
    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "VendasCommissionReceivable" (
        "id" TEXT NOT NULL,
        "companyId" INTEGER NOT NULL,
        "leadId" TEXT NOT NULL,
        "sellerUserId" INTEGER,
        "linkedCompanyId" INTEGER,
        "cycleKey" TEXT NOT NULL,
        "kind" TEXT NOT NULL DEFAULT 'recurring',
        "status" TEXT NOT NULL DEFAULT 'payable',
        "baseAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "commissionPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "dueAt" TIMESTAMP(3),
        "paidAt" TIMESTAMP(3),
        "payoutId" TEXT,
        "source" TEXT NOT NULL DEFAULT 'hbx_recurring',
        "createdByUserId" INTEGER,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "VendasCommissionReceivable_pkey" PRIMARY KEY ("id")
      )
    `);

    await this.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'VendasCommissionReceivable_companyId_fkey'
        ) THEN
          ALTER TABLE "VendasCommissionReceivable"
          ADD CONSTRAINT "VendasCommissionReceivable_companyId_fkey"
          FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'VendasCommissionReceivable_leadId_fkey'
        ) THEN
          ALTER TABLE "VendasCommissionReceivable"
          ADD CONSTRAINT "VendasCommissionReceivable_leadId_fkey"
          FOREIGN KEY ("leadId") REFERENCES "VendasLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$
    `);

    await this.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "VendasCommissionReceivable_leadId_cycleKey_kind_key" ON "VendasCommissionReceivable"("leadId", "cycleKey", "kind")
    `);

    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "VendasCommissionReceivable_companyId_status_dueAt_idx" ON "VendasCommissionReceivable"("companyId", "status", "dueAt")
    `);

    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "VendasCommissionReceivable_sellerUserId_status_dueAt_idx" ON "VendasCommissionReceivable"("sellerUserId", "status", "dueAt")
    `);

    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "VendasCommissionReceivable_linkedCompanyId_idx" ON "VendasCommissionReceivable"("linkedCompanyId")
    `);

    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "VendasCommissionReceivable_payoutId_idx" ON "VendasCommissionReceivable"("payoutId")
    `);

    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "VendasCommissionReceivable_cycleKey_idx" ON "VendasCommissionReceivable"("cycleKey")
    `);
  }

  private async ensureRadarAutoDistributionRuleTables() {
    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "RadarAutoDistributionRule" (
        "id" TEXT NOT NULL,
        "companyId" INTEGER NOT NULL,
        "scope" TEXT NOT NULL DEFAULT 'company',
        "status" TEXT NOT NULL DEFAULT 'draft',
        "includeAdmin" BOOLEAN NOT NULL DEFAULT false,
        "adminUserId" INTEGER,
        "adminTargetStock" INTEGER NOT NULL DEFAULT 0,
        "targetStockPerSeller" INTEGER NOT NULL DEFAULT 30,
        "preferredState" TEXT,
        "preferredCity" TEXT,
        "segment" TEXT,
        "categoryKey" TEXT,
        "radiusKm" INTEGER,
        "targetUserIdsJson" TEXT,
        "filtersJson" TEXT,
        "createdByUserId" INTEGER,
        "updatedByUserId" INTEGER,
        "lastActivatedAt" TIMESTAMP(3),
        "lastRunAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "RadarAutoDistributionRule_pkey" PRIMARY KEY ("id")
      )
    `);

    await this.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'RadarAutoDistributionRule_companyId_fkey'
        ) THEN
          ALTER TABLE "RadarAutoDistributionRule"
          ADD CONSTRAINT "RadarAutoDistributionRule_companyId_fkey"
          FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;
    `);

    await this.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "RadarAutoDistributionRule_companyId_scope_key" ON "RadarAutoDistributionRule"("companyId", "scope")
    `);
    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "RadarAutoDistributionRule_companyId_status_idx" ON "RadarAutoDistributionRule"("companyId", "status")
    `);
    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "RadarAutoDistributionRule_companyId_updatedAt_idx" ON "RadarAutoDistributionRule"("companyId", "updatedAt")
    `);
  }
}
