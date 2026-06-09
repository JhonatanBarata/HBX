export type GerencialRole = "USER" | "ADMIN" | "USERMASTER";
export type UserFilter = "active" | "sellers" | "admins" | "inactive" | "all";
export type TeamRoleTab = "admins" | "sellers";

export type UserItem = {
  id: number;
  username?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  commissionPercent?: number | null;
  canRecruitSellers?: boolean | null;
  sellerReferralCommissionPercent?: number | null;
  referredByUserId?: number | null;
  referredByCommissionPercentSnapshot?: number | null;
  referredByUser?: {
    id: number;
    username?: string | null;
    name?: string | null;
    email?: string | null;
  } | null;
  role: string;
  isSystemMaster?: boolean | null;
  isActive: boolean;
  sellerDistributionDailyLimitOverride?: number | null;
  deactivatedAt?: string | null;
  retentionUntil?: string | null;
  createdAt: string;
};

export type CompanyModule = {
  key: string;
  name: string;
  companyEnabled: boolean;
};

export type HbxPartnerReferralCandidate = {
  id: string;
  companyId: number;
  referrerUserId: number;
  name: string;
  phone: string;
  note?: string | null;
  preferredSegmentsJson?: string | null;
  status: "pending" | "approved" | "rejected" | "converted" | string;
  reviewedByUserId?: number | null;
  reviewedAt?: string | null;
  convertedUserId?: number | null;
  createdAt: string;
  updatedAt?: string | null;
  referrerUser?: {
    id: number;
    username?: string | null;
    name?: string | null;
    email?: string | null;
    commissionPercent?: number | null;
    sellerReferralCommissionPercent?: number | null;
  } | null;
  convertedUser?: {
    id: number;
    username?: string | null;
    name?: string | null;
    email?: string | null;
    isActive?: boolean | null;
  } | null;
};

export type CommissionTotals = {
  sellers: number;
  activeClients: number;
  pendingActivation: number;
  inactiveClients: number;
  payableAmount: number;
  duePayableAmount: number;
  duePayableCount: number;
  pendingAmount: number;
  paidAmount: number;
  recurringAmount: number;
  inheritedAmount?: number;
  inheritedCount?: number;
  nextDueAt?: string | null;
};

export type SellerOnboardingAttachment = {
  id: string;
  kind: "photo_id" | "curriculum" | "contract_pdf" | "generated_contract" | "other" | string;
  originalFilename: string;
  required?: boolean | null;
  status?: string | null;
  createdAt?: string | null;
};

export type PendingOnboardingAttachment = {
  kind: SellerOnboardingAttachment["kind"];
  file: File;
  required: boolean;
};

export type SellerOnboardingReadiness = {
  complete: boolean;
  emailConfirmed?: boolean;
  documents: Array<{
    kind: SellerOnboardingAttachment["kind"];
    label: string;
    required: boolean;
    present: boolean;
  }>;
  receivedDocuments: Array<{ kind: SellerOnboardingAttachment["kind"]; label: string; required: boolean; present: boolean }>;
  missingRequiredDocuments: Array<{ kind: SellerOnboardingAttachment["kind"]; label: string; required: boolean; present: boolean }>;
  missingActivationRequirements?: Array<{ code?: string | null; label: string }>;
};

export type TeamPolicyActorKind =
  | "system_master"
  | "company_admin"
  | "common_seller"
  | "unknown";

export type TeamPolicyLimitMode = "inherit" | "limited" | "unlimited" | "blocked";

export type TeamPolicyLimit = {
  mode: TeamPolicyLimitMode;
  value: number | null;
  used?: number | null;
  remaining?: number | null;
  resetAt?: string | null;
  source: string;
};

export type TeamPolicyModule = {
  key: string;
  name?: string | null;
  allowed: boolean;
  accessible?: boolean;
  visible?: boolean;
  source?: string;
};

export type TeamPolicyAccessGroupKey =
  | "modules"
  | "radar"
  | "vendas"
  | "communication"
  | "commission"
  | "sellerNetwork"
  | "products"
  | "admin";

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
  riskLevel: "low" | "medium" | "high" | "critical";
  sellerVisible: boolean;
  backendEnforced: boolean;
};

export type TeamPolicyAccessPreset = {
  key: string;
  label: string;
  description: string;
  access: TeamPolicyAccessMap;
  limits?: Partial<
    Record<
      keyof TeamPolicy["limits"],
      {
        mode: TeamPolicyLimitMode;
        value: number | null;
      }
    >
  >;
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

export type TeamPolicy = {
  version: 1;
  subject: TeamPolicySubject;
  modules: TeamPolicyModule[];
  accessCatalog?: TeamPolicyAccessCatalogItem[];
  accessGroups?: TeamPolicyAccessCatalogGroup[];
  accessPresets?: TeamPolicyAccessPreset[];
  access?: TeamPolicyAccessMap;
  effectiveAccessMap?: TeamPolicyAccessMap;
  missingBackendEnforcement?: TeamPolicyMissingBackendEnforcement[];
  compensation: {
    commissionPercent: number;
    commissionDueBusinessDays: number;
  };
  sellerNetwork: {
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
  limits: {
    enrichmentDaily: TeamPolicyLimit;
    cardDeliveryDaily: TeamPolicyLimit;
    activeCards: TeamPolicyLimit;
    monthlyCards: TeamPolicyLimit;
    vendasPullQuantity: TeamPolicyLimit;
  };
  radar: {
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
  visibility: {
    sellerCanViewOwnPolicy: boolean;
    sellerCanViewCommission: boolean;
    sellerCanViewSellerNetwork: boolean;
    sellerCanViewLimits: boolean;
    adminCanEditLegacyFields: boolean;
    masterCanUseUnlimited: boolean;
  };
  persistence: {
    mode: "legacy_derived" | "persisted_with_legacy_fallback";
    policyId?: string | null;
    presetId?: string | null;
    source?: string | null;
    persistedFields: string[];
    pendingSchemaFields: string[];
  };
};

export type TeamPolicyPatch = {
  modules?: Array<{ key: string; allowed: boolean }>;
  access?: TeamPolicyAccessMap;
  accessPresetKey?: string | null;
  compensation?: {
    commissionPercent?: number;
    commissionDueBusinessDays?: number;
  };
  sellerNetwork?: {
    canRecruitSellers?: boolean;
    sellerReferralCommissionPercent?: number;
    referredByUserId?: number | null;
    referredByCommissionPercentSnapshot?: number;
  };
  limits?: Partial<
    Record<
      keyof TeamPolicy["limits"],
      {
        mode?: TeamPolicyLimitMode;
        value?: number | null | "unlimited";
      }
    >
  >;
  radar?: {
    allowedSegments?: string[];
    blockedSegments?: string[];
    allowedCities?: Array<{ city: string; state: string | null }>;
    allowedStates?: string[];
    requiresLocation?: boolean;
    requiredChannels?: TeamPolicy["radar"]["requiredChannels"];
  };
  visibility?: Pick<
    TeamPolicy["visibility"],
    "sellerCanViewOwnPolicy" | "sellerCanViewCommission" | "sellerCanViewSellerNetwork" | "sellerCanViewLimits"
  >;
};
