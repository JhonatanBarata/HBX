type PrismaCompanyLookup = {
  company: {
    findFirst(input: {
      where: { name: string };
      select: { id: true };
      orderBy?: { id: 'asc' };
    }): Promise<{ id: number } | null>;
  };
};

export const HBX_PLATFORM_COMPANY_NAME = 'HBX';

let cachedPlatformCompanyId: number | null = null;
let cachedAtMs = 0;

// PR12062026005: identifica a empresa-tenant da própria HBX (o "HBX admin")
// pelo nome exato, não por ID fixo. O único privilégio dela no módulo de
// e-mail é compartilhar o transporte SMTP do Master.
export async function resolveHbxPlatformCompanyId(prisma: PrismaCompanyLookup): Promise<number | null> {
  const now = Date.now();
  if (cachedPlatformCompanyId && now - cachedAtMs < 30_000) return cachedPlatformCompanyId;

  const company = await prisma.company.findFirst({
    where: { name: HBX_PLATFORM_COMPANY_NAME },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  cachedPlatformCompanyId = company?.id ? Math.trunc(Number(company.id)) : null;
  cachedAtMs = now;
  return cachedPlatformCompanyId;
}

export async function isHbxPlatformCompany(
  prisma: PrismaCompanyLookup,
  companyId?: number | null,
): Promise<boolean> {
  const normalized = Math.trunc(Number(companyId || 0));
  if (normalized <= 0) return false;
  const platformCompanyId = await resolveHbxPlatformCompanyId(prisma);
  return Boolean(platformCompanyId && normalized === platformCompanyId);
}
