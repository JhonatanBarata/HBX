import { MASTER_WHATSAPP_ENGINE_COMPANY_SLUG } from '../companies/master-whatsapp-company.constants';

export type AccessGovernor = 'HBX_MASTER' | 'COMPANY_ADMIN';

export type HbxCompanyLike = {
  id?: number | string | null;
  slug?: string | null;
  isHbxOperation?: boolean | null;
  isMasterOperationalCompany?: boolean | null;
};

export type HbxUserLike = {
  id?: number | string | null;
  companyId?: number | string | null;
  role?: string | null;
  isSystemMaster?: boolean | null;
  company?: HbxCompanyLike | null;
};

export type HbxCapability =
  | 'canAccessDesktop'
  | 'canAccessMobile'
  | 'canAccessRadar'
  | 'canAccessVendas'
  | 'canViewOwnRadarCards'
  | 'canViewCompanyPool'
  | 'canRunRadarSearch'
  | 'canAssignCardsToOthers'
  | 'canReopenFinalizedCards'
  | 'canManageUsers'
  | 'canManageSellerAccess'
  | 'canManageSellerQuotas';

export type CapabilityMap = Partial<Record<HbxCapability, boolean>>;

export type ResolveEffectiveCapabilityInput = {
  capability: HbxCapability;
  companyEntitlements?: CapabilityMap | null;
  configuredUserCaps?: CapabilityMap | null;
  safetyCaps?: CapabilityMap | null;
};

export function isHbxOperationCompany(company?: HbxCompanyLike | null): boolean {
  if (!company) return false;
  const slug = String(company.slug || '').trim().toLowerCase();
  return Boolean(
    company.isHbxOperation === true ||
      company.isMasterOperationalCompany === true ||
      slug === 'hbx' ||
      slug === MASTER_WHATSAPP_ENGINE_COMPANY_SLUG,
  );
}

export function resolveAccessGovernor(targetUser: HbxUserLike, targetCompany?: HbxCompanyLike | null): AccessGovernor {
  return isHbxOperationCompany(targetCompany || targetUser.company)
    ? 'HBX_MASTER'
    : 'COMPANY_ADMIN';
}

export function resolveEffectiveCapability({
  capability,
  companyEntitlements = {},
  configuredUserCaps = {},
  safetyCaps = {},
}: ResolveEffectiveCapabilityInput): boolean {
  const planAllows = companyEntitlements?.[capability] !== false;
  const userAllows = configuredUserCaps?.[capability] === true;
  const safetyAllows = safetyCaps?.[capability] !== false;
  return Boolean(planAllows && userAllows && safetyAllows);
}

export function buildModuleCapabilityKey(moduleKey: string, action: 'access' | 'run' | 'manage' = 'access'): HbxCapability | null {
  const normalized = String(moduleKey || '').trim().toLowerCase();
  if (action === 'manage') {
    if (normalized === 'users' || normalized === 'gerencial') return 'canManageUsers';
    if (normalized === 'seller-access') return 'canManageSellerAccess';
    if (normalized === 'seller-quotas') return 'canManageSellerQuotas';
  }
  if (action === 'run' && normalized === 'webscraping') return 'canRunRadarSearch';
  if (normalized === 'webscraping' || normalized === 'radar' || normalized === 'radar-digital') return 'canAccessRadar';
  if (normalized === 'vendas' || normalized === 'sales') return 'canAccessVendas';
  return null;
}
