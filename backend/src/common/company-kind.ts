export const COMPANY_KIND_TENANT = 'tenant' as const;
export const COMPANY_KIND_PLATFORM_INFRA = 'platform_infra' as const;

export type CompanyKind = typeof COMPANY_KIND_TENANT | typeof COMPANY_KIND_PLATFORM_INFRA;

export type CompanyKindCompanyLike = {
  companyKind?: string | null;
  [key: string]: unknown;
} | null | undefined;

export function resolveCompanyKind(company?: CompanyKindCompanyLike): CompanyKind {
  const normalized = String(company?.companyKind || '').trim().toLowerCase();
  return normalized === COMPANY_KIND_PLATFORM_INFRA ? COMPANY_KIND_PLATFORM_INFRA : COMPANY_KIND_TENANT;
}

export function isTenantCompany(company?: CompanyKindCompanyLike): boolean {
  return resolveCompanyKind(company) === COMPANY_KIND_TENANT;
}

export function isPlatformInfraCompany(company?: CompanyKindCompanyLike): boolean {
  return resolveCompanyKind(company) === COMPANY_KIND_PLATFORM_INFRA;
}
