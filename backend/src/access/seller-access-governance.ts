import { resolveCompanyKind, type CompanyKind } from '../common/company-kind';

export type AccessGovernor = CompanyKind;

export type HbxCompanyLike = {
  id?: number | string | null;
  companyKind?: string | null;
  slug?: string | null;
  [key: string]: unknown;
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
  | 'canManageSellerAccess';

export type CapabilityMap = Partial<Record<HbxCapability, boolean>>;

export type ResolveEffectiveCapabilityInput = {
  capability: HbxCapability;
  companyCapabilities?: CapabilityMap | null;
  configuredUserCaps?: CapabilityMap | null;
  safetyCaps?: CapabilityMap | null;
};

export function resolveAccessGovernor(targetUser: HbxUserLike, targetCompany?: HbxCompanyLike | null): AccessGovernor {
  return resolveCompanyKind(targetCompany || targetUser.company);
}

export function resolveEffectiveCapability({
  capability,
  companyCapabilities = {},
  configuredUserCaps = {},
  safetyCaps = {},
}: ResolveEffectiveCapabilityInput): boolean {
  const companyAllows = companyCapabilities?.[capability] !== false;
  const userAllows = configuredUserCaps?.[capability] === true;
  const safetyAllows = safetyCaps?.[capability] !== false;
  return Boolean(companyAllows && userAllows && safetyAllows);
}

export function buildModuleCapabilityKey(moduleKey: string, action: 'access' | 'run' | 'manage' = 'access'): HbxCapability | null {
  const normalized = String(moduleKey || '').trim().toLowerCase();
  if (action === 'manage') {
    if (normalized === 'users' || normalized === 'gerencial') return 'canManageUsers';
    if (normalized === 'seller-access') return 'canManageSellerAccess';
  }
  if (action === 'run' && normalized === 'webscraping') return 'canRunRadarSearch';
  if (normalized === 'webscraping' || normalized === 'radar' || normalized === 'radar-digital') return 'canAccessRadar';
  if (normalized === 'vendas' || normalized === 'sales') return 'canAccessVendas';
  return null;
}
