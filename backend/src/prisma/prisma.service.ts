import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly schemaCapabilityCache = new Map<string, boolean>();

  async onModuleInit() {
    // Log DB URL at startup to help diagnose multiple DB instances
    try {
      // eslint-disable-next-line no-console
      console.log('Prisma connecting to DATABASE_URL=', process.env.DATABASE_URL);
    } catch (e) {}
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  private isSqliteUrl() {
    const databaseUrl = String(process.env.DATABASE_URL || '').trim().toLowerCase();
    return databaseUrl.startsWith('file:') || databaseUrl.endsWith('.db');
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
}
