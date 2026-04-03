import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

function buildRuntimeDatabaseUrl() {
  const rawDatabaseUrl = String(process.env.DATABASE_URL || '').trim();
  if (!rawDatabaseUrl) {
    return rawDatabaseUrl;
  }

  const normalizedLower = rawDatabaseUrl.toLowerCase();
  if (normalizedLower.startsWith('file:') || normalizedLower.endsWith('.db')) {
    return rawDatabaseUrl;
  }

  try {
    const parsed = new URL(rawDatabaseUrl);
    const hostname = String(parsed.hostname || '').trim().toLowerCase();
    const isLocalHost = ['localhost', '127.0.0.1', '0.0.0.0', 'db'].includes(hostname);
    const isSupabasePooler = hostname.endsWith('.pooler.supabase.com');

    if (isLocalHost || !isSupabasePooler) {
      return rawDatabaseUrl;
    }

    if (!parsed.searchParams.get('connection_limit')) {
      parsed.searchParams.set('connection_limit', '2');
    }

    if (!parsed.searchParams.get('pool_timeout')) {
      parsed.searchParams.set('pool_timeout', '30');
    }

    return parsed.toString();
  } catch {
    return rawDatabaseUrl;
  }
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
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  private isSqliteUrl() {
    const databaseUrl = String(this.runtimeDatabaseUrl || process.env.DATABASE_URL || '').trim().toLowerCase();
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
