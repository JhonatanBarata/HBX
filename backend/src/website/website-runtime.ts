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

function mapConfigRow(row: {
  companyId: number;
  websiteEnabled: boolean;
  websitePublicUrl: string | null;
  websiteAdminUrl: string | null;
  websiteProjectId: string | null;
  websiteAdminEnabled: boolean;
  websiteLaunchMode: string;
  createdAt: Date;
  updatedAt: Date;
}): CompanyWebsiteConfigRecord {
  return {
    companyId: Number(row.companyId || 0),
    websiteEnabled: Boolean(row.websiteEnabled),
    websitePublicUrl: normalizeOptionalString(row.websitePublicUrl),
    websiteAdminUrl: normalizeOptionalString(row.websiteAdminUrl),
    websiteProjectId: normalizeOptionalString(row.websiteProjectId),
    websiteAdminEnabled: Boolean(row.websiteAdminEnabled),
    websiteLaunchMode: normalizeLaunchMode(row.websiteLaunchMode),
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
  };
}

function mapEntryRow(row: {
  id: string;
  companyId: number;
  userId: number;
  websiteProjectId: string;
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
  usedByIp: string | null;
}): WebsiteAdminEntryTokenRecord {
  return {
    id: String(row.id || ''),
    companyId: Number(row.companyId || 0),
    userId: Number(row.userId || 0),
    websiteProjectId: String(row.websiteProjectId || ''),
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    usedAt: row.usedAt ?? null,
    usedByIp: normalizeOptionalString(row.usedByIp),
  };
}

export async function listCompanyWebsiteConfigs(
  prisma: PrismaService,
  companyIds?: number[],
) {
  const normalizedIds = Array.from(
    new Set((companyIds || []).map((value) => Number(value || 0)).filter((value) => value > 0)),
  );

  const rows = await prisma.companyWebsiteConfig.findMany({
    where: normalizedIds.length ? { companyId: { in: normalizedIds } } : undefined,
  });

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
  const companyId = Number(input.companyId);
  const websitePublicUrl = normalizeOptionalString(input.websitePublicUrl);
  const websiteAdminUrl = normalizeOptionalString(input.websiteAdminUrl);
  const websiteProjectId = normalizeOptionalString(input.websiteProjectId);
  const websiteLaunchMode = normalizeLaunchMode(input.websiteLaunchMode);
  const websiteEnabled = Boolean(input.websiteEnabled);
  const websiteAdminEnabled = Boolean(input.websiteAdminEnabled);

  const saved = await prisma.companyWebsiteConfig.upsert({
    where: { companyId },
    create: {
      companyId,
      websiteEnabled,
      websitePublicUrl,
      websiteAdminUrl,
      websiteProjectId,
      websiteAdminEnabled,
      websiteLaunchMode,
    },
    update: {
      websiteEnabled,
      websitePublicUrl,
      websiteAdminUrl,
      websiteProjectId,
      websiteAdminEnabled,
      websiteLaunchMode,
    },
  });

  return mapConfigRow(saved);
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
  await prisma.websiteAdminEntryToken.create({
    data: {
      id: input.id,
      companyId: Number(input.companyId),
      userId: Number(input.userId),
      websiteProjectId: String(input.websiteProjectId),
      expiresAt: input.expiresAt,
    },
  });
}

export async function getWebsiteAdminEntryTokenRecord(prisma: PrismaService, id: string) {
  const row = await prisma.websiteAdminEntryToken.findUnique({
    where: { id: String(id) },
  });
  return row ? mapEntryRow(row) : null;
}

export async function consumeWebsiteAdminEntryTokenRecord(
  prisma: PrismaService,
  id: string,
  usedByIp?: string | null,
) {
  const { count } = await prisma.websiteAdminEntryToken.updateMany({
    where: { id: String(id), usedAt: null },
    data: {
      usedAt: new Date(),
      usedByIp: normalizeOptionalString(usedByIp),
    },
  });
  if (!count) return null;

  const row = await prisma.websiteAdminEntryToken.findUnique({ where: { id: String(id) } });
  return row ? mapEntryRow(row) : null;
}

export async function deleteExpiredWebsiteAdminEntryTokens(prisma: PrismaService, olderThan: Date) {
  const { count } = await prisma.websiteAdminEntryToken.deleteMany({
    where: { expiresAt: { lt: olderThan } },
  });
  return count;
}
