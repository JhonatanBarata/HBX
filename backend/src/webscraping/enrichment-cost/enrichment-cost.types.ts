import type { ActiveCommercialPlanKey, CommercialPlanTier } from '../../commercial-plans/commercial-plan-catalog';

export type EnrichmentCostProvider = 'hbx' | 'google' | 'email_provider' | 'manual' | 'other';
export type EnrichmentCostTrigger = 'auto' | 'manual' | 'admin' | 'retry' | 'import';
export type EnrichmentCostDecisionStage = 'ok' | 'reduce_auto' | 'manual_only' | 'locked';

export type EnrichmentBudgetConfig = {
  freeSmartEnrichmentsPerDay: number;
  paidGoogleFallbacksPerDay: number;
  paidEmailVerificationsPerMonth: number;
  paidApiBudgetBrlPerMonth: number;
};

export type PaidFallbackRuntimeUsage = {
  currentMonthCostBrl?: number | null;
  currentDailyProviderCount?: number | null;
  currentMonthlySkuCount?: number | null;
};

export type PaidFallbackContext = PaidFallbackRuntimeUsage & {
  companyId?: number | null;
  leadId?: string | null;
  provider: EnrichmentCostProvider;
  sku: string;
  planKey?: unknown;
  triggeredBy?: EnrichmentCostTrigger;
  leadScore?: number | null;
  hasCriticalMissingData?: boolean;
  hasCompanyName?: boolean;
  hasCity?: boolean;
  domain?: string | null;
  cacheHit?: boolean;
  estimatedCostUsd?: number | null;
  estimatedCostBrl?: number | null;
  reason?: string | null;
  budget?: Partial<EnrichmentBudgetConfig> | null;
  metadata?: Record<string, any> | null;
  recordBlocked?: boolean;
};

export type EnrichmentCostDecision = {
  allowed: boolean;
  code: string;
  stage: EnrichmentCostDecisionStage;
  message: string;
  provider: EnrichmentCostProvider;
  sku: string;
  planKey: ActiveCommercialPlanKey;
  planTier: CommercialPlanTier;
  triggeredBy: EnrichmentCostTrigger;
  budget: EnrichmentBudgetConfig;
  budgetUsageRatio: number;
  estimatedCostUsd: number;
  estimatedCostBrl: number;
  cacheHit: boolean;
  ledgerRequired: boolean;
  consumesPaidQuota: boolean;
};

export type EnrichmentLedgerRecordInput = {
  companyId?: number | null;
  leadId?: string | null;
  provider: EnrichmentCostProvider;
  sku: string;
  estimatedCostUsd?: number | null;
  estimatedCostBrl?: number | null;
  cacheHit?: boolean;
  reason?: string | null;
  planKey?: string | null;
  triggeredBy: EnrichmentCostTrigger;
  metadata?: Record<string, any> | null;
};

export type PaidFallbackReservation = EnrichmentCostDecision & {
  ledgerId: string | null;
  ledgerCreated: boolean;
};

export type EnrichmentCostSummary = {
  companyId: number;
  generatedAt: string;
  from: string;
  to: string;
  ledgerCount: number;
  paidLedgerCount: number;
  cacheHitCount: number;
  estimatedCostBrl: number;
  estimatedCostUsd: number;
  byProvider: Record<string, {
    count: number;
    paidCount: number;
    cacheHitCount: number;
    estimatedCostBrl: number;
    estimatedCostUsd: number;
  }>;
  budget: EnrichmentBudgetConfig;
  budgetUsageRatio: number;
  status: EnrichmentCostDecisionStage;
};

export type EmailProviderStatus = 'valid' | 'invalid' | 'unknown' | 'disabled' | 'error';

export type EmailProviderResult = {
  email?: string | null;
  domain?: string | null;
  status: EmailProviderStatus;
  confidence?: number | null;
  provider: 'internal' | 'external_disabled' | 'hunter' | 'future';
  source: string;
  reason?: string | null;
  costLedgerId?: string | null;
  metadata?: Record<string, any>;
};

export interface EmailEnrichmentProvider {
  verify(email: string): Promise<EmailProviderResult>;
  domainSearch(domain: string): Promise<EmailProviderResult[]>;
  findByCompanyDomain(companyName: string, domain: string): Promise<EmailProviderResult[]>;
}
