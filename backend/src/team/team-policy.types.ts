export type TeamPolicyActorKind =
  | 'system_master'
  | 'company_admin'
  | 'common_seller'
  | 'unknown';

export type TeamPolicyLimitMode = 'inherit' | 'limited' | 'unlimited' | 'blocked';
export type TeamPolicyLimitSource =
  | 'team_policy'
  | 'legacy_user_field'
  | 'usage_snapshot'
  | 'active_card_quota'
  | 'company_default'
  | 'not_persisted_yet';

export type TeamPolicyLimit = {
  mode: TeamPolicyLimitMode;
  value: number | null;
  used?: number | null;
  remaining?: number | null;
  resetAt?: string | null;
  source: TeamPolicyLimitSource;
};

export type TeamPolicyModule = {
  key: string;
  name?: string | null;
  allowed: boolean;
  accessible?: boolean;
  visible?: boolean;
  source: 'module_access' | 'module_service';
};

export type TeamPolicyAccessGroupKey =
  | 'modules'
  | 'radar'
  | 'vendas'
  | 'communication'
  | 'commission'
  | 'sellerNetwork'
  | 'products'
  | 'admin';

export type TeamPolicyAccessRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type TeamPolicyAccessMap = Record<string, boolean>;

export type TeamPolicyAccessCatalogGroup = {
  key: TeamPolicyAccessGroupKey;
  label: string;
  description: string;
};

export type TeamPolicyAccessCatalogItem = {
  key: string;
  group: TeamPolicyAccessGroupKey;
  label: string;
  description: string;
  defaultForAdmin: boolean;
  defaultForSeller: boolean;
  requiresModule?: string;
  riskLevel: TeamPolicyAccessRiskLevel;
  sellerVisible: boolean;
  backendEnforced: boolean;
};

export type TeamPolicyAccessPreset = {
  key: string;
  label: string;
  description: string;
  access: TeamPolicyAccessMap;
  limits?: Partial<Record<'enrichmentDaily' | 'cardDeliveryDaily' | 'activeCards' | 'monthlyCards' | 'vendasPullQuantity', {
    mode: TeamPolicyLimitMode;
    value: number | null;
  }>>;
};

export type TeamPolicyMissingBackendEnforcement = {
  key: string;
  group: TeamPolicyAccessGroupKey;
  label: string;
};

export type TeamPolicySubject = {
  id: number;
  companyId: number | null;
  role: string;
  kind: TeamPolicyActorKind;
  isSystemMaster: boolean;
  isActive: boolean;
  name: string | null;
  email: string | null;
  username: string | null;
};

export type TeamPolicyCompensation = {
  commissionPercent: number;
  commissionDueBusinessDays: number;
};

export type TeamPolicySellerNetwork = {
  isSellerNetwork: boolean;
  canRecruitSellers: boolean;
  sellerReferralCommissionPercent: number;
  referredByUserId: number | null;
  referredByCommissionPercentSnapshot: number;
  referredByUser: {
    id: number;
    name: string | null;
    username: string | null;
    email: string | null;
  } | null;
};

export type TeamPolicyRadarFilters = {
  allowedSegments: string[];
  blockedSegments: string[];
  allowedCities: Array<{ city: string; state: string | null }>;
  allowedStates: string[];
  requiresLocation: boolean;
  requiredChannels: {
    whatsapp: boolean;
    instagram: boolean;
    facebook: boolean;
    email: boolean;
    website: boolean;
  };
};

export type TeamPolicyVisibility = {
  sellerCanViewOwnPolicy: boolean;
  sellerCanViewCommission: boolean;
  sellerCanViewSellerNetwork: boolean;
  sellerCanViewLimits: boolean;
  adminCanEditLegacyFields: boolean;
  masterCanUseUnlimited: boolean;
};

export type TeamPolicyPersistence = {
  mode: 'legacy_derived' | 'persisted_with_legacy_fallback';
  policyId?: string | null;
  presetId?: string | null;
  source?: string | null;
  persistedFields: string[];
  pendingSchemaFields: string[];
};

export type TeamPolicy = {
  version: 1;
  subject: TeamPolicySubject;
  modules: TeamPolicyModule[];
  accessCatalog: TeamPolicyAccessCatalogItem[];
  accessGroups: TeamPolicyAccessCatalogGroup[];
  accessPresets: TeamPolicyAccessPreset[];
  access: TeamPolicyAccessMap;
  effectiveAccessMap: TeamPolicyAccessMap;
  missingBackendEnforcement: TeamPolicyMissingBackendEnforcement[];
  compensation: TeamPolicyCompensation;
  sellerNetwork: TeamPolicySellerNetwork;
  limits: {
    enrichmentDaily: TeamPolicyLimit;
    cardDeliveryDaily: TeamPolicyLimit;
    activeCards: TeamPolicyLimit;
    monthlyCards: TeamPolicyLimit;
    vendasPullQuantity: TeamPolicyLimit;
  };
  radar: TeamPolicyRadarFilters;
  visibility: TeamPolicyVisibility;
  persistence: TeamPolicyPersistence;
};
