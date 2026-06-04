import { BadRequestException, ForbiddenException, Injectable, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { CreateIntegrationConnectionDto, UpdateIntegrationConnectionDto } from '../integrations/dto/integration-connection.dto';
import { IntegrationSyncDto } from '../integrations/dto/integration-sync.dto';
import { IntegrationConnectionsService } from '../integrations/integration-connections.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import structuralDefaults from '../bootstrap/structural-defaults.json';
import { MasterContextService } from '../master-context/master-context.service';
import { CompanyOperationalStatusService } from '../companies/company-operational-status.service';
import { CommercialUsageLimitsService } from '../commercial-plans/commercial-usage-limits.service';
import { ensureWebsiteRuntimeSchema, listCompanyWebsiteConfigs } from '../website/website-runtime';
import { ensureMasterBillingRuntimeSchema } from './master-runtime';
import { buildMasterBillingSituation } from './master-billing-situation';
import { buildMasterWhatsAppSituation } from './master-whatsapp-situation';
import { buildWhatsAppCenterSnapshot } from '../companies/whatsapp-center.util';
import { MASTER_WHATSAPP_ENGINE_COMPANY_SLUG } from '../companies/master-whatsapp-company.constants';
import {
  getMasterGlobalIntegrationConfig,
  normalizeMasterGlobalIntegrationConfig,
  pickMasterMercadoPagoCredential,
  pickMasterWhatsAppCredential,
  serializeMasterGlobalIntegrationConfig,
  serializeMasterIntegrationLibrariesForStorage,
} from './master-global-integrations.util';
import {
  COMMERCIAL_ENTITLEMENT_KEYS,
  COMMERCIAL_PLAN_ENTITLEMENT_KEYS,
  COMMERCIAL_PLAN_KEYS,
  COMMERCIAL_PLAN_MODULE_KEYS,
  COMMERCIAL_PLAN_QUOTAS,
  getCommercialPlanMonthlyPrice,
  getCommercialPlanTitle,
  normalizeCommercialPlanKey,
  type ActiveCommercialPlanKey,
} from '../commercial-plans/commercial-plan-catalog';
import { resolveExtraSeatMonthlyAmount } from '../commercial-plans/seat-billing.util';
import { ensureVendasComplaintsRuntimeSchema } from '../vendas/vendas-complaints-runtime';
import {
  PRIMARY_COMMERCIAL_MODULE_KEYS,
  ROUTE_GUARDED_MODULE_KEYS,
  resolveCompanyModuleAccessPolicy,
} from './module-access-policy';

type DefaultModuleDef = {
  key: string;
  name: string;
  description: string;
  monthlyPrice?: number;
  defaultEnabled: boolean;
  companyAssignable: boolean;
  serviceUrl?: string;
};

type ModuleCategory = 'commercial' | 'structural' | 'system';

type ModuleAvailability = {
  category: ModuleCategory;
  sortOrder: number;
  entryEligible: boolean;
  blockedByEngine: boolean;
  blockedReason: string | null;
  blockedCode: string | null;
  criticalEngine: string | null;
};

const DEFAULT_MODULES: DefaultModuleDef[] = (structuralDefaults.systemModules as DefaultModuleDef[]).map((moduleDef) => ({
  ...moduleDef,
  serviceUrl: moduleDef.key === 'webscraping'
    ? '/vendas?radar=1'
    : moduleDef.serviceUrl,
}));

const LEGACY_MODULE_KEYS = structuralDefaults.legacyModuleKeys as string[];
const RETIRED_MODULE_KEYS = Array.isArray((structuralDefaults as any).retiredModuleKeys)
  ? ((structuralDefaults as any).retiredModuleKeys as string[])
  : [];
const TRIAL_BUNDLED_MODULE_KEYS = ['atendimento', 'vendas', 'webscraping'];
const EMPLOYEE_BLOCKED_MODULE_KEYS = new Set([
  'atendimento',
  'vendas',
  'webscraping',
  'cadastro',
  'financeiro',
  'gerencial',
  'website',
  'master',
  'exclusoes',
]);
const SELLER_MOBILE_OPERATIONAL_MODULE_KEYS = new Set(['vendas', 'webscraping']);
const HBX_SELLER_OPERATIONAL_MODULE_KEYS = new Set(['vendas', 'webscraping']);
const MODULE_DISPLAY_ORDER = [
  'atendimento',
  'vendas',
  'bot_ia',
  'website',
  'webscraping',
  'cadastro',
  'financeiro',
  'gerencial',
  'master',
  'exclusoes',
];

type BillingLedgerEntryRow = {
  id: string;
  companyId: number;
  entryType: string;
  entryGroup: string;
  status: string;
  origin: string | null;
  currency: string;
  competence: string | null;
  amount: number;
  dueDate: Date | null;
  paidAt: Date | null;
  paymentMethod: string | null;
  referenceLabel: string | null;
  observation: string | null;
  metadata: string | null;
  createdByUserId: number | null;
  createdAt: Date;
  updatedAt: Date;
};

type WebscrapingLatestUsageRow = {
  companyId: number;
  userId: number;
  eventType: string;
  source: string | null;
  resultCount: number;
  reusedCount: number;
  fetchedCount: number;
  technicalCacheUsed: boolean;
  technicalCacheReusedCount: number;
  createdAt: Date;
  city: string | null;
  segment: string | null;
  message: string | null;
  userName: string | null;
  userUsername: string | null;
  userEmail: string | null;
};

type UserConfirmationSummary = {
  confirmed: boolean;
  confirmedUsersCount: number;
  pendingUsersCount: number;
  lastConfirmedAt: string | null;
};

type WebscrapingUsageSummary = ReturnType<ModulesService['buildDefaultWebscrapingUsageSummary']>;
type ModuleAccessContext = {
  mobileRoute?: boolean;
};

@Injectable()
export class ModulesService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integrationConnectionsService: IntegrationConnectionsService,
    private readonly usersService: UsersService,
    private readonly masterContextService: MasterContextService,
    private readonly companyOperationalStatus: CompanyOperationalStatusService,
    private readonly commercialUsageLimits: CommercialUsageLimitsService,
  ) {}

  private async supportsWhatsAppEndpointTable() {
    return this.prisma.hasTable('CompanyWhatsAppEndpoint');
  }

  private buildLegacyEndpointSnapshot(company: any) {
    const phoneNumberId = String(company?.whatsappPhoneNumberId || '').trim();
    const accessToken = String(company?.whatsappAccessToken || '').trim();
    const whatsappNumber = String(company?.whatsappNumber || '').trim();
    if (!phoneNumberId && !accessToken && !whatsappNumber) return [];

    return [
      {
        id: 'legacy-primary',
        label: 'Numero principal',
        moduleKey: null,
        whatsappNumber: company?.whatsappNumber || null,
        whatsappPhoneNumberId: company?.whatsappPhoneNumberId || null,
        whatsappWabaId: company?.whatsappWabaId || null,
        whatsappDisplayNumber: company?.whatsappDisplayNumber || company?.whatsappNumber || null,
        whatsappStatus: company?.whatsappStatus || null,
        whatsappStatusError: company?.whatsappStatusError || null,
        whatsappStatusUpdatedAt: company?.whatsappStatusUpdatedAt || null,
        whatsappAccessToken: company?.whatsappAccessToken || null,
        isActive: true,
        isPrimary: true,
        sortOrder: 0,
      },
    ];
  }

  private normalizeOptionalString(value: unknown) {
    const normalized = String(value || '').trim();
    return normalized || null;
  }

  private previewSecret(value: unknown) {
    const normalized = String(value || '').trim();
    if (!normalized) return null;
    return `***${normalized.slice(-6)}`;
  }

  private preserveMasterWhatsAppCredentialSecrets(input: Array<any>, current: Array<any>) {
    const currentByKey = new Map(
      (current || []).map((entry) => [this.normalizeOptionalString(entry?.key), entry]),
    );
    return (input || []).map((entry) => {
      const accessToken = this.normalizeOptionalString(entry?.accessToken);
      if (accessToken) return entry;

      const currentEntry = currentByKey.get(this.normalizeOptionalString(entry?.key));
      if (!currentEntry?.accessToken) return entry;

      return {
        ...entry,
        accessToken: currentEntry.accessToken,
      };
    });
  }

  private effectiveMercadoPagoAccessToken(company: any, masterIntegrations?: any) {
    if (company?.useMasterMercadoPagoToken) {
      return this.normalizeOptionalString(
        pickMasterMercadoPagoCredential(masterIntegrations, company?.masterMercadoPagoCredentialKey)?.accessToken,
      );
    }
    return this.normalizeOptionalString(company?.mercadoPagoAccessToken);
  }

  private effectiveWhatsAppConfig(company: any, masterIntegrations?: any) {
    if (company?.useMasterWhatsAppToken) {
      const credential = pickMasterWhatsAppCredential(masterIntegrations, company?.masterWhatsAppCredentialKey);
      return {
        accessToken: this.normalizeOptionalString(credential?.accessToken),
        phoneNumberId: this.normalizeOptionalString(credential?.phoneNumberId),
        wabaId: this.normalizeOptionalString(credential?.wabaId),
        whatsappNumber: this.normalizeOptionalString(credential?.whatsappNumber),
        displayNumber:
          this.normalizeOptionalString(credential?.displayNumber) ||
          this.normalizeOptionalString(credential?.whatsappNumber),
      };
    }
    return {
      accessToken: this.normalizeOptionalString(company?.whatsappAccessToken),
      phoneNumberId: this.normalizeOptionalString(company?.whatsappPhoneNumberId),
      wabaId: this.normalizeOptionalString(company?.whatsappWabaId),
      whatsappNumber: this.normalizeOptionalString(company?.whatsappNumber),
      displayNumber:
        this.normalizeOptionalString(company?.whatsappDisplayNumber) ||
        this.normalizeOptionalString(company?.whatsappNumber),
    };
  }

  private mapPaymentStatusToSubscriptionStatus(paymentStatusRaw: string) {
    const normalized = String(paymentStatusRaw || '').trim().toUpperCase();
    if (normalized === 'PAID') return 'active';
    if (normalized === 'TRIAL') return 'trialing';
    if (normalized === 'MANUAL') return 'manual';
    if (normalized === 'DISABLED') return 'canceled';
    if (normalized === 'EXPIRED') return 'expired';
    return 'past_due';
  }

  private parseDateValue(value: unknown) {
    if (!value) return null;
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private startOfMonth(date = new Date()) {
    return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  }

  private startOfNextMonth(date = new Date()) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 1, 0, 0, 0, 0);
  }

  private startOfToday(date = new Date()) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  }

  private startOfTomorrow(date = new Date()) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0);
  }

  private addDays(date: Date, days: number) {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  }

  private monthKey(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  private monthLabel(date: Date) {
    return date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
  }

  private normalizeCurrencyAmount(value: unknown) {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric)) return 0;
    return Number(numeric.toFixed(2));
  }

  private normalizePercentValue(value: unknown) {
    return Math.max(0, this.normalizeCurrencyAmount(value || 0));
  }

  private safeJsonParse(value: unknown) {
    if (value == null) return null;
    if (typeof value === 'object') return value;
    const raw = String(value || '').trim();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return { raw };
    }
  }

  private resolveCompanyMonthlyValue(company: any) {
    if (company?.selectedPlanKey) {
      return this.normalizeCurrencyAmount(getCommercialPlanMonthlyPrice(normalizeCommercialPlanKey(company.selectedPlanKey)));
    }
    return this.normalizeCurrencyAmount(company?.plan?.price || 0);
  }

  private resolveExtraSeatMonthlyAmount(pricingPolicy: any) {
    return this.normalizeCurrencyAmount(resolveExtraSeatMonthlyAmount(pricingPolicy?.extraSeatMonthlyAmount));
  }

  private buildSeatBillingSnapshot(company: any, billingCycle: string, pricingPolicy?: any) {
    const activeUsers = Array.isArray(company?.users)
      ? company.users.filter((user: any) => {
          const role = String(user?.role || '').trim().toUpperCase();
          return Boolean(user?.isActive) && !user?.deactivatedAt && !Boolean(user?.isSystemMaster) && (role === 'USER' || role === 'ADMIN');
        }).length
      : 0;
    const includedActiveUsers = 2;
    const extraActiveUsers = Math.max(0, activeUsers - includedActiveUsers);
    const extraSeatMonthlyAmount = this.resolveExtraSeatMonthlyAmount(pricingPolicy);
    const cycleMultiplier = billingCycle === 'ANNUAL' ? 12 : 1;
    const extraSeatCycleAmount = this.normalizeCurrencyAmount(
      extraActiveUsers * extraSeatMonthlyAmount * cycleMultiplier,
    );

    return {
      activeUsers,
      includedActiveUsers,
      extraActiveUsers,
      extraSeatMonthlyAmount,
      extraSeatCycleAmount,
    };
  }

  private normalizeBillingCycle(value: unknown) {
    return String(value || '').trim().toUpperCase() === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY';
  }

  private buildReferralSnapshot(company: any, referralPolicy?: any) {
    const acquisitionSource = String(company?.acquisitionSource || '').trim().toLowerCase();
    const referrerName = this.normalizeOptionalString(company?.referralReferrerName);
    const referralCode = this.normalizeOptionalString(company?.referralCode);
    const referred = acquisitionSource === 'indicacao' && Boolean(referrerName || referralCode);
    const discountActive = Boolean(referralPolicy?.referralDiscountActive);
    const referralDiscountPercent = this.normalizePercentValue(referralPolicy?.referralDiscountPercent || 0);
    const referralDiscountMode =
      String(referralPolicy?.referralDiscountMode || '').trim().toUpperCase() === 'RECURRING'
        ? 'RECURRING'
        : 'ONCE';
    const consumedAt =
      company?.referralDiscountConsumedAt instanceof Date ? company.referralDiscountConsumedAt.toISOString() : null;
    const eligible = referred && discountActive && referralDiscountPercent > 0;
    const appliesNow = eligible && (referralDiscountMode === 'RECURRING' || !consumedAt);

    return {
      acquisitionSource: acquisitionSource || null,
      acquisitionSourceDetail: this.normalizeOptionalString(company?.acquisitionSourceDetail),
      isReferral: referred,
      referrerName,
      referralCode,
      referralDiscountActive: discountActive,
      referralDiscountPercent,
      referralDiscountMode,
      referralDiscountEligible: eligible,
      referralDiscountAppliesNow: appliesNow,
      referralDiscountConsumedAt: consumedAt,
    };
  }

  private buildCompanyFinanceSnapshot(company: any, companyLedgerRows: BillingLedgerEntryRow[], pricingPolicy?: any) {
    const monthlyValue = this.resolveCompanyMonthlyValue(company);
    const billingCycle = this.normalizeBillingCycle(company?.billingCycle);
    const annualPlanDiscountPercent = this.normalizePercentValue(pricingPolicy?.annualPlanDiscountPercent || 0);
    const manualDiscountPercent = this.normalizePercentValue(company?.manualDiscountPercent || 0);
    const referral = this.buildReferralSnapshot(company, pricingPolicy);
    const freeMonths = Math.max(0, Math.trunc(Number(company?.freeMonths || 0) || 0));
    const basePlanCycleAmount =
      billingCycle === 'ANNUAL'
        ? this.normalizeCurrencyAmount(monthlyValue * 12)
        : monthlyValue;
    const seats = this.buildSeatBillingSnapshot(company, billingCycle, pricingPolicy);
    const baseCycleAmount = this.normalizeCurrencyAmount(basePlanCycleAmount + seats.extraSeatCycleAmount);
    const annualDiscountValue =
      billingCycle === 'ANNUAL'
        ? this.normalizeCurrencyAmount(baseCycleAmount * (annualPlanDiscountPercent / 100))
        : 0;
    const subtotalAfterAnnual = this.normalizeCurrencyAmount(baseCycleAmount - annualDiscountValue);
    const manualDiscountValue = this.normalizeCurrencyAmount(
      subtotalAfterAnnual * (manualDiscountPercent / 100),
    );
    const subtotalAfterManual = Math.max(0, this.normalizeCurrencyAmount(subtotalAfterAnnual - manualDiscountValue));
    const referralDiscountValue = referral.referralDiscountAppliesNow
      ? this.normalizeCurrencyAmount(subtotalAfterManual * (referral.referralDiscountPercent / 100))
      : 0;
    const finalCycleAmount = Math.max(
      0,
      this.normalizeCurrencyAmount(subtotalAfterManual - referralDiscountValue),
    );
    const failedRows = companyLedgerRows.filter((row) =>
      ['FAILED', 'CANCELLED'].includes(String(row.status || '').toUpperCase()),
    );
    const refundRows = companyLedgerRows.filter((row) =>
      ['REFUNDED', 'PARTIALLY_REFUNDED'].includes(String(row.status || '').toUpperCase()),
    );
    const pendingRows = companyLedgerRows.filter((row) => String(row.status || '').toUpperCase() === 'PENDING');

    return {
      billingCycle,
      annualPlanDiscountPercent,
      annualDiscountValue,
      manualDiscountPercent,
      manualDiscountValue,
      referralDiscountPercent: referral.referralDiscountPercent,
      referralDiscountMode: referral.referralDiscountMode,
      referralDiscountValue,
      referralDiscountEligible: referral.referralDiscountEligible,
      referralDiscountAppliedNow: referral.referralDiscountAppliesNow,
      referralDiscountConsumedAt: referral.referralDiscountConsumedAt,
      freeMonths,
      acquisitionSource: referral.acquisitionSource,
      acquisitionSourceDetail: referral.acquisitionSourceDetail,
      referralReferrerName: referral.referrerName,
      referralCode: referral.referralCode,
      isReferral: referral.isReferral,
      basePlanCycleAmount,
      activeUsers: seats.activeUsers,
      includedActiveUsers: seats.includedActiveUsers,
      extraActiveUsers: seats.extraActiveUsers,
      extraSeatMonthlyAmount: seats.extraSeatMonthlyAmount,
      extraSeatCycleAmount: seats.extraSeatCycleAmount,
      cardConfigured: Boolean(company?.billingCardLast4),
      cardBrand: company?.billingCardBrand || null,
      cardLast4: company?.billingCardLast4 || null,
      cardUpdatedAt:
        company?.billingCardUpdatedAt instanceof Date ? company.billingCardUpdatedAt.toISOString() : null,
      pixAvailable: true,
      baseCycleAmount,
      finalCycleAmount,
      pendingCount: pendingRows.length,
      failedCount: failedRows.length,
      refundCount: refundRows.length,
      refundAmount: this.normalizeCurrencyAmount(
        refundRows.reduce((total, row) => total + this.normalizeCurrencyAmount(row.amount), 0),
      ),
      hasPendingIssues: pendingRows.length > 0 || failedRows.length > 0,
    };
  }

  private normalizeLedgerEntryRow(row: BillingLedgerEntryRow) {
    return {
      id: String(row.id),
      companyId: Number(row.companyId),
      entryType: String(row.entryType || ''),
      entryGroup: String(row.entryGroup || 'revenue'),
      status: String(row.status || 'PENDING'),
      origin: row.origin ? String(row.origin) : null,
      currency: String(row.currency || 'BRL'),
      competence: row.competence ? String(row.competence) : null,
      amount: this.normalizeCurrencyAmount(row.amount),
      dueDate: row.dueDate instanceof Date ? row.dueDate.toISOString() : null,
      paidAt: row.paidAt instanceof Date ? row.paidAt.toISOString() : null,
      paymentMethod: row.paymentMethod ? String(row.paymentMethod) : null,
      referenceLabel: row.referenceLabel ? String(row.referenceLabel) : null,
      observation: row.observation ? String(row.observation) : null,
      metadata: this.safeJsonParse(row.metadata),
      createdByUserId: Number(row.createdByUserId || 0) || null,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : null,
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : null,
    };
  }

  private normalizeAuditRow(row: any) {
    return {
      id: String(row?.id || ''),
      companyId: Number(row?.companyId || 0) || null,
      scope: String(row?.scope || ''),
      action: String(row?.action || ''),
      severity: String(row?.severity || 'INFO'),
      route: row?.route ? String(row.route) : null,
      metadata: this.safeJsonParse(row?.metadata),
      masterUserId: Number(row?.masterUserId || 0) || null,
      createdAt: row?.createdAt instanceof Date ? row.createdAt.toISOString() : String(row?.createdAt || ''),
    };
  }

  private toAuditIso(value: unknown) {
    if (value instanceof Date) return value.toISOString();
    return this.normalizeOptionalString(value);
  }

  private buildCompanyAccessAuditSnapshot(company: any) {
    return {
      isActive: Boolean(company?.isActive),
      paymentStatus: this.normalizeOptionalString(company?.paymentStatus),
      subscriptionStatus: this.normalizeOptionalString(company?.subscriptionStatus),
      premiumAccess: Boolean(company?.premiumAccess),
      trialStartsAt: this.toAuditIso(company?.trialStartsAt),
      trialEndsAt: this.toAuditIso(company?.trialEndsAt),
      subscriptionCurrentPeriodStart: this.toAuditIso(company?.subscriptionCurrentPeriodStart),
      subscriptionCurrentPeriodEnd: this.toAuditIso(company?.subscriptionCurrentPeriodEnd),
      deactivatedAt: this.toAuditIso(company?.deactivatedAt),
    };
  }

  private buildCompanyBillingAuditSnapshot(company: any) {
    return {
      paymentStatus: this.normalizeOptionalString(company?.paymentStatus),
      subscriptionStatus: this.normalizeOptionalString(company?.subscriptionStatus),
      billingProvider: this.normalizeOptionalString(company?.billingProvider),
      paymentMethod: this.normalizeOptionalString(company?.paymentMethod),
    };
  }

  private diffStringSets(previousItems: Iterable<string>, currentItems: Iterable<string>) {
    const previous = new Set([...previousItems].map((item) => String(item || '').trim()).filter(Boolean));
    const current = new Set([...currentItems].map((item) => String(item || '').trim()).filter(Boolean));
    return {
      added: [...current].filter((item) => !previous.has(item)).sort(),
      removed: [...previous].filter((item) => !current.has(item)).sort(),
    };
  }

  private buildCompanyProfileAuditSnapshot(company: any) {
    return {
      name: this.normalizeOptionalString(company?.name),
      primaryContactName: this.normalizeOptionalString(company?.primaryContactName),
      contactEmail: this.normalizeOptionalString(company?.contactEmail),
      contactPhone: this.normalizeOptionalString(company?.contactPhone),
      taxDocument: this.normalizeOptionalString(company?.taxDocument),
      paymentMethod: this.normalizeOptionalString(company?.paymentMethod),
      billingProvider: this.normalizeOptionalString(company?.billingProvider),
      subscriptionStatus: this.normalizeOptionalString(company?.subscriptionStatus),
      premiumAccess: Boolean(company?.premiumAccess),
    };
  }

  private buildCompanyFinanceSettingsAuditSnapshot(company: any) {
    return {
      billingCycle: this.normalizeBillingCycle(company?.billingCycle),
      manualDiscountPercent: this.normalizePercentValue(company?.manualDiscountPercent || 0),
      freeMonths: Math.max(0, Math.trunc(Number(company?.freeMonths || 0) || 0)),
    };
  }

  private normalizeQuotaOverride(value: unknown) {
    const parsed = Math.trunc(Number(value || 0));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private resolveCommercialCardQuota(company: any) {
    const planKey = normalizeCommercialPlanKey(company?.selectedPlanKey || COMMERCIAL_PLAN_KEYS.PADRAO);
    const planQuota = COMMERCIAL_PLAN_QUOTAS[planKey as ActiveCommercialPlanKey] || COMMERCIAL_PLAN_QUOTAS[COMMERCIAL_PLAN_KEYS.PADRAO];
    const monthlyOverride = this.normalizeQuotaOverride(company?.commercialCardsMonthlyLimitOverride);
    const dailyOverride = this.normalizeQuotaOverride(company?.commercialCardsDailyLimitOverride);
    return {
      planKey,
      monthlyDefault: Number(planQuota.cardsPerMonth || planQuota.totalCards || 0) || 0,
      dailyDefault: Number(planQuota.dailyCardSafetyLimit || 0) || 0,
      monthlyOverride,
      dailyOverride,
      monthlyEffective: monthlyOverride || Number(planQuota.cardsPerMonth || planQuota.totalCards || 0) || 0,
      dailyEffective: dailyOverride || Number(planQuota.dailyCardSafetyLimit || 0) || 0,
    };
  }

  private buildCompanyCardQuotaAuditSnapshot(company: any) {
    const quota = this.resolveCommercialCardQuota(company);
    return {
      selectedPlanKey: quota.planKey,
      monthlyDefault: quota.monthlyDefault,
      dailyDefault: quota.dailyDefault,
      monthlyOverride: quota.monthlyOverride,
      dailyOverride: quota.dailyOverride,
      monthlyEffective: quota.monthlyEffective,
      dailyEffective: quota.dailyEffective,
    };
  }

  private async listCompanyQuotaOverrides(companyIds: number[]) {
    const normalizedIds = [...new Set(companyIds.map((id) => Math.trunc(Number(id || 0))).filter((id) => id > 0))];
    const result = new Map<number, { commercialCardsMonthlyLimitOverride: number | null; commercialCardsDailyLimitOverride: number | null }>();
    if (!normalizedIds.length) return result;
    await ensureMasterBillingRuntimeSchema(this.prisma);
    const rows = await this.prisma.$queryRawUnsafe<Array<{
      id: number;
      commercialCardsMonthlyLimitOverride: number | null;
      commercialCardsDailyLimitOverride: number | null;
    }>>(
      `SELECT "id", "commercialCardsMonthlyLimitOverride", "commercialCardsDailyLimitOverride"
       FROM "Company"
       WHERE "id" IN (${normalizedIds.join(',')})`,
    );
    for (const row of rows || []) {
      result.set(Number(row.id), {
        commercialCardsMonthlyLimitOverride: this.normalizeQuotaOverride(row.commercialCardsMonthlyLimitOverride),
        commercialCardsDailyLimitOverride: this.normalizeQuotaOverride(row.commercialCardsDailyLimitOverride),
      });
    }
    return result;
  }

  private buildCompanyMasterTokenUsageAuditSnapshot(company: any) {
    return {
      useMasterMercadoPagoToken: Boolean(company?.useMasterMercadoPagoToken),
      useMasterWhatsAppToken: Boolean(company?.useMasterWhatsAppToken),
      masterMercadoPagoCredentialKey: this.normalizeOptionalString(company?.masterMercadoPagoCredentialKey),
      masterWhatsAppCredentialKey: this.normalizeOptionalString(company?.masterWhatsAppCredentialKey),
    };
  }

  private buildWebscrapingUserLabel(row: {
    userName?: string | null;
    userUsername?: string | null;
    userEmail?: string | null;
    userId?: number | null;
  }) {
    const name = String(row?.userName || '').trim();
    if (name) return name;
    const username = String(row?.userUsername || '').trim();
    if (username) return username;
    const email = String(row?.userEmail || '').trim();
    if (email) return email;
    return row?.userId ? `User #${Number(row.userId)}` : null;
  }

  private buildDefaultWebscrapingUsageSummary() {
    return {
      searchesToday: 0,
      blockedToday: 0,
      totalReusedToday: 0,
      fetchedToday: 0,
      globalCacheHitsToday: 0,
      globalCacheReusedToday: 0,
      globalCacheReuseRate: 0,
      lastAttemptAt: null as string | null,
      lastAttemptMessage: null as string | null,
      lastSearchAt: null as string | null,
      lastSearchLabel: null as string | null,
      lastSearchUser: null as string | null,
      lastResultCount: 0,
      lastSearchSource: null as string | null,
      lastTechnicalCacheUsed: false,
      lastTechnicalCacheReusedCount: 0,
      hasBlockedAttempts: false,
    };
  }

  private buildDefaultUserConfirmationSummary(): UserConfirmationSummary {
    return {
      confirmed: false,
      confirmedUsersCount: 0,
      pendingUsersCount: 0,
      lastConfirmedAt: null,
    };
  }

  private async listUserConfirmationSummaryByCompanyIds(companyIds: number[]) {
    const summaries = new Map<number, UserConfirmationSummary>();
    if (!companyIds.length) return summaries;

    const users = await this.prisma.user.findMany({
      where: { companyId: { in: companyIds } },
      select: {
        companyId: true,
        emailConfirmedAt: true,
      },
      orderBy: [{ companyId: 'asc' }, { emailConfirmedAt: 'desc' }],
    });

    for (const user of users) {
      const companyId = Number(user.companyId || 0);
      if (!companyId) continue;
      const current = summaries.get(companyId) || this.buildDefaultUserConfirmationSummary();
      if (user.emailConfirmedAt instanceof Date) {
        current.confirmed = true;
        current.confirmedUsersCount += 1;
        if (!current.lastConfirmedAt) {
          current.lastConfirmedAt = user.emailConfirmedAt.toISOString();
        }
      } else {
        current.pendingUsersCount += 1;
      }
      summaries.set(companyId, current);
    }

    return summaries;
  }

  private async listWebscrapingUsageSummaryByCompanyIds(companyIds: number[]) {
    const summaries = new Map<number, WebscrapingUsageSummary>();
    if (!companyIds.length) return summaries;

    const usageLogEnabled = await this.prisma.hasTable('WebscrapingUsageLog');
    if (!usageLogEnabled) return summaries;

    const dayStart = this.startOfToday();
    const nextDayStart = this.startOfTomorrow();

    const [todayLogs, latestExecutedRows] = await Promise.all([
      this.prisma.webscrapingUsageLog.findMany({
        where: {
          companyId: { in: companyIds },
          createdAt: {
            gte: dayStart,
            lt: nextDayStart,
          },
        },
        orderBy: [{ companyId: 'asc' }, { createdAt: 'desc' }],
        select: {
          companyId: true,
          userId: true,
          eventType: true,
          source: true,
          resultCount: true,
          reusedCount: true,
          fetchedCount: true,
          technicalCacheUsed: true,
          technicalCacheReusedCount: true,
          createdAt: true,
          city: true,
          segment: true,
          message: true,
          user: {
            select: {
              name: true,
              username: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.$queryRaw<WebscrapingLatestUsageRow[]>(
        Prisma.sql`
          SELECT DISTINCT ON (l."companyId")
            l."companyId",
            l."userId",
            l."eventType",
            l."source",
            l."resultCount",
            l."reusedCount",
            l."fetchedCount",
            l."technicalCacheUsed",
            l."technicalCacheReusedCount",
            l."createdAt",
            l."city",
            l."segment",
            l."message",
            u."name" AS "userName",
            u."username" AS "userUsername",
            u."email" AS "userEmail"
          FROM "WebscrapingUsageLog" l
          LEFT JOIN "User" u ON u."id" = l."userId"
          WHERE l."companyId" IN (${Prisma.join(companyIds.map((id) => Number(id)))})
            AND l."eventType" IN ('EXECUTED', 'GOOGLE_SEARCH_EXECUTED', 'GOOGLE_EMERGENCY_EXECUTED')
          ORDER BY l."companyId", l."createdAt" DESC
        `,
      ),
    ]);

    for (const log of todayLogs || []) {
      const companyId = Number(log.companyId || 0);
      if (!companyId) continue;
      const current = summaries.get(companyId) || this.buildDefaultWebscrapingUsageSummary();
      const eventType = String(log.eventType || '').trim().toUpperCase();
      if (eventType === 'EXECUTED' || eventType === 'GOOGLE_SEARCH_EXECUTED' || eventType === 'GOOGLE_EMERGENCY_EXECUTED') {
        current.searchesToday += 1;
        current.totalReusedToday += Math.max(0, Math.trunc(Number(log.reusedCount || 0)));
        current.fetchedToday += Math.max(0, Math.trunc(Number(log.fetchedCount || 0)));
        if (Boolean(log.technicalCacheUsed) || String(log.source || '').trim().toLowerCase() === 'global_cache') {
          current.globalCacheHitsToday += 1;
          current.globalCacheReusedToday += Math.max(
            0,
            Math.trunc(Number(log.technicalCacheReusedCount || 0)),
          );
        }
      }
      if (eventType === 'BLOCKED_DAILY_LIMIT') {
        current.blockedToday += 1;
        current.hasBlockedAttempts = true;
      }
      const createdAtIso = log.createdAt instanceof Date ? log.createdAt.toISOString() : null;
      if (createdAtIso && !current.lastAttemptAt) {
        current.lastAttemptAt = createdAtIso;
        current.lastAttemptMessage = log.message ? String(log.message) : null;
      }
      summaries.set(companyId, current);
    }

    for (const row of latestExecutedRows || []) {
      const companyId = Number(row.companyId || 0);
      if (!companyId) continue;
      const current = summaries.get(companyId) || this.buildDefaultWebscrapingUsageSummary();
      current.lastSearchAt = row.createdAt instanceof Date ? row.createdAt.toISOString() : null;
      current.lastSearchLabel =
        row.city || row.segment
          ? [String(row.segment || '').trim(), String(row.city || '').trim()].filter(Boolean).join(' em ')
          : null;
      current.lastSearchUser = this.buildWebscrapingUserLabel(row);
      current.lastResultCount = Math.max(0, Math.trunc(Number(row.resultCount || 0)));
      current.lastSearchSource = row.source ? String(row.source) : null;
      current.lastTechnicalCacheUsed = Boolean(row.technicalCacheUsed);
      current.lastTechnicalCacheReusedCount = Math.max(
        0,
        Math.trunc(Number(row.technicalCacheReusedCount || 0)),
      );
      summaries.set(companyId, current);
    }

    for (const [companyId, summary] of summaries.entries()) {
      const denominator = summary.totalReusedToday + summary.fetchedToday;
      summary.globalCacheReuseRate =
        denominator > 0 ? Number(((summary.globalCacheReusedToday / denominator) * 100).toFixed(1)) : 0;
      summaries.set(companyId, summary);
    }

    return summaries;
  }

  private companyStatusBucket(company: any) {
    const paymentMethod = String(company?.paymentMethod || '').trim().toUpperCase();
    const paymentStatus = String(company?.paymentStatus || '').trim().toUpperCase();
    const subscriptionStatus = String(company?.subscriptionStatus || '').trim().toLowerCase();
    const trialEndsAt = this.parseDateValue(company?.trialEndsAt);

    if (company?.isActive === false) return 'SUSPENDED';
    if (paymentStatus === 'MANUAL' || subscriptionStatus === 'manual') return 'MANUAL_PREMIUM';
    if (subscriptionStatus === 'authorized') return 'PAYING';
    if (paymentStatus === 'DISABLED' || paymentStatus === 'EXPIRED' || subscriptionStatus === 'canceled' || subscriptionStatus === 'expired') {
      return 'SUSPENDED';
    }
    if (subscriptionStatus === 'trialing') {
      if (trialEndsAt && trialEndsAt.getTime() - Date.now() <= 7 * 24 * 60 * 60 * 1000) {
        return 'TRIAL_ENDING';
      }
      return 'TRIAL';
    }
    if (!paymentMethod || paymentMethod === 'NONE') return 'NO_METHOD';
    if (paymentStatus === 'OVERDUE' || paymentStatus === 'PENDING' || subscriptionStatus === 'past_due') {
      return 'OVERDUE';
    }
    if (paymentStatus === 'PAID' || subscriptionStatus === 'active') {
      return 'PAYING';
    }
    return 'UNKNOWN';
  }

  private computeDaysOverdue(company: any, pendingEntry?: BillingLedgerEntryRow | null) {
    const dueDate =
      this.parseDateValue(pendingEntry?.dueDate) ||
      this.parseDateValue(company?.subscriptionCurrentPeriodEnd) ||
      this.parseDateValue(company?.trialEndsAt);
    if (!dueDate) return 0;
    const diff = Date.now() - dueDate.getTime();
    if (diff <= 0) return 0;
    return Math.ceil(diff / (24 * 60 * 60 * 1000));
  }

  private async insertBillingLedgerEntry(input: {
    companyId: number;
    entryType: string;
    entryGroup?: string;
    status?: string;
    origin?: string | null;
    competence?: string | null;
    amount?: number;
    dueDate?: Date | null;
    paidAt?: Date | null;
    paymentMethod?: string | null;
    referenceLabel?: string | null;
    observation?: string | null;
    metadata?: Record<string, unknown> | null;
    createdByUserId?: number | null;
  }) {
    const now = new Date();
    const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;
    const amount = this.normalizeCurrencyAmount(input.amount || 0);

    await this.prisma.$executeRaw`
      INSERT INTO "MasterBillingLedgerEntry"
      ("id", "companyId", "entryType", "entryGroup", "status", "origin", "currency", "competence", "amount", "dueDate", "paidAt", "paymentMethod", "referenceLabel", "observation", "metadata", "createdByUserId", "createdAt", "updatedAt")
      VALUES (
        ${randomUUID()},
        ${Number(input.companyId)},
        ${String(input.entryType || 'MANUAL_ENTRY')},
        ${String(input.entryGroup || 'revenue')},
        ${String(input.status || 'PENDING')},
        ${input.origin ? String(input.origin) : null},
        ${'BRL'},
        ${input.competence ? String(input.competence) : null},
        ${amount},
        ${input.dueDate || null},
        ${input.paidAt || null},
        ${input.paymentMethod ? String(input.paymentMethod) : null},
        ${input.referenceLabel ? String(input.referenceLabel) : null},
        ${input.observation ? String(input.observation) : null},
        ${metadataJson},
        ${input.createdByUserId ? Number(input.createdByUserId) : null},
        ${now},
        ${now}
      )
    `;
  }

  private async listBillingLedgerEntriesByCompanyIds(companyIds: number[], limit = 1200) {
    if (!companyIds.length) return [] as BillingLedgerEntryRow[];
    const rows = await this.prisma.$queryRaw<BillingLedgerEntryRow[]>(
      Prisma.sql`
        SELECT
          "id",
          "companyId",
          "entryType",
          "entryGroup",
          "status",
          "origin",
          "currency",
          "competence",
          "amount",
          "dueDate",
          "paidAt",
          "paymentMethod",
          "referenceLabel",
          "observation",
          "metadata",
          "createdByUserId",
          "createdAt",
          "updatedAt"
        FROM "MasterBillingLedgerEntry"
        WHERE "companyId" IN (${Prisma.join(companyIds.map((id) => Number(id)))})
        ORDER BY COALESCE("paidAt", "dueDate", "createdAt") DESC, "createdAt" DESC
        LIMIT ${Math.max(1, Math.trunc(limit))}
      `,
    );
    return rows || [];
  }

  async listMasterSystemModules(masterUserId: number) {
    await this.assertMasterUser(masterUserId);
    await ensureMasterBillingRuntimeSchema(this.prisma);
    await this.ensureDefaultSystemModules();

    const modules = await this.prisma.systemModule.findMany({
      where: {
        key: {
          notIn: RETIRED_MODULE_KEYS,
        },
      },
      orderBy: [{ companyAssignable: 'desc' }, { name: 'asc' }, { id: 'asc' }],
    });

    return modules.map((moduleItem) => ({
      id: moduleItem.id,
      key: moduleItem.key,
      name: moduleItem.name,
      description: moduleItem.description || null,
      monthlyPrice: this.normalizeCurrencyAmount((moduleItem as any).monthlyPrice || 0),
      defaultEnabled: Boolean(moduleItem.defaultEnabled),
      companyAssignable: Boolean(moduleItem.companyAssignable),
      serviceUrl: moduleItem.serviceUrl || null,
    }));
  }

  async updateMasterSystemModule(
    masterUserId: number,
    moduleKey: string,
    input: { monthlyPrice?: number; name?: string; description?: string; defaultEnabled?: boolean },
  ) {
    await this.assertMasterUser(masterUserId);
    await ensureMasterBillingRuntimeSchema(this.prisma);
    await this.ensureDefaultSystemModules();

    const key = this.normalizeKey(moduleKey);
    const moduleItem = await this.prisma.systemModule.findUnique({ where: { key } });
    if (!moduleItem) throw new BadRequestException('Modulo nao encontrado');

    const updateData: Prisma.SystemModuleUpdateInput = {};
    if (input?.name !== undefined) updateData.name = String(input.name || '').trim() || moduleItem.name;
    if (input?.description !== undefined) {
      updateData.description = this.normalizeOptionalString(input.description);
    }
    if (input?.monthlyPrice !== undefined) {
      updateData.monthlyPrice = this.normalizeCurrencyAmount(input.monthlyPrice);
    }
    if (input?.defaultEnabled !== undefined) {
      updateData.defaultEnabled = Boolean(input.defaultEnabled);
    }

    const updated = await this.prisma.systemModule.update({
      where: { id: moduleItem.id },
      data: updateData,
    });

    await this.masterContextService.registerSupportAction({
      masterUserId,
      scope: 'master_module_catalog',
      action: 'SYSTEM_MODULE_UPDATED',
      metadata: {
        moduleKey: updated.key,
        monthlyPrice: this.normalizeCurrencyAmount((updated as any).monthlyPrice || 0),
        defaultEnabled: Boolean(updated.defaultEnabled),
      },
    });

    return {
      id: updated.id,
      key: updated.key,
      name: updated.name,
      description: updated.description || null,
      monthlyPrice: this.normalizeCurrencyAmount((updated as any).monthlyPrice || 0),
      defaultEnabled: Boolean(updated.defaultEnabled),
      companyAssignable: Boolean(updated.companyAssignable),
      serviceUrl: updated.serviceUrl || null,
    };
  }

  async getMasterGlobalIntegrations(masterUserId: number) {
    await this.assertMasterUser(masterUserId);
    const config = await getMasterGlobalIntegrationConfig(this.prisma);
    return serializeMasterGlobalIntegrationConfig(config);
  }

  async updateMasterGlobalIntegrations(
    masterUserId: number,
    input: {
      mercadoPagoLibrary?: Array<any>;
      whatsappLibrary?: Array<any>;
    },
  ) {
    await this.assertMasterUser(masterUserId);
    await ensureMasterBillingRuntimeSchema(this.prisma);
    const existing = await getMasterGlobalIntegrationConfig(this.prisma);
    const currentLibraries = normalizeMasterGlobalIntegrationConfig(existing);
    const whatsappLibraryInput =
      input?.whatsappLibrary !== undefined
        ? this.preserveMasterWhatsAppCredentialSecrets(input.whatsappLibrary, currentLibraries.whatsappLibrary)
        : currentLibraries.whatsappLibrary;
    const serializedLibraries = serializeMasterIntegrationLibrariesForStorage({
      mercadoPagoLibrary:
        input?.mercadoPagoLibrary !== undefined
          ? input.mercadoPagoLibrary
          : currentLibraries.mercadoPagoLibrary,
      whatsappLibrary: whatsappLibraryInput,
    });
    const primaryMercadoPago = serializedLibraries.mercadoPagoLibrary.find((entry) => Boolean(entry.accessToken)) || null;
    const primaryWhatsApp =
      serializedLibraries.whatsappLibrary.find((entry) => Boolean(entry.accessToken && entry.phoneNumberId)) || null;

    const updated = await this.prisma.masterGlobalIntegrationConfig.update({
      where: { key: existing.key },
      data: {
        mercadoPagoAccessToken: primaryMercadoPago?.accessToken || null,
        whatsappAccessToken: primaryWhatsApp?.accessToken || null,
        whatsappPhoneNumberId: primaryWhatsApp?.phoneNumberId || null,
        whatsappWabaId: primaryWhatsApp?.wabaId || null,
        whatsappNumber: primaryWhatsApp?.whatsappNumber || null,
        whatsappDisplayNumber: primaryWhatsApp?.displayNumber || null,
        mercadoPagoLibrary: serializedLibraries.mercadoPagoLibraryJson,
        whatsappLibrary: serializedLibraries.whatsappLibraryJson,
      },
    });

    await this.masterContextService.registerSupportAction({
      masterUserId,
      scope: 'master_global_integrations',
      action: 'MASTER_GLOBAL_TOKENS_UPDATED',
      metadata: {
        mercadoPagoCredentials: serializedLibraries.mercadoPagoLibrary.length,
        whatsappCredentials: serializedLibraries.whatsappLibrary.length,
      },
    });

    return serializeMasterGlobalIntegrationConfig(updated);
  }

  async updateMasterBillingPolicy(
    masterUserId: number,
    input: {
      annualPlanDiscountPercent?: number;
      extraSeatMonthlyAmount?: number;
      referralDiscountActive?: boolean;
      referralDiscountPercent?: number;
      referralDiscountMode?: string;
    },
  ) {
    await this.assertMasterUser(masterUserId);
    await ensureMasterBillingRuntimeSchema(this.prisma);
    const current = await getMasterGlobalIntegrationConfig(this.prisma);
    const annualPlanDiscountPercent =
      input?.annualPlanDiscountPercent !== undefined
        ? this.normalizePercentValue(input.annualPlanDiscountPercent)
        : this.normalizePercentValue((current as any)?.annualPlanDiscountPercent || 0);
    const referralDiscountActive =
      input?.referralDiscountActive !== undefined
        ? Boolean(input.referralDiscountActive)
        : Boolean((current as any)?.referralDiscountActive);
    const extraSeatMonthlyAmount =
      input?.extraSeatMonthlyAmount !== undefined
        ? this.normalizeCurrencyAmount(input.extraSeatMonthlyAmount)
        : this.normalizeCurrencyAmount((current as any)?.extraSeatMonthlyAmount || 0);
    const referralDiscountPercent =
      input?.referralDiscountPercent !== undefined
        ? this.normalizePercentValue(input.referralDiscountPercent)
        : this.normalizePercentValue((current as any)?.referralDiscountPercent || 0);
    const referralDiscountMode =
      String(input?.referralDiscountMode ?? ((current as any)?.referralDiscountMode || ''))
        .trim()
        .toUpperCase() === 'RECURRING'
        ? 'RECURRING'
        : 'ONCE';

    const updated = await this.prisma.masterGlobalIntegrationConfig.update({
      where: { key: current.key },
      data: {
        annualPlanDiscountPercent,
        extraSeatMonthlyAmount,
        referralDiscountActive,
        referralDiscountPercent,
        referralDiscountMode,
      },
    });

    await this.masterContextService.registerSupportAction({
      masterUserId,
      scope: 'master_billing',
      action: 'MASTER_BILLING_POLICY_UPDATED',
      metadata: {
        annualPlanDiscountPercent,
        extraSeatMonthlyAmount,
        referralDiscountActive,
        referralDiscountPercent,
        referralDiscountMode,
      },
    });

    return serializeMasterGlobalIntegrationConfig(updated);
  }

  async listMasterCompanyIntegrations(masterUserId: number, companyId: number, provider?: string) {
    await this.assertMasterUser(masterUserId);
    await this.assertCompanyExists(companyId);
    return this.integrationConnectionsService.listByCompanyId(companyId, provider);
  }

  async createMasterCompanyIntegration(
    masterUserId: number,
    companyId: number,
    dto: CreateIntegrationConnectionDto,
  ) {
    await this.assertMasterUser(masterUserId);
    await this.assertCompanyExists(companyId);
    return this.integrationConnectionsService.createByCompanyId(companyId, dto);
  }

  async updateMasterCompanyIntegration(
    masterUserId: number,
    companyId: number,
    connectionId: string,
    dto: UpdateIntegrationConnectionDto,
  ) {
    await this.assertMasterUser(masterUserId);
    await this.assertCompanyExists(companyId);
    return this.integrationConnectionsService.updateByCompanyId(companyId, connectionId, dto);
  }

  async testMasterCompanyIntegration(masterUserId: number, companyId: number, connectionId: string) {
    await this.assertMasterUser(masterUserId);
    await this.assertCompanyExists(companyId);
    return this.integrationConnectionsService.testByCompanyId(companyId, connectionId);
  }

  async syncMasterCompanyIntegration(
    masterUserId: number,
    companyId: number,
    connectionId: string,
    dto?: IntegrationSyncDto,
  ) {
    await this.assertMasterUser(masterUserId);
    await this.assertCompanyExists(companyId);
    return this.integrationConnectionsService.syncNowByCompanyId(companyId, connectionId, dto || {});
  }

  async updateCompanyMasterTokenUsage(
    masterUserId: number,
    companyId: number,
    input: {
      useMasterMercadoPagoToken?: boolean;
      useMasterWhatsAppToken?: boolean;
      masterMercadoPagoCredentialKey?: string;
      masterWhatsAppCredentialKey?: string;
    },
  ) {
    await this.assertMasterUser(masterUserId);
    await ensureMasterBillingRuntimeSchema(this.prisma);

    const company = await this.prisma.company.findUnique({ where: { id: Number(companyId) } });
    if (!company) throw new BadRequestException('Empresa nao encontrada');
  const previousState = this.buildCompanyMasterTokenUsageAuditSnapshot(company);
    const masterConfig = await getMasterGlobalIntegrationConfig(this.prisma);
    const serializedConfig = serializeMasterGlobalIntegrationConfig(masterConfig);
    const selectedMercadoPago = input?.masterMercadoPagoCredentialKey
      ? serializedConfig.mercadoPagoLibrary.find((entry) => entry.key === this.normalizeOptionalString(input.masterMercadoPagoCredentialKey))
      : serializedConfig.mercadoPagoLibrary.find((entry) => entry.key === company.masterMercadoPagoCredentialKey) ||
        serializedConfig.mercadoPagoLibrary.find((entry) => entry.configured);
    const selectedWhatsApp = input?.masterWhatsAppCredentialKey
      ? serializedConfig.whatsappLibrary.find((entry) => entry.key === this.normalizeOptionalString(input.masterWhatsAppCredentialKey))
      : serializedConfig.whatsappLibrary.find((entry) => entry.key === company.masterWhatsAppCredentialKey) ||
        serializedConfig.whatsappLibrary.find((entry) => entry.configured);

    if (input?.useMasterMercadoPagoToken === true && !selectedMercadoPago?.configured) {
      throw new BadRequestException('Escolha antes uma credencial de pagamentos configurada no MASTER.');
    }
    if (
      input?.useMasterWhatsAppToken === true &&
      !selectedWhatsApp?.configured
    ) {
      throw new BadRequestException('Escolha antes uma credencial de WhatsApp configurada no MASTER.');
    }

    const updated = await this.prisma.company.update({
      where: { id: company.id },
      data: {
        useMasterMercadoPagoToken:
          input?.useMasterMercadoPagoToken !== undefined
            ? Boolean(input.useMasterMercadoPagoToken)
            : company.useMasterMercadoPagoToken,
        useMasterWhatsAppToken:
          input?.useMasterWhatsAppToken !== undefined
            ? Boolean(input.useMasterWhatsAppToken)
            : company.useMasterWhatsAppToken,
        masterMercadoPagoCredentialKey:
          input?.masterMercadoPagoCredentialKey !== undefined
            ? this.normalizeOptionalString(input.masterMercadoPagoCredentialKey)
            : company.masterMercadoPagoCredentialKey,
        masterWhatsAppCredentialKey:
          input?.masterWhatsAppCredentialKey !== undefined
            ? this.normalizeOptionalString(input.masterWhatsAppCredentialKey)
            : company.masterWhatsAppCredentialKey,
      },
    });

    await this.masterContextService.registerSupportAction({
      masterUserId,
      companyId,
      scope: 'master_global_integrations',
      action: 'COMPANY_MASTER_TOKEN_USAGE_UPDATED',
      metadata: {
        previousState,
        currentState: this.buildCompanyMasterTokenUsageAuditSnapshot(updated),
      },
    });

    return {
      ok: true,
      companyId: updated.id,
      useMasterMercadoPagoToken: Boolean(updated.useMasterMercadoPagoToken),
      useMasterWhatsAppToken: Boolean(updated.useMasterWhatsAppToken),
      masterMercadoPagoCredentialKey: updated.masterMercadoPagoCredentialKey || null,
      masterWhatsAppCredentialKey: updated.masterWhatsAppCredentialKey || null,
    };
  }

  async importCompanyTokensToMaster(
    masterUserId: number,
    companyId: number,
    input?: { clearSource?: boolean },
  ) {
    await this.assertMasterUser(masterUserId);
    await ensureMasterBillingRuntimeSchema(this.prisma);

    const company = await this.prisma.company.findUnique({ where: { id: Number(companyId) } });
    if (!company) throw new BadRequestException('Empresa nao encontrada');
  const previousState = this.buildCompanyMasterTokenUsageAuditSnapshot(company);

    const mercadoPagoAccessToken = this.normalizeOptionalString(company.mercadoPagoAccessToken);
    const whatsappAccessToken = this.normalizeOptionalString(company.whatsappAccessToken);
    const whatsappPhoneNumberId = this.normalizeOptionalString(company.whatsappPhoneNumberId);
    const whatsappWabaId = this.normalizeOptionalString(company.whatsappWabaId);
    const whatsappNumber = this.normalizeOptionalString(company.whatsappNumber);
    const whatsappDisplayNumber =
      this.normalizeOptionalString(company.whatsappDisplayNumber) || whatsappNumber;

    if (!mercadoPagoAccessToken && !(whatsappAccessToken && whatsappPhoneNumberId)) {
      throw new BadRequestException('A empresa nao possui tokens-raiz para importar ao MASTER.');
    }

    const masterConfig = await getMasterGlobalIntegrationConfig(this.prisma);
    const clearSource = input?.clearSource !== false;
    const serializedMaster = normalizeMasterGlobalIntegrationConfig(masterConfig);
    const mercadoPagoLibrary = serializedMaster.mercadoPagoLibrary.map((entry) => ({ ...entry }));
    const whatsappLibrary = serializedMaster.whatsappLibrary.map((entry) => ({ ...entry }));

    let importedMercadoPagoKey: string | null = null;
    let importedWhatsAppKey: string | null = null;

    if (mercadoPagoAccessToken) {
      const existingMercadoPago =
        mercadoPagoLibrary.find((entry) => entry.accessToken === mercadoPagoAccessToken) || null;
      if (existingMercadoPago) {
        importedMercadoPagoKey = existingMercadoPago.key;
      } else {
        const createdAt = new Date().toISOString();
        const created = {
          key: randomUUID(),
          label: `${company.name} Pagamentos`,
          accessToken: mercadoPagoAccessToken,
          sourceCompanyId: company.id,
          sourceCompanyName: company.name,
          createdAt,
          updatedAt: createdAt,
        };
        mercadoPagoLibrary.unshift(created);
        importedMercadoPagoKey = created.key;
      }
    }

    if (whatsappAccessToken && whatsappPhoneNumberId) {
      const existingWhatsApp =
        whatsappLibrary.find(
          (entry) =>
            entry.accessToken === whatsappAccessToken && entry.phoneNumberId === whatsappPhoneNumberId,
        ) || null;
      if (existingWhatsApp) {
        importedWhatsAppKey = existingWhatsApp.key;
      } else {
        const createdAt = new Date().toISOString();
        const created = {
          key: randomUUID(),
          label: whatsappDisplayNumber || whatsappNumber || `${company.name} WhatsApp`,
          accessToken: whatsappAccessToken,
          phoneNumberId: whatsappPhoneNumberId,
          wabaId: whatsappWabaId,
          whatsappNumber,
          displayNumber: whatsappDisplayNumber,
          sourceCompanyId: company.id,
          sourceCompanyName: company.name,
          createdAt,
          updatedAt: createdAt,
        };
        whatsappLibrary.unshift(created);
        importedWhatsAppKey = created.key;
      }
    }

    const serializedLibraries = serializeMasterIntegrationLibrariesForStorage({
      mercadoPagoLibrary,
      whatsappLibrary,
    });
    const primaryMercadoPago = serializedLibraries.mercadoPagoLibrary.find((entry) => Boolean(entry.accessToken)) || null;
    const primaryWhatsApp =
      serializedLibraries.whatsappLibrary.find((entry) => Boolean(entry.accessToken && entry.phoneNumberId)) || null;

    const updatedMaster = await this.prisma.masterGlobalIntegrationConfig.update({
      where: { key: masterConfig.key },
      data: {
        mercadoPagoAccessToken: primaryMercadoPago?.accessToken || null,
        whatsappAccessToken: primaryWhatsApp?.accessToken || null,
        whatsappPhoneNumberId: primaryWhatsApp?.phoneNumberId || null,
        whatsappWabaId: primaryWhatsApp?.wabaId || null,
        whatsappNumber: primaryWhatsApp?.whatsappNumber || null,
        whatsappDisplayNumber: primaryWhatsApp?.displayNumber || null,
        mercadoPagoLibrary: serializedLibraries.mercadoPagoLibraryJson,
        whatsappLibrary: serializedLibraries.whatsappLibraryJson,
      },
    });

    const companyUpdateData: Prisma.CompanyUpdateInput = {
      useMasterMercadoPagoToken: mercadoPagoAccessToken ? true : company.useMasterMercadoPagoToken,
      useMasterWhatsAppToken:
        whatsappAccessToken && whatsappPhoneNumberId ? true : company.useMasterWhatsAppToken,
      masterMercadoPagoCredentialKey: importedMercadoPagoKey || company.masterMercadoPagoCredentialKey,
      masterWhatsAppCredentialKey: importedWhatsAppKey || company.masterWhatsAppCredentialKey,
    };

    if (clearSource) {
      if (mercadoPagoAccessToken) {
        companyUpdateData.mercadoPagoAccessToken = null;
        companyUpdateData.mercadoPagoStatus = 'DISCONNECTED';
        companyUpdateData.mercadoPagoStatusError = null;
        companyUpdateData.mercadoPagoStatusUpdatedAt = new Date();
      }
      if (whatsappAccessToken && whatsappPhoneNumberId) {
        companyUpdateData.whatsappAccessToken = null;
        companyUpdateData.whatsappPhoneNumberId = null;
        companyUpdateData.whatsappWabaId = null;
        companyUpdateData.whatsappNumber = null;
        companyUpdateData.whatsappDisplayNumber = null;
        companyUpdateData.whatsappStatus = 'DISCONNECTED';
        companyUpdateData.whatsappStatusError = null;
        companyUpdateData.whatsappStatusUpdatedAt = new Date();
      }
    }

    const updatedCompany = await this.prisma.company.update({
      where: { id: company.id },
      data: companyUpdateData,
    });

    await this.masterContextService.registerSupportAction({
      masterUserId,
      companyId,
      scope: 'master_global_integrations',
      action: 'COMPANY_TOKENS_IMPORTED_TO_MASTER',
      metadata: {
        clearSource,
        importedMercadoPago: Boolean(mercadoPagoAccessToken),
        importedWhatsApp: Boolean(whatsappAccessToken && whatsappPhoneNumberId),
        previousState,
        currentState: this.buildCompanyMasterTokenUsageAuditSnapshot(updatedCompany),
        sourceCredentialsCleared: {
          mercadoPago: Boolean(clearSource && mercadoPagoAccessToken),
          whatsapp: Boolean(clearSource && whatsappAccessToken && whatsappPhoneNumberId),
        },
      },
    });

    return {
      ok: true,
      companyId: updatedCompany.id,
      companyName: updatedCompany.name,
      clearSource,
      masterIntegrations: serializeMasterGlobalIntegrationConfig(updatedMaster),
      company: {
        useMasterMercadoPagoToken: Boolean(updatedCompany.useMasterMercadoPagoToken),
        useMasterWhatsAppToken: Boolean(updatedCompany.useMasterWhatsAppToken),
        masterMercadoPagoCredentialKey: updatedCompany.masterMercadoPagoCredentialKey || null,
        masterWhatsAppCredentialKey: updatedCompany.masterWhatsAppCredentialKey || null,
      },
    };
  }

  private async listCompanyAuditRows(companyIds: number[], limit = 400) {
    if (!companyIds.length) return [] as Array<any>;
    return this.prisma.$queryRaw<Array<any>>(
      Prisma.sql`
        SELECT
          "id",
          "companyId",
          "scope",
          "action",
          "severity",
          "route",
          "metadata",
          "masterUserId",
          "createdAt"
        FROM "MasterSupportAuditLog"
        WHERE "companyId" IN (${Prisma.join(companyIds.map((id) => Number(id)))})
        ORDER BY "createdAt" DESC
        LIMIT ${Math.max(1, Math.trunc(limit))}
      `,
    );
  }

  async onModuleInit() {
    await ensureMasterBillingRuntimeSchema(this.prisma);
    await this.ensureDefaultSystemModules();
    await this.removeRetiredSystemModules();
    await this.ensureDatabaseAutomation();
    await this.syncCompanyModulesForAllCompanies();
    await this.ensureTrialBundleForAllCompanies();
  }

  private normalizeKey(key: string) {
    return String(key || '').trim().toLowerCase();
  }

  private getModuleCandidateKeys(moduleKey: string) {
    const key = this.normalizeKey(moduleKey);
    if (key === 'atendimento' || key === 'hbx_recovery') {
      return ['atendimento', 'hbx_recovery'];
    }
    return [key];
  }

  private isRetiredModuleKey(moduleKey: string) {
    return RETIRED_MODULE_KEYS.includes(this.normalizeKey(moduleKey));
  }

  private normalizeRequestedModuleKey(moduleKey: string) {
    const key = this.normalizeKey(moduleKey);
    return key === 'hbx_recovery' ? 'atendimento' : key;
  }

  private isTrialBundledModuleKey(moduleKey: string) {
    return TRIAL_BUNDLED_MODULE_KEYS.includes(this.normalizeRequestedModuleKey(moduleKey));
  }

  private async ensureTrialBundleForCompany(companyId: number) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { trialModuleSelection: true },
    });
    if (String(company?.trialModuleSelection || '').trim().toLowerCase() !== 'vendas') return;

    const moduleRows = await this.prisma.systemModule.findMany({
      where: {
        companyAssignable: true,
        key: { in: TRIAL_BUNDLED_MODULE_KEYS },
      },
      select: { id: true },
    });
    if (!moduleRows.length) return;

    await this.prisma.$transaction(async (tx) => {
      for (const moduleRow of moduleRows) {
        await tx.companyModule.upsert({
          where: {
            companyId_moduleId: {
              companyId,
              moduleId: moduleRow.id,
            },
          },
          update: { enabled: true },
          create: { companyId, moduleId: moduleRow.id, enabled: true },
        });
      }

      await tx.userModuleAccess.updateMany({
        where: {
          moduleId: { in: moduleRows.map((moduleRow) => moduleRow.id) },
          user: { companyId },
          allowed: false,
        },
        data: { allowed: true },
      });
    });
  }

  private async ensureTrialBundleForAllCompanies() {
    const companies = await this.prisma.company.findMany({
      where: { trialModuleSelection: 'vendas' },
      select: { id: true },
    });

    for (const company of companies) {
      await this.ensureTrialBundleForCompany(company.id);
    }
  }

  private getModuleCategory(moduleKey: string): ModuleCategory {
    const normalized = this.normalizeRequestedModuleKey(moduleKey);
    if (normalized === 'financeiro' || normalized === 'gerencial' || normalized === 'cadastro') return 'structural';
    if (normalized === 'master' || normalized === 'exclusoes') return 'system';
    return 'commercial';
  }

  private getModuleSortOrder(moduleKey: string) {
    const normalized = this.normalizeRequestedModuleKey(moduleKey);
    const index = MODULE_DISPLAY_ORDER.indexOf(normalized);
    return index >= 0 ? index : MODULE_DISPLAY_ORDER.length + 10;
  }

  private async buildModuleAvailabilityMap(companyId: number, moduleKeys: string[]) {
    const normalizedKeys = Array.from(
      new Set((moduleKeys || []).map((moduleKey) => this.normalizeRequestedModuleKey(moduleKey)).filter(Boolean)),
    );
    const availabilityMap = new Map<string, ModuleAvailability>();
    if (!normalizedKeys.length) return availabilityMap;

    const company = await this.prisma.company.findUnique({
      where: { id: Number(companyId) },
      select: {
        whatsappAccessToken: true,
        whatsappPhoneNumberId: true,
        whatsappWabaId: true,
        whatsappNumber: true,
        whatsappDisplayNumber: true,
        whatsappStatus: true,
        whatsappModalStatus: true,
        useMasterWhatsAppToken: true,
        masterWhatsAppCredentialKey: true,
      },
    });

    const masterIntegrations = company?.useMasterWhatsAppToken
      ? await getMasterGlobalIntegrationConfig(this.prisma)
      : null;
    const effectiveWhatsApp = company ? this.effectiveWhatsAppConfig(company, masterIntegrations) : null;
    const officialConfigured = Boolean(effectiveWhatsApp?.accessToken && effectiveWhatsApp?.phoneNumberId);
    const officialConnected =
      officialConfigured && String(company?.whatsappStatus || '').trim().toUpperCase() === 'CONNECTED';
    const modalConfigured = ['1', 'true', 'yes', 'on'].includes(
      String(process.env.WHATSAPP_MODAL_ENABLED || '').trim().toLowerCase(),
    ) && Boolean(String(process.env.WHATSAPP_MODAL_INTERNAL_URL || '').trim());
    const modalConnected = ['CONNECTED', 'RECONNECTING'].includes(
      String(company?.whatsappModalStatus || '').trim().toUpperCase(),
    );
    const hasOperationalWhatsAppEngine = officialConnected || modalConnected;
    for (const moduleKey of normalizedKeys) {
      const category = this.getModuleCategory(moduleKey);
      let blockedByEngine = false;
      let blockedReason: string | null = null;
      let blockedCode: string | null = null;
      let criticalEngine: string | null = null;

      if (moduleKey === 'atendimento' && !hasOperationalWhatsAppEngine) {
        blockedByEngine = true;
        blockedCode = officialConfigured || modalConfigured
          ? 'whatsapp_not_operational'
          : 'whatsapp_missing';
        blockedReason = officialConfigured || modalConfigured
          ? 'Conclua a conexão do motor de WhatsApp para liberar Atendimento.'
          : 'Configure WhatsApp/Meta para liberar Atendimento.';
        criticalEngine = 'whatsapp';
      }

      availabilityMap.set(moduleKey, {
        category,
        sortOrder: this.getModuleSortOrder(moduleKey),
        entryEligible: category === 'commercial',
        blockedByEngine,
        blockedReason,
        blockedCode,
        criticalEngine,
      });
    }

    return availabilityMap;
  }

  private async resolveUserContext(userId: number) {
    const user = await this.usersService.findById(Number(userId));
    if (!user) throw new ForbiddenException('Usuario nao encontrado');
    let companyId = user.companyId ? Number(user.companyId) : null;
    if ((user as any).isSystemMaster) {
      const runtimeContext = await this.masterContextService.resolveRuntimeContext(user);
      companyId = runtimeContext.effectiveCompanyId || null;
    }
    // Attach a lightweight company object to the user so callers can access
    // company-related fields via `user.company` without changing all callers.
    let company = null;
    if (companyId) {
      company = await this.prisma.company.findUnique({
        where: { id: Number(companyId) },
        select: {
          id: true,
          paymentStatus: true,
          subscriptionStatus: true,
          premiumAccess: true,
          trialEndsAt: true,
          billingGraceEndsAt: true,
          isActive: true,
        },
      });
    }
    (user as any).company = company;

    return { user, companyId, isSystemMaster: Boolean((user as any).isSystemMaster) };
  }

  private async assertMasterUser(masterUserId: number) {
    const { isSystemMaster } = await this.resolveUserContext(masterUserId);
    if (!isSystemMaster) throw new ForbiddenException('Acesso exclusivo do usuario MASTER');
  }

  private async assertCompanyExists(companyId: number) {
    const company = await this.prisma.company.findUnique({
      where: { id: Number(companyId) },
      select: { id: true },
    });
    if (!company) throw new BadRequestException('Empresa nao encontrada');
  }

  private async ensureDatabaseAutomation() {
    await this.prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION public.ensure_company_modules_from_company()
      RETURNS trigger AS $$
      BEGIN
        INSERT INTO "CompanyModule" ("companyId", "moduleId", "enabled", "createdAt", "updatedAt")
        SELECT NEW.id, sm.id, sm."defaultEnabled", NOW(), NOW()
        FROM "SystemModule" sm
        WHERE sm."companyAssignable" = true
        ON CONFLICT ("companyId", "moduleId") DO NOTHING;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await this.prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS trg_company_insert_modules ON "Company";');
    await this.prisma.$executeRawUnsafe(`
      CREATE TRIGGER trg_company_insert_modules
      AFTER INSERT ON "Company"
      FOR EACH ROW
      EXECUTE FUNCTION public.ensure_company_modules_from_company();
    `);

    await this.prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION public.ensure_company_modules_from_system_module()
      RETURNS trigger AS $$
      BEGIN
        IF NEW."companyAssignable" = true THEN
          INSERT INTO "CompanyModule" ("companyId", "moduleId", "enabled", "createdAt", "updatedAt")
          SELECT c.id, NEW.id, NEW."defaultEnabled", NOW(), NOW()
          FROM "Company" c
          ON CONFLICT ("companyId", "moduleId") DO NOTHING;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await this.prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS trg_system_module_insert_companies ON "SystemModule";');
    await this.prisma.$executeRawUnsafe(`
      CREATE TRIGGER trg_system_module_insert_companies
      AFTER INSERT ON "SystemModule"
      FOR EACH ROW
      EXECUTE FUNCTION public.ensure_company_modules_from_system_module();
    `);
  }

  private async ensureDefaultSystemModules() {
    await ensureMasterBillingRuntimeSchema(this.prisma);

    for (const moduleDef of DEFAULT_MODULES) {
      await this.prisma.systemModule.upsert({
        where: { key: moduleDef.key },
        update: {
          name: moduleDef.name,
          description: moduleDef.description,
          defaultEnabled: moduleDef.defaultEnabled,
          companyAssignable: moduleDef.companyAssignable,
          serviceUrl: moduleDef.serviceUrl ?? null,
        },
        create: {
          key: moduleDef.key,
          name: moduleDef.name,
          description: moduleDef.description,
          monthlyPrice: this.normalizeCurrencyAmount(moduleDef.monthlyPrice || 0),
          defaultEnabled: moduleDef.defaultEnabled,
          companyAssignable: moduleDef.companyAssignable,
          serviceUrl: moduleDef.serviceUrl ?? null,
        },
      });
    }

    await this.prisma.systemModule.updateMany({
      where: { key: { in: LEGACY_MODULE_KEYS } },
      data: {
        companyAssignable: false,
        defaultEnabled: false,
      },
    });
  }

  private async removeRetiredSystemModules() {
    if (!RETIRED_MODULE_KEYS.length) return;

    const retiredModules = await this.prisma.systemModule.findMany({
      where: { key: { in: RETIRED_MODULE_KEYS } },
      select: { id: true },
    });
    if (!retiredModules.length) return;

    const retiredModuleIds = retiredModules.map((moduleItem) => moduleItem.id);

    await this.prisma.$transaction([
      this.prisma.userModuleAccess.deleteMany({ where: { moduleId: { in: retiredModuleIds } } }),
      this.prisma.companyModule.deleteMany({ where: { moduleId: { in: retiredModuleIds } } }),
      this.prisma.systemModule.deleteMany({ where: { id: { in: retiredModuleIds } } }),
    ]);
  }

  private async syncCompanyModulesForAllCompanies() {
    await this.prisma.$executeRawUnsafe(`
      INSERT INTO "CompanyModule" ("companyId", "moduleId", "enabled", "createdAt", "updatedAt")
      SELECT c.id, sm.id, sm."defaultEnabled", NOW(), NOW()
      FROM "Company" c
      CROSS JOIN "SystemModule" sm
      WHERE sm."companyAssignable" = true
      ON CONFLICT ("companyId", "moduleId") DO NOTHING;
    `);
  }

  private async evaluateCompanyStatus(
    companyId: number,
    companySnapshot?: {
      id?: number | null;
      slug?: string | null;
      isActive?: boolean | null;
      paymentStatus?: string | null;
      subscriptionStatus?: string | null;
      premiumAccess?: boolean | null;
      trialEndsAt?: Date | string | null;
      billingGraceEndsAt?: Date | string | null;
    } | null,
  ) {
    const normalizedSnapshotId = Number(companySnapshot?.id || 0);
    const company = normalizedSnapshotId === companyId
      ? {
          id: companyId,
          slug: companySnapshot?.slug || null,
          isActive: Boolean(companySnapshot?.isActive),
          paymentStatus: companySnapshot?.paymentStatus || null,
          subscriptionStatus: companySnapshot?.subscriptionStatus || null,
          premiumAccess: Boolean(companySnapshot?.premiumAccess),
          trialEndsAt: this.parseDateValue(companySnapshot?.trialEndsAt),
          billingGraceEndsAt: this.parseDateValue(companySnapshot?.billingGraceEndsAt),
        }
      : await this.prisma.company.findUnique({
          where: { id: companyId },
          select: {
            id: true,
            slug: true,
            isActive: true,
            paymentStatus: true,
            subscriptionStatus: true,
            premiumAccess: true,
            trialEndsAt: true,
            billingGraceEndsAt: true,
          },
        });
    if (!company) return { exists: false, active: false };

    if (String((company as any).slug || '').trim().toLowerCase() === MASTER_WHATSAPP_ENGINE_COMPANY_SLUG) {
      if (!company.isActive || !company.premiumAccess) {
        await this.prisma.company.update({
          where: { id: companyId },
          data: {
            isActive: true,
            deactivatedAt: null,
            premiumAccess: true,
          },
        });
      }
      return { exists: true, active: true };
    }

    const now = Date.now();
    const paymentStatus = String(company.paymentStatus || '').trim().toUpperCase();
    const subscriptionStatus = String(company.subscriptionStatus || '').trim().toLowerCase();
    const accessReleased =
      paymentStatus === 'PAID' ||
      paymentStatus === 'MANUAL' ||
      subscriptionStatus === 'active' ||
      subscriptionStatus === 'authorized' ||
      subscriptionStatus === 'manual' ||
      Boolean(company.premiumAccess);
    const graceAllowed = Boolean(
      company.billingGraceEndsAt &&
      company.billingGraceEndsAt.getTime() >= now &&
      company.isActive,
    );
    const trialExpired = Boolean(
      company.trialEndsAt &&
      company.trialEndsAt.getTime() < now &&
      paymentStatus !== 'PAID' &&
      paymentStatus !== 'MANUAL' &&
      subscriptionStatus !== 'active' &&
      subscriptionStatus !== 'manual' &&
      !Boolean(company.premiumAccess),
    );
    const trialAllowed =
      (paymentStatus === 'TRIAL' || subscriptionStatus === 'trialing') &&
      (!company.trialEndsAt || company.trialEndsAt.getTime() >= now);
    const paidAllowed = paymentStatus === 'PAID' || subscriptionStatus === 'active' || subscriptionStatus === 'authorized';
    const manualAllowed = paymentStatus === 'MANUAL' || subscriptionStatus === 'manual';
    const premiumAllowed = Boolean(company.premiumAccess);
    const shouldRemainActive = Boolean(paidAllowed || trialAllowed || manualAllowed || premiumAllowed || graceAllowed);

    if (trialExpired || !shouldRemainActive) {
      await this.prisma.$transaction([
        this.prisma.company.update({
          where: { id: companyId },
          data: {
            isActive: false,
            paymentStatus: trialExpired ? 'EXPIRED' : (company.paymentStatus || 'DISABLED'),
            subscriptionStatus: trialExpired
              ? 'expired'
              : this.mapPaymentStatusToSubscriptionStatus(company.paymentStatus || 'DISABLED'),
            premiumAccess: false,
            deactivatedAt: new Date(),
          },
        }),
        this.prisma.companyModule.updateMany({ where: { companyId }, data: { enabled: false } }),
      ]);
      return { exists: true, active: false };
    }

    if (!company.isActive) {
      await this.prisma.company.update({
        where: { id: companyId },
        data: {
          isActive: true,
          deactivatedAt: null,
          premiumAccess: premiumAllowed || manualAllowed || paidAllowed || trialAllowed,
        },
      });
    }

    return { exists: true, active: true };
  }

  private async isCompanyModuleEnabled(companyId: number, moduleId: number) {
    const row = await this.prisma.companyModule.findUnique({
      where: { companyId_moduleId: { companyId, moduleId } },
    });
    return Boolean(row?.enabled);
  }

  private isFinanceModuleKey(moduleKey: string) {
    return this.normalizeRequestedModuleKey(moduleKey) === 'financeiro';
  }

  private canUseSellerMobileOperationalModule(user: any, moduleKey: string, context?: ModuleAccessContext) {
    const normalized = this.normalizeRequestedModuleKey(moduleKey);
    const role = String(user?.role || '').trim().toUpperCase();
    return role === 'USER' && Boolean(context?.mobileRoute) && SELLER_MOBILE_OPERATIONAL_MODULE_KEYS.has(normalized);
  }

  private isHbxSellerNetworkCompanySnapshot(company: any) {
    return String(company?.slug || '').trim().toLowerCase() === MASTER_WHATSAPP_ENGINE_COMPANY_SLUG;
  }

  private isHbxSellerOperationalModule(moduleKey: string) {
    return HBX_SELLER_OPERATIONAL_MODULE_KEYS.has(this.normalizeRequestedModuleKey(moduleKey));
  }

  private canUseAdminOnlyModule(user: any, moduleKey: string, context?: ModuleAccessContext) {
    const normalized = this.normalizeRequestedModuleKey(moduleKey);
    const role = String(user?.role || '').trim().toUpperCase();
    if (Boolean(user?.isSystemMaster) || role === 'ADMIN') return true;
    if (this.canUseSellerMobileOperationalModule(user, normalized, context)) return true;
    return !EMPLOYEE_BLOCKED_MODULE_KEYS.has(normalized);
  }

  private defaultUserModuleAllowed(user: any, moduleKey: string, context?: ModuleAccessContext) {
    if (!this.canUseAdminOnlyModule(user, moduleKey, context)) {
      return false;
    }
    return true;
  }

  async canUserAccessModule(userId: number, moduleKey: string, context?: ModuleAccessContext) {
    await this.ensureDefaultSystemModules();
    const { user, companyId, isSystemMaster } = await this.resolveUserContext(userId);

    const key = this.normalizeRequestedModuleKey(moduleKey);
    if (key === 'master' || key === 'exclusoes') return isSystemMaster;
    if (isSystemMaster) return true;
    if (!companyId) return false;
    if (this.isFinanceModuleKey(key)) return this.canUseAdminOnlyModule(user, key, context);
    if (this.isTrialBundledModuleKey(key)) {
      await this.ensureTrialBundleForCompany(companyId);
    }

    const candidateKeys = this.getModuleCandidateKeys(key);
    const moduleItems = await this.prisma.systemModule.findMany({
      where: {
        key: { in: candidateKeys },
      },
    });
    const moduleMap = new Map(moduleItems.map((moduleItem) => [moduleItem.key, moduleItem]));
    const orderedModules = candidateKeys
      .map((candidateKey) => moduleMap.get(candidateKey))
      .filter((moduleItem): moduleItem is NonNullable<typeof moduleItem> => Boolean(moduleItem?.companyAssignable));
    if (!orderedModules.length) return false;

    const status = await this.evaluateCompanyStatus(companyId);
    const companyAccessSnapshot = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        slug: true,
        isActive: true,
        onboardingStatus: true,
        paymentStatus: true,
        subscriptionStatus: true,
        premiumAccess: true,
        selectedPlanKey: true,
        trialEndsAt: true,
        billingGraceEndsAt: true,
      },
    });
    const accessPolicy = resolveCompanyModuleAccessPolicy(companyAccessSnapshot);
    if (!status.active || !accessPolicy.active) {
      return this.isFinanceModuleKey(key);
    }

    const availabilityMap = await this.buildModuleAvailabilityMap(
      companyId,
      orderedModules.map((moduleItem) => moduleItem.key),
    );
    const planManagedModuleKeys = new Set(
      Object.values(COMMERCIAL_PLAN_MODULE_KEYS)
        .flat()
        .map((moduleKey) => this.normalizeRequestedModuleKey(moduleKey)),
    );

    for (const moduleItem of orderedModules) {
      const normalizedModuleKey = this.normalizeRequestedModuleKey(moduleItem.key);
      const availability = availabilityMap.get(normalizedModuleKey);
      if (availability?.blockedByEngine && !accessPolicy.moduleKeys.has(normalizedModuleKey)) continue;
      if (planManagedModuleKeys.has(normalizedModuleKey) && !accessPolicy.moduleKeys.has(normalizedModuleKey)) continue;
      if (!this.canUseAdminOnlyModule(user, moduleItem.key, context)) continue;

      const userAccess = isSystemMaster
        ? null
        : await this.prisma.userModuleAccess.findUnique({
            where: {
              userId_moduleId: {
                userId: Number(userId),
                moduleId: moduleItem.id,
              },
            },
          });
      const sellerMobileOperationalModule = this.canUseSellerMobileOperationalModule(user, moduleItem.key, context);
      const userAllowed = isSystemMaster
        ? true
        : sellerMobileOperationalModule
          ? true
        : userAccess
          ? Boolean(userAccess.allowed)
          : this.defaultUserModuleAllowed(user, moduleItem.key, context);
      if (!userAllowed) continue;

      if (accessPolicy.moduleKeys.has(normalizedModuleKey)) {
        return true;
      }

      if (isSystemMaster) {
        if (await this.isCompanyModuleEnabled(companyId, moduleItem.id)) {
          return true;
        }
        continue;
      }

      const companyEnabled = await this.isCompanyModuleEnabled(companyId, moduleItem.id);
      if (!companyEnabled) continue;
      return true;
    }

    return false;
  }

  async listMyModules(userId: number, context?: ModuleAccessContext) {
    await this.ensureDefaultSystemModules();
    const { user, companyId, isSystemMaster } = await this.resolveUserContext(userId);

    const systemMasterModules = isSystemMaster
      ? await this.prisma.systemModule.findMany({
          where: { key: { in: ['master', 'exclusoes'] } },
          orderBy: { name: 'asc' },
        })
      : [];

    if (isSystemMaster) {
      const allModules = await this.prisma.systemModule.findMany({
        where: { key: { notIn: RETIRED_MODULE_KEYS } },
        orderBy: [{ companyAssignable: 'desc' }, { name: 'asc' }, { id: 'asc' }],
      });

      return allModules.map((moduleItem) => ({
        key: moduleItem.key,
        name: moduleItem.name,
        description: moduleItem.description,
        serviceUrl: moduleItem.serviceUrl,
        companyEnabled: true,
        userAllowed: true,
        accessible: true,
        visible: true,
        category: this.getModuleCategory(moduleItem.key),
        entryEligible: this.getModuleCategory(moduleItem.key) === 'commercial',
        blockedByEngine: false,
        blockedReason: null,
        blockedCode: null,
        criticalEngine: null,
        sortOrder: this.getModuleSortOrder(moduleItem.key),
      }));
    }

    if (!companyId) {
      return systemMasterModules.map((moduleItem) => ({
        key: moduleItem.key,
        name: moduleItem.name,
        description: moduleItem.description,
        serviceUrl: moduleItem.serviceUrl,
        companyEnabled: true,
        accessible: true,
      }));
    }

    await this.ensureTrialBundleForCompany(companyId);

    await this.evaluateCompanyStatus(companyId);

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        slug: true,
        isActive: true,
        onboardingStatus: true,
        paymentStatus: true,
        subscriptionStatus: true,
        premiumAccess: true,
        selectedPlanKey: true,
        trialEndsAt: true,
        billingGraceEndsAt: true,
      },
    });
    const accessPolicy = resolveCompanyModuleAccessPolicy(company);

    const rows = await this.prisma.companyModule.findMany({
      where: { companyId },
      include: { systemModule: true },
      orderBy: { systemModule: { name: 'asc' } },
    });
    const companyModuleByKey = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      companyModuleByKey.set(this.normalizeRequestedModuleKey(row.systemModule.key), row);
    }

    const knownModuleKeys = new Set<string>([
      ...PRIMARY_COMMERCIAL_MODULE_KEYS,
      ...ROUTE_GUARDED_MODULE_KEYS,
      ...Object.values(COMMERCIAL_PLAN_MODULE_KEYS).flat(),
      'financeiro',
      'gerencial',
      'whatsapp',
      'cadastro',
    ]);
    for (const row of rows) {
      knownModuleKeys.add(this.normalizeRequestedModuleKey(row.systemModule.key));
    }

    const moduleRows = await this.prisma.systemModule.findMany({
      where: {
        companyAssignable: true,
        key: { in: Array.from(knownModuleKeys) },
      },
      orderBy: { name: 'asc' },
    });

    const userAccessMap = new Map<number, boolean>();
    if (!isSystemMaster) {
      const userAccessRows = await this.prisma.userModuleAccess.findMany({
        where: { userId },
        select: { moduleId: true, allowed: true },
      });
      for (const row of userAccessRows) {
        userAccessMap.set(row.moduleId, row.allowed);
      }
    }

    const availabilityMap = await this.buildModuleAvailabilityMap(
      companyId,
      moduleRows.map((row) => row.key),
    );

    const planManagedModuleKeys = new Set<string>(Object.values(COMMERCIAL_PLAN_MODULE_KEYS).flat());
    const companyModules = moduleRows
      .filter((moduleItem) => moduleItem.companyAssignable && !this.isRetiredModuleKey(moduleItem.key))
      .map((moduleItem) => {
        const normalizedKey = this.normalizeRequestedModuleKey(moduleItem.key);
        const row = companyModuleByKey.get(normalizedKey);
        const availability = availabilityMap.get(normalizedKey) || {
          category: this.getModuleCategory(normalizedKey),
          sortOrder: this.getModuleSortOrder(normalizedKey),
          entryEligible: this.getModuleCategory(normalizedKey) === 'commercial',
          blockedByEngine: false,
          blockedReason: null,
          blockedCode: null,
          criticalEngine: null,
        };
        const planAllowsModule = accessPolicy.moduleKeys.has(normalizedKey);
        const primaryCommercialModule = PRIMARY_COMMERCIAL_MODULE_KEYS.includes(normalizedKey as any);
        const guardedCommercialModule = ROUTE_GUARDED_MODULE_KEYS.includes(normalizedKey as any);
        const planManagedModule = planManagedModuleKeys.has(normalizedKey);
        const financeModule = this.isFinanceModuleKey(normalizedKey);
        const effectiveCompanyEnabled = Boolean(row?.enabled || (accessPolicy.active && planAllowsModule));
        const sellerMobileOperationalModule = this.canUseSellerMobileOperationalModule(user, moduleItem.key, context);
        const userAllowed = isSystemMaster
          ? true
          : sellerMobileOperationalModule
            ? true
          : (row && userAccessMap.has(row.moduleId)
              ? Boolean(userAccessMap.get(row.moduleId))
              : this.defaultUserModuleAllowed(user, moduleItem.key, context));
        const roleEligible = this.canUseAdminOnlyModule(user, moduleItem.key, context);
        const visible =
          primaryCommercialModule ||
          (guardedCommercialModule && Boolean(row)) ||
          Boolean(effectiveCompanyEnabled && userAllowed && roleEligible) ||
          Boolean(financeModule && userAllowed && roleEligible);
        let blockedReason: string | null = null;
        let blockedCode: string | null = null;
        let criticalEngine: string | null = null;

        if (!accessPolicy.active && !financeModule) {
          blockedReason = accessPolicy.blockedReason;
          blockedCode = accessPolicy.blockedCode;
          criticalEngine = 'payment';
        } else if (!userAllowed || !roleEligible) {
          blockedReason = 'Usuario sem permissao para este modulo.';
          blockedCode = 'user_module_blocked';
        } else if (accessPolicy.active && (primaryCommercialModule || planManagedModule) && !planAllowsModule) {
          blockedReason = 'Este modulo nao faz parte do plano atual.';
          blockedCode = 'plan_required';
          criticalEngine = 'payment';
        } else if (availability.blockedByEngine && !planAllowsModule) {
          blockedReason = availability.blockedReason;
          blockedCode = availability.blockedCode;
          criticalEngine = availability.criticalEngine;
        }

        const accessible = Boolean(
          visible &&
          !blockedReason &&
          (financeModule ||
            planAllowsModule ||
            (accessPolicy.active && effectiveCompanyEnabled && !planManagedModule && !availability.blockedByEngine)),
        );

        return {
          key: moduleItem.key,
          name: moduleItem.name,
          description: moduleItem.description,
          serviceUrl: moduleItem.serviceUrl,
          companyEnabled: effectiveCompanyEnabled,
          userAllowed,
          accessible,
          visible,
          category: availability.category,
          entryEligible: normalizedKey === 'webscraping' ? false : availability.entryEligible,
          blockedByEngine: planAllowsModule ? false : availability.blockedByEngine,
          blockedReason: visible ? blockedReason : null,
          blockedCode: visible ? blockedCode : null,
          criticalEngine: visible ? criticalEngine : null,
          sortOrder: availability.sortOrder,
        };
      });

    const merged = new Map<string, any>();
    for (const moduleItem of companyModules) {
      merged.set(String(moduleItem.key || '').trim().toLowerCase(), moduleItem);
    }
    for (const moduleItem of systemMasterModules) {
      const key = String(moduleItem.key || '').trim().toLowerCase();
      if (!key || merged.has(key)) continue;
      merged.set(key, {
        key: moduleItem.key,
        name: moduleItem.name,
        description: moduleItem.description,
        serviceUrl: moduleItem.serviceUrl,
        companyEnabled: true,
        userAllowed: true,
        accessible: true,
        visible: true,
        category: this.getModuleCategory(moduleItem.key),
        entryEligible: false,
        blockedByEngine: false,
        blockedReason: null,
        blockedCode: null,
        criticalEngine: null,
        sortOrder: this.getModuleSortOrder(moduleItem.key),
      });
    }

    return Array.from(merged.values()).sort((left, right) => {
      const leftOrder = Number(left.sortOrder || 0);
      const rightOrder = Number(right.sortOrder || 0);
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return String(left.name || '').localeCompare(String(right.name || ''), 'pt-BR');
    });
  }

  async listCompanyAccessForAdmin(adminUserId: number) {
    await this.ensureDefaultSystemModules();
    const { user, companyId, isSystemMaster } = await this.resolveUserContext(adminUserId);
    const isAdmin = String((user as any).role || '').toUpperCase() === 'ADMIN';
    if (!companyId || (!isAdmin && !isSystemMaster)) throw new ForbiddenException('Admin role required');
    await this.ensureTrialBundleForCompany(companyId);

    const [users, modules, company] = await Promise.all([
      this.usersService.listByCompany(companyId),
      this.prisma.systemModule.findMany({
        where: { companyAssignable: true, key: { notIn: RETIRED_MODULE_KEYS } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.company.findUnique({
        where: { id: companyId },
        select: {
          slug: true,
          isActive: true,
          onboardingStatus: true,
          paymentStatus: true,
          subscriptionStatus: true,
          premiumAccess: true,
          selectedPlanKey: true,
          trialEndsAt: true,
          billingGraceEndsAt: true,
        },
      }),
    ]);
    const accessPolicy = resolveCompanyModuleAccessPolicy(company);
    const hbxSellerNetworkCompany = this.isHbxSellerNetworkCompanySnapshot(company);
    const planManagedModuleKeys = new Set(
      Object.values(COMMERCIAL_PLAN_MODULE_KEYS)
        .flat()
        .map((moduleKey) => this.normalizeRequestedModuleKey(moduleKey)),
    );

    const companyModuleRows = await this.prisma.companyModule.findMany({ where: { companyId } });
    const companyModuleMap = new Map<number, boolean>(companyModuleRows.map((row) => [row.moduleId, row.enabled]));

    const accessRows = await this.prisma.userModuleAccess.findMany({
      where: { userId: { in: users.map((u) => u.id) } },
      select: { userId: true, moduleId: true, allowed: true },
    });

    const accessByUser = new Map<number, Map<number, boolean>>();
    for (const row of accessRows) {
      const existing = accessByUser.get(row.userId) || new Map<number, boolean>();
      existing.set(row.moduleId, row.allowed);
      accessByUser.set(row.userId, existing);
    }

    return {
      companyId,
      modules: modules.map((moduleItem) => ({
        key: moduleItem.key,
        name: moduleItem.name,
        description: moduleItem.description,
        companyEnabled: planManagedModuleKeys.has(this.normalizeRequestedModuleKey(moduleItem.key))
          ? accessPolicy.moduleKeys.has(this.normalizeRequestedModuleKey(moduleItem.key))
          : companyModuleMap.has(moduleItem.id) ? Boolean(companyModuleMap.get(moduleItem.id)) : false,
      })),
      users: users.map((u) => {
        const userMap = accessByUser.get(u.id) || new Map<number, boolean>();
        const hbxSeller = hbxSellerNetworkCompany && String(u.role || '').trim().toUpperCase() === 'USER';
        return {
          id: u.id,
          username: u.username,
          email: u.email,
          role: u.role,
          modules: modules.map((m) => {
            const hbxSellerOperationalModule = hbxSeller && this.isHbxSellerOperationalModule(m.key);
            return {
              key: m.key,
              allowed: hbxSellerOperationalModule
                ? true
                : this.canUseAdminOnlyModule(u, m.key) &&
                  (userMap.has(m.id) ? Boolean(userMap.get(m.id)) : this.defaultUserModuleAllowed(u, m.key)),
            };
          }),
        };
      }),
    };
  }

  async updateCompanyUserModuleAccess(adminUserId: number, targetUserId: number, modulePermissions: Array<{ key: string; allowed: boolean }>) {
    await this.ensureDefaultSystemModules();
    const { user, companyId, isSystemMaster } = await this.resolveUserContext(adminUserId);
    const isAdmin = String((user as any).role || '').toUpperCase() === 'ADMIN';
    if (!companyId || (!isAdmin && !isSystemMaster)) throw new ForbiddenException('Admin role required');

    const target = await this.usersService.findById(targetUserId);
    if (!target) throw new BadRequestException('Usuario alvo nao encontrado');
    if (Number(target.companyId || 0) !== companyId) throw new ForbiddenException('Usuario fora da sua empresa');
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { slug: true },
    });
    const hbxSeller =
      this.isHbxSellerNetworkCompanySnapshot(company) &&
      String((target as any).role || '').trim().toUpperCase() === 'USER';

    const modules = await this.prisma.systemModule.findMany({
      where: { companyAssignable: true, key: { notIn: RETIRED_MODULE_KEYS } },
    });
    const byKey = new Map(modules.map((m) => [m.key, m]));

    await this.prisma.$transaction(async (tx) => {
      for (const permission of modulePermissions || []) {
        const normalizedKey = this.normalizeRequestedModuleKey(permission.key);
        const moduleItem = byKey.get(normalizedKey);
        if (!moduleItem) continue;
        const allowed = hbxSeller && this.isHbxSellerOperationalModule(normalizedKey)
          ? true
          : Boolean(permission.allowed);

        await tx.userModuleAccess.upsert({
          where: {
            userId_moduleId: {
              userId: targetUserId,
              moduleId: moduleItem.id,
            },
          },
          update: { allowed },
          create: {
            userId: targetUserId,
            moduleId: moduleItem.id,
            allowed,
          },
        });
      }

      if (hbxSeller) {
        for (const moduleKey of HBX_SELLER_OPERATIONAL_MODULE_KEYS) {
          const moduleItem = byKey.get(moduleKey);
          if (!moduleItem) continue;
          await tx.userModuleAccess.upsert({
            where: {
              userId_moduleId: {
                userId: targetUserId,
                moduleId: moduleItem.id,
              },
            },
            update: { allowed: true },
            create: {
              userId: targetUserId,
              moduleId: moduleItem.id,
              allowed: true,
            },
          });
        }
      }
    });
    await this.ensureTrialBundleForCompany(companyId);

    return { ok: true };
  }

  private buildMasterCompanySummary(
    company: any,
    websiteConfig: any,
    companyLedgerRows: BillingLedgerEntryRow[],
    companyAuditRows: Array<any>,
    active: boolean,
    userConfirmation: UserConfirmationSummary,
    webscrapingUsage: WebscrapingUsageSummary,
    masterIntegrations?: any,
  ) {
    const selectedMercadoPagoCredential = company?.useMasterMercadoPagoToken
      ? pickMasterMercadoPagoCredential(masterIntegrations, company?.masterMercadoPagoCredentialKey)
      : null;
    const selectedWhatsAppCredential = company?.useMasterWhatsAppToken
      ? pickMasterWhatsAppCredential(masterIntegrations, company?.masterWhatsAppCredentialKey)
      : null;
    const monthlyValue = this.resolveCompanyMonthlyValue(company);
    const finance = this.buildCompanyFinanceSnapshot(
      company,
      companyLedgerRows,
      masterIntegrations,
    );
    const statusBucket = this.companyStatusBucket({
      ...company,
      isActive: active,
      paymentStatus:
        active && String(company?.paymentStatus || '').trim().toUpperCase() !== 'DISABLED'
          ? company?.paymentStatus
          : company?.paymentStatus || 'DISABLED',
    });
    const enabledModules = (company.companyModules || [])
      .filter((row: any) => row?.systemModule?.companyAssignable)
      .map((row: any) => ({
        key: row.systemModule.key,
        name: row.systemModule.name,
        enabled: Boolean(row.enabled),
        monthlyPrice: this.normalizeCurrencyAmount(row?.systemModule?.monthlyPrice || 0),
      }));
    const activeModules = enabledModules.filter((module: any) => module.enabled);
    const lastApproved =
      companyLedgerRows.find(
        (row) => row.entryGroup === 'revenue' && String(row.status || '').toUpperCase() === 'APPROVED',
      ) || null;
    const lastFailed =
      companyLedgerRows.find((row) =>
        ['FAILED', 'CANCELLED', 'REFUNDED'].includes(String(row.status || '').toUpperCase()),
      ) || null;
    const pendingEntry =
      companyLedgerRows.find((row) => String(row.status || '').toUpperCase() === 'PENDING') || null;
    const daysOverdue = this.computeDaysOverdue(company, pendingEntry);
    const nextDueAt =
      (pendingEntry?.dueDate instanceof Date ? pendingEntry.dueDate.toISOString() : null) ||
      (company?.subscriptionCurrentPeriodEnd instanceof Date
        ? company.subscriptionCurrentPeriodEnd.toISOString()
        : null) ||
      (company?.trialEndsAt instanceof Date ? company.trialEndsAt.toISOString() : null);
    const billingSituation = buildMasterBillingSituation({
      company,
      ledgerRows: companyLedgerRows,
      canUse: active,
      currentCycleAmount: finance.finalCycleAmount,
      billingCycle: finance.billingCycle,
      paymentMethod: company.paymentMethod,
      provider: company.billingProvider,
      nextDueAt,
      daysOverdue,
    });
    const trialEndsAt = company?.trialEndsAt instanceof Date ? company.trialEndsAt.toISOString() : null;
    const trialStartsAt =
      company?.trialStartsAt instanceof Date ? company.trialStartsAt.toISOString() : null;
    const trialRemainingDays = trialEndsAt
      ? Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
      : null;
    const currentOutstandingValue =
      statusBucket === 'OVERDUE'
        ? Math.max(monthlyValue, this.normalizeCurrencyAmount(pendingEntry?.amount || 0))
        : 0;
    const websiteConfigured = Boolean(websiteConfig?.websiteEnabled && websiteConfig?.websitePublicUrl);
    const hasWebsiteModule = activeModules.some((module: any) => module.key === 'website');
    const websiteNeedsAttention = Boolean(hasWebsiteModule && !websiteConfigured);
    const recentCardFailure = Boolean(
      String(company?.paymentMethod || '').trim().toUpperCase() === 'CARD' &&
        (String(company?.mercadoPagoStatus || '').trim().toUpperCase() === 'ERROR' ||
          (lastFailed?.createdAt instanceof Date &&
            Date.now() - lastFailed.createdAt.getTime() <= 45 * 24 * 60 * 60 * 1000)),
    );
    const manualPaymentPending = Boolean(
      String(company?.paymentMethod || '').trim().toUpperCase() === 'MANUAL' &&
        ['PENDING', 'OVERDUE'].includes(String(company?.paymentStatus || '').trim().toUpperCase()),
    );
    const effectiveMercadoPagoToken = this.effectiveMercadoPagoAccessToken(company, masterIntegrations);
    const effectiveWhatsApp = this.effectiveWhatsAppConfig(company, masterIntegrations);
    const whatsappEndpoints = (((company as any).whatsappEndpoints || this.buildLegacyEndpointSnapshot(company)) as any[]);
    const whatsappCenter = buildWhatsAppCenterSnapshot({
      company,
      credential: selectedWhatsAppCredential,
      effectiveConfig: effectiveWhatsApp,
      includeInternal: true,
      temporaryAvailable: false,
    });
    const whatsappSituation = buildMasterWhatsAppSituation({
      company,
      credential: selectedWhatsAppCredential,
      effectiveConfig: effectiveWhatsApp,
      whatsappCenter,
      endpoints: whatsappEndpoints,
    });
    const onboardingStatus = String(company?.onboardingStatus || '').trim().toLowerCase() || 'active_paid';
    const trialModuleSelection = this.normalizeOptionalString(company?.trialModuleSelection);
    const hasOperationalWebscraping = Boolean(webscrapingUsage?.lastSearchAt);
    const whatsappMigrationPending = Boolean(
      company?.whatsappMigrationInterestStatus &&
        ['REQUESTED', 'CONTACTED'].includes(String(company.whatsappMigrationInterestStatus).trim().toUpperCase()),
    );
    const hasWhatsAppSignal = Boolean(
      String(company?.whatsappConnectionMode || '').trim().toUpperCase() !== 'NONE' || whatsappMigrationPending,
    );
    const activationNeedsAttention = Boolean(
      ['active_trial', 'active_paid'].includes(onboardingStatus) &&
        active &&
        !hasOperationalWebscraping &&
        !hasWhatsAppSignal,
    );
    const activationStatus =
      onboardingStatus === 'pending_email_confirmation'
        ? 'pending_email_confirmation'
        : activationNeedsAttention
          ? 'needs_activation'
          : hasOperationalWebscraping || hasWhatsAppSignal
            ? 'operating'
            : 'basic_access';
    const onboardingLabel =
      onboardingStatus === 'pending_email_confirmation'
        ? 'Pendente de confirmação'
        : onboardingStatus === 'active_trial'
          ? 'Trial ativo'
          : onboardingStatus === 'suspended'
            ? 'Suspenso'
            : 'Ativo pago';

    let riskLevel: 'stable' | 'warning' | 'critical' = 'stable';
    if (['OVERDUE', 'NO_METHOD', 'SUSPENDED'].includes(statusBucket) || recentCardFailure) {
      riskLevel = 'critical';
    } else if (statusBucket === 'TRIAL_ENDING' || statusBucket === 'MANUAL_PREMIUM' || manualPaymentPending || websiteNeedsAttention) {
      riskLevel = 'warning';
    }

    return {
      id: company.id,
      name: company.name,
      slug: company.slug || null,
      createdAt: company?.createdAt instanceof Date ? company.createdAt.toISOString() : null,
      onboardingStatus,
      onboardingLabel,
      trialModuleSelection,
      emailConfirmation: userConfirmation,
      activationStatus,
      activationNeedsAttention,
      primaryContactName: company.primaryContactName || null,
      contactEmail: company.contactEmail || null,
      contactPhone: company.contactPhone || null,
      acquisitionSource: company.acquisitionSource || null,
      acquisitionSourceDetail: company.acquisitionSourceDetail || null,
      referralReferrerName: company.referralReferrerName || null,
      referralCode: company.referralCode || null,
      taxDocument: company.taxDocument || null,
      isActive: active,
      userCount: Number(company?._count?.users || 0),
      plan: company.plan
        ? {
            id: company.plan.id,
            name: company.plan.name,
            price: this.normalizeCurrencyAmount(company.plan.price || 0),
          }
        : null,
      selectedPlanKey: company.selectedPlanKey || null,
      monthlyValue,
      finance,
      billingSituation,
      paymentStatus: company.paymentStatus,
      paymentMethod: company.paymentMethod,
      billingCycle: finance.billingCycle,
      subscriptionStatus: company.subscriptionStatus,
      billingProvider: company.billingProvider,
      premiumAccess: Boolean(company.premiumAccess),
      commercialCardQuota: this.resolveCommercialCardQuota(company),
      assistedSetup: {
        required: Boolean(company.assistedSetupRequired),
        status: String(company.assistedSetupStatus || 'not_required'),
        completedAt: company.assistedSetupCompletedAt instanceof Date ? company.assistedSetupCompletedAt.toISOString() : null,
        completedByUserId: Number(company.assistedSetupCompletedByUserId || 0) || null,
        note: company.assistedSetupNote || null,
      },
      trialStartsAt,
      trialEndsAt,
      trialRemainingDays,
      subscriptionCurrentPeriodStart:
        company?.subscriptionCurrentPeriodStart instanceof Date
          ? company.subscriptionCurrentPeriodStart.toISOString()
          : null,
      subscriptionCurrentPeriodEnd:
        company?.subscriptionCurrentPeriodEnd instanceof Date
          ? company.subscriptionCurrentPeriodEnd.toISOString()
          : null,
      nextDueAt,
      daysOverdue,
      currentOutstandingValue,
      statusBucket,
      riskLevel,
      financialSituation:
        statusBucket === 'PAYING'
          ? 'Adimplente'
          : statusBucket === 'MANUAL_PREMIUM'
            ? 'Premium manual'
          : statusBucket === 'TRIAL'
            ? 'Em trial'
            : statusBucket === 'TRIAL_ENDING'
              ? 'Trial vencendo'
              : statusBucket === 'OVERDUE'
                ? 'Em atraso'
                : statusBucket === 'NO_METHOD'
                  ? 'Sem metodo'
                  : 'Suspenso',
      lastPayment: lastApproved ? this.normalizeLedgerEntryRow(lastApproved) : null,
      lastFailure: lastFailed ? this.normalizeLedgerEntryRow(lastFailed) : null,
      manualPaymentPending,
      recentCardFailure,
      websiteNeedsAttention,
      website: {
        enabled: Boolean(websiteConfig?.websiteEnabled),
        configured: websiteConfigured,
        adminEnabled: Boolean(websiteConfig?.websiteAdminEnabled),
        publicUrl: websiteConfig?.websitePublicUrl || null,
        adminUrl: websiteConfig?.websiteAdminUrl || null,
        projectId: websiteConfig?.websiteProjectId || null,
        launchMode: websiteConfig?.websiteLaunchMode || 'public',
      },
      whatsapp: {
        status: company.whatsappStatus || null,
        hasNumber: Boolean(effectiveWhatsApp.phoneNumberId || effectiveWhatsApp.whatsappNumber),
        displayNumber: effectiveWhatsApp.displayNumber || null,
        usingMasterToken: Boolean(company?.useMasterWhatsAppToken),
        tokenConfigured: Boolean(effectiveWhatsApp.accessToken && effectiveWhatsApp.phoneNumberId),
        masterCredentialKey: selectedWhatsAppCredential?.key || company?.masterWhatsAppCredentialKey || null,
        masterCredentialLabel: selectedWhatsAppCredential?.label || null,
      },
      whatsappCenter,
      whatsappSituation,
      webscrapingUsage,
      mercadoPago: {
        status: company.mercadoPagoStatus || null,
        accountEmail: company.mercadoPagoAccountEmail || null,
        accountUserId: company.mercadoPagoUserId || null,
        tokenConfigured: Boolean(effectiveMercadoPagoToken),
        usingMasterToken: Boolean(company?.useMasterMercadoPagoToken),
        masterCredentialKey: selectedMercadoPagoCredential?.key || company?.masterMercadoPagoCredentialKey || null,
        masterCredentialLabel: selectedMercadoPagoCredential?.label || null,
      },
      modules: activeModules,
      modulesTotalMonthlyValue: 0,
      auditCount: companyAuditRows.length,
    };
  }

  async getMasterWorkspace(masterUserId: number) {
    await this.assertMasterUser(masterUserId);
    await this.ensureDefaultSystemModules();
    await this.syncCompanyModulesForAllCompanies();
    await ensureWebsiteRuntimeSchema(this.prisma);
    await ensureMasterBillingRuntimeSchema(this.prisma);

    const companies = await this.prisma.company.findMany({
      where: {
        OR: [
          { slug: null },
          { slug: { not: MASTER_WHATSAPP_ENGINE_COMPANY_SLUG } },
        ],
      },
      include: {
        plan: {
          select: {
            id: true,
            name: true,
            price: true,
          },
        },
        companyModules: {
          include: { systemModule: true },
          orderBy: { systemModule: { name: 'asc' } },
        },
        _count: {
          select: { users: true },
        },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });

    const companyIds = companies.map((company) => Number(company.id));
    // Master workspace fans out across many cross-company reads. Keep this sequence explicit
    // so a single request does not burst through the database connection pool.
    const websiteConfigs = await listCompanyWebsiteConfigs(this.prisma, companyIds);
    const ledgerRows = await this.listBillingLedgerEntriesByCompanyIds(companyIds, 2400);
    const auditRows = await this.listCompanyAuditRows(companyIds, 600);
    const systemModules = await this.prisma.systemModule.findMany({
      orderBy: [{ companyAssignable: 'desc' }, { name: 'asc' }, { id: 'asc' }],
    });
    const masterIntegrationConfig = await getMasterGlobalIntegrationConfig(this.prisma);
    const userConfirmationByCompany = await this.listUserConfirmationSummaryByCompanyIds(companyIds);
    const webscrapingUsageByCompany = await this.listWebscrapingUsageSummaryByCompanyIds(companyIds);
    const quotaOverridesByCompany = await this.listCompanyQuotaOverrides(companyIds);

    const ledgerByCompany = new Map<number, BillingLedgerEntryRow[]>();
    for (const row of ledgerRows) {
      const existing = ledgerByCompany.get(Number(row.companyId)) || [];
      existing.push(row);
      ledgerByCompany.set(Number(row.companyId), existing);
    }

    const auditByCompany = new Map<number, Array<any>>();
    for (const row of auditRows || []) {
      const companyId = Number(row.companyId || 0);
      if (!companyId) continue;
      const existing = auditByCompany.get(companyId) || [];
      existing.push(row);
      auditByCompany.set(companyId, existing);
    }

    const companySummaries: Array<any> = [];
    for (const company of companies) {
      Object.assign(company as any, quotaOverridesByCompany.get(Number(company.id)) || {});
      const status = await this.evaluateCompanyStatus(company.id, company);
      companySummaries.push(
        this.buildMasterCompanySummary(
          company,
          websiteConfigs.get(Number(company.id)) || null,
          ledgerByCompany.get(Number(company.id)) || [],
          auditByCompany.get(Number(company.id)) || [],
          status.active,
          userConfirmationByCompany.get(Number(company.id)) || this.buildDefaultUserConfirmationSummary(),
          webscrapingUsageByCompany.get(Number(company.id)) || this.buildDefaultWebscrapingUsageSummary(),
          masterIntegrationConfig,
        ),
      );
    }

    const operationalStatuses = await this.companyOperationalStatus.getOperationalStatusForCompanies(
      companyIds,
      { validatePayments: false },
    );
    const operationalStatusByCompanyId = new Map(
      operationalStatuses.map((item) => [Number(item.companyId), item]),
    );
    for (const summary of companySummaries) {
      summary.operationalStatus = operationalStatusByCompanyId.get(Number(summary.id)) || null;
    }

    const now = new Date();
    const currentMonthStart = this.startOfMonth(now);
    const nextMonthStart = this.startOfNextMonth(now);
    const previousMonthStart = new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth() - 1, 1);
    const previousMonthEnd = currentMonthStart;

    const approvedRevenueCurrent = ledgerRows
      .filter((row) =>
        row.entryGroup === 'revenue' &&
        String(row.status || '').toUpperCase() === 'APPROVED' &&
        row.paidAt instanceof Date &&
        row.paidAt >= currentMonthStart &&
        row.paidAt < nextMonthStart,
      )
      .reduce((total, row) => total + this.normalizeCurrencyAmount(row.amount), 0);
    const approvedRevenuePrevious = ledgerRows
      .filter((row) =>
        row.entryGroup === 'revenue' &&
        String(row.status || '').toUpperCase() === 'APPROVED' &&
        row.paidAt instanceof Date &&
        row.paidAt >= previousMonthStart &&
        row.paidAt < previousMonthEnd,
      )
      .reduce((total, row) => total + this.normalizeCurrencyAmount(row.amount), 0);
    const currentCosts = ledgerRows
      .filter((row) =>
        row.entryGroup === 'cost' &&
        String(row.status || '').toUpperCase() === 'APPROVED' &&
        row.createdAt instanceof Date &&
        row.createdAt >= currentMonthStart &&
        row.createdAt < nextMonthStart,
      )
      .reduce((total, row) => total + this.normalizeCurrencyAmount(row.amount), 0);
    const previousCosts = ledgerRows
      .filter((row) =>
        row.entryGroup === 'cost' &&
        String(row.status || '').toUpperCase() === 'APPROVED' &&
        row.createdAt instanceof Date &&
        row.createdAt >= previousMonthStart &&
        row.createdAt < previousMonthEnd,
      )
      .reduce((total, row) => total + this.normalizeCurrencyAmount(row.amount), 0);

    const projectedRevenueMonth = companySummaries
      .filter((company) => ['PAYING', 'TRIAL', 'TRIAL_ENDING', 'OVERDUE'].includes(company.statusBucket))
      .reduce((total, company) => total + this.normalizeCurrencyAmount(company.monthlyValue || 0), 0);
    const currentDelinquency = companySummaries
      .filter((company) => company.statusBucket === 'OVERDUE')
      .reduce((total, company) => total + this.normalizeCurrencyAmount(company.currentOutstandingValue || 0), 0);
    const activeTrials = companySummaries.filter((company) => ['TRIAL', 'TRIAL_ENDING'].includes(company.statusBucket)).length;
    const payingClients = companySummaries.filter((company) => company.statusBucket === 'PAYING').length;
    const recentCardFailures = companySummaries.filter((company) => company.recentCardFailure).length;
    const manualPaymentsCurrent = ledgerRows.filter((row) =>
      row.paidAt instanceof Date &&
      row.paidAt >= currentMonthStart &&
      row.paidAt < nextMonthStart &&
      String(row.status || '').toUpperCase() === 'APPROVED' &&
      String(row.entryType || '').toUpperCase().includes('MANUAL'),
    );

    const monthlyPoints = Array.from({ length: 6 }, (_, index) => {
      const pointDate = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
      const pointStart = this.startOfMonth(pointDate);
      const pointEnd = this.startOfNextMonth(pointDate);
      const monthApproved = ledgerRows
        .filter((row) =>
          row.entryGroup === 'revenue' &&
          String(row.status || '').toUpperCase() === 'APPROVED' &&
          row.paidAt instanceof Date &&
          row.paidAt >= pointStart &&
          row.paidAt < pointEnd,
        )
        .reduce((total, row) => total + this.normalizeCurrencyAmount(row.amount), 0);
      const monthPending = ledgerRows
        .filter((row) =>
          row.entryGroup === 'revenue' &&
          String(row.status || '').toUpperCase() === 'PENDING' &&
          row.dueDate instanceof Date &&
          row.dueDate >= pointStart &&
          row.dueDate < pointEnd,
        )
        .reduce((total, row) => total + this.normalizeCurrencyAmount(row.amount), 0);
      const monthLoss = ledgerRows
        .filter((row) =>
          row.entryGroup === 'revenue' &&
          ['FAILED', 'REFUNDED', 'CANCELLED'].includes(String(row.status || '').toUpperCase()) &&
          row.createdAt instanceof Date &&
          row.createdAt >= pointStart &&
          row.createdAt < pointEnd,
        )
        .reduce((total, row) => total + this.normalizeCurrencyAmount(row.amount), 0);
      return {
        id: this.monthKey(pointDate),
        label: this.monthLabel(pointDate),
        received: this.normalizeCurrencyAmount(monthApproved),
        projected:
          pointStart.getTime() === currentMonthStart.getTime()
            ? this.normalizeCurrencyAmount(projectedRevenueMonth)
            : this.normalizeCurrencyAmount(monthApproved + monthPending),
        loss:
          pointStart.getTime() === currentMonthStart.getTime()
            ? this.normalizeCurrencyAmount(monthLoss + currentDelinquency)
            : this.normalizeCurrencyAmount(monthLoss),
      };
    });

    const paymentSeries = monthlyPoints.map((point) => {
      const pointStart = this.parseDateValue(`${point.id}-01T00:00:00.000Z`) || currentMonthStart;
      const pointEnd = this.startOfNextMonth(pointStart);
      const rowsInMonth = ledgerRows.filter((row) => {
        const baseDate = row.paidAt instanceof Date ? row.paidAt : row.createdAt;
        return baseDate instanceof Date && baseDate >= pointStart && baseDate < pointEnd;
      });
      return {
        id: point.id,
        label: point.label,
        approved: rowsInMonth.filter((row) => String(row.status || '').toUpperCase() === 'APPROVED').length,
        failed: rowsInMonth.filter((row) =>
          ['FAILED', 'REFUNDED', 'CANCELLED'].includes(String(row.status || '').toUpperCase()),
        ).length,
        manual: rowsInMonth.filter((row) => String(row.entryType || '').toUpperCase().includes('MANUAL')).length,
        pending: rowsInMonth.filter((row) => String(row.status || '').toUpperCase() === 'PENDING').length,
      };
    });

    const baseStatusDistribution = [
      { key: 'PAYING', label: 'Pagando', value: companySummaries.filter((company) => company.statusBucket === 'PAYING').length },
      { key: 'MANUAL_PREMIUM', label: 'Premium manual', value: companySummaries.filter((company) => company.statusBucket === 'MANUAL_PREMIUM').length },
      { key: 'TRIAL', label: 'Trial', value: companySummaries.filter((company) => company.statusBucket === 'TRIAL').length },
      { key: 'TRIAL_ENDING', label: 'Trial vencendo', value: companySummaries.filter((company) => company.statusBucket === 'TRIAL_ENDING').length },
      { key: 'OVERDUE', label: 'Atrasado', value: companySummaries.filter((company) => company.statusBucket === 'OVERDUE').length },
      { key: 'SUSPENDED', label: 'Suspenso', value: companySummaries.filter((company) => company.statusBucket === 'SUSPENDED').length },
      { key: 'NO_METHOD', label: 'Sem metodo', value: companySummaries.filter((company) => company.statusBucket === 'NO_METHOD').length },
    ];

    const ninetyDaysAgo = this.addDays(now, -90);
    const trialConversionRows = (auditRows || []).filter((row) => row.createdAt instanceof Date && row.createdAt >= ninetyDaysAgo);
    const trialConversion = {
      active: activeTrials,
      converted: trialConversionRows.filter((row) => String(row.action || '').toUpperCase() === 'TRIAL_CONVERTED').length,
      expired: trialConversionRows.filter((row) =>
        ['TRIAL_ENDED', 'TRIAL_SET_DATE_EXPIRED'].includes(String(row.action || '').toUpperCase()),
      ).length,
      extended: trialConversionRows.filter((row) => String(row.action || '').toUpperCase() === 'TRIAL_EXTENDED').length,
    };

    const moduleRevenueMap = new Map<string, number>();
    for (const company of companySummaries) {
      if (!['PAYING', 'TRIAL', 'TRIAL_ENDING'].includes(company.statusBucket)) continue;
      const enabledModules = Array.isArray(company.modules) ? company.modules : [];
      if (!enabledModules.length || company.monthlyValue <= 0) continue;
      const slice = company.monthlyValue / enabledModules.length;
      for (const moduleItem of enabledModules) {
        moduleRevenueMap.set(
          String(moduleItem.name || moduleItem.key),
          this.normalizeCurrencyAmount((moduleRevenueMap.get(String(moduleItem.name || moduleItem.key)) || 0) + slice),
        );
      }
    }

    const attentionDefinitions = [
      {
        id: 'manual_premium',
        title: 'Premium manual sem financeiro',
        severity: 'warning',
        companies: companySummaries.filter((company) => company.statusBucket === 'MANUAL_PREMIUM'),
      },
      {
        id: 'trial_today',
        title: 'Trial vencendo hoje',
        severity: 'danger',
        companies: companySummaries.filter((company) => company.statusBucket === 'TRIAL_ENDING' && (company.trialRemainingDays || 0) <= 0),
      },
      {
        id: 'trial_soon',
        title: 'Trial vencendo em ate 3 dias',
        severity: 'warning',
        companies: companySummaries.filter((company) => company.statusBucket === 'TRIAL_ENDING' && (company.trialRemainingDays || 0) > 0 && (company.trialRemainingDays || 0) <= 3),
      },
      {
        id: 'overdue',
        title: 'Clientes em atraso',
        severity: 'danger',
        companies: companySummaries.filter((company) => company.statusBucket === 'OVERDUE'),
      },
      {
        id: 'no_method',
        title: 'Clientes sem metodo',
        severity: 'warning',
        companies: companySummaries.filter((company) => company.statusBucket === 'NO_METHOD'),
      },
      {
        id: 'manual_payment',
        title: 'Pagamento manual pendente',
        severity: 'warning',
        companies: companySummaries.filter((company) => company.manualPaymentPending),
      },
      {
        id: 'website_missing',
        title: 'Website sem configuracao',
        severity: 'info',
        companies: companySummaries.filter((company) => company.websiteNeedsAttention),
      },
      {
        id: 'card_failure',
        title: 'Cartao com falha recente',
        severity: 'danger',
        companies: companySummaries.filter((company) => company.recentCardFailure),
      },
      {
        id: 'whatsapp_migration_pending',
        title: 'Migração WhatsApp pendente',
        severity: 'warning',
        companies: companySummaries.filter((company) =>
          ['REQUESTED', 'CONTACTED'].includes(
            String(company.whatsappCenter?.migration?.workflowStatus || '').trim().toUpperCase(),
          ),
        ),
      },
      {
        id: 'webscraping_trial_blocked',
        title: 'Trial com bloqueio de scraping hoje',
        severity: 'warning',
        companies: companySummaries.filter((company) => Number(company.webscrapingUsage?.blockedToday || 0) > 0),
      },
      {
        id: 'webscraping_heavy_usage',
        title: 'Uso forte de webscraping',
        severity: 'info',
        companies: companySummaries.filter((company) => Number(company.webscrapingUsage?.searchesToday || 0) >= 3),
      },
      {
        id: 'activation_needs_attention',
        title: 'Ativação ainda fraca',
        severity: 'info',
        companies: companySummaries.filter((company) => Boolean(company.activationNeedsAttention)),
      },
      {
        id: 'email_pending',
        title: 'E-mail ainda não confirmado',
        severity: 'danger',
        companies: companySummaries.filter((company) => !Boolean(company.emailConfirmation?.confirmed)),
      },
    ]
      .filter((item) => item.companies.length > 0)
      .map((item) => ({
        id: item.id,
        title: item.title,
        severity: item.severity,
        count: item.companies.length,
        companies: item.companies.slice(0, 5).map((company) => ({
          id: company.id,
          name: company.name,
          statusBucket: company.statusBucket,
          nextDueAt: company.nextDueAt,
          trialRemainingDays: company.trialRemainingDays,
        })),
      }));

    return {
      generatedAt: now.toISOString(),
      summary: {
        confirmedRevenueMonth: {
          kind: 'currency',
          value: this.normalizeCurrencyAmount(approvedRevenueCurrent),
          previousValue: this.normalizeCurrencyAmount(approvedRevenuePrevious),
          delta: this.normalizeCurrencyAmount(approvedRevenueCurrent - approvedRevenuePrevious),
          note: 'Receita recebida e registrada no ledger SaaS.',
        },
        projectedRevenueMonth: {
          kind: 'currency',
          value: this.normalizeCurrencyAmount(projectedRevenueMonth),
          previousValue: null,
          delta: null,
          note: 'Estimativa pela base ativa do mes e pendencias em aberto.',
        },
        netRevenueMonth: {
          kind: 'currency',
          value: this.normalizeCurrencyAmount(approvedRevenueCurrent - currentCosts),
          previousValue: this.normalizeCurrencyAmount(approvedRevenuePrevious - previousCosts),
          delta: this.normalizeCurrencyAmount((approvedRevenueCurrent - currentCosts) - (approvedRevenuePrevious - previousCosts)),
          note:
            currentCosts > 0 || previousCosts > 0
              ? 'Receita recebida menos custos registrados no MASTER.'
              : 'Sem custos registrados. Exibindo receita liquida do mes.',
        },
        delinquencyCurrent: {
          kind: 'currency',
          value: this.normalizeCurrencyAmount(currentDelinquency),
          previousValue: null,
          delta: null,
          note: 'Soma estimada das empresas em atraso no ciclo atual.',
        },
        activeTrials: {
          kind: 'count',
          value: activeTrials,
          previousValue: null,
          delta: null,
          note: 'Trials ativos e trials em vencimento iminente.',
        },
        payingClients: {
          kind: 'count',
          value: payingClients,
          previousValue: null,
          delta: null,
          note: 'Clientes ativos com status financeiro saudavel.',
        },
        recentCardFailures: {
          kind: 'count',
          value: recentCardFailures,
          previousValue: null,
          delta: null,
          note: 'Falhas recentes de cartao ou conexao Mercado Pago.',
        },
        manualPaymentsMonth: {
          kind: 'count',
          value: manualPaymentsCurrent.length,
          auxValue: this.normalizeCurrencyAmount(
            manualPaymentsCurrent.reduce((total, row) => total + this.normalizeCurrencyAmount(row.amount), 0),
          ),
          previousValue: null,
          delta: null,
          note: 'Lancamentos manuais aprovados no mes.',
        },
      },
      charts: {
        revenue: monthlyPoints,
        payments: paymentSeries,
        baseStatus: baseStatusDistribution,
        trialConversion,
        revenueByModule: Array.from(moduleRevenueMap.entries()).map(([label, value]) => ({
          label,
          value: this.normalizeCurrencyAmount(value),
        })),
      },
      attention: attentionDefinitions,
      companies: companySummaries,
      masterIntegrations: serializeMasterGlobalIntegrationConfig(masterIntegrationConfig),
      systemModules: systemModules.map((moduleItem) => ({
        id: moduleItem.id,
        key: moduleItem.key,
        name: moduleItem.name,
        description: moduleItem.description || null,
        monthlyPrice: this.normalizeCurrencyAmount((moduleItem as any).monthlyPrice || 0),
        defaultEnabled: Boolean(moduleItem.defaultEnabled),
        companyAssignable: Boolean(moduleItem.companyAssignable),
        serviceUrl: moduleItem.serviceUrl || null,
      })),
    };
  }

  async getMasterCompanyDetail(masterUserId: number, companyId: number) {
    await this.assertMasterUser(masterUserId);
    await this.ensureDefaultSystemModules();
    await ensureWebsiteRuntimeSchema(this.prisma);
    await ensureMasterBillingRuntimeSchema(this.prisma);

    const supportsEndpointTable = await this.supportsWhatsAppEndpointTable();
    const company = supportsEndpointTable
      ? await this.prisma.company.findUnique({
          where: { id: companyId },
          include: {
            plan: {
              select: {
                id: true,
                name: true,
                price: true,
              },
            },
            users: {
              select: {
                id: true,
                username: true,
                email: true,
                name: true,
                role: true,
                isActive: true,
                deactivatedAt: true,
                retentionUntil: true,
                createdAt: true,
              },
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            },
            companyModules: {
              include: { systemModule: true },
              orderBy: { systemModule: { name: 'asc' } },
            },
            whatsappEndpoints: {
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            },
            _count: {
              select: { users: true },
            },
          },
        })
      : await this.prisma.company.findUnique({
          where: { id: companyId },
          include: {
            plan: {
              select: {
                id: true,
                name: true,
                price: true,
              },
            },
            users: {
              select: {
                id: true,
                username: true,
                email: true,
                name: true,
                role: true,
                isActive: true,
                deactivatedAt: true,
                retentionUntil: true,
                createdAt: true,
              },
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            },
            companyModules: {
              include: { systemModule: true },
              orderBy: { systemModule: { name: 'asc' } },
            },
            _count: {
              select: { users: true },
            },
          },
        });

    if (!company) throw new BadRequestException('Empresa nao encontrada');

    const [websiteConfigs, ledgerRows, auditRows, masterIntegrationConfig, userConfirmationByCompany, webscrapingUsageByCompany, quotaOverridesByCompany] = await Promise.all([
      listCompanyWebsiteConfigs(this.prisma, [Number(companyId)]),
      this.listBillingLedgerEntriesByCompanyIds([Number(companyId)], 240),
      this.listCompanyAuditRows([Number(companyId)], 240),
      getMasterGlobalIntegrationConfig(this.prisma),
      this.listUserConfirmationSummaryByCompanyIds([Number(companyId)]),
      this.listWebscrapingUsageSummaryByCompanyIds([Number(companyId)]),
      this.listCompanyQuotaOverrides([Number(companyId)]),
    ]);
    Object.assign(company as any, quotaOverridesByCompany.get(Number(company.id)) || {});
    const serializedMasterIntegrations = serializeMasterGlobalIntegrationConfig(masterIntegrationConfig);
    const selectedWhatsAppCredential = pickMasterWhatsAppCredential(
      masterIntegrationConfig,
      company.masterWhatsAppCredentialKey,
    );
    const selectedMercadoPagoCredential = pickMasterMercadoPagoCredential(
      masterIntegrationConfig,
      company.masterMercadoPagoCredentialKey,
    );

    const status = await this.evaluateCompanyStatus(company.id, company);
    const summary = this.buildMasterCompanySummary(
      company,
      websiteConfigs.get(Number(company.id)) || null,
      ledgerRows,
      auditRows,
      status.active,
      userConfirmationByCompany.get(Number(company.id)) || this.buildDefaultUserConfirmationSummary(),
      webscrapingUsageByCompany.get(Number(company.id)) || this.buildDefaultWebscrapingUsageSummary(),
      masterIntegrationConfig,
    );
    const operationalStatus = await this.companyOperationalStatus.getOperationalStatusForCompany(
      Number(company.id),
      { refresh: false },
    );

    const auditTimeline = (auditRows || []).map((row) => this.normalizeAuditRow(row));
    const trialHistory = auditTimeline.filter((row) => String(row.action || '').toUpperCase().startsWith('TRIAL_'));

    return {
      generatedAt: new Date().toISOString(),
      company: {
        ...summary,
        operationalStatus,
        users: company.users.map((user) => ({
          id: user.id,
          username: user.username || null,
          email: user.email || null,
          name: user.name || null,
          role: user.role,
          isActive: Boolean(user.isActive),
          deactivatedAt: user.deactivatedAt ? user.deactivatedAt.toISOString() : null,
          retentionUntil: user.retentionUntil ? user.retentionUntil.toISOString() : null,
          createdAt: user.createdAt ? user.createdAt.toISOString() : null,
        })),
        modules: (company.companyModules || [])
          .filter((row) => row.systemModule.companyAssignable)
          .map((row) => ({
            key: row.systemModule.key,
            name: row.systemModule.name,
            enabled: Boolean(row.enabled),
            monthlyPrice: this.normalizeCurrencyAmount(row.systemModule.monthlyPrice || 0),
          })),
        website: {
          ...summary.website,
        },
        whatsapp: {
          ...summary.whatsapp,
          endpoints: (((company as any).whatsappEndpoints || this.buildLegacyEndpointSnapshot(company)) as any[]).map((endpoint) => ({
            id: endpoint.id,
            label: endpoint.label || null,
            moduleKey: endpoint.moduleKey || null,
            whatsappNumber: endpoint.whatsappNumber || null,
            whatsappPhoneNumberId: endpoint.whatsappPhoneNumberId || null,
            whatsappWabaId: endpoint.whatsappWabaId || null,
            whatsappDisplayNumber: endpoint.whatsappDisplayNumber || null,
            whatsappStatus: endpoint.whatsappStatus || null,
            whatsappStatusError: endpoint.whatsappStatusError || null,
            whatsappStatusUpdatedAt:
              endpoint.whatsappStatusUpdatedAt instanceof Date
                ? endpoint.whatsappStatusUpdatedAt.toISOString()
                : endpoint.whatsappStatusUpdatedAt || null,
            accessTokenConfigured: Boolean(endpoint.whatsappAccessToken),
            accessTokenValue: null,
            isActive: endpoint.isActive !== false,
            isPrimary: Boolean(endpoint.isPrimary),
          })),
          companyAccessTokenConfigured: Boolean(company.whatsappAccessToken),
          companyAccessTokenValue: null,
          usingMasterToken: Boolean(company.useMasterWhatsAppToken),
          masterCredentialKey: selectedWhatsAppCredential?.key || company.masterWhatsAppCredentialKey || null,
          masterCredentialLabel: selectedWhatsAppCredential?.label || null,
          masterAccessTokenConfigured: Boolean(
            selectedWhatsAppCredential?.accessToken && selectedWhatsAppCredential?.phoneNumberId,
          ),
          masterAccessTokenValue: null,
          masterPhoneNumberId: selectedWhatsAppCredential?.phoneNumberId || null,
          masterWabaId: selectedWhatsAppCredential?.wabaId || null,
          masterDisplayNumber: selectedWhatsAppCredential?.displayNumber || null,
        },
        mercadoPago: {
          ...summary.mercadoPago,
          statusError: company.mercadoPagoStatusError || null,
          accessTokenValue: company.mercadoPagoAccessToken || null,
          usingMasterToken: Boolean(company.useMasterMercadoPagoToken),
          masterCredentialKey: selectedMercadoPagoCredential?.key || company.masterMercadoPagoCredentialKey || null,
          masterCredentialLabel: selectedMercadoPagoCredential?.label || null,
          masterTokenConfigured: Boolean(selectedMercadoPagoCredential?.accessToken),
          masterAccessTokenValue: selectedMercadoPagoCredential?.accessToken || null,
          lastValidatedAt:
            company.mercadoPagoStatusUpdatedAt instanceof Date
              ? company.mercadoPagoStatusUpdatedAt.toISOString()
              : null,
        },
        masterIntegrations: serializedMasterIntegrations,
        financeHistory: ledgerRows.map((row) => this.normalizeLedgerEntryRow(row)),
        trialHistory,
        auditTimeline,
      },
    };
  }

  async listMasterOverview(masterUserId: number) {
    await this.assertMasterUser(masterUserId);
    await this.ensureDefaultSystemModules();
    await this.syncCompanyModulesForAllCompanies();
    await ensureWebsiteRuntimeSchema(this.prisma);

    const supportsEndpointTable = await this.supportsWhatsAppEndpointTable();
    const companies = supportsEndpointTable
      ? await this.prisma.company.findMany({
          include: {
            users: {
              select: {
                id: true,
                username: true,
                email: true,
                name: true,
                role: true,
                isActive: true,
                deactivatedAt: true,
                retentionUntil: true,
                createdAt: true,
              },
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            },
            companyModules: {
              include: { systemModule: true },
              orderBy: { systemModule: { name: 'asc' } },
            },
            whatsappEndpoints: {
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            },
          },
          orderBy: { id: 'asc' },
        })
      : await this.prisma.company.findMany({
          include: {
            users: {
              select: {
                id: true,
                username: true,
                email: true,
                name: true,
                role: true,
                isActive: true,
                deactivatedAt: true,
                retentionUntil: true,
                createdAt: true,
              },
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            },
            companyModules: {
              include: { systemModule: true },
              orderBy: { systemModule: { name: 'asc' } },
            },
          },
          orderBy: { id: 'asc' },
        });

    const websiteConfigs = await listCompanyWebsiteConfigs(
      this.prisma,
      companies.map((company) => Number(company.id)),
    );
    const webscrapingUsageByCompany = await this.listWebscrapingUsageSummaryByCompanyIds(
      companies.map((company) => Number(company.id)),
    );
    const operationalStatuses = await this.companyOperationalStatus.getOperationalStatusForCompanies(
      companies.map((company) => Number(company.id)),
      { validatePayments: true },
    );
    const operationalStatusByCompanyId = new Map(
      operationalStatuses.map((item) => [Number(item.companyId), item]),
    );

    const result: any[] = [];
    for (const company of companies) {
      const status = await this.evaluateCompanyStatus(company.id, company);
      const websiteConfig = websiteConfigs.get(Number(company.id)) || null;
      result.push({
        id: company.id,
        name: company.name,
        slug: company.slug,
        primaryContactName: company.primaryContactName || null,
        contactEmail: company.contactEmail || null,
        contactPhone: company.contactPhone || null,
        taxDocument: company.taxDocument || null,
        isActive: status.active,
        paymentStatus: company.paymentStatus,
        paymentMethod: company.paymentMethod,
        subscriptionStatus: company.subscriptionStatus,
        billingProvider: company.billingProvider,
        premiumAccess: company.premiumAccess,
        trialStartsAt: company.trialStartsAt,
        trialEndsAt: company.trialEndsAt,
        subscriptionCurrentPeriodStart: company.subscriptionCurrentPeriodStart,
        subscriptionCurrentPeriodEnd: company.subscriptionCurrentPeriodEnd,
        websiteEnabled: Boolean(websiteConfig?.websiteEnabled),
        websitePublicUrl: websiteConfig?.websitePublicUrl || null,
        websiteAdminUrl: websiteConfig?.websiteAdminUrl || null,
        websiteProjectId: websiteConfig?.websiteProjectId || null,
        websiteAdminEnabled: Boolean(websiteConfig?.websiteAdminEnabled),
        websiteLaunchMode: websiteConfig?.websiteLaunchMode || 'public',
        whatsappNumber: company.whatsappNumber || null,
        whatsappPhoneNumberId: company.whatsappPhoneNumberId || null,
        whatsappWabaId: company.whatsappWabaId || null,
        whatsappDisplayNumber: company.whatsappDisplayNumber || null,
        whatsappStatus: company.whatsappStatus || null,
        whatsappStatusError: company.whatsappStatusError || null,
        whatsappStatusUpdatedAt: company.whatsappStatusUpdatedAt || null,
        accessTokenConfigured: Boolean(company.whatsappAccessToken),
        accessTokenPreview: this.previewSecret(company.whatsappAccessToken),
        whatsappEndpoints: (((company as any).whatsappEndpoints || this.buildLegacyEndpointSnapshot(company)) as any[]).map((endpoint) => ({
          id: endpoint.id,
          label: endpoint.label || null,
          moduleKey: endpoint.moduleKey || null,
          whatsappNumber: endpoint.whatsappNumber || null,
          whatsappPhoneNumberId: endpoint.whatsappPhoneNumberId || null,
          whatsappWabaId: endpoint.whatsappWabaId || null,
          whatsappDisplayNumber: endpoint.whatsappDisplayNumber || null,
          whatsappStatus: endpoint.whatsappStatus || null,
          whatsappStatusError: endpoint.whatsappStatusError || null,
          whatsappStatusUpdatedAt: endpoint.whatsappStatusUpdatedAt || null,
          accessTokenConfigured: Boolean(endpoint.whatsappAccessToken),
          accessTokenPreview: endpoint.whatsappAccessToken
            ? `***${String(endpoint.whatsappAccessToken).slice(-6)}`
            : null,
          isActive: endpoint.isActive !== false,
          isPrimary: Boolean(endpoint.isPrimary),
          sortOrder: Number(endpoint.sortOrder || 0),
        })),
        mercadoPagoStatus: company.mercadoPagoStatus || null,
        mercadoPagoStatusError: company.mercadoPagoStatusError || null,
        mercadoPagoStatusUpdatedAt: company.mercadoPagoStatusUpdatedAt || null,
        mercadoPagoAccountEmail: company.mercadoPagoAccountEmail || null,
        mercadoPagoUserId: company.mercadoPagoUserId || null,
        mercadoPagoTokenConfigured: Boolean(company.mercadoPagoAccessToken),
        mercadoPagoTokenPreview: company.mercadoPagoAccessToken
          ? `***${String(company.mercadoPagoAccessToken).slice(-6)}`
          : null,
        webscrapingUsage:
          webscrapingUsageByCompany.get(Number(company.id)) || this.buildDefaultWebscrapingUsageSummary(),
        operationalStatus: operationalStatusByCompanyId.get(Number(company.id)) || null,
        users: company.users,
        modules: company.companyModules
          .filter((row) => row.systemModule.companyAssignable)
          .map((row) => ({ key: row.systemModule.key, name: row.systemModule.name, enabled: row.enabled })),
      });
    }

    return result;
  }

  async setCompanyModuleByMaster(masterUserId: number, companyId: number, moduleKey: string, enabled: boolean) {
    await this.assertMasterUser(masterUserId);
    await this.ensureDefaultSystemModules();

    const key = this.normalizeKey(moduleKey);
    const moduleItem = await this.prisma.systemModule.findUnique({ where: { key } });
    if (!moduleItem || !moduleItem.companyAssignable) throw new BadRequestException('Modulo nao encontrado para empresas');
    const existingModuleState = await this.prisma.companyModule.findUnique({
      where: { companyId_moduleId: { companyId, moduleId: moduleItem.id } },
      select: { enabled: true },
    });

    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new BadRequestException('Empresa nao encontrada');
    const status = await this.evaluateCompanyStatus(companyId);
    if (!status.active) {
      throw new BadRequestException(
        'Esta empresa esta sem acesso liberado. Ative pagamento ou trial antes de liberar modulos.',
      );
    }

    const result = await this.prisma.companyModule.upsert({
      where: { companyId_moduleId: { companyId, moduleId: moduleItem.id } },
      update: { enabled: Boolean(enabled) },
      create: { companyId, moduleId: moduleItem.id, enabled: Boolean(enabled) },
    });

    await this.masterContextService.registerSupportAction({
      masterUserId,
      companyId,
      scope: 'master_module',
      action: 'MODULE_TOGGLED',
      metadata: {
        moduleKey: moduleItem.key,
        moduleName: moduleItem.name,
        previousState: {
          moduleKey: moduleItem.key,
          moduleName: moduleItem.name,
          enabled: Boolean(existingModuleState?.enabled),
        },
        currentState: {
          moduleKey: moduleItem.key,
          moduleName: moduleItem.name,
          enabled: Boolean(result.enabled),
        },
      },
    });
    if (this.isTrialBundledModuleKey(moduleItem.key)) {
      await this.ensureTrialBundleForCompany(companyId);
    }

    return { ok: true, companyId: result.companyId, moduleKey: moduleItem.key, enabled: result.enabled };
  }

  async manageTrialByMaster(
    masterUserId: number,
    companyId: number,
    input?: { action?: string; days?: number; endsAt?: string; reason?: string },
  ) {
    await this.assertMasterUser(masterUserId);
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new BadRequestException('Empresa nao encontrada');
    const previousState = this.buildCompanyAccessAuditSnapshot(company);

    const action = String(input?.action || 'grant').trim().toLowerCase();
    const reason = this.normalizeOptionalString(input?.reason);
    const now = new Date();
    let trialStartsAt = company.trialStartsAt || now;
    let trialEndsAt = company.trialEndsAt || null;
    let auditAction = 'TRIAL_GRANTED';

    if (action === 'end') {
      await this.prisma.$transaction([
        this.prisma.company.update({
          where: { id: companyId },
          data: {
            isActive: false,
            onboardingStatus: 'pending_checkout',
            paymentStatus: 'PENDING',
            subscriptionStatus: 'pending_checkout',
            premiumAccess: false,
            deactivatedAt: now,
          },
        }),
        this.prisma.companyModule.updateMany({ where: { companyId }, data: { enabled: false } }),
      ]);

      await this.masterContextService.registerSupportAction({
        masterUserId,
        companyId,
        scope: 'master_trial',
        action: 'TRIAL_ENDED',
        metadata: {
          reason,
          requestedAction: action,
          previousState,
          currentState: this.buildCompanyAccessAuditSnapshot(
            await this.prisma.company.findUnique({ where: { id: companyId } }),
          ),
        },
      });

      return {
        ok: true,
        companyId,
        action: 'end',
        trialStartsAt: company.trialStartsAt?.toISOString() || null,
        trialEndsAt: company.trialEndsAt?.toISOString() || null,
      };
    }

    if (action === 'set_date') {
      const manualEnd = this.parseDateValue(input?.endsAt);
      if (!manualEnd) throw new BadRequestException('Informe endsAt em formato de data valido.');
      trialEndsAt = manualEnd;
      auditAction = manualEnd.getTime() <= now.getTime() ? 'TRIAL_SET_DATE_EXPIRED' : 'TRIAL_SET_DATE';
      if (manualEnd.getTime() <= now.getTime()) {
        await this.prisma.$transaction([
          this.prisma.company.update({
            where: { id: companyId },
            data: {
              trialStartsAt,
              trialEndsAt: manualEnd,
              isActive: false,
              onboardingStatus: 'pending_checkout',
              paymentStatus: 'PENDING',
              subscriptionStatus: 'pending_checkout',
              premiumAccess: false,
              deactivatedAt: now,
            },
          }),
          this.prisma.companyModule.updateMany({ where: { companyId }, data: { enabled: false } }),
        ]);
      } else {
        await this.prisma.$transaction(async (tx) => {
          await tx.company.update({
            where: { id: companyId },
            data: {
              selectedPlanKey: COMMERCIAL_PLAN_KEYS.PADRAO,
              trialModuleSelection: 'vendas',
              isActive: true,
              paymentStatus: 'TRIAL',
              subscriptionStatus: 'trialing',
              premiumAccess: true,
              trialStartsAt,
              trialEndsAt: manualEnd,
              trialNoticeEmailStage: 0,
              trialNoticeLastEmailAt: null,
              subscriptionCurrentPeriodStart: null,
              subscriptionCurrentPeriodEnd: null,
              deactivatedAt: null,
            },
          });
          await this.syncCompanyModulesForPlanTx(tx, companyId, COMMERCIAL_PLAN_KEYS.PADRAO);
          await this.syncCompanyEntitlementsForPlanTx(
            tx,
            companyId,
            COMMERCIAL_PLAN_KEYS.PADRAO,
            'trialing',
            'master_trial',
            trialStartsAt,
            manualEnd,
          );
        });
      }

      await this.masterContextService.registerSupportAction({
        masterUserId,
        companyId,
        scope: 'master_trial',
        action: auditAction,
        metadata: {
          reason,
          requestedAction: action,
          endsAt: manualEnd.toISOString(),
          previousState,
          currentState: this.buildCompanyAccessAuditSnapshot(
            await this.prisma.company.findUnique({ where: { id: companyId } }),
          ),
        },
      });

      return {
        ok: true,
        companyId,
        action,
        trialStartsAt: trialStartsAt.toISOString(),
        trialEndsAt: manualEnd.toISOString(),
      };
    }

    const days = Number(input?.days || 30);
    if (!Number.isFinite(days) || days < 1 || days > 365) {
      throw new BadRequestException('Periodo de trial invalido');
    }

    if (action === 'extend') {
      const base = company.trialEndsAt && company.trialEndsAt.getTime() > now.getTime() ? company.trialEndsAt : now;
      trialEndsAt = this.addDays(base, Math.trunc(days));
      auditAction = 'TRIAL_EXTENDED';
    } else if (action === 'reactivate') {
      trialStartsAt = now;
      trialEndsAt = this.addDays(now, Math.trunc(days));
      auditAction = 'TRIAL_REACTIVATED';
    } else {
      trialStartsAt = now;
      trialEndsAt = this.addDays(now, Math.trunc(days));
      auditAction = 'TRIAL_GRANTED';
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.company.update({
        where: { id: companyId },
        data: {
          selectedPlanKey: COMMERCIAL_PLAN_KEYS.PADRAO,
          trialModuleSelection: 'vendas',
          isActive: true,
          paymentStatus: 'TRIAL',
          subscriptionStatus: 'trialing',
          premiumAccess: true,
          trialStartsAt,
          trialEndsAt,
          trialNoticeEmailStage: 0,
          trialNoticeLastEmailAt: null,
          subscriptionCurrentPeriodStart: null,
          subscriptionCurrentPeriodEnd: null,
          deactivatedAt: null,
        },
      });
      await this.syncCompanyModulesForPlanTx(tx, companyId, COMMERCIAL_PLAN_KEYS.PADRAO);
      await this.syncCompanyEntitlementsForPlanTx(
        tx,
        companyId,
        COMMERCIAL_PLAN_KEYS.PADRAO,
        'trialing',
        'master_trial',
        trialStartsAt,
        trialEndsAt,
      );
    });

    await this.masterContextService.registerSupportAction({
      masterUserId,
      companyId,
      scope: 'master_trial',
      action: auditAction,
      metadata: {
        reason,
        requestedAction: action,
        days: Math.trunc(days),
        trialStartsAt: trialStartsAt.toISOString(),
        trialEndsAt: trialEndsAt.toISOString(),
        previousState,
        currentState: this.buildCompanyAccessAuditSnapshot(
          await this.prisma.company.findUnique({ where: { id: companyId } }),
        ),
      },
    });

    return {
      ok: true,
      companyId,
      action,
      trialStartsAt: trialStartsAt.toISOString(),
      trialEndsAt: trialEndsAt.toISOString(),
    };
  }

  async grantTrial(masterUserId: number, companyId: number, days = 30) {
    return this.manageTrialByMaster(masterUserId, companyId, {
      action: 'grant',
      days,
    });
  }

  private async syncCompanyModulesForPlanTx(tx: any, companyId: number, planKey: ActiveCommercialPlanKey) {
    const moduleKeys = COMMERCIAL_PLAN_MODULE_KEYS[planKey] || [];
    const moduleRows = moduleKeys.length
      ? await tx.systemModule.findMany({
          where: { companyAssignable: true, key: { in: moduleKeys } },
          select: { id: true },
        })
      : [];

    await tx.companyModule.updateMany({ where: { companyId }, data: { enabled: false } });
    for (const moduleRow of moduleRows) {
      await tx.companyModule.upsert({
        where: { companyId_moduleId: { companyId, moduleId: moduleRow.id } },
        update: { enabled: true },
        create: { companyId, moduleId: moduleRow.id, enabled: true },
      });
    }
  }

  private async syncCompanyEntitlementsForPlanTx(
    tx: any,
    companyId: number,
    planKey: ActiveCommercialPlanKey,
    status: 'paid' | 'manual' | 'trialing' | 'pending_checkout',
    source: string,
    periodStart: Date | null,
    periodEnd: Date | null,
  ) {
    const activeKeys = new Set(COMMERCIAL_PLAN_ENTITLEMENT_KEYS[planKey] || []);
    const allKeys = Object.values(COMMERCIAL_ENTITLEMENT_KEYS);

    for (const key of allKeys) {
      const active = activeKeys.has(key);
      await tx.companyCommercialEntitlement.upsert({
        where: { companyId_key: { companyId, key } },
        update: {
          status: active ? status : 'canceled',
          source: active ? source : 'master_plan_change',
          currentPeriodStart: active ? periodStart : null,
          currentPeriodEnd: active ? periodEnd : null,
          metadataJson: JSON.stringify({
            selectedPlanKey: planKey,
            changedBy: 'master',
            changedAt: new Date().toISOString(),
          }),
        },
        create: {
          companyId,
          key,
          status: active ? status : 'canceled',
          source: active ? source : 'master_plan_change',
          currentPeriodStart: active ? periodStart : null,
          currentPeriodEnd: active ? periodEnd : null,
          metadataJson: JSON.stringify({
            selectedPlanKey: planKey,
            changedBy: 'master',
            changedAt: new Date().toISOString(),
          }),
        },
      });
    }
  }

  async setCompanyPlanByMaster(masterUserId: number, companyId: number, planKey: string) {
    await this.assertMasterUser(masterUserId);
    const normalizedPlanKey = normalizeCommercialPlanKey(planKey);
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new BadRequestException('Empresa nao encontrada');

    const previousState = this.buildCompanyAccessAuditSnapshot(company);
    const previousBillingState = this.buildCompanyBillingAuditSnapshot(company);
    const previousPlanKey = this.normalizeOptionalString(company.selectedPlanKey);
    const previousNormalizedPlanKey = previousPlanKey
      ? normalizeCommercialPlanKey(previousPlanKey)
      : null;
    const previousModuleRows = await this.prisma.companyModule.findMany({
      where: { companyId, enabled: true },
      include: { systemModule: { select: { key: true } } },
    });
    const previousModuleKeys = previousModuleRows
      .map((row) => this.normalizeOptionalString(row.systemModule?.key))
      .filter(Boolean) as string[];
    const previousEntitlementKeys =
      previousNormalizedPlanKey
        ? COMMERCIAL_PLAN_ENTITLEMENT_KEYS[previousNormalizedPlanKey]
        : [];

    const paymentStatus = String(company.paymentStatus || 'PENDING').trim().toUpperCase();
    const subscriptionStatus = String(
      company.subscriptionStatus || this.mapPaymentStatusToSubscriptionStatus(paymentStatus),
    )
      .trim()
      .toLowerCase();
    const isManualAccess = paymentStatus === 'MANUAL' || subscriptionStatus === 'manual';
    const isTrialAccess = paymentStatus === 'TRIAL' || subscriptionStatus === 'trialing';
    const isPaidAccess = paymentStatus === 'PAID' || subscriptionStatus === 'active';
    const blockedStatuses = new Set(['PENDING', 'OVERDUE', 'EXPIRED', 'DISABLED']);
    const blockedSubscriptionStatuses = new Set(['pending_checkout', 'past_due', 'expired', 'canceled']);
    const isBlockedAccess =
      blockedStatuses.has(paymentStatus) || blockedSubscriptionStatuses.has(subscriptionStatus);
    const accessIsAvailable = isManualAccess || isTrialAccess || isPaidAccess;
    const entitlementStatus: 'paid' | 'manual' | 'trialing' | 'pending_checkout' =
      isManualAccess
        ? 'manual'
        : isTrialAccess
          ? 'trialing'
          : isPaidAccess
            ? 'paid'
            : 'pending_checkout';
    const nextIsActive = accessIsAvailable ? true : isBlockedAccess ? false : Boolean(company.isActive);
    const nextPremiumAccess = isManualAccess || isTrialAccess || isPaidAccess
      ? true
      : isBlockedAccess
        ? false
        : Boolean(company.premiumAccess);
    const nextModuleKeys = nextIsActive && nextPremiumAccess
      ? (COMMERCIAL_PLAN_MODULE_KEYS[normalizedPlanKey] || [])
      : [];
    const currentEntitlementKeys = COMMERCIAL_PLAN_ENTITLEMENT_KEYS[normalizedPlanKey] || [];
    const moduleDiff = this.diffStringSets(previousModuleKeys, nextModuleKeys);
    const entitlementDiff = this.diffStringSets(previousEntitlementKeys, currentEntitlementKeys);
    const periodStart = isTrialAccess
      ? company.trialStartsAt
      : company.subscriptionCurrentPeriodStart;
    const periodEnd = isTrialAccess
      ? company.trialEndsAt
      : company.subscriptionCurrentPeriodEnd;
    const assistedSetupCompleted =
      String(company.assistedSetupStatus || '').trim().toLowerCase() === 'completed';
    const assistedSetupRequired = normalizedPlanKey === COMMERCIAL_PLAN_KEYS.MELHOR;

    await this.prisma.$transaction(async (tx) => {
      await tx.company.update({
        where: { id: companyId },
        data: {
          selectedPlanKey: normalizedPlanKey,
          trialModuleSelection: normalizedPlanKey === COMMERCIAL_PLAN_KEYS.PADRAO ? 'vendas' : null,
          isActive: nextIsActive,
          premiumAccess: nextPremiumAccess,
          assistedSetupRequired,
          assistedSetupStatus:
            assistedSetupRequired
              ? assistedSetupCompleted
                ? 'completed'
                : 'pending'
              : 'not_required',
          assistedSetupCompletedAt:
            assistedSetupRequired ? company.assistedSetupCompletedAt : null,
          assistedSetupCompletedByUserId:
            assistedSetupRequired ? company.assistedSetupCompletedByUserId : null,
          assistedSetupNote:
            assistedSetupRequired
              ? company.assistedSetupNote || 'Implantação assistida pendente para liberar automação completa.'
              : null,
          deactivatedAt: nextIsActive ? null : company.deactivatedAt || new Date(),
        },
      });
      if (nextIsActive && nextPremiumAccess) {
        await this.syncCompanyModulesForPlanTx(tx, companyId, normalizedPlanKey);
      } else {
        await tx.companyModule.updateMany({ where: { companyId }, data: { enabled: false } });
      }
      await this.syncCompanyEntitlementsForPlanTx(
        tx,
        companyId,
        normalizedPlanKey,
        entitlementStatus,
        'master_plan_change',
        periodStart,
        periodEnd,
      );
    });

    const updatedCompany = await this.prisma.company.findUnique({ where: { id: companyId } });
    const currentState = this.buildCompanyAccessAuditSnapshot(updatedCompany);
    const currentBillingState = this.buildCompanyBillingAuditSnapshot(updatedCompany);
    const billingPreserved =
      previousBillingState.paymentStatus === currentBillingState.paymentStatus &&
      previousBillingState.subscriptionStatus === currentBillingState.subscriptionStatus &&
      previousBillingState.billingProvider === currentBillingState.billingProvider &&
      previousBillingState.paymentMethod === currentBillingState.paymentMethod;
    const accessPreserved =
      previousState.isActive === currentState.isActive &&
      previousState.premiumAccess === currentState.premiumAccess &&
      previousState.trialStartsAt === currentState.trialStartsAt &&
      previousState.trialEndsAt === currentState.trialEndsAt &&
      previousState.subscriptionCurrentPeriodStart === currentState.subscriptionCurrentPeriodStart &&
      previousState.subscriptionCurrentPeriodEnd === currentState.subscriptionCurrentPeriodEnd;
    const planTitle = getCommercialPlanTitle(normalizedPlanKey);
    const billingLabel =
      paymentStatus === 'PAID'
        ? 'Pago'
        : paymentStatus === 'MANUAL'
          ? 'Manual'
          : paymentStatus === 'TRIAL'
            ? 'Trial'
            : paymentStatus === 'OVERDUE'
              ? 'Atrasado'
              : paymentStatus === 'EXPIRED'
                ? 'Expirado'
                : paymentStatus === 'DISABLED'
                  ? 'Suspenso'
                  : 'Pendente';
    const warning = isManualAccess
      ? 'Acesso manual ativo'
      : !nextIsActive || !nextPremiumAccess
        ? paymentStatus === 'OVERDUE'
          ? 'Empresa continua sem acesso por cobrança em atraso.'
          : paymentStatus === 'DISABLED'
            ? 'Empresa continua suspensa.'
            : paymentStatus === 'EXPIRED'
              ? 'Empresa continua sem acesso por assinatura expirada.'
              : 'Empresa continua sem acesso por cobrança pendente.'
        : null;
    const message = isManualAccess
      ? `Plano alterado para ${planTitle}. Acesso manual continua ativo.`
      : !nextIsActive || !nextPremiumAccess
        ? `Plano alterado para ${planTitle}. ${warning}`
        : `Plano alterado para ${planTitle}. Cobrança mantida como ${billingLabel}.`;

    await this.masterContextService.registerSupportAction({
      masterUserId,
      companyId,
      scope: 'master_plan',
      action: 'COMMERCIAL_PLAN_CHANGED',
      metadata: {
        previousPlanKey: previousPlanKey || null,
        currentPlanKey: normalizedPlanKey,
        previousPaymentStatus: previousState.paymentStatus,
        previousSubscriptionStatus: previousState.subscriptionStatus,
        previousPremiumAccess: previousState.premiumAccess,
        previousIsActive: previousState.isActive,
        currentPaymentStatus: currentState.paymentStatus,
        currentSubscriptionStatus: currentState.subscriptionStatus,
        currentPremiumAccess: currentState.premiumAccess,
        currentIsActive: currentState.isActive,
        previousState,
        currentState,
        billingPreserved,
        accessPreserved,
        modulesAdded: moduleDiff.added,
        modulesRemoved: moduleDiff.removed,
        entitlementsAdded: entitlementDiff.added,
        entitlementsRemoved: entitlementDiff.removed,
      },
    });

    return {
      ok: true,
      companyId,
      previousPlanKey: previousPlanKey || null,
      planKey: normalizedPlanKey,
      paymentStatus: currentState.paymentStatus,
      subscriptionStatus: currentState.subscriptionStatus,
      premiumAccess: currentState.premiumAccess,
      isActive: currentState.isActive,
      accessPreserved,
      billingPreserved,
      modulesChanged: moduleDiff.added.length > 0 || moduleDiff.removed.length > 0,
      entitlementsChanged: entitlementDiff.added.length > 0 || entitlementDiff.removed.length > 0,
      warning,
      message,
    };
  }

  async completeAssistedSetupByMaster(masterUserId: number, companyId: number, dto?: { note?: string }) {
    await this.assertMasterUser(masterUserId);
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new BadRequestException('Empresa nao encontrada');

    const now = new Date();
    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: {
        assistedSetupRequired: normalizeCommercialPlanKey(company.selectedPlanKey || COMMERCIAL_PLAN_KEYS.PADRAO) === COMMERCIAL_PLAN_KEYS.MELHOR,
        assistedSetupStatus: 'completed',
        assistedSetupCompletedAt: now,
        assistedSetupCompletedByUserId: masterUserId,
        assistedSetupNote: String(dto?.note || '').trim() || 'Implantação assistida concluída pelo MASTER.',
      },
    });

    await this.masterContextService.registerSupportAction({
      masterUserId,
      companyId,
      scope: 'master_company',
      action: 'ASSISTED_SETUP_COMPLETED',
      metadata: {
        previousStatus: company.assistedSetupStatus || null,
        completedAt: now.toISOString(),
        note: updated.assistedSetupNote || null,
      },
    });

    return {
      ok: true,
      companyId,
      assistedSetup: {
        required: Boolean(updated.assistedSetupRequired),
        status: updated.assistedSetupStatus,
        completedAt: updated.assistedSetupCompletedAt?.toISOString() || null,
      },
    };
  }

  async setPaymentStatus(masterUserId: number, companyId: number, paymentStatus: string) {
    await this.assertMasterUser(masterUserId);

    const normalized = String(paymentStatus || '').trim().toUpperCase();
    const allowed = ['PENDING', 'TRIAL', 'PAID', 'MANUAL', 'OVERDUE', 'EXPIRED', 'DISABLED'];
    if (!allowed.includes(normalized)) {
      throw new BadRequestException(`paymentStatus deve ser um de: ${allowed.join(', ')}`);
    }

    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new BadRequestException('Empresa nao encontrada');
    const previousState = this.buildCompanyAccessAuditSnapshot(company);

    const isActive = normalized === 'PAID' || normalized === 'TRIAL' || normalized === 'MANUAL';
    const subscriptionStatus = this.mapPaymentStatusToSubscriptionStatus(normalized);
    const now = new Date();
    const planKey = normalizeCommercialPlanKey(company.selectedPlanKey || COMMERCIAL_PLAN_KEYS.PADRAO);
    const periodStart = normalized === 'PAID' ? now : normalized === 'TRIAL' ? (company.trialStartsAt || now) : null;
    const periodEnd = normalized === 'PAID'
      ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
      : normalized === 'TRIAL'
        ? (company.trialEndsAt || this.addDays(now, 14))
        : null;
    await this.prisma.$transaction(async (tx) => {
      await tx.company.update({
        where: { id: companyId },
        data: {
          selectedPlanKey: normalized === 'TRIAL' ? COMMERCIAL_PLAN_KEYS.PADRAO : planKey,
          trialModuleSelection: normalized === 'TRIAL' ? 'vendas' : company.trialModuleSelection,
          paymentStatus: normalized,
          subscriptionStatus,
          onboardingStatus:
            normalized === 'MANUAL' || normalized === 'PAID'
              ? 'active_paid'
              : normalized === 'TRIAL'
                ? 'active_trial'
                : company.onboardingStatus,
          premiumAccess: ['active', 'trialing', 'manual'].includes(subscriptionStatus),
          assistedSetupRequired: planKey === COMMERCIAL_PLAN_KEYS.MELHOR,
          assistedSetupStatus:
            planKey === COMMERCIAL_PLAN_KEYS.MELHOR
              ? String(company.assistedSetupStatus || '').trim().toLowerCase() === 'completed'
                ? 'completed'
                : 'pending'
              : 'not_required',
          trialStartsAt: normalized === 'TRIAL' ? periodStart : normalized === 'MANUAL' ? null : company.trialStartsAt,
          trialEndsAt: normalized === 'TRIAL' ? periodEnd : normalized === 'MANUAL' ? null : company.trialEndsAt,
          subscriptionCurrentPeriodStart:
            normalized === 'PAID'
              ? periodStart
              : normalized === 'MANUAL'
                ? null
                : company.subscriptionCurrentPeriodStart,
          subscriptionCurrentPeriodEnd:
            normalized === 'PAID'
              ? periodEnd
              : normalized === 'MANUAL'
                ? null
                : normalized === 'DISABLED' || normalized === 'EXPIRED'
                  ? null
                  : company.subscriptionCurrentPeriodEnd,
          isActive,
          deactivatedAt: isActive ? null : new Date(),
        },
      });

      if (!isActive) {
        await tx.companyModule.updateMany({ where: { companyId }, data: { enabled: false } });
        await this.syncCompanyEntitlementsForPlanTx(
          tx,
          companyId,
          planKey,
          normalized === 'PENDING' ? 'pending_checkout' : 'pending_checkout',
          'master_payment_status',
          null,
          null,
        );
      } else {
        const effectivePlanKey = normalized === 'TRIAL' ? COMMERCIAL_PLAN_KEYS.PADRAO : planKey;
        await this.syncCompanyModulesForPlanTx(tx, companyId, effectivePlanKey);
        await this.syncCompanyEntitlementsForPlanTx(
          tx,
          companyId,
          effectivePlanKey,
          normalized === 'TRIAL' ? 'trialing' : normalized === 'MANUAL' ? 'manual' : 'paid',
          'master_payment_status',
          periodStart,
          periodEnd,
        );
      }
    });

    await this.masterContextService.registerSupportAction({
      masterUserId,
      companyId,
      scope: 'master_billing',
      action: 'PAYMENT_STATUS_UPDATED',
      metadata: {
        previousState,
        currentState: this.buildCompanyAccessAuditSnapshot(
          await this.prisma.company.findUnique({ where: { id: companyId } }),
        ),
        paymentStatus: normalized,
        subscriptionStatus,
        isActive,
      },
    });

    return { ok: true, companyId, paymentStatus: normalized, subscriptionStatus, isActive };
  }

  async recordManualPayment(
    masterUserId: number,
    companyId: number,
    input: {
      value?: number;
      competence?: string;
      paidAt?: string;
      dueDate?: string;
      paymentMethod?: string;
      observation?: string;
      settlePending?: boolean;
      generateAudit?: boolean;
    },
  ) {
    await this.assertMasterUser(masterUserId);
    await ensureMasterBillingRuntimeSchema(this.prisma);

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: {
        plan: {
          select: {
            id: true,
            name: true,
            price: true,
          },
        },
      },
    });
    if (!company) throw new BadRequestException('Empresa nao encontrada');

    const value = this.normalizeCurrencyAmount(input?.value || 0);
    if (value <= 0) throw new BadRequestException('Informe um valor maior que zero.');

    const paidAt = this.parseDateValue(input?.paidAt) || new Date();
    const dueDate = this.parseDateValue(input?.dueDate);
    const paymentMethod = String(input?.paymentMethod || company.paymentMethod || 'MANUAL')
      .trim()
      .toUpperCase();
    const competence =
      this.normalizeOptionalString(input?.competence) || this.monthKey(paidAt);
    const observation = this.normalizeOptionalString(input?.observation);
    const settlePending = input?.settlePending !== false;
    const previousSubscriptionStatus = String(company.subscriptionStatus || '').trim().toLowerCase();
    const previousState = this.buildCompanyAccessAuditSnapshot(company);

    await this.insertBillingLedgerEntry({
      companyId,
      createdByUserId: masterUserId,
      entryType:
        paymentMethod === 'PIX'
          ? 'PIX_MANUAL'
          : paymentMethod === 'TRANSFERENCIA'
            ? 'TRANSFERENCIA_MANUAL'
            : paymentMethod === 'DINHEIRO'
              ? 'DINHEIRO_MANUAL'
              : 'MANUAL_PAYMENT',
      entryGroup: 'revenue',
      status: 'APPROVED',
      origin: 'master_manual_payment',
      competence,
      amount: value,
      dueDate,
      paidAt,
      paymentMethod,
      observation,
      referenceLabel: company.plan?.name || 'Mensalidade SaaS',
      metadata: {
        settlePending,
        previousPaymentStatus: company.paymentStatus,
      },
    });

    if (settlePending) {
      const planKey = normalizeCommercialPlanKey(company.selectedPlanKey || COMMERCIAL_PLAN_KEYS.PADRAO);
      const periodEnd = this.addDays(paidAt, 30);
      await this.prisma.$transaction(async (tx) => {
        await tx.company.update({
          where: { id: companyId },
          data: {
            selectedPlanKey: planKey,
            paymentStatus: 'PAID',
            subscriptionStatus: 'active',
            premiumAccess: true,
            subscriptionCurrentPeriodStart: paidAt,
            subscriptionCurrentPeriodEnd: periodEnd,
            isActive: true,
            deactivatedAt: null,
          },
        });
        await this.syncCompanyModulesForPlanTx(tx, companyId, planKey);
        await this.syncCompanyEntitlementsForPlanTx(tx, companyId, planKey, 'paid', 'master_manual_payment', paidAt, periodEnd);
      });
    }

    if (input?.generateAudit !== false) {
      await this.masterContextService.registerSupportAction({
        masterUserId,
        companyId,
        scope: 'master_billing',
        action: 'MANUAL_PAYMENT_RECORDED',
        metadata: {
          value,
          competence,
          paidAt: paidAt.toISOString(),
          paymentMethod,
          settlePending,
          observation,
          previousState,
          currentState: this.buildCompanyAccessAuditSnapshot(
            settlePending
              ? await this.prisma.company.findUnique({ where: { id: companyId } })
              : company,
          ),
        },
      });

      if (settlePending && previousSubscriptionStatus === 'trialing') {
        await this.masterContextService.registerSupportAction({
          masterUserId,
          companyId,
          scope: 'master_trial',
          action: 'TRIAL_CONVERTED',
          metadata: {
            value,
            paidAt: paidAt.toISOString(),
            paymentMethod,
          },
        });
      }
    }

    return {
      ok: true,
      companyId,
      value,
      competence,
      paidAt: paidAt.toISOString(),
      paymentMethod,
      settlePending,
    };
  }

  async cancelManualPaymentEntry(
    masterUserId: number,
    companyId: number,
    entryId: string,
    input?: { observation?: string },
  ) {
    await this.assertMasterUser(masterUserId);
    await ensureMasterBillingRuntimeSchema(this.prisma);

    const rows = await this.prisma.$queryRaw<BillingLedgerEntryRow[]>(
      Prisma.sql`
        SELECT
          "id",
          "companyId",
          "entryType",
          "entryGroup",
          "status",
          "origin",
          "currency",
          "competence",
          "amount",
          "dueDate",
          "paidAt",
          "paymentMethod",
          "referenceLabel",
          "observation",
          "metadata",
          "createdByUserId",
          "createdAt",
          "updatedAt"
        FROM "MasterBillingLedgerEntry"
        WHERE "id" = ${String(entryId)}
          AND "companyId" = ${Number(companyId)}
        LIMIT 1
      `,
    );

    const entry = rows?.[0];
    if (!entry) throw new BadRequestException('Lancamento financeiro nao encontrado.');

    const entryType = String(entry.entryType || '').toUpperCase();
    const isManualEntry =
      String(entry.origin || '').toLowerCase() === 'master_manual_payment' ||
      ['MANUAL_PAYMENT', 'PIX_MANUAL', 'TRANSFERENCIA_MANUAL', 'DINHEIRO_MANUAL'].includes(entryType);
    if (!isManualEntry) {
      throw new BadRequestException('Somente lancamentos manuais podem ser removidos por esta tela.');
    }

    const nextObservation = [entry.observation, this.normalizeOptionalString(input?.observation), `Removido pelo MASTER em ${new Date().toLocaleString('pt-BR')}`]
      .filter(Boolean)
      .join(' | ');

    await this.prisma.$executeRaw`
      UPDATE "MasterBillingLedgerEntry"
      SET
        "status" = ${'CANCELLED'},
        "observation" = ${nextObservation || null},
        "updatedAt" = ${new Date()}
      WHERE "id" = ${String(entryId)}
        AND "companyId" = ${Number(companyId)}
    `;

    await this.masterContextService.registerSupportAction({
      masterUserId,
      companyId,
      scope: 'master_billing',
      action: 'MANUAL_PAYMENT_CANCELLED',
      severity: 'WARN',
      metadata: {
        previousState: {
          entryId: String(entryId),
          status: String(entry.status || 'PENDING'),
          amount: this.normalizeCurrencyAmount(entry.amount),
          competence: entry.competence || null,
          observation: entry.observation || null,
        },
        currentState: {
          entryId: String(entryId),
          status: 'CANCELLED',
          amount: this.normalizeCurrencyAmount(entry.amount),
          competence: entry.competence || null,
          observation: nextObservation || null,
        },
      },
    });

    return {
      ok: true,
      companyId,
      entryId: String(entryId),
      status: 'CANCELLED',
    };
  }

  async updateCompanyProfileByMaster(
    masterUserId: number,
    companyId: number,
    dto: {
      name?: string;
      primaryContactName?: string;
      contactEmail?: string;
      contactPhone?: string;
      taxDocument?: string;
      paymentMethod?: string;
      billingProvider?: string;
      subscriptionStatus?: string;
      premiumAccess?: boolean;
    },
  ) {
    await this.assertMasterUser(masterUserId);
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new BadRequestException('Empresa nao encontrada');
    const previousState = this.buildCompanyProfileAuditSnapshot(company);

    const paymentMethod = String(dto?.paymentMethod || company.paymentMethod || 'NONE')
      .trim()
      .toUpperCase();
    const billingProvider = String(dto?.billingProvider || company.billingProvider || 'manual')
      .trim()
      .toLowerCase();
    const requestedPremiumAccess = typeof dto?.premiumAccess === 'boolean'
      ? dto.premiumAccess
      : Boolean(company.premiumAccess);
    const subscriptionStatus = String(
      dto?.subscriptionStatus || company.subscriptionStatus || this.mapPaymentStatusToSubscriptionStatus(company.paymentStatus),
    )
      .trim()
      .toLowerCase();
    const effectiveSubscriptionStatus = requestedPremiumAccess ? 'manual' : subscriptionStatus;

    const allowedPaymentMethods = ['NONE', 'CARD', 'PIX', 'BOLETO', 'MANUAL'];
    const allowedBillingProviders = ['manual', 'mercadopago', 'stripe', 'apple', 'google'];
    const allowedSubscriptionStatuses = ['trialing', 'active', 'manual', 'past_due', 'canceled', 'expired'];

    if (!allowedPaymentMethods.includes(paymentMethod)) {
      throw new BadRequestException(`paymentMethod deve ser um de: ${allowedPaymentMethods.join(', ')}`);
    }
    if (!allowedBillingProviders.includes(billingProvider)) {
      throw new BadRequestException(
        `billingProvider deve ser um de: ${allowedBillingProviders.join(', ')}`,
      );
    }
    if (!allowedSubscriptionStatuses.includes(effectiveSubscriptionStatus)) {
      throw new BadRequestException(
        `subscriptionStatus deve ser um de: ${allowedSubscriptionStatuses.join(', ')}`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const premiumPlanKey = normalizeCommercialPlanKey(company.selectedPlanKey || COMMERCIAL_PLAN_KEYS.PADRAO);
      const next = await tx.company.update({
        where: { id: companyId },
        data: {
          selectedPlanKey: requestedPremiumAccess ? premiumPlanKey : company.selectedPlanKey,
          name: this.normalizeOptionalString(dto?.name) || company.name,
          primaryContactName: this.normalizeOptionalString(dto?.primaryContactName),
          contactEmail: this.normalizeOptionalString(dto?.contactEmail),
          contactPhone: this.normalizeOptionalString(dto?.contactPhone),
          taxDocument: this.normalizeOptionalString(dto?.taxDocument),
          paymentMethod: requestedPremiumAccess && paymentMethod === 'NONE' ? 'MANUAL' : paymentMethod,
          billingProvider: requestedPremiumAccess ? 'manual' : billingProvider,
          onboardingStatus: requestedPremiumAccess ? 'active_paid' : company.onboardingStatus,
          paymentStatus: requestedPremiumAccess ? 'MANUAL' : company.paymentStatus,
          subscriptionStatus: effectiveSubscriptionStatus,
          premiumAccess: requestedPremiumAccess || ['active', 'trialing', 'manual'].includes(effectiveSubscriptionStatus),
          isActive: requestedPremiumAccess || company.isActive,
          deactivatedAt: requestedPremiumAccess ? null : company.deactivatedAt,
        },
      });
      if (requestedPremiumAccess) {
        await this.syncCompanyModulesForPlanTx(tx, companyId, premiumPlanKey);
        await this.syncCompanyEntitlementsForPlanTx(tx, companyId, premiumPlanKey, 'manual', 'master_profile_premium', null, null);
      }
      return next;
    });

    await this.masterContextService.registerSupportAction({
      masterUserId,
      companyId,
      scope: 'master_company',
      action: 'COMPANY_PROFILE_UPDATED',
      metadata: {
        previousState,
        currentState: this.buildCompanyProfileAuditSnapshot(updated),
      },
    });

    return { ok: true, companyId };
  }

  async updateCompanyFinanceSettingsByMaster(
    masterUserId: number,
    companyId: number,
    dto: {
      manualDiscountPercent?: number;
      freeMonths?: number;
      billingCycle?: string;
    },
  ) {
    await this.assertMasterUser(masterUserId);
    await ensureMasterBillingRuntimeSchema(this.prisma);
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new BadRequestException('Empresa nao encontrada');
    const previousState = this.buildCompanyFinanceSettingsAuditSnapshot(company);

    const billingCycle = dto?.billingCycle !== undefined
      ? this.normalizeBillingCycle(dto.billingCycle)
      : this.normalizeBillingCycle(company.billingCycle);
    const manualDiscountPercent =
      dto?.manualDiscountPercent !== undefined
        ? this.normalizePercentValue(dto.manualDiscountPercent)
        : this.normalizePercentValue(company.manualDiscountPercent || 0);
    const freeMonths =
      dto?.freeMonths !== undefined
        ? Math.max(0, Math.trunc(Number(dto.freeMonths || 0) || 0))
        : Math.max(0, Math.trunc(Number(company.freeMonths || 0) || 0));

    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: {
        billingCycle,
        manualDiscountPercent,
        freeMonths,
      },
    });

    await this.masterContextService.registerSupportAction({
      masterUserId,
      companyId,
      scope: 'master_billing',
      action: 'COMPANY_FINANCE_SETTINGS_UPDATED',
      metadata: {
        previousState,
        currentState: this.buildCompanyFinanceSettingsAuditSnapshot(updated),
      },
    });

    return { ok: true, companyId, billingCycle, manualDiscountPercent, freeMonths };
  }

  async updateCompanyCardQuotaByMaster(
    masterUserId: number,
    companyId: number,
    dto: {
      monthlyCardLimit?: number | null;
      dailyCardLimit?: number | null;
    },
  ) {
    await this.assertMasterUser(masterUserId);
    await ensureMasterBillingRuntimeSchema(this.prisma);
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new BadRequestException('Empresa nao encontrada');
    const quotaOverrides = await this.listCompanyQuotaOverrides([companyId]);
    Object.assign(company as any, quotaOverrides.get(companyId) || {});
    const previousState = this.buildCompanyCardQuotaAuditSnapshot(company);

    const monthlyOverride = this.normalizeQuotaOverride(dto?.monthlyCardLimit);
    const dailyOverride = this.normalizeQuotaOverride(dto?.dailyCardLimit);

    await this.prisma.$executeRawUnsafe(
      `UPDATE "Company"
       SET "commercialCardsMonthlyLimitOverride" = $1,
           "commercialCardsDailyLimitOverride" = $2
       WHERE "id" = $3`,
      monthlyOverride,
      dailyOverride,
      companyId,
    );

    const updated = {
      ...company,
      commercialCardsMonthlyLimitOverride: monthlyOverride,
      commercialCardsDailyLimitOverride: dailyOverride,
    };
    const currentState = this.buildCompanyCardQuotaAuditSnapshot(updated);

    await this.masterContextService.registerSupportAction({
      masterUserId,
      companyId,
      scope: 'master_quota',
      action: 'COMPANY_CARD_QUOTA_UPDATED',
      metadata: {
        previousState,
        currentState,
      },
    });

    return { ok: true, companyId, commercialCardQuota: currentState };
  }

  private normalizeVendasComplaintStatus(value: unknown) {
    const status = String(value || '').trim().toLowerCase();
    const allowed = ['new', 'reviewing', 'refunded', 'denied', 'resolved'];
    return allowed.includes(status) ? status : 'new';
  }

  private normalizeNullableText(value: unknown, max = 600) {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim();
    return normalized ? normalized.slice(0, max) : null;
  }

  private normalizeRadarPhoneDigits(value: unknown) {
    let digits = String(value || '').replace(/\D/g, '');
    if (digits.startsWith('55') && digits.length > 11) digits = digits.slice(2);
    return digits || null;
  }

  private buildVendasComplaintPayload(row: any) {
    const leadPhone = this.normalizeNullableText(row.leadPhone, 40);
    const companyPhone = this.normalizeNullableText(row.companyContactPhone || row.companyWhatsappNumber, 40);
    const contactDigits = String(companyPhone || '').replace(/\D/g, '');
    return {
      id: String(row.id),
      companyId: Number(row.companyId || 0),
      companyName: String(row.companyName || 'Empresa'),
      userId: Number(row.userId || 0) || null,
      userName: row.userName ? String(row.userName) : null,
      userEmail: row.userEmail ? String(row.userEmail) : null,
      vendasLeadId: row.vendasLeadId ? String(row.vendasLeadId) : null,
      radarLeadId: row.radarLeadId ? String(row.radarLeadId) : null,
      leadName: row.leadName ? String(row.leadName) : null,
      leadPhone,
      leadCity: row.leadCity ? String(row.leadCity) : null,
      leadState: row.leadState ? String(row.leadState) : null,
      leadSegment: row.leadSegment ? String(row.leadSegment) : null,
      reason: String(row.reason || ''),
      status: this.normalizeVendasComplaintStatus(row.status),
      refundedCards: Math.max(0, Math.trunc(Number(row.refundedCards || 0) || 0)),
      internalNote: row.internalNote ? String(row.internalNote) : null,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt || ''),
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : null,
      resolvedAt: row.resolvedAt instanceof Date ? row.resolvedAt.toISOString() : null,
      contactPhone: companyPhone,
      contactWhatsappUrl: contactDigits ? `https://wa.me/55${contactDigits.replace(/^55/, '')}` : null,
    };
  }

  async listMasterVendasComplaints(masterUserId: number, input: { status?: string; limit?: number } = {}) {
    await this.assertMasterUser(masterUserId);
    await ensureVendasComplaintsRuntimeSchema(this.prisma);
    const normalizedStatus = String(input.status || '').trim().toLowerCase();
    const limit = Math.max(1, Math.min(2000, Math.trunc(Number(input.limit || 80) || 80)));
    const rows = normalizedStatus && normalizedStatus !== 'all'
      ? await this.prisma.$queryRaw<Array<any>>(
        Prisma.sql`
          SELECT
            c.*,
            co."name" AS "companyName",
            co."contactPhone" AS "companyContactPhone",
            co."whatsappNumber" AS "companyWhatsappNumber",
            u."name" AS "userName",
            u."email" AS "userEmail"
          FROM "VendasCardComplaint" c
          INNER JOIN "Company" co ON co."id" = c."companyId"
          LEFT JOIN "User" u ON u."id" = c."userId"
          WHERE c."status" = ${this.normalizeVendasComplaintStatus(normalizedStatus)}
          ORDER BY c."createdAt" DESC
          LIMIT ${limit}
        `,
      )
      : await this.prisma.$queryRaw<Array<any>>(
        Prisma.sql`
          SELECT
            c.*,
            co."name" AS "companyName",
            co."contactPhone" AS "companyContactPhone",
            co."whatsappNumber" AS "companyWhatsappNumber",
            u."name" AS "userName",
            u."email" AS "userEmail"
          FROM "VendasCardComplaint" c
          INNER JOIN "Company" co ON co."id" = c."companyId"
          LEFT JOIN "User" u ON u."id" = c."userId"
          ORDER BY
            CASE c."status"
              WHEN 'new' THEN 0
              WHEN 'reviewing' THEN 1
              WHEN 'refunded' THEN 2
              WHEN 'denied' THEN 3
              ELSE 4
            END,
            c."createdAt" DESC
          LIMIT ${limit}
        `,
      );

    const items = rows.map((row) => this.buildVendasComplaintPayload(row));
    return {
      ok: true,
      items,
      summary: {
        total: items.length,
        new: items.filter((item) => item.status === 'new').length,
        reviewing: items.filter((item) => item.status === 'reviewing').length,
        refunded: items.filter((item) => item.status === 'refunded').length,
        denied: items.filter((item) => item.status === 'denied').length,
        resolved: items.filter((item) => item.status === 'resolved').length,
      },
    };
  }

  async updateMasterVendasComplaint(masterUserId: number, complaintId: string, dto: { status?: string; internalNote?: string; refundCards?: number } = {}) {
    await this.assertMasterUser(masterUserId);
    await ensureVendasComplaintsRuntimeSchema(this.prisma);
    const id = String(complaintId || '').trim();
    if (!id) throw new BadRequestException('Reclamacao nao informada.');

    const rows = await this.prisma.$queryRaw<Array<any>>(
      Prisma.sql`
        SELECT * FROM "VendasCardComplaint"
        WHERE "id" = ${id}
        LIMIT 1
      `,
    );
    const existing = rows[0] || null;
    if (!existing) throw new BadRequestException('Reclamacao nao encontrada.');

    const refundCards = Math.max(0, Math.min(100, Math.trunc(Number(dto.refundCards || 0) || 0)));
    const previousRefunded = Math.max(0, Math.trunc(Number(existing.refundedCards || 0) || 0));
    const refundDelta = Math.max(0, refundCards - previousRefunded);
    const requestedStatus = dto.status !== undefined
      ? this.normalizeVendasComplaintStatus(dto.status)
      : refundDelta > 0
        ? 'refunded'
        : this.normalizeVendasComplaintStatus(existing.status);
    const note = this.normalizeNullableText(dto.internalNote, 1200);
    const now = new Date();

    if (refundDelta > 0) {
      await this.commercialUsageLimits.recordCardRefund(Number(existing.companyId), Number(existing.userId || 0) || null, {
        count: refundDelta,
        complaintId: id,
        vendasLeadId: existing.vendasLeadId || null,
        radarLeadId: existing.radarLeadId || null,
        reason: existing.reason || null,
        refundedByUserId: masterUserId,
      });
    }

    await this.prisma.$executeRaw`
      UPDATE "VendasCardComplaint"
      SET
        "status" = ${requestedStatus},
        "refundedCards" = ${Math.max(previousRefunded, refundCards)},
        "internalNote" = ${note},
        "resolvedByUserId" = ${['refunded', 'denied', 'resolved'].includes(requestedStatus) ? Number(masterUserId) : null},
        "resolvedAt" = ${['refunded', 'denied', 'resolved'].includes(requestedStatus) ? now : null},
        "updatedAt" = ${now}
      WHERE "id" = ${id}
    `;

    await this.masterContextService.registerSupportAction({
      masterUserId,
      companyId: Number(existing.companyId),
      scope: 'vendas_complaint',
      action: refundDelta > 0 ? 'VENDAS_COMPLAINT_REFUNDED' : 'VENDAS_COMPLAINT_UPDATED',
      severity: refundDelta > 0 ? 'WARN' : 'INFO',
      metadata: {
        complaintId: id,
        previousStatus: existing.status || null,
        status: requestedStatus,
        refundDelta,
        refundedCards: Math.max(previousRefunded, refundCards),
        note,
      },
    });

    return this.listMasterVendasComplaints(masterUserId, { limit: 80 });
  }

  async permanentDeleteMasterVendasComplaints(masterUserId: number, input: { complaintIds?: string[]; status?: string } = {}) {
    await this.assertMasterUser(masterUserId);
    await ensureVendasComplaintsRuntimeSchema(this.prisma);

    const ids = Array.from(new Set((Array.isArray(input.complaintIds) ? input.complaintIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean))).slice(0, 2000);
    const status = String(input.status || '').trim().toLowerCase();

    let affected = 0;
    if (ids.length) {
      affected = await this.prisma.$executeRaw(
        Prisma.sql`DELETE FROM "VendasCardComplaint" WHERE "id" IN (${Prisma.join(ids)})`,
      );
    } else if (status && status !== 'all') {
      affected = await this.prisma.$executeRaw(
        Prisma.sql`DELETE FROM "VendasCardComplaint" WHERE "status" = ${this.normalizeVendasComplaintStatus(status)}`,
      );
    } else {
      throw new BadRequestException('Nenhuma reclamacao selecionada para exclusao em massa.');
    }

    await this.masterContextService.registerSupportAction({
      masterUserId,
      companyId: null,
      scope: 'vendas_complaint',
      action: 'VENDAS_COMPLAINT_MASS_DELETED',
      severity: 'WARN',
      metadata: {
        affected,
        selectedCount: ids.length,
        status: status || null,
      },
    });

    return { ok: true, affected };
  }

  private buildMasterRadarCardExclusionPayload(row: any) {
    const lead = row?.radarLead || {};
    const reason = this.normalizeNullableText(
      row?.complaintReason || row?.deniedReason || row?.negativeReason || lead?.complaintReason || lead?.deniedReason || lead?.rejectionReason,
      1000,
    );
    return {
      id: String(row?.id || ''),
      companyId: Number(row?.companyId || 0) || null,
      companyName: row?.company?.name ? String(row.company.name) : null,
      radarLeadId: row?.radarLeadId ? String(row.radarLeadId) : null,
      vendasLeadId: row?.vendasLeadId ? String(row.vendasLeadId) : null,
      status: String(row?.status || ''),
      reason,
      negativeReason: row?.negativeReason ? String(row.negativeReason) : null,
      complaintReason: row?.complaintReason ? String(row.complaintReason) : null,
      deniedReason: row?.deniedReason ? String(row.deniedReason) : null,
      lastActionAt: row?.lastActionAt instanceof Date ? row.lastActionAt.toISOString() : null,
      updatedAt: row?.updatedAt instanceof Date ? row.updatedAt.toISOString() : null,
      lead: {
        id: lead?.id ? String(lead.id) : null,
        name: lead?.name ? String(lead.name) : null,
        phone: lead?.phone ? String(lead.phone) : null,
        city: lead?.city ? String(lead.city) : null,
        state: lead?.state ? String(lead.state) : null,
        segment: lead?.segment ? String(lead.segment) : null,
        website: lead?.website ? String(lead.website) : null,
        status: lead?.status ? String(lead.status) : null,
        opportunityScore: Math.max(0, Math.trunc(Number(lead?.opportunityScore || 0) || 0)),
      },
    };
  }

  private buildMasterRadarCardExclusionWhere(query?: { moduleKey?: string; companyId?: number; search?: string }) {
    const moduleKey = String(query?.moduleKey || '').trim().toLowerCase();
    const allowedModuleFilter = !moduleKey || ['radar', 'webscraping', 'bancodedados', 'vendas', 'cards'].includes(moduleKey);
    if (!allowedModuleFilter) {
      return null;
    }

    const where: any = { status: { in: ['discarded', 'complaint'] } };
    const companyId = Number(query?.companyId || 0);
    if (companyId > 0) where.companyId = companyId;

    const search = String(query?.search || '').trim();
    if (search) {
      where.OR = [
        { negativeReason: { contains: search, mode: 'insensitive' } },
        { complaintReason: { contains: search, mode: 'insensitive' } },
        { deniedReason: { contains: search, mode: 'insensitive' } },
        { radarLead: { is: { name: { contains: search, mode: 'insensitive' } } } },
        { radarLead: { is: { phone: { contains: search, mode: 'insensitive' } } } },
        { radarLead: { is: { city: { contains: search, mode: 'insensitive' } } } },
        { radarLead: { is: { state: { contains: search, mode: 'insensitive' } } } },
        { radarLead: { is: { segment: { contains: search, mode: 'insensitive' } } } },
      ];
    }

    return where;
  }

  private async listMasterRadarCardExclusions(query?: { moduleKey?: string; companyId?: number; search?: string }) {
    const where = this.buildMasterRadarCardExclusionWhere(query);
    if (!where) {
      return { items: [], summary: { total: 0, discarded: 0, complaint: 0 } };
    }

    const hasState = await this.prisma.hasTable('RadarLeadCompanyState').catch(() => false);
    const hasPool = await this.prisma.hasTable('RadarLeadPool').catch(() => false);
    if (!hasState || !hasPool || !(this.prisma as any).radarLeadCompanyState?.findMany) {
      return { items: [], summary: { total: 0, discarded: 0, complaint: 0 } };
    }

    const rows = await (this.prisma as any).radarLeadCompanyState.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { lastActionAt: 'desc' }],
      take: 1000,
      include: {
        company: { select: { id: true, name: true } },
        radarLead: {
          select: {
            id: true,
            name: true,
            phone: true,
            city: true,
            state: true,
            segment: true,
            website: true,
            status: true,
            opportunityScore: true,
            complaintReason: true,
            deniedReason: true,
            rejectionReason: true,
          },
        },
      },
    }).catch(() => []);

    const items = (rows || []).map((row: any) => this.buildMasterRadarCardExclusionPayload(row));
    return {
      items,
      summary: {
        total: items.length,
        discarded: items.filter((item: any) => item.status === 'discarded').length,
        complaint: items.filter((item: any) => item.status === 'complaint').length,
      },
    };
  }

  async listMasterExclusoes(
    masterUserId: number,
    query?: { moduleKey?: string; companyId?: number; search?: string },
  ) {
    await this.assertMasterUser(masterUserId);
    await this.ensureDefaultSystemModules();

    const where: any = {
      permanentlyDeletedAt: null,
    };

    const moduleKey = String(query?.moduleKey || '').trim().toLowerCase();
    if (moduleKey) where.moduleKey = moduleKey;

    const companyId = Number(query?.companyId || 0);
    if (companyId > 0) where.companyId = companyId;

    const search = String(query?.search || '').trim();
    if (search) {
      where.OR = [
        { entityType: { contains: search, mode: 'insensitive' } },
        { entityId: { contains: search, mode: 'insensitive' } },
        { motivo: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [records, modules, radarCards] = await Promise.all([
      this.prisma.deletionRecord.findMany({
        where,
        include: {
          company: { select: { id: true, name: true } },
          deletedBy: { select: { id: true, username: true, email: true } },
        },
        orderBy: { deletedAt: 'desc' },
        take: 1000,
      }),
      this.prisma.systemModule.findMany({
        orderBy: { name: 'asc' },
        select: { key: true, name: true },
      }),
      this.listMasterRadarCardExclusions(query),
    ]);

    return {
      modules,
      records,
      radarCards: radarCards.items,
      radarSummary: radarCards.summary,
    };
  }

  async restoreRadarCardExclusion(masterUserId: number, stateId: string, motivo?: string) {
    await this.assertMasterUser(masterUserId);
    const id = String(stateId || '').trim();
    if (!id) throw new BadRequestException('Card removido nao informado.');

    const hasState = await this.prisma.hasTable('RadarLeadCompanyState').catch(() => false);
    const hasEvent = await this.prisma.hasTable('RadarLeadEvent').catch(() => false);
    if (!hasState || !(this.prisma as any).radarLeadCompanyState?.findUnique) {
      throw new BadRequestException('Controle de cards removidos indisponivel neste ambiente.');
    }

    const row = await (this.prisma as any).radarLeadCompanyState.findUnique({
      where: { id },
      include: { radarLead: { select: { id: true, status: true } } },
    }).catch(() => null);
    if (!row) throw new BadRequestException('Card removido nao encontrado.');

    const currentStatus = String(row.status || '').trim().toLowerCase();
    if (!['discarded', 'complaint'].includes(currentStatus)) {
      return { ok: true, id, already: true };
    }

    const now = new Date();
    const note = this.normalizeNullableText(motivo, 800) || 'Remocao cancelada pelo MASTER.';

    await (this.prisma as any).radarLeadCompanyState.update({
      where: { id },
      data: {
        status: 'new',
        vendasLeadId: null,
        lastActionAt: now,
        negativeReason: null,
        complaintReason: null,
        deniedReason: null,
        privateNotes: note,
      },
    });

    if ((this.prisma as any).radarLeadPool?.update && row?.radarLeadId && ['discarded', 'complaint', 'hidden'].includes(String(row?.radarLead?.status || '').toLowerCase())) {
      const remainingBlockedStates = await (this.prisma as any).radarLeadCompanyState.count({
        where: {
          radarLeadId: row.radarLeadId,
          id: { not: id },
          status: { in: ['discarded', 'complaint'] },
        },
      }).catch(() => 1);
      if (!remainingBlockedStates) {
        await (this.prisma as any).radarLeadPool.update({
          where: { id: row.radarLeadId },
          data: {
            status: 'clean',
            complaintReason: null,
            deniedReason: null,
            rejectionReason: null,
            lastSeenAt: now,
          },
        }).catch(() => null);
      }
    }

    if (hasEvent && (this.prisma as any).radarLeadEvent?.create && row?.radarLeadId) {
      await (this.prisma as any).radarLeadEvent.create({
        data: {
          leadId: row.radarLeadId,
          companyId: Number(row.companyId || 0) || null,
          eventType: 'restored',
          note,
          statusFrom: currentStatus,
          statusTo: 'new',
          createdByUserId: masterUserId,
        },
      }).catch(() => null);
    }

    return { ok: true, id };
  }

  async permanentDeleteExclusao(masterUserId: number, deletionId: number, motivo?: string) {
    const { user } = await this.resolveUserContext(masterUserId);
    await this.assertMasterUser(masterUserId);

    const row = await this.prisma.deletionRecord.findUnique({ where: { id: deletionId } });
    if (!row) throw new BadRequestException('Registro de exclusao nao encontrado');
    if (row.permanentlyDeletedAt) {
      return { ok: true, id: row.id, already: true };
    }

    const currentSnapshot = row.snapshot ? String(row.snapshot) : '';
    const permanentMeta = {
      permanentBy: String((user as any)?.username || (user as any)?.email || `master_${masterUserId}`),
      permanentAt: new Date().toISOString(),
      motivo: motivo ? String(motivo).trim() : null,
    };

    await this.prisma.deletionRecord.update({
      where: { id: deletionId },
      data: {
        permanentlyDeletedAt: new Date(),
        permanentlyDeletedById: masterUserId,
        snapshot: currentSnapshot ? JSON.stringify({ compacted: true, permanentMeta }) : JSON.stringify({ permanentMeta }),
      },
    });

    return { ok: true, id: deletionId };
  }

  private async cleanupMasterRadarCardExclusions(
    masterUserId: number,
    filters: { moduleKey?: string; companyId?: number; search?: string },
  ) {
    const empty = {
      radarCards: 0,
      radarEvents: 0,
      searchHistoryPlaces: 0,
      searchRunItems: 0,
      emptySearchHistories: 0,
      emptySearchRuns: 0,
    };
    const where = this.buildMasterRadarCardExclusionWhere(filters);
    if (!where) return empty;

    const [hasState, hasPool] = await Promise.all([
      this.prisma.hasTable('RadarLeadCompanyState').catch(() => false),
      this.prisma.hasTable('RadarLeadPool').catch(() => false),
    ]);
    if (!hasState || !hasPool || !(this.prisma as any).radarLeadCompanyState?.findMany) return empty;

    const rows = await (this.prisma as any).radarLeadCompanyState.findMany({
      where,
      take: 5000,
      include: {
        radarLead: {
          select: {
            id: true,
            placeId: true,
            phone: true,
            phoneDigits: true,
          },
        },
      },
    }).catch(() => []);
    if (!rows.length) return empty;

    const stateIds: string[] = Array.from(new Set(rows.map((row: any) => String(row.id || '')).filter(Boolean) as string[]));
    const leadIds: string[] = Array.from(new Set(rows.map((row: any) => String(row.radarLeadId || row.radarLead?.id || '')).filter(Boolean) as string[]));
    const companyIds: number[] = Array.from(new Set(rows.map((row: any) => Number(row.companyId || 0)).filter((id: number) => id > 0) as number[]));
    const placeIds: string[] = Array.from(new Set(rows.map((row: any) => String(row.radarLead?.placeId || '').trim()).filter(Boolean) as string[]));
    const phoneDigits: string[] = Array.from(new Set(
      rows
        .flatMap((row: any) => {
          const digits = this.normalizeRadarPhoneDigits(row.radarLead?.phoneDigits || row.radarLead?.phone);
          if (!digits) return [];
          return digits.startsWith('55') ? [digits, digits.slice(2)] : [digits, `55${digits}`];
        })
        .filter(Boolean) as string[],
    ));
    const cardIdentityOr = [
      ...(phoneDigits.length ? [{ phoneDigits: { in: phoneDigits } }] : []),
      ...(placeIds.length ? [{ placeId: { in: placeIds } }] : []),
    ];
    const companyFilter = companyIds.length ? { companyId: { in: companyIds } } : {};

    let searchHistoryPlaces = 0;
    if (cardIdentityOr.length && (this.prisma as any).webscrapingSearchPlace?.deleteMany) {
      const result = await (this.prisma as any).webscrapingSearchPlace.deleteMany({
        where: { OR: cardIdentityOr },
      }).catch(() => ({ count: 0 }));
      searchHistoryPlaces = Number(result?.count || 0);
    }

    let searchRunItems = 0;
    if (cardIdentityOr.length && (this.prisma as any).webscrapingSearchRunItem?.deleteMany) {
      const result = await (this.prisma as any).webscrapingSearchRunItem.deleteMany({
        where: { ...companyFilter, OR: cardIdentityOr },
      }).catch(() => ({ count: 0 }));
      searchRunItems = Number(result?.count || 0);
    }

    let emptySearchHistories = 0;
    if ((this.prisma as any).webscrapingSearchHistory?.deleteMany && companyIds.length) {
      const result = await (this.prisma as any).webscrapingSearchHistory.deleteMany({
        where: { companyId: { in: companyIds }, places: { none: {} } },
      }).catch(() => ({ count: 0 }));
      emptySearchHistories = Number(result?.count || 0);
    }

    let emptySearchRuns = 0;
    if ((this.prisma as any).webscrapingSearchRun?.deleteMany && companyIds.length) {
      const result = await (this.prisma as any).webscrapingSearchRun.deleteMany({
        where: { companyId: { in: companyIds }, items: { none: {} } },
      }).catch(() => ({ count: 0 }));
      emptySearchRuns = Number(result?.count || 0);
    }

    let radarEvents = 0;
    if (leadIds.length && (await this.prisma.hasTable('RadarLeadEvent').catch(() => false)) && (this.prisma as any).radarLeadEvent?.deleteMany) {
      const result = await (this.prisma as any).radarLeadEvent.deleteMany({
        where: { leadId: { in: leadIds }, ...(companyIds.length ? { companyId: { in: companyIds } } : {}) },
      }).catch(() => ({ count: 0 }));
      radarEvents = Number(result?.count || 0);
    }

    const deletedStates = await (this.prisma as any).radarLeadCompanyState.deleteMany({
      where: { id: { in: stateIds } },
    }).catch(() => ({ count: 0 }));

    if (leadIds.length && (this.prisma as any).radarLeadPool?.updateMany) {
      const remainingRows = await (this.prisma as any).radarLeadCompanyState.findMany({
        where: { radarLeadId: { in: leadIds }, status: { in: ['discarded', 'complaint'] } },
        select: { radarLeadId: true },
        distinct: ['radarLeadId'],
      }).catch(() => []);
      const stillBlocked = new Set((remainingRows || []).map((row: any) => String(row.radarLeadId || '')).filter(Boolean));
      const releasableLeadIds = leadIds.filter((id) => !stillBlocked.has(id));
      if (releasableLeadIds.length) {
        await (this.prisma as any).radarLeadPool.updateMany({
          where: { id: { in: releasableLeadIds }, status: { in: ['discarded', 'complaint', 'hidden', 'rejected', 'denied'] } },
          data: {
            status: 'clean',
            complaintReason: null,
            deniedReason: null,
            rejectionReason: null,
            lastSeenAt: new Date(),
          },
        }).catch(() => null);
      }
    }

    await this.masterContextService.registerSupportAction({
      masterUserId,
      companyId: companyIds.length === 1 ? companyIds[0] : null,
      scope: 'master_exclusoes',
      action: 'RADAR_CARD_EXCLUSIONS_MASS_REMOVED',
      severity: 'WARN',
      metadata: {
        filters,
        stateIdsCount: stateIds.length,
        leadIdsCount: leadIds.length,
        radarCards: Number(deletedStates?.count || 0),
        radarEvents,
        searchHistoryPlaces,
        searchRunItems,
        emptySearchHistories,
        emptySearchRuns,
      },
    }).catch(() => null);

    return {
      radarCards: Number(deletedStates?.count || 0),
      radarEvents,
      searchHistoryPlaces,
      searchRunItems,
      emptySearchHistories,
      emptySearchRuns,
    };
  }

  async permanentDeleteExclusoesBatch(
    masterUserId: number,
    filters: { moduleKey?: string; companyId?: number; motivo?: string; search?: string },
  ) {
    const { user } = await this.resolveUserContext(masterUserId);
    await this.assertMasterUser(masterUserId);

    const where: any = { permanentlyDeletedAt: null };
    const moduleKey = String(filters?.moduleKey || '').trim().toLowerCase();
    if (moduleKey) where.moduleKey = moduleKey;

    const companyId = Number(filters?.companyId || 0);
    if (companyId > 0) where.companyId = companyId;

    const search = String(filters?.search || '').trim();
    if (search) {
      where.OR = [
        { entityType: { contains: search, mode: 'insensitive' } },
        { entityId: { contains: search, mode: 'insensitive' } },
        { motivo: { contains: search, mode: 'insensitive' } },
      ];
    }

    const rows = await this.prisma.deletionRecord.findMany({
      where,
      select: { id: true, snapshot: true },
      take: 5000,
    });

    const radarCleanup = await this.cleanupMasterRadarCardExclusions(masterUserId, filters);

    if (!rows.length) return { ok: true, affected: 0, ...radarCleanup };

    const permanentBy = String((user as any)?.username || (user as any)?.email || `master_${masterUserId}`);
    const nowIso = new Date().toISOString();

    await this.prisma.$transaction(
      rows.map((row) => {
        const currentSnapshot = row.snapshot ? String(row.snapshot) : '';
        return this.prisma.deletionRecord.update({
          where: { id: row.id },
          data: {
            permanentlyDeletedAt: new Date(),
            permanentlyDeletedById: masterUserId,
            snapshot: currentSnapshot
              ? JSON.stringify({ compacted: true, permanentMeta: { permanentBy, permanentAt: nowIso, motivo: filters?.motivo || null, batch: true } })
              : JSON.stringify({ permanentMeta: { permanentBy, permanentAt: nowIso, motivo: filters?.motivo || null, batch: true } }),
          },
        });
      }),
    );

    return { ok: true, affected: rows.length, ...radarCleanup };
  }
}
