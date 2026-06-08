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
