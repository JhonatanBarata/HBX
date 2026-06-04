export type CurrentUser = {
  id: number;
  username?: string | null;
  name?: string | null;
  email?: string | null;
  isSystemMaster?: boolean;
  masterContext?: {
    active: boolean;
    companyId: number | null;
    companyName: string | null;
  } | null;
};

export type MetricKind = "currency" | "count";

export type SummaryMetric = {
  kind: MetricKind;
  value: number;
  auxValue?: number | null;
  previousValue?: number | null;
  delta?: number | null;
  note: string;
};

export type RevenuePoint = {
  id: string;
  label: string;
  received: number;
  projected: number;
  loss: number;
};

export type PaymentPoint = {
  id: string;
  label: string;
  approved: number;
  failed: number;
  manual: number;
  pending: number;
};

export type DistributionPoint = {
  key: string;
  label: string;
  value: number;
};

export type TrialConversion = {
  active: number;
  converted: number;
  expired: number;
  extended: number;
};

export type ModuleRevenuePoint = {
  label: string;
  value: number;
};

export type StatusBucket =
  | "PAYING"
  | "MANUAL_PREMIUM"
  | "TRIAL"
  | "TRIAL_ENDING"
  | "OVERDUE"
  | "SUSPENDED"
  | "NO_METHOD"
  | "UNKNOWN";

export type LedgerEntry = {
  id: string;
  entryType: string;
  status: string;
  origin?: string | null;
  competence?: string | null;
  amount: number;
  dueDate?: string | null;
  paidAt?: string | null;
  paymentMethod?: string | null;
  referenceLabel?: string | null;
  observation?: string | null;
  createdAt?: string | null;
};

export type MasterBillingSituationReason =
  | "paid"
  | "trial"
  | "manual"
  | "overdue"
  | "suspended"
  | "no_method"
  | "unknown";

export type MasterBillingLedgerSummary = Pick<
  LedgerEntry,
  "id" | "status" | "amount" | "paidAt" | "dueDate" | "paymentMethod" | "referenceLabel" | "origin" | "competence"
>;

export type MasterBillingSituation = {
  canUse: boolean;
  reason: MasterBillingSituationReason;
  statusLabel: string;
  amountDue: number;
  currentCycleAmount: number;
  billingCycle: "MONTHLY" | "ANNUAL" | string;
  paymentMethod?: string | null;
  provider?: string | null;
  lastPayment?: MasterBillingLedgerSummary | null;
  lastFailure?: MasterBillingLedgerSummary | null;
  nextDueAt?: string | null;
  daysOverdue: number;
  hasPendingIssues: boolean;
};

export type OperationalTone = "green" | "yellow" | "red";

export type OperationalStatusChip = {
  key: "token" | "meta" | "webwhats" | "payment" | "access";
  label: string;
  shortLabel: string;
  tone: OperationalTone;
  value: string;
  detail: string;
  hint: string;
  href: string;
  active: boolean;
  updatedAt?: string | null;
};

export type MasterWhatsAppSituationMode =
  | "none"
  | "qr"
  | "official"
  | "master_token"
  | "mixed"
  | "unknown";

export type MasterWhatsAppSituationStatus =
  | "connected"
  | "attention"
  | "disconnected"
  | "error"
  | "unknown";

export type MasterWhatsAppSituation = {
  mode: MasterWhatsAppSituationMode;
  status: MasterWhatsAppSituationStatus;
  statusLabel: string;
  numberLabel?: string | null;
  usingMasterToken: boolean;
  tokenConfigured: boolean;
  phoneNumberIdConfigured: boolean;
  wabaIdConfigured: boolean;
  qrAvailable: boolean;
  officialConfigured: boolean;
  nextStepLabel: string;
  hasPendingMigration: boolean;
  hasError: boolean;
  errorMessageSafe?: string | null;
};

export type CompanySummary = {
  id: number;
  name: string;
  slug?: string | null;
  createdAt?: string | null;
  onboardingStatus?: string | null;
  onboardingLabel?: string | null;
  trialModuleSelection?: "vendas" | "recovery" | string | null;
  emailConfirmation: {
    confirmed: boolean;
    confirmedUsersCount: number;
    pendingUsersCount: number;
    lastConfirmedAt?: string | null;
  };
  activationStatus?: "pending_email_confirmation" | "needs_activation" | "operating" | "basic_access" | string | null;
  activationNeedsAttention?: boolean;
  primaryContactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  taxDocument?: string | null;
  acquisitionSource?: string | null;
  acquisitionSourceDetail?: string | null;
  referralReferrerName?: string | null;
  referralCode?: string | null;
  isActive: boolean;
  userCount: number;
  plan?: {
    id: number;
    name: string;
    price: number;
  } | null;
  selectedPlanKey?: "hbx_lite" | "hbx_padrao" | "hbx_melhor" | string | null;
  monthlyValue: number;
  billingSituation?: MasterBillingSituation | null;
  paymentStatus: string;
  paymentMethod?: string | null;
  billingCycle?: "MONTHLY" | "ANNUAL" | string | null;
  subscriptionStatus?: string | null;
  billingProvider?: string | null;
  premiumAccess?: boolean;
  commercialCardQuota?: {
    planKey: string;
    monthlyDefault: number;
    dailyDefault: number;
    monthlyOverride?: number | null;
    dailyOverride?: number | null;
    monthlyEffective: number;
    dailyEffective: number;
  };
  assistedSetup?: {
    required: boolean;
    status: string;
    completedAt?: string | null;
    completedByUserId?: number | null;
    note?: string | null;
  };
  trialStartsAt?: string | null;
  trialEndsAt?: string | null;
  trialRemainingDays?: number | null;
  subscriptionCurrentPeriodStart?: string | null;
  subscriptionCurrentPeriodEnd?: string | null;
  nextDueAt?: string | null;
  daysOverdue: number;
  currentOutstandingValue: number;
  statusBucket: StatusBucket;
  riskLevel: "stable" | "warning" | "critical";
  financialSituation: string;
  lastPayment?: LedgerEntry | null;
  lastFailure?: LedgerEntry | null;
  manualPaymentPending?: boolean;
  recentCardFailure?: boolean;
  websiteNeedsAttention?: boolean;
  whatsappCenter: {
    mode: "NONE" | "QR" | "OFFICIAL";
    status: "NOT_CONNECTED" | "QR" | "OFFICIAL" | "ATTENTION";
    statusLabel: string;
    statusHint: string;
    qrConnection: {
      selected: boolean;
      status: "NOT_CONNECTED" | "QR" | "ATTENTION";
      available: boolean;
      note: string;
    };
    official: {
      selected: boolean;
      configured: boolean;
      connected: boolean;
      status?: string | null;
      displayNumber?: string | null;
      usingMasterToken: boolean;
      credentialLabel?: string | null;
      phoneNumberId?: string | null;
      wabaId?: string | null;
    };
    migration: {
      interestRequested: boolean;
      requestedAt?: string | null;
      workflowStatus?: "NONE" | "REQUESTED" | "CONTACTED" | "RESOLVED";
      source?: string | null;
      lastContactAt?: string | null;
      internalNote?: string | null;
    };
  };
  whatsappSituation?: MasterWhatsAppSituation | null;
  website: {
    enabled: boolean;
    configured: boolean;
    adminEnabled: boolean;
    publicUrl?: string | null;
    adminUrl?: string | null;
    projectId?: string | null;
    launchMode?: "public" | "admin";
  };
  mercadoPago: {
    status?: string | null;
    accountEmail?: string | null;
    accountUserId?: string | null;
    tokenConfigured: boolean;
    usingMasterToken?: boolean;
    masterCredentialKey?: string | null;
    masterCredentialLabel?: string | null;
  };
  finance: {
    billingCycle: "MONTHLY" | "ANNUAL";
    annualPlanDiscountPercent: number;
    annualDiscountValue: number;
    manualDiscountPercent: number;
    manualDiscountValue: number;
    basePlanCycleAmount?: number;
    activeUsers?: number;
    includedActiveUsers?: number;
    extraActiveUsers?: number;
    extraSeatMonthlyAmount?: number;
    extraSeatCycleAmount?: number;
    referralDiscountPercent: number;
    referralDiscountMode: "ONCE" | "RECURRING" | string;
    referralDiscountValue: number;
    referralDiscountEligible: boolean;
    referralDiscountAppliedNow: boolean;
    referralDiscountConsumedAt?: string | null;
    freeMonths: number;
    acquisitionSource?: string | null;
    acquisitionSourceDetail?: string | null;
    referralReferrerName?: string | null;
    referralCode?: string | null;
    isReferral?: boolean;
    cardConfigured: boolean;
    cardBrand?: string | null;
    cardLast4?: string | null;
    cardUpdatedAt?: string | null;
    pixAvailable: boolean;
    baseCycleAmount: number;
    finalCycleAmount: number;
    pendingCount: number;
    failedCount: number;
    refundCount: number;
    refundAmount: number;
    hasPendingIssues: boolean;
  };
  webscrapingUsage: {
    searchesToday: number;
    blockedToday: number;
    totalReusedToday: number;
    fetchedToday: number;
    globalCacheHitsToday: number;
    globalCacheReusedToday: number;
    globalCacheReuseRate: number;
    lastAttemptAt?: string | null;
    lastAttemptMessage?: string | null;
    lastSearchAt?: string | null;
    lastSearchLabel?: string | null;
    lastSearchUser?: string | null;
    lastResultCount: number;
    lastSearchSource?: "history" | "google" | "hybrid" | "global_cache" | string | null;
    lastTechnicalCacheUsed: boolean;
    lastTechnicalCacheReusedCount: number;
    hasBlockedAttempts: boolean;
  };
  modules: Array<{
    key: string;
    name: string;
    enabled: boolean;
    monthlyPrice?: number;
  }>;
  modulesTotalMonthlyValue?: number;
  auditCount?: number;
  operationalStatus?: {
    companyId: number;
    companyName?: string | null;
    statuses: OperationalStatusChip[];
    tokenActive: boolean;
    metaActive: boolean;
    webWhatsActive: boolean;
    paymentActive: boolean;
    accessActive: boolean;
    accessReason?: string | null;
    accessSource?: "paid" | "trial" | "blocked";
    overallHealth: OperationalTone;
    overallHint: string;
    overallLabel: string;
    lastCheckedAt?: string | null;
  } | null;
};

export type MasterMercadoPagoCredential = {
  key: string;
  label: string;
  accessToken?: string | null;
  accessTokenPreview?: string | null;
  configured: boolean;
  sourceCompanyId?: number | null;
  sourceCompanyName?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type MasterWhatsAppCredential = {
  key: string;
  label: string;
  accessToken?: string | null;
  accessTokenPreview?: string | null;
  phoneNumberId?: string | null;
  wabaId?: string | null;
  whatsappNumber?: string | null;
  displayNumber?: string | null;
  configured: boolean;
  sourceCompanyId?: number | null;
  sourceCompanyName?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type AttentionGroup = {
  id: string;
  title: string;
  severity: "info" | "warning" | "danger" | string;
  count: number;
  companies: Array<{
    id: number;
    name: string;
    statusBucket: StatusBucket;
    nextDueAt?: string | null;
    trialRemainingDays?: number | null;
  }>;
};

export type WorkspacePayload = {
  generatedAt: string;
  summary: Record<string, SummaryMetric>;
  charts: {
    revenue: RevenuePoint[];
    payments: PaymentPoint[];
    baseStatus: DistributionPoint[];
    trialConversion: TrialConversion;
    revenueByModule: ModuleRevenuePoint[];
  };
  attention: AttentionGroup[];
  companies: CompanySummary[];
  masterIntegrations: {
    mercadoPagoConfigured: boolean;
    whatsappConfigured: boolean;
    annualPlanDiscountPercent: number;
    extraSeatMonthlyAmount: number;
    referralDiscountActive: boolean;
    referralDiscountPercent: number;
    referralDiscountMode: "ONCE" | "RECURRING" | string;
    mercadoPagoLibrary: MasterMercadoPagoCredential[];
    whatsappLibrary: MasterWhatsAppCredential[];
  };
  systemModules: Array<{
    id: number;
    key: string;
    name: string;
    description?: string | null;
    monthlyPrice: number;
    defaultEnabled: boolean;
    companyAssignable: boolean;
    serviceUrl?: string | null;
  }>;
};

export type SystemModule = WorkspacePayload["systemModules"][number];

export type MasterWorkspaceBootstrap = {
  token: string | null;
  workspacePayload: WorkspacePayload;
  userPayload: CurrentUser;
};


export type CompanyUser = {
  id: number;
  username?: string | null;
  name?: string | null;
  email?: string | null;
  role: string;
  isActive: boolean;
  deactivatedAt?: string | null;
  retentionUntil?: string | null;
  createdAt?: string | null;
};

export type AuditEntry = {
  id: string;
  scope: string;
  action: string;
  severity: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
};

export type CompanyDetailPayload = {
  generatedAt: string;
  company: CompanySummary & {
    taxDocument?: string | null;
    users: CompanyUser[];
    financeHistory: LedgerEntry[];
    trialHistory: AuditEntry[];
    auditTimeline: AuditEntry[];
    whatsapp: {
      tokenConfigured?: boolean;
      usingMasterToken?: boolean;
      endpoints: Array<{
        id: string;
        label?: string | null;
        moduleKey?: string | null;
        whatsappNumber?: string | null;
        whatsappPhoneNumberId?: string | null;
        whatsappWabaId?: string | null;
        whatsappDisplayNumber?: string | null;
        whatsappStatus?: string | null;
        whatsappStatusError?: string | null;
        whatsappStatusUpdatedAt?: string | null;
        accessTokenConfigured: boolean;
        accessTokenValue?: string | null;
        accessTokenPreview?: string | null;
        isActive: boolean;
        isPrimary: boolean;
      }>;
      companyAccessTokenConfigured?: boolean;
      companyAccessTokenValue?: string | null;
      masterCredentialKey?: string | null;
      masterCredentialLabel?: string | null;
      masterAccessTokenConfigured?: boolean;
      masterAccessTokenValue?: string | null;
      masterPhoneNumberId?: string | null;
      masterWabaId?: string | null;
      masterDisplayNumber?: string | null;
    };
    mercadoPago: CompanySummary["mercadoPago"] & {
      statusError?: string | null;
      lastValidatedAt?: string | null;
      accessTokenValue?: string | null;
      masterCredentialKey?: string | null;
      masterCredentialLabel?: string | null;
      masterTokenConfigured?: boolean;
      masterAccessTokenValue?: string | null;
    };
    masterIntegrations?: WorkspacePayload["masterIntegrations"];
  };
};

export type ProfileDraft = {
  name: string;
  primaryContactName: string;
  contactEmail: string;
  contactPhone: string;
  taxDocument: string;
  paymentMethod: string;
  subscriptionStatus: string;
  billingProvider: string;
  premiumAccess: boolean;
};

export type WebsiteDraft = {
  websiteEnabled: boolean;
  websitePublicUrl: string;
  websiteAdminUrl: string;
  websiteProjectId: string;
  websiteAdminEnabled: boolean;
  websiteLaunchMode: "public" | "admin";
};

export type MercadoPagoDraft = {
  mercadoPagoAccessToken: string;
  status: string;
  statusError: string | null;
  accountEmail: string | null;
  accountUserId: string | null;
  lastValidatedAt: string | null;
  accessTokenConfigured: boolean;
};

export type MasterIntegrationsDraft = WorkspacePayload["masterIntegrations"];

export type FinanceSettingsDraft = {
  billingCycle: "MONTHLY" | "ANNUAL";
  manualDiscountPercent: string;
  freeMonths: string;
};

export type WhatsAppMigrationWorkflowDraft = {
  status: "REQUESTED" | "CONTACTED" | "RESOLVED";
  internalNote: string;
  lastContactAt: string;
};

export type IntegrationProviderId = "AUVO" | "TAGPLUS";

export type IntegrationProviderModel = {
  id: IntegrationProviderId;
  label: string;
  category: string;
  adapterMode: "scaffold" | "real-http";
  syncTargets: string[];
  credentialFields: Array<{
    key: string;
    label: string;
    required: boolean;
    secret: boolean;
  }>;
  notes: string[];
};

export type IntegrationCredentialSummary = {
  configured: boolean;
  fields: Array<{
    key: string;
    label: string;
    configured: boolean;
  }>;
};

export type IntegrationConnectionConfigSummary = {
  authMode?: string | null;
  baseUrl?: string | null;
  externalAccountId?: string | null;
};

export type CompanyIntegrationSyncRun = {
  id: string;
  status: string;
  importedCount: number;
  updatedCount: number;
  failedCount: number;
  startedAt?: string | null;
  finishedAt?: string | null;
  errorSummary?: string | null;
};

export type CompanyIntegrationConnection = {
  id: string;
  companyId: number;
  provider: IntegrationProviderId;
  providerModel?: IntegrationProviderModel | null;
  instanceName: string;
  status: string;
  lastTestedAt?: string | null;
  lastTestStatus?: string | null;
  lastTestMessage?: string | null;
  lastSyncAt?: string | null;
  lastSuccessAt?: string | null;
  lastError?: string | null;
  isActive: boolean;
  secretConfigured: boolean;
  secretPreview?: string | null;
  credentialSummary?: IntegrationCredentialSummary | null;
  connectionConfig?: IntegrationConnectionConfigSummary | null;
  lastSyncRun?: CompanyIntegrationSyncRun | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type IntegrationEditorState = {
  mode: "create" | "edit";
  connectionId?: string;
  provider: IntegrationProviderId;
  instanceName: string;
  secret: string;
  appKey: string;
  baseUrl: string;
  authMode: string;
  externalAccountId: string;
  isActive: boolean;
};

export type UserModalState = {
  mode: "create" | "edit" | "reset";
  companyId: number;
  companyName: string;
  userId?: number;
  userLabel?: string;
  email: string;
  username: string;
  name: string;
  role: "USER" | "ADMIN";
  password: string;
};

export type ManualPaymentState = {
  companyId: number;
  companyName: string;
  value: string;
  competence: string;
  paidAt: string;
  dueDate: string;
  paymentMethod: string;
  observation: string;
  settlePending: boolean;
  generateAudit: boolean;
};

export type ConfirmActionState = {
  title: string;
  description: string;
  confirmLabel: string;
  tone: "primary" | "danger";
  details?: string[];
  confirmationKeyword?: string;
  confirmationInputLabel?: string;
  run: () => Promise<void>;
};

export type DrawerTab =
  | "summary"
  | "finance"
  | "whatsapp"
  | "users"
  | "modules"
  | "website"
  | "integrations"
  | "audit"
  | "danger";
