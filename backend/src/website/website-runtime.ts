import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
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
  websiteCaptureToken: string | null;
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
    websiteCaptureToken: normalizeOptionalString(row.websiteCaptureToken),
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

  // COLD-22: token opaco de captura pública (form do site → lead). Nunca expor companyId cru
  // na URL pública; o site do cliente aponta pro endpoint com este token, não com o id.
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "CompanyWebsiteConfig" ADD COLUMN IF NOT EXISTS "websiteCaptureToken" TEXT',
  );
  await prisma.$executeRawUnsafe(
    'CREATE UNIQUE INDEX IF NOT EXISTS "CompanyWebsiteConfig_captureToken_key" ON "CompanyWebsiteConfig"("websiteCaptureToken")',
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
      c."websiteCaptureToken",
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
      "websiteCaptureToken",
      "createdAt",
      "updatedAt"
  `);

  return rows[0] ? mapConfigRow(rows[0]) : null;
}

// COLD-22: token opaco (nunca companyId cru na URL pública) que o site do cliente usa pra
// apontar o formulário de captura pro backend. Emite se a empresa ainda não tiver um; se já
// tiver linha de config sem token (empresa criada antes desta feature), gera e grava agora.
function generateCaptureToken() {
  return randomBytes(24).toString('hex'); // 48 chars hex — opaco, não sequencial.
}

export async function ensureWebsiteCaptureToken(prisma: PrismaService, companyId: number): Promise<string> {
  await ensureWebsiteRuntimeSchema(prisma);
  const normalizedCompanyId = Number(companyId || 0);

  const existing = await prisma.$queryRaw<Array<any>>(Prisma.sql`
    SELECT "websiteCaptureToken" FROM "CompanyWebsiteConfig" WHERE "companyId" = ${normalizedCompanyId} LIMIT 1
  `);
  const currentToken = normalizeOptionalString(existing[0]?.websiteCaptureToken);
  if (currentToken) return currentToken;

  // Tenta algumas vezes por causa da chance (mínima) de colisão no índice único.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = generateCaptureToken();
    try {
      const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
        INSERT INTO "CompanyWebsiteConfig" ("companyId", "websiteCaptureToken", "createdAt", "updatedAt")
        VALUES (${normalizedCompanyId}, ${token}, ${new Date()}, ${new Date()})
        ON CONFLICT ("companyId") DO UPDATE SET
          "websiteCaptureToken" = COALESCE("CompanyWebsiteConfig"."websiteCaptureToken", EXCLUDED."websiteCaptureToken"),
          "updatedAt" = CASE
            WHEN "CompanyWebsiteConfig"."websiteCaptureToken" IS NULL THEN EXCLUDED."updatedAt"
            ELSE "CompanyWebsiteConfig"."updatedAt"
          END
        RETURNING "websiteCaptureToken"
      `);
      const savedToken = normalizeOptionalString(rows[0]?.websiteCaptureToken);
      if (savedToken) return savedToken;
    } catch (error: any) {
      if (error?.code === 'P2010' || error?.code === '23505') continue; // colisão de índice único — tenta outro token
      throw error;
    }
  }
  throw new Error('Nao foi possivel gerar um websiteCaptureToken unico apos varias tentativas.');
}

export async function rotateWebsiteCaptureToken(prisma: PrismaService, companyId: number): Promise<string> {
  await ensureWebsiteRuntimeSchema(prisma);
  const normalizedCompanyId = Number(companyId || 0);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = generateCaptureToken();
    try {
      const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
        INSERT INTO "CompanyWebsiteConfig" ("companyId", "websiteCaptureToken", "createdAt", "updatedAt")
        VALUES (${normalizedCompanyId}, ${token}, ${new Date()}, ${new Date()})
        ON CONFLICT ("companyId") DO UPDATE SET
          "websiteCaptureToken" = EXCLUDED."websiteCaptureToken",
          "updatedAt" = EXCLUDED."updatedAt"
        RETURNING "websiteCaptureToken"
      `);
      const savedToken = normalizeOptionalString(rows[0]?.websiteCaptureToken);
      if (savedToken) return savedToken;
    } catch (error: any) {
      if (error?.code === 'P2010' || error?.code === '23505') continue;
      throw error;
    }
  }
  throw new Error('Nao foi possivel rotacionar o websiteCaptureToken apos varias tentativas.');
}

export async function getCompanyIdByCaptureToken(prisma: PrismaService, token: string): Promise<number | null> {
  await ensureWebsiteRuntimeSchema(prisma);
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) return null;
  const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
    SELECT "companyId" FROM "CompanyWebsiteConfig" WHERE "websiteCaptureToken" = ${normalizedToken} LIMIT 1
  `);
  const companyId = Number(rows[0]?.companyId || 0);
  return companyId > 0 ? companyId : null;
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

// Website-Kit Sprint 2 (cron sweep): limpa WebsiteAdminEntryToken vencidos.
// Prisma-model (a tabela existe via ensureWebsiteRuntimeSchema/migração); chamado
// pelo sweep diário do WebsiteService.
export async function deleteExpiredWebsiteAdminEntryTokens(prisma: PrismaService, olderThan: Date) {
  await ensureWebsiteRuntimeSchema(prisma);
  const { count } = await prisma.websiteAdminEntryToken.deleteMany({
    where: { expiresAt: { lt: olderThan } },
  });
  return count;
}
