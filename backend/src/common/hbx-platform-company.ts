// PR12062026005: identifica a empresa-tenant da própria HBX (o "HBX admin").
// Único privilégio dela no módulo de e-mail: compartilhar o transporte SMTP
// do Master — decidido internamente pelo CompanyMailerService, nunca por
// endpoint master nem por flag visível ao tenant.
export function resolveHbxPlatformCompanyId(): number {
  const raw = Math.trunc(Number(process.env.HBX_PLATFORM_COMPANY_ID || 2));
  return Number.isFinite(raw) && raw > 0 ? raw : 2;
}

export function isHbxPlatformCompany(companyId?: number | null): boolean {
  const normalized = Math.trunc(Number(companyId || 0));
  return normalized > 0 && normalized === resolveHbxPlatformCompanyId();
}
