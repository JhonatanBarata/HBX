import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type WebsiteLaunchMode = 'public' | 'admin';

export type CompanyWebsiteConfigRecord = {
  companyId: number;
  websiteEnabled: boolean;
  websitePublicUrl: string | null;
  websiteAdminUrl: string | null;
  websiteProjectId: string | null;
  websiteAdminEnabled: boolean;
  websiteLaunchMode: WebsiteLaunchMode;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type WebsiteAdminEntryTokenRecord = {
  id: string;
  companyId: number;
  userId: number;
  websiteProjectId: string;
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
  usedByIp: string | null;
};

function normalizeOptionalString(value: unknown) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function normalizeLaunchMode(value: unknown): WebsiteLaunchMode {
  return String(value || '').trim().toLowerCase() === 'admin' ? 'admin' : 'public';
}

function mapConfigRow(row: any): CompanyWebsiteConfigRecord {
  return {
    companyId: Number(row.companyId || 0),
    websiteEnabled: Boolean(row.websiteEnabled),
    websitePublicUrl: normalizeOptionalString(row.websitePublicUrl),
    websiteAdminUrl: normalizeOptionalString(row.websiteAdminUrl),
    websiteProjectId: normalizeOptionalString(row.websiteProjectId),
    websiteAdminEnabled: Boolean(row.websiteAdminEnabled),
    websiteLaunchMode: normalizeLaunchMode(row.websiteLaunchMode),
    createdAt: row.createdAt instanceof Date ? row.createdAt : row.createdAt ? new Date(row.createdAt) : null,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt : row.updatedAt ? new Date(row.updatedAt) : null,
  };
}

function mapEntryRow(row: any): WebsiteAdminEntryTokenRecord {
  return {
    id: String(row.id || ''),
    companyId: Number(row.companyId || 0),
    userId: Number(row.userId || 0),
    websiteProjectId: String(row.websiteProjectId || ''),
    createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
    expiresAt: row.expiresAt instanceof Date ? row.expiresAt : new Date(row.expiresAt),
    usedAt: row.usedAt instanceof Date ? row.usedAt : row.usedAt ? new Date(row.usedAt) : null,
    usedByIp: normalizeOptionalString(row.usedByIp),
  };
}

let websiteRuntimeEnsured = false;
let websiteRuntimeEnsurePromise: Promise<void> | null = null;

export async function ensureWebsiteRuntimeSchema(prisma: PrismaService) {
  if (websiteRuntimeEnsured) return;
  if (websiteRuntimeEnsurePromise) return websiteRuntimeEnsurePromise;

  websiteRuntimeEnsurePromise = ensureWebsiteRuntimeSchemaUncached(prisma)
    .then(() => {
      websiteRuntimeEnsured = true;
    })
    .finally(() => {
      websiteRuntimeEnsurePromise = null;
    });

  return websiteRuntimeEnsurePromise;
}

async function ensureWebsiteRuntimeSchemaUncached(prisma: PrismaService) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CompanyWebsiteConfig" (
      "companyId" INTEGER PRIMARY KEY REFERENCES "Company"("id") ON DELETE CASCADE,
      "websiteEnabled" BOOLEAN NOT NULL DEFAULT false,
      "websitePublicUrl" TEXT,
      "websiteAdminUrl" TEXT,
      "websiteProjectId" TEXT,
      "websiteAdminEnabled" BOOLEAN NOT NULL DEFAULT false,
      "websiteLaunchMode" TEXT NOT NULL DEFAULT 'public',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "CompanyWebsiteConfig_project_idx" ON "CompanyWebsiteConfig"("websiteProjectId")',
  );

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "WebsiteAdminEntryToken" (
      "id" TEXT PRIMARY KEY,
      "companyId" INTEGER NOT NULL REFERENCES "Company"("id") ON DELETE CASCADE,
      "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
      "websiteProjectId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "usedAt" TIMESTAMP(3),
      "usedByIp" TEXT
    )
  `);

  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "WebsiteAdminEntryToken_companyId_expiresAt_idx" ON "WebsiteAdminEntryToken"("companyId", "expiresAt")',
  );
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "WebsiteAdminEntryToken_userId_expiresAt_idx" ON "WebsiteAdminEntryToken"("userId", "expiresAt")',
  );
}

export async function listCompanyWebsiteConfigs(
  prisma: PrismaService,
  companyIds?: number[],
) {
  await ensureWebsiteRuntimeSchema(prisma);
  const normalizedIds = Array.from(
    new Set((companyIds || []).map((value) => Number(value || 0)).filter((value) => value > 0)),
  );

  const whereClause = normalizedIds.length
    ? Prisma.sql`WHERE c."companyId" IN (${Prisma.join(normalizedIds)})`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
    SELECT
      c."companyId",
      c."websiteEnabled",
      c."websitePublicUrl",
      c."websiteAdminUrl",
      c."websiteProjectId",
      c."websiteAdminEnabled",
      c."websiteLaunchMode",
      c."createdAt",
      c."updatedAt"
    FROM "CompanyWebsiteConfig" c
    ${whereClause}
  `);

  const byCompanyId = new Map<number, CompanyWebsiteConfigRecord>();
  for (const row of rows) {
    const config = mapConfigRow(row);
    byCompanyId.set(config.companyId, config);
  }
  return byCompanyId;
}

export async function getCompanyWebsiteConfig(prisma: PrismaService, companyId: number) {
  const byCompanyId = await listCompanyWebsiteConfigs(prisma, [companyId]);
  return byCompanyId.get(Number(companyId)) || null;
}

export async function upsertCompanyWebsiteConfig(
  prisma: PrismaService,
  input: {
    companyId: number;
    websiteEnabled: boolean;
    websitePublicUrl?: string | null;
    websiteAdminUrl?: string | null;
    websiteProjectId?: string | null;
    websiteAdminEnabled: boolean;
    websiteLaunchMode: WebsiteLaunchMode;
  },
) {
  await ensureWebsiteRuntimeSchema(prisma);
  const now = new Date();
  const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
    INSERT INTO "CompanyWebsiteConfig"
    (
      "companyId",
      "websiteEnabled",
      "websitePublicUrl",
      "websiteAdminUrl",
      "websiteProjectId",
      "websiteAdminEnabled",
      "websiteLaunchMode",
      "createdAt",
      "updatedAt"
    )
    VALUES
    (
      ${Number(input.companyId)},
      ${Boolean(input.websiteEnabled)},
      ${normalizeOptionalString(input.websitePublicUrl)},
      ${normalizeOptionalString(input.websiteAdminUrl)},
      ${normalizeOptionalString(input.websiteProjectId)},
      ${Boolean(input.websiteAdminEnabled)},
      ${normalizeLaunchMode(input.websiteLaunchMode)},
      ${now},
      ${now}
    )
    ON CONFLICT ("companyId") DO UPDATE SET
      "websiteEnabled" = EXCLUDED."websiteEnabled",
      "websitePublicUrl" = EXCLUDED."websitePublicUrl",
      "websiteAdminUrl" = EXCLUDED."websiteAdminUrl",
      "websiteProjectId" = EXCLUDED."websiteProjectId",
      "websiteAdminEnabled" = EXCLUDED."websiteAdminEnabled",
      "websiteLaunchMode" = EXCLUDED."websiteLaunchMode",
      "updatedAt" = EXCLUDED."updatedAt"
    RETURNING
      "companyId",
      "websiteEnabled",
      "websitePublicUrl",
      "websiteAdminUrl",
      "websiteProjectId",
      "websiteAdminEnabled",
      "websiteLaunchMode",
      "createdAt",
      "updatedAt"
  `);

  return rows[0] ? mapConfigRow(rows[0]) : null;
}

export async function createWebsiteAdminEntryTokenRecord(
  prisma: PrismaService,
  input: {
    id: string;
    companyId: number;
    userId: number;
    websiteProjectId: string;
    expiresAt: Date;
  },
) {
  await ensureWebsiteRuntimeSchema(prisma);
  await prisma.$executeRaw`
    INSERT INTO "WebsiteAdminEntryToken"
    ("id", "companyId", "userId", "websiteProjectId", "createdAt", "expiresAt")
    VALUES
    (${input.id}, ${Number(input.companyId)}, ${Number(input.userId)}, ${String(input.websiteProjectId)}, ${new Date()}, ${input.expiresAt})
  `;
}

export async function getWebsiteAdminEntryTokenRecord(prisma: PrismaService, id: string) {
  await ensureWebsiteRuntimeSchema(prisma);
  const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
    SELECT
      t."id",
      t."companyId",
      t."userId",
      t."websiteProjectId",
      t."createdAt",
      t."expiresAt",
      t."usedAt",
      t."usedByIp"
    FROM "WebsiteAdminEntryToken" t
    WHERE t."id" = ${String(id)}
    LIMIT 1
  `);
  return rows[0] ? mapEntryRow(rows[0]) : null;
}

export async function consumeWebsiteAdminEntryTokenRecord(
  prisma: PrismaService,
  id: string,
  usedByIp?: string | null,
) {
  await ensureWebsiteRuntimeSchema(prisma);
  const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
    UPDATE "WebsiteAdminEntryToken"
    SET
      "usedAt" = ${new Date()},
      "usedByIp" = ${normalizeOptionalString(usedByIp)}
    WHERE "id" = ${String(id)} AND "usedAt" IS NULL
    RETURNING
      "id",
      "companyId",
      "userId",
      "websiteProjectId",
      "createdAt",
      "expiresAt",
      "usedAt",
      "usedByIp"
  `);
  return rows[0] ? mapEntryRow(rows[0]) : null;
}
