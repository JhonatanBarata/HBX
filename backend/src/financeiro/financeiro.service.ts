import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ensureMasterBillingRuntimeSchema } from '../modules/master-runtime';
import {
  getMasterGlobalIntegrationConfig,
  pickMasterMercadoPagoCredential,
  resolveCompanyMercadoPagoAccess,
} from '../modules/master-global-integrations.util';
import { MercadoPagoClientService } from '../payments/mercado-pago-client.service';
import {
  COMMERCIAL_ENTITLEMENT_KEYS,
  COMMERCIAL_PLAN_ENTITLEMENT_KEYS,
  COMMERCIAL_PLAN_MODULE_KEYS,
  COMMERCIAL_PLAN_KEYS,
  COMMERCIAL_PRICING,
  classifyPlanChange,
  computeCommercialPlanCycleAmount,
  getCommercialAnnualDiscountPercent,
  getCommercialPlanExtraUserMonthlyPrice,
  getCommercialPlanMonthlyPrice,
  getCommercialPlanTitle,
  getCommercialPlanTrialDays,
  isCommercialEntitlementActive,
  isCommercialPlanPaused,
  normalizeCommercialPlanKey as normalizeCatalogCommercialPlanKey,
  type ActiveCommercialPlanKey,
} from '../commercial-plans/commercial-plan-catalog';
import {
  computePlanProration,
  remainingDays as prorationRemainingDays,
} from '../commercial-plans/plan-proration.util';
import {
  canBillExtraSeatsForPlan,
  computeCompanySeatBillingSnapshot,
  computeImmediateExtraSeatCharge,
} from '../commercial-plans/seat-billing.util';
import { reserveTrialUsageTx } from '../commercial-plans/trial-usage';
import { resolveCompanyAccessState } from '../modules/company-access-state';
import { MailService } from '../mail/mail.service';
import { HbxCommissionSyncService } from '../commissions/hbx-commission-sync.service';

const BILLING_GRACE_WINDOW_MS = 48 * 60 * 60 * 1000;
const BILLING_GRACE_SECOND_NOTICE_MS = 24 * 60 * 60 * 1000;
const BILLING_GRACE_SWEEP_MS = 15 * 60 * 1000;
const TRIAL_NOTICE_WINDOW_MS = 72 * 60 * 60 * 1000;

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

type PaymentContactProfile = {
  contactName: string;
  contactPhone: string;
  taxDocument: string;
  acceptedTerms: true;
};

@Injectable()
export class FinanceiroService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FinanceiroService.name);
  private billingGraceSweepHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mercadoPagoClient: MercadoPagoClientService,
    private readonly mailService: MailService,
    private readonly hbxCommissionSync: HbxCommissionSyncService,
  ) {}

  onModuleInit() {
    this.billingGraceSweepHandle = setInterval(() => {
      void this.processBillingGracePeriods('interval');
      void this.processTrialNoticeEmails('interval');
    }, BILLING_GRACE_SWEEP_MS);

    setTimeout(() => {
      void this.processBillingGracePeriods('startup');
      void this.processTrialNoticeEmails('startup');
    }, 5000);
  }

  onModuleDestroy() {
    if (this.billingGraceSweepHandle) clearInterval(this.billingGraceSweepHandle);
    this.billingGraceSweepHandle = null;
  }

  private normalizeCurrencyAmount(value: unknown) {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric)) return 0;
    return Number(numeric.toFixed(2));
  }

  private normalizeOptionalString(value: unknown) {
    const normalized = String(value || '').trim();
    return normalized || null;
  }

  private normalizePaymentMethod(value: unknown) {
    const normalized = String(value || '').trim().toUpperCase();
    if (['CARD', 'PIX', 'BOLETO', 'MANUAL', 'NONE', 'BONUS'].includes(normalized)) return normalized;
    return 'NONE';
  }

  private normalizeBillingCycle(value: unknown) {
    const normalized = String(value || '').trim().toUpperCase();
    return normalized === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY';
  }

  private normalizeContactPhone(value: unknown) {
    const digits = String(value || '').replace(/\D/g, '');
    const normalized = digits.startsWith('55') && digits.length > 11 ? digits.slice(2, 13) : digits.slice(0, 11);
    if (normalized.length < 10 || normalized.length > 11) return null;
    return normalized;
  }

  private normalizeContactName(value: unknown) {
    const normalized = String(value || '').trim().replace(/\s+/g, ' ');
    return normalized || null;
  }

  private hasRepeatedDigits(value: string) {
    return /^(\d)\1+$/.test(value);
  }

  private isValidCpf(value: string) {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length !== 11 || this.hasRepeatedDigits(digits)) return false;
    const calculate = (length: number) => {
      let sum = 0;
      for (let index = 0; index < length; index += 1) {
        sum += Number(digits[index]) * (length + 1 - index);
      }
      const mod = (sum * 10) % 11;
      return mod === 10 ? 0 : mod;
    };
    return calculate(9) === Number(digits[9]) && calculate(10) === Number(digits[10]);
  }

  private isValidCnpj(value: string) {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length !== 14 || this.hasRepeatedDigits(digits)) return false;
    const calculate = (weights: number[]) => {
      const sum = weights.reduce((total, weight, index) => total + Number(digits[index]) * weight, 0);
      const mod = sum % 11;
      return mod < 2 ? 0 : 11 - mod;
    };
    return (
      calculate([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(digits[12]) &&
      calculate([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(digits[13])
    );
  }

  private normalizeTaxDocument(value: unknown) {
    const digits = String(value || '').replace(/\D/g, '').slice(0, 14);
    if (digits.length === 11 && this.isValidCpf(digits)) return digits;
    if (digits.length === 14 && this.isValidCnpj(digits)) return digits;
    return null;
  }

  private normalizePaymentContactProfile(dto: {
    contactName?: string | null;
    contactPhone?: string | null;
    taxDocument?: string | null;
    acceptedTerms?: boolean | null;
  }, fallback?: {
    contactName?: string | null;
    contactPhone?: string | null;
    taxDocument?: string | null;
    allowExistingWithoutTerms?: boolean;
  }): PaymentContactProfile {
    const contactName = this.normalizeContactName(dto?.contactName) || this.normalizeContactName(fallback?.contactName);
    const contactPhone = this.normalizeContactPhone(dto?.contactPhone) || this.normalizeContactPhone(fallback?.contactPhone);
    const taxDocument = this.normalizeTaxDocument(dto?.taxDocument) || this.normalizeTaxDocument(fallback?.taxDocument);
    const canUseExistingProfile = Boolean(
      fallback?.allowExistingWithoutTerms &&
      dto?.acceptedTerms === undefined &&
      contactName &&
      contactPhone &&
      taxDocument,
    );
    if (!contactName || contactName.length < 3) {
      throw new BadRequestException('Informe o nome completo do responsável pelo pagamento.');
    }
    if (!contactPhone) {
      throw new BadRequestException('Informe um telefone de contato válido.');
    }
    if (!taxDocument) {
      throw new BadRequestException('Informe um CPF/CNPJ válido para o pagamento.');
    }
    if (dto?.acceptedTerms !== true && !canUseExistingProfile) {
      throw new BadRequestException('Confirme a autorização de uso dos dados de pagamento.');
    }
    return { contactName, contactPhone, taxDocument, acceptedTerms: true };
  }

  private hasPaymentContactProfileInput(dto: {
    contactName?: string | null;
    contactPhone?: string | null;
    taxDocument?: string | null;
    acceptedTerms?: boolean | null;
  }) {
    return Boolean(
      this.normalizeContactName(dto?.contactName) ||
      this.normalizeContactPhone(dto?.contactPhone) ||
      String(dto?.taxDocument || '').trim() ||
      dto?.acceptedTerms !== undefined,
    );
  }

  private resolvePaymentContactProfile(dto: {
    contactName?: string | null;
    contactPhone?: string | null;
    taxDocument?: string | null;
    acceptedTerms?: boolean | null;
  }, fallback?: {
    contactName?: string | null;
    contactPhone?: string | null;
    taxDocument?: string | null;
    allowExistingWithoutTerms?: boolean;
  }) {
    try {
      return this.normalizePaymentContactProfile(dto, fallback);
    } catch (error) {
      if (!this.hasPaymentContactProfileInput(dto) && fallback?.allowExistingWithoutTerms) return null;
      throw error;
    }
  }

  private companyContactUpdateFromPaymentProfile(profile: PaymentContactProfile) {
    return {
      primaryContactName: profile.contactName,
      contactPhone: profile.contactPhone,
      taxDocument: profile.taxDocument,
    };
  }

  private normalizePayerEmail(value: unknown) {
    const normalized = String(value || '').trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
  }

  private normalizeCardToken(value: unknown) {
    const normalized = String(value || '').trim();
    if (!normalized || normalized.length < 8 || normalized.length > 200) return null;
    return normalized;
  }

  private normalizeProviderSubscriptionStatus(value: unknown) {
    const normalized = String(value || '').trim().toLowerCase();
    if (['authorized', 'active'].includes(normalized)) return 'authorized';
    if (['paused'].includes(normalized)) return 'paused';
    if (['cancelled', 'canceled'].includes(normalized)) return 'canceled';
    if (['rejected', 'failed'].includes(normalized)) return 'past_due';
    if (['pending'].includes(normalized)) return 'pending';
    return normalized || 'pending';
  }

  private normalizeProviderPaymentStatus(value: unknown) {
    const normalized = String(value || '').trim().toLowerCase();
    if (['approved', 'accredited'].includes(normalized)) return 'approved';
    if (normalized === 'refunded') return 'refunded';
    if (normalized === 'partially_refunded') return 'partially_refunded';
    if (['rejected', 'failed'].includes(normalized)) return 'failed';
    if (['cancelled', 'canceled'].includes(normalized)) return 'cancelled';
    return 'pending';
  }

  private normalizeLifecycle(status: string) {
    if (['approved', 'refunded', 'partially_refunded'].includes(status)) return 'paid';
    if (['failed', 'cancelled'].includes(status)) return 'cancelled';
    return 'in_progress';
  }

  private parseDate(value: unknown) {
    if (!value) return null;
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private json(value: unknown) {
    try {
      return JSON.stringify(value ?? null);
    } catch {
      return JSON.stringify({ error: 'json_serialize_failed' });
    }
  }

  private sanitizeProviderPayload(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => this.sanitizeProviderPayload(item));
    if (!value || typeof value !== 'object') return value;

    const blockedKeys = new Set([
      'card_token_id',
      'cardtokenid',
      'card_token',
      'cardtoken',
      'token',
      'security_code',
      'securitycode',
      'cvv',
      'card_number',
      'cardnumber',
      'first_six_digits',
      'firstsixdigits',
    ]);

    const sanitized: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      const normalizedKey = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
      if (blockedKeys.has(normalizedKey) || blockedKeys.has(key.toLowerCase())) continue;
      sanitized[key] = this.sanitizeProviderPayload(nestedValue);
    }
    return sanitized;
  }

  private providerJson(value: unknown) {
    return this.json(this.sanitizeProviderPayload(value));
  }

  private paymentsProvider() {
    return String(process.env.PAYMENTS_PROVIDER || 'mercadopago').trim().toLowerCase();
  }

  private isMockPaymentsProvider() {
    return this.paymentsProvider() === 'mock' && String(process.env.NODE_ENV || '').trim() === 'development';
  }

  private subscriptionProviderWhere() {
    return this.isMockPaymentsProvider() ? { in: ['mercadopago', 'mock'] } : 'mercadopago';
  }

  private monthKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  private addDays(date: Date, days: number) {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  }

  private billingGraceEndsFrom(start: Date) {
    return new Date(start.getTime() + BILLING_GRACE_WINDOW_MS);
  }

  private parseBillingGraceDate(value: unknown) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    return this.parseDate(value);
  }

  private billingGraceRemainingMs(company: any, now = new Date()) {
    const endsAt = this.parseBillingGraceDate(company?.billingGraceEndsAt);
    if (!endsAt) return 0;
    return Math.max(0, endsAt.getTime() - now.getTime());
  }

  private isBillingGraceActive(company: any, now = new Date()) {
    return this.billingGraceRemainingMs(company, now) > 0;
  }

  private billingGraceClearData() {
    return {
      billingGraceStartedAt: null,
      billingGraceEndsAt: null,
      billingGraceReason: null,
      billingGraceEmailStage: 0,
      billingGraceLastEmailAt: null,
      billingGraceLastFailureAt: null,
    };
  }

  private isBillingGraceEmailSuppressed(reason: unknown) {
    const normalized = String(reason || '').trim().toLowerCase();
    return normalized === 'initial_access' || normalized === 'provider_pending';
  }

  private supportEmail() {
    return String(process.env.ADMIN_SUPPORT_EMAIL || 'jbinformatica1100@gmail.com').trim();
  }

  private supportPhone() {
    return String(process.env.ADMIN_SUPPORT_PHONE || '++5519997024884').trim();
  }

  private supportWhatsAppUrl() {
    const digits = this.supportPhone().replace(/\D/g, '');
    return digits ? `https://wa.me/${digits}` : null;
  }

  private escapeHtml(value: unknown) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private formatDateTimePtBr(date: Date) {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(date);
  }

  private billingGraceEmailRecipient(company: any, subscription?: any | null) {
    const candidates = [
      subscription?.payerEmail,
      company?.contactEmail,
      ...(Array.isArray(company?.users)
        ? company.users
            .filter((user: any) => user?.isActive !== false)
            .sort((left: any, right: any) => {
              // USERMASTER (dono) tambem e destinatario preferencial do e-mail de cobranca, igual a ADMIN.
              const isAdminRole = (u: any) => {
                const r = String(u?.role || '').trim().toUpperCase();
                return r === 'ADMIN' || r === 'USERMASTER';
              };
              const leftAdmin = isAdminRole(left) ? 0 : 1;
              const rightAdmin = isAdminRole(right) ? 0 : 1;
              return leftAdmin - rightAdmin;
            })
            .map((user: any) => user?.email)
        : []),
    ];
    for (const candidate of candidates) {
      const email = this.normalizePayerEmail(candidate);
      if (email) return email;
    }
    return null;
  }

  private paymentAuthorizationFailureText(value: unknown) {
    if (!value) return '';
    const error = value as any;
    const raw = [
      error?.message,
      error?.response?.data?.message,
      error?.response?.data?.error_description,
      error?.response?.data?.error,
      error?.response?.data?.cause?.[0]?.description,
      error?.response?.data?.cause?.[0]?.code,
    ]
      .filter(Boolean)
      .join(' ');
    return raw || String(value || '');
  }

  private isPaymentAuthorizationFailure(value: unknown) {
    const text = this.paymentAuthorizationFailureText(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    return /recus|rejeit|reject|declin|denied|unauthori|unauthoriz|nao autoriz|not authorized|cc_rejected|card|cartao/.test(text);
  }

  private buildAppUrl() {
    return String(process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:3001').replace(/\/$/, '');
  }

  private publicApiBaseUrl() {
    const explicit = process.env.PUBLIC_API_BASE_URL || process.env.API_PUBLIC_URL || process.env.BACKEND_PUBLIC_URL || '';
    if (String(explicit).trim()) return String(explicit).trim().replace(/\/+$/, '');
    return `http://localhost:${Number(process.env.APP_PORT || 3000)}`;
  }

  private buildCheckoutReturnUrl(chargeId: string) {
    return `${this.buildAppUrl()}/dashboard/financeiro?charge=${encodeURIComponent(chargeId)}`;
  }

  private buildNotificationUrl(companyId: number) {
    return `${this.publicApiBaseUrl()}/webhooks/mercadopago/financeiro?company_id=${companyId}`;
  }

  private isCommercialEntitlementUsable(row: any) {
    const status = String(row?.status || '').trim().toLowerCase();
    if (!isCommercialEntitlementActive(status)) return false;
    if (status === 'trialing' && row?.currentPeriodEnd instanceof Date) {
      return row.currentPeriodEnd.getTime() >= Date.now();
    }
    return true;
  }

  private resolveCommercialMonthlyValue(company: any) {
    const selectedPlanKey = normalizeCatalogCommercialPlanKey(company?.selectedPlanKey);
    const entitlements = Array.isArray(company?.commercialEntitlements)
      ? company.commercialEntitlements
      : [];
    const findEntitlement = (key: string) =>
      entitlements.find((row: any) => String(row?.key || '').trim().toLowerCase() === key && this.isCommercialEntitlementUsable(row));
    const vendas = findEntitlement(COMMERCIAL_ENTITLEMENT_KEYS.VENDAS);
    const hasCommercialState = Boolean(company?.selectedPlanKey || vendas);
    if (!hasCommercialState) return null;

    const planKey = selectedPlanKey;
    const title = getCommercialPlanTitle(planKey);
    return {
      planKey,
      title,
      monthlyValue: getCommercialPlanMonthlyPrice(planKey),
      referenceLabel: title,
      chargeDescription: title,
    };
  }

  private resolveChargeDescription(company: any, pricing: any) {
    const commercialDescription = this.normalizeOptionalString(pricing?.commercialPlan?.chargeDescription);
    if (commercialDescription) return commercialDescription;
    return `HBX ${pricing.billingCycle === 'ANNUAL' ? 'anual' : 'mensal'} - ${company?.name || 'empresa'}`;
  }

  private resolveChargeReferenceLabel(company: any, pricing: any) {
    return (
      this.normalizeOptionalString(pricing?.commercialPlan?.referenceLabel) ||
      'HBX Financeiro'
    );
  }

  private normalizeCommercialPlanKey(value: unknown): ActiveCommercialPlanKey {
    return normalizeCatalogCommercialPlanKey(value);
  }

  private buildCommercialPlanProviderSnapshot(planKeyRaw: unknown, billingCycleRaw: unknown) {
    const planKey = this.normalizeCommercialPlanKey(planKeyRaw);
    const billingCycle = this.normalizeBillingCycle(billingCycleRaw);
    const amount = computeCommercialPlanCycleAmount(planKey, billingCycle);
    const monthlyValue = getCommercialPlanMonthlyPrice(planKey);
    const title = getCommercialPlanTitle(planKey);
    return {
      planKey,
      billingCycle,
      amount,
      currency: 'BRL',
      monthlyValue,
      title,
      reason: 'HBX System',
      frequency: billingCycle === 'ANNUAL' ? 12 : 1,
      frequencyType: 'months' as const,
      trialDays: getCommercialPlanTrialDays(planKey),
    };
  }

  private buildSubscriptionBackUrl() {
    return `${this.buildAppUrl()}/dashboard/financeiro?focus=payment`;
  }

  private async syncPaidPlanModulesTx(tx: any, companyId: number, planKey: string) {
    const moduleKeys = COMMERCIAL_PLAN_MODULE_KEYS[this.normalizeCommercialPlanKey(planKey)] || [];
    const moduleRows = moduleKeys.length
      ? await tx.systemModule.findMany({
          where: {
            companyAssignable: true,
            key: { in: moduleKeys },
          },
          select: { id: true },
        })
      : [];

    await tx.companyModule.updateMany({ where: { companyId }, data: { enabled: false } });
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
  }

  private async upsertPaidEntitlementTx(
    tx: any,
    companyId: number,
    key: string,
    paidAt: Date,
    periodEnd: Date,
    metadata: Record<string, unknown>,
  ) {
    await tx.companyCommercialEntitlement.upsert({
      where: {
        companyId_key: {
          companyId,
          key,
        },
      },
      update: {
        status: 'paid',
        source: 'checkout',
        currentPeriodStart: paidAt,
        currentPeriodEnd: periodEnd,
        metadataJson: JSON.stringify(metadata),
      },
      create: {
        companyId,
        key,
        status: 'paid',
        source: 'checkout',
        currentPeriodStart: paidAt,
        currentPeriodEnd: periodEnd,
        metadataJson: JSON.stringify(metadata),
      },
    });
  }

  private async syncPaidCommercialEntitlementsTx(tx: any, companyId: number, planKey: string, paidAt: Date, periodEnd: Date) {
    const normalizedPlanKey = this.normalizeCommercialPlanKey(planKey);
    const metadata = {
      selectedPlanKey: normalizedPlanKey,
      paidAt: paidAt.toISOString(),
      activatedBy: 'financeiro_checkout',
    };
    const activeKeys = new Set(COMMERCIAL_PLAN_ENTITLEMENT_KEYS[normalizedPlanKey] || []);
    const allKeys = [
      COMMERCIAL_ENTITLEMENT_KEYS.VENDAS,
      COMMERCIAL_ENTITLEMENT_KEYS.ATENDIMENTO_CHAT,
      COMMERCIAL_ENTITLEMENT_KEYS.WEBSCRAPING,
    ];

    for (const key of allKeys) {
      if (activeKeys.has(key)) {
        await this.upsertPaidEntitlementTx(tx, companyId, key, paidAt, periodEnd, metadata);
      } else {
        await tx.companyCommercialEntitlement.updateMany({
          where: { companyId, key },
          data: { status: 'canceled', source: 'checkout', currentPeriodStart: null, currentPeriodEnd: null },
        });
      }
    }
  }

  private async buildSeatBillingSnapshot(company: any, billingCycle: string, _pricingPolicy?: any) {
    const planKey = normalizeCatalogCommercialPlanKey(company?.selectedPlanKey);
    return computeCompanySeatBillingSnapshot(this.prisma, {
      companyId: Number(company?.id || 0),
      planKey,
      // Fonte ÚNICA do valor do assento extra: o catálogo por-plano (overlay do
      // Self-Checkout), não mais a policy global.
      extraSeatMonthlyAmount: getCommercialPlanExtraUserMonthlyPrice(planKey),
    });
  }

  private resolveUserContext(user: any) {
    const companyId = Number(user?.masterContext?.active ? user?.masterContext?.companyId : user?.companyId || 0);
    const userId = Number(user?.id || 0);
    if (!companyId) throw new ForbiddenException('Empresa nao identificada.');
    if (!userId) throw new ForbiddenException('Usuario nao identificado.');
    const role = String(user?.role || '').trim().toUpperCase();
    // Régua única (PR13062026007 P3): vínculo HBX×contratante (assinatura/plano)
    // só Dono e Master. Gerente = ADMIN com canViewBilling=false → barrado nos 12
    // pontos de cobrança via assertCanManageBilling.
    // USERMASTER (dono do tenant) gerencia cobranca, igual ao ADMIN-dono com billing.
    const canManageBilling = Boolean(user?.isSystemMaster) || ((role === 'ADMIN' || role === 'USERMASTER') && user?.canViewBilling !== false);
    return { companyId, userId, role, canManageBilling };
  }

  private assertCanManageBilling(context: { canManageBilling: boolean }) {
    if (context.canManageBilling) return;
    throw new ForbiddenException({
      code: 'USER_PLAN_UPGRADE_NOT_ALLOWED',
      message: 'Seu usuário não pode alterar cobrança. Contate seu ADMIN ou o suporte da empresa.',
    });
  }

  private maskPricingForUser(pricing: any) {
    return {
      ...pricing,
      monthlyValue: 0,
      annualDiscountValue: 0,
      manualDiscountValue: 0,
      referralDiscountValue: 0,
      basePlanCycleAmount: 0,
      extraSeatMonthlyAmount: 0,
      extraSeatCycleAmount: 0,
      extraSeatFullMonthAmount: 0,
      extraSeatBillableDays: 0,
      extraSeatAverageUsers: 0,
      baseCycleAmount: 0,
      finalCycleAmount: 0,
      commercialPlan: pricing?.commercialPlan
        ? {
            ...pricing.commercialPlan,
            monthlyValue: 0,
          }
        : null,
    };
  }

  private computeTrialRemainingDays(trialEndsAt?: Date | null) {
    if (!(trialEndsAt instanceof Date)) return null;
    const diff = trialEndsAt.getTime() - Date.now();
    if (diff <= 0) return 0;
    return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
  }

  private computePeriodEnd(start: Date, billingCycle: string) {
    return this.addDays(start, billingCycle === 'ANNUAL' ? 365 : 30);
  }

  private buildReferralSnapshot(company: any, referralPolicy?: any) {
    const acquisitionSource = String(company?.acquisitionSource || '').trim().toLowerCase();
    const referrerName = this.normalizeOptionalString(company?.referralReferrerName);
    const referralCode = this.normalizeOptionalString(company?.referralCode);
    const isReferral = acquisitionSource === 'indicacao' && Boolean(referrerName || referralCode);
    const referralDiscountActive = Boolean(referralPolicy?.referralDiscountActive);
    const referralDiscountPercent = Math.max(
      0,
      this.normalizeCurrencyAmount(referralPolicy?.referralDiscountPercent || 0),
    );
    const referralDiscountMode =
      String(referralPolicy?.referralDiscountMode || '').trim().toUpperCase() === 'RECURRING'
        ? 'RECURRING'
        : 'ONCE';
    const referralDiscountConsumedAt =
      company?.referralDiscountConsumedAt instanceof Date
        ? company.referralDiscountConsumedAt.toISOString()
        : null;
    const referralDiscountEligible = isReferral && referralDiscountActive && referralDiscountPercent > 0;
    const referralDiscountAppliesNow =
      referralDiscountEligible &&
      (referralDiscountMode === 'RECURRING' || !referralDiscountConsumedAt);

    return {
      acquisitionSource: acquisitionSource || null,
      acquisitionSourceDetail: this.normalizeOptionalString(company?.acquisitionSourceDetail),
      isReferral,
      referrerName,
      referralCode,
      referralDiscountActive,
      referralDiscountPercent,
      referralDiscountMode,
      referralDiscountEligible,
      referralDiscountAppliesNow,
      referralDiscountConsumedAt,
    };
  }

  private extractPaymentId(query: Record<string, any>, body: any): string | null {
    const candidate = query?.['data.id'] || body?.data?.id || body?.id || query?.id;
    if (candidate !== undefined && candidate !== null && String(candidate).trim()) return String(candidate).trim();
    const resource = body?.resource || query?.resource;
    if (typeof resource === 'string') {
      const match = resource.match(/payments\/(\d+)/i);
      if (match?.[1]) return match[1];
    }
    return null;
  }

  private webhookTopic(query: Record<string, any>, body: any) {
    return String(query?.type || query?.topic || body?.type || body?.topic || body?.action || '').trim().toLowerCase();
  }

  private extractPreapprovalId(query: Record<string, any>, body: any): string | null {
    const topic = this.webhookTopic(query, body);
    const candidate = query?.['data.id'] || body?.data?.id || body?.id || query?.id;
    if (candidate && /preapproval|subscription/.test(topic)) return String(candidate).trim();
    const resource = body?.resource || query?.resource;
    if (typeof resource === 'string') {
      const match = resource.match(/preapproval\/([^/?#]+)/i);
      if (match?.[1]) return decodeURIComponent(match[1]);
    }
    return null;
  }

  private parseSubscriptionExternalReference(value: unknown) {
    const externalReference = String(value || '').trim();
    const match = externalReference.match(/^hbx-sub-(\d+)-([^/]+)$/i);
    if (!match) return null;
    return {
      companyId: Number(match[1] || 0) || null,
      subscriptionId: match[2] || null,
    };
  }

  private subscriptionCardSnapshot(provider: any, fallback?: any) {
    const card = provider?.card || provider?.payment_method || {};
    const paymentMethod = card?.payment_method || card || {};
    const brand = this.normalizeOptionalString(paymentMethod?.name || paymentMethod?.id || provider?.payment_method_id || fallback?.cardBrand);
    const last4 = String(card?.last_four_digits || provider?.card_last_four_digits || fallback?.cardLast4 || '')
      .replace(/\D/g, '')
      .slice(-4) || null;
    return { brand, last4 };
  }

  private inferNextBillingAt(provider: any, start: Date | null, billingCycle: string) {
    const direct =
      this.parseDate(provider?.next_payment_date) ||
      this.parseDate(provider?.auto_recurring?.end_date) ||
      null;
    if (direct) return direct;
    if (start) return this.computePeriodEnd(start, billingCycle);
    return null;
  }

  private serializeSubscription(row: any, canManageBilling = true) {
    if (!row || !canManageBilling) return null;
    return {
      id: String(row.id),
      provider: String(row.provider || 'mercadopago'),
      providerPreapprovalId: row.providerPreapprovalId ? String(row.providerPreapprovalId) : null,
      providerPreapprovalPlanId: row.providerPreapprovalPlanId ? String(row.providerPreapprovalPlanId) : null,
      planKey: String(row.planKey || ''),
      billingCycle: this.normalizeBillingCycle(row.billingCycle),
      status: String(row.status || 'pending'),
      payerEmail: row.payerEmail ? String(row.payerEmail) : null,
      billingContactPhone: row.billingContactPhone ? String(row.billingContactPhone) : null,
      cardBrand: row.cardBrand ? String(row.cardBrand) : null,
      cardLast4: row.cardLast4 ? String(row.cardLast4) : null,
      currentPeriodStart: row.currentPeriodStart instanceof Date ? row.currentPeriodStart.toISOString() : null,
      currentPeriodEnd: row.currentPeriodEnd instanceof Date ? row.currentPeriodEnd.toISOString() : null,
      nextBillingAt: row.nextBillingAt instanceof Date ? row.nextBillingAt.toISOString() : null,
      cancelAtPeriodEnd: Boolean(row.cancelAtPeriodEnd),
      canceledAt: row.canceledAt instanceof Date ? row.canceledAt.toISOString() : null,
      lastProviderStatus: row.lastProviderStatus ? String(row.lastProviderStatus) : null,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : null,
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : null,
    };
  }

  private normalizeLedgerEntry(row: BillingLedgerEntryRow) {
    return {
      id: String(row.id),
      entryType: String(row.entryType || ''),
      entryGroup: String(row.entryGroup || ''),
      status: String(row.status || ''),
      origin: row.origin ? String(row.origin) : null,
      amount: this.normalizeCurrencyAmount(row.amount),
      dueDate: row.dueDate instanceof Date ? row.dueDate.toISOString() : null,
      paidAt: row.paidAt instanceof Date ? row.paidAt.toISOString() : null,
      paymentMethod: row.paymentMethod ? String(row.paymentMethod) : null,
      referenceLabel: row.referenceLabel ? String(row.referenceLabel) : null,
      observation: row.observation ? String(row.observation) : null,
      competence: row.competence ? String(row.competence) : null,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : null,
    };
  }

  private serializeCharge(row: any) {
    if (!row) return null;
    return {
      id: String(row.id),
      amount: this.normalizeCurrencyAmount(row.amount),
      currency: String(row.currency || 'BRL'),
      description: String(row.description || ''),
      billingCycle: this.normalizeBillingCycle(row.billingCycle),
      paymentMethod: this.normalizePaymentMethod(row.paymentMethod),
      status: String(row.status || 'pending'),
      lifecycle: String(row.lifecycle || 'in_progress'),
      competence: row.competence ? String(row.competence) : null,
      externalReference: row.externalReference ? String(row.externalReference) : null,
      paymentUrl: row.paymentUrl ? String(row.paymentUrl) : null,
      pixQrCode: row.pixQrCode ? String(row.pixQrCode) : null,
      pixQrCodeBase64: row.pixQrCodeBase64 ? String(row.pixQrCodeBase64) : null,
      pixTicketUrl: row.pixTicketUrl ? String(row.pixTicketUrl) : null,
      paidAt: row.paidAt instanceof Date ? row.paidAt.toISOString() : null,
      refundedAt: row.refundedAt instanceof Date ? row.refundedAt.toISOString() : null,
      refundAmount: this.normalizeCurrencyAmount(row.refundAmount || 0),
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : null,
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : null,
      lastWebhookAt: row.lastWebhookAt instanceof Date ? row.lastWebhookAt.toISOString() : null,
    };
  }

  private async buildPricing(company: any, pricingPolicy: any, ledgerRows: BillingLedgerEntryRow[]) {
    const commercialPlan = this.resolveCommercialMonthlyValue(company);
    const monthlyValue = commercialPlan?.monthlyValue ?? 0;
    const billingCycle = this.normalizeBillingCycle(company?.billingCycle);
    // Desconto anual: fonte ÚNICA no catálogo (global, editável na Política comercial
    // do Self-Checkout). Não há mais ramo paralelo da policy.
    const annualPlanDiscountPercent = getCommercialAnnualDiscountPercent();
    const manualDiscountPercent = Math.max(0, this.normalizeCurrencyAmount(company?.manualDiscountPercent || 0));
    const referral = this.buildReferralSnapshot(company, pricingPolicy);
    const freeMonths = Math.max(0, Math.trunc(Number(company?.freeMonths || 0) || 0));
    const basePlanCycleAmount =
      billingCycle === 'ANNUAL'
        ? this.normalizeCurrencyAmount(monthlyValue * 12)
        : monthlyValue;
    const seats = await this.buildSeatBillingSnapshot(company, billingCycle, pricingPolicy);
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
    const discountedAmount = Math.max(
      0,
      this.normalizeCurrencyAmount(subtotalAfterManual - referralDiscountValue),
    );
    const finalCycleAmount = freeMonths > 0 ? 0 : discountedAmount;
    const failedStatuses = ['FAILED', 'CANCELLED'];
    const refundStatuses = ['REFUNDED', 'PARTIALLY_REFUNDED'];
    const pendingCount = ledgerRows.filter((row) => String(row.status || '').toUpperCase() === 'PENDING').length;
    const failedCount = ledgerRows.filter((row) => failedStatuses.includes(String(row.status || '').toUpperCase())).length;
    const refundRows = ledgerRows.filter((row) => refundStatuses.includes(String(row.status || '').toUpperCase()));
    const refundCount = refundRows.length;
    const refundAmount = refundRows.reduce((total, row) => total + this.normalizeCurrencyAmount(row.amount), 0);

    return {
      billingCycle,
      monthlyValue,
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
      freeCycleApplied: freeMonths > 0,
      commercialPlan,
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
      extraSeatFullMonthAmount: seats.extraSeatFullMonthAmount,
      extraSeatBillableDays: seats.extraSeatBillableDays,
      extraSeatAverageUsers: seats.extraSeatAverageUsers,
      seatBillingPeriodStart: seats.billingPeriodStart,
      seatBillingPeriodEnd: seats.billingPeriodEnd,
      seatBillingMode: seats.billingMode,
      seatBillingBilledImmediately: seats.billedImmediately,
      baseCycleAmount,
      finalCycleAmount,
      pendingCount,
      failedCount,
      refundCount,
      refundAmount: this.normalizeCurrencyAmount(refundAmount),
      // Saldo de crédito de downgrade (B6) — abate na próxima fatura (honrado pelo master).
      billingCreditBalance: this.normalizeCurrencyAmount(
        Math.max(0, Math.trunc(Number(company?.billingCreditCents || 0))) / 100,
      ),
      cardConfigured: Boolean(company?.billingCardLast4),
      pixAvailable: true,
    };
  }

  private pricingSeatBillingMetadata(pricing: any) {
    return {
      activeUsers: Number(pricing?.activeUsers || 0) || 0,
      includedActiveUsers: Number(pricing?.includedActiveUsers || 0) || 0,
      extraActiveUsers: Number(pricing?.extraActiveUsers || 0) || 0,
      extraSeatMonthlyAmount: this.normalizeCurrencyAmount(pricing?.extraSeatMonthlyAmount || 0),
      extraSeatCycleAmount: this.normalizeCurrencyAmount(pricing?.extraSeatCycleAmount || 0),
      extraSeatBillableDays: Number(pricing?.extraSeatBillableDays || 0) || 0,
      billingPeriodStart: pricing?.seatBillingPeriodStart || null,
      billingPeriodEnd: pricing?.seatBillingPeriodEnd || null,
      billingMode: pricing?.seatBillingMode || null,
      billedImmediately: Boolean(pricing?.seatBillingBilledImmediately),
    };
  }

  private async listLedgerRows(companyId: number, limit = 12) {
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
        WHERE "companyId" = ${Number(companyId)}
        ORDER BY COALESCE("paidAt", "dueDate", "createdAt") DESC, "createdAt" DESC
        LIMIT ${Math.max(1, Math.trunc(limit))}
      `,
    );
    return rows || [];
  }

  private async resolveFinanceContext(companyId: number) {
    await ensureMasterBillingRuntimeSchema(this.prisma);
    const [resolved, company] = await Promise.all([
      resolveCompanyMercadoPagoAccess(this.prisma, companyId),
      this.prisma.company.findUnique({
        where: { id: companyId },
        include: {
          companyModules: {
            include: { systemModule: true },
            orderBy: { systemModule: { name: 'asc' } },
          },
          users: {
            select: { id: true, isActive: true, isSystemMaster: true, deactivatedAt: true },
          },
          commercialEntitlements: true,
        },
      }),
    ]);

    if (!company) throw new BadRequestException('Empresa nao encontrada.');
    const accessToken = String(resolved.accessToken || '').trim();
    if (!accessToken) {
      throw new BadRequestException({
        code: 'MERCADO_PAGO_MASTER_NOT_LINKED',
        message: 'Mercado Pago não está pronto para esta empresa.',
        operationalMessage:
          resolved.source === 'master_missing'
            ? 'Empresa marcada para usar o token MASTER, mas o Mercado Pago global ainda nao foi configurado.'
            : 'Empresa nao vinculada a uma credencial Mercado Pago MASTER.',
      });
    }
    return { company, accessToken };
  }

  private async resolveWebhookMercadoPagoAccessToken() {
    const envToken = String(process.env.MERCADO_PAGO_ACCESS_TOKEN || '').trim();
    if (envToken) return envToken;
    const masterConfig = await getMasterGlobalIntegrationConfig(this.prisma);
    const credential = pickMasterMercadoPagoCredential(masterConfig);
    const accessToken = String(credential?.accessToken || masterConfig?.mercadoPagoAccessToken || '').trim();
    if (!accessToken) {
      throw new BadRequestException('Mercado Pago MASTER nao configurado para consultar webhook sem company_id.');
    }
    return accessToken;
  }

  private async ensureMercadoPagoPreapprovalPlan(
    accessToken: string,
    planKeyRaw: unknown,
    billingCycleRaw: unknown,
  ) {
    const snapshot = this.buildCommercialPlanProviderSnapshot(planKeyRaw, billingCycleRaw);
    const existing = await this.prisma.commercialPlanProviderMapping.findFirst({
      where: {
        planKey: snapshot.planKey,
        billingCycle: snapshot.billingCycle,
        provider: 'mercadopago',
        active: true,
      },
    });
    if (existing?.providerPlanId) {
      // Só reusa o template em cache se o preço/moeda registrados ainda baterem com o
      // catálogo atual. Se o catálogo mudou de preço depois do registro, o template no MP
      // ficou VELHO — e como o createPreapproval manda o preço novo contra esse template,
      // o MP recusa: "transaction_amount must be the same as preapproval_plan". O MP não
      // deixa mutar o valor de um preapproval_plan existente, então re-registramos um novo
      // (catálogo = fonte da verdade); o upsert abaixo troca o providerPlanId + amount.
      const registeredCents = Math.round(Number(existing.amount) * 100);
      const currentCents = Math.round(Number(snapshot.amount) * 100);
      const sameAmount = registeredCents === currentCents;
      const sameCurrency =
        String(existing.currency || 'BRL').toUpperCase() === String(snapshot.currency || 'BRL').toUpperCase();
      if (sameAmount && sameCurrency) return existing;
      this.logger.warn(
        `mp_preapproval_plan_amount_drift plan=${snapshot.planKey} cycle=${snapshot.billingCycle} ` +
          `registered=${existing.amount} current=${snapshot.amount} -> re-registrando template`,
      );
    }

    const providerPlan = await this.mercadoPagoClient.createPreapprovalPlan(
      accessToken,
      {
        reason: snapshot.reason,
        auto_recurring: {
          frequency: snapshot.frequency,
          frequency_type: snapshot.frequencyType,
          transaction_amount: snapshot.amount,
          currency_id: snapshot.currency,
          // Plano B: trial com cartão. O free_trial autoriza o cartão agora e adia a
          // 1ª cobrança pro fim do período gratuito (X+14). Só nos planos com trial.
          ...(snapshot.trialDays > 0
            ? { free_trial: { frequency: snapshot.trialDays, frequency_type: 'days' } }
            : {}),
        },
        payment_methods_allowed: {
          payment_types: [{ id: 'credit_card' }],
        },
        back_url: this.buildSubscriptionBackUrl(),
      },
      randomUUID(),
    );

    const providerPlanId = String(providerPlan?.id || '').trim();
    if (!providerPlanId) throw new Error('Mercado Pago nao retornou preapproval_plan_id.');

    return this.prisma.commercialPlanProviderMapping.upsert({
      where: {
        planKey_billingCycle_provider: {
          planKey: snapshot.planKey,
          billingCycle: snapshot.billingCycle,
          provider: 'mercadopago',
        },
      },
      update: {
        providerPlanId,
        amount: snapshot.amount,
        currency: snapshot.currency,
        active: true,
      },
      create: {
        planKey: snapshot.planKey,
        billingCycle: snapshot.billingCycle,
        provider: 'mercadopago',
        providerPlanId,
        amount: snapshot.amount,
        currency: snapshot.currency,
        active: true,
      },
    });
  }

  // ANTI-BRECHA do crédito de downgrade: prova que o período ATUAL foi realmente
  // COBRADO (caiu no cartão), não só autorizado. Receita = cobrança paga de cartão/
  // pix/boleto (exclui CREDIT/BONUS) com `paidAt` dentro do período vigente. Sem isso,
  // o cliente assinaria o plano maior (1ª fatura ainda não caiu), baixaria na hora e
  // levaria crédito sem ter passado o cartão de verdade.
  private async hasCollectedRevenueSince(companyId: number, since: Date | null): Promise<boolean> {
    if (!(since instanceof Date) || Number.isNaN(since.getTime())) return false;
    const count = await this.prisma.financeiroCharge.count({
      where: {
        companyId,
        lifecycle: 'paid',
        paymentMethod: { in: ['CARD', 'PIX', 'BOLETO'] },
        paidAt: { gte: since },
      },
    });
    return count > 0;
  }

  private async findCurrentCompanySubscription(companyId: number) {
    return this.prisma.companySubscription.findFirst({
      where: {
        companyId,
        provider: this.subscriptionProviderWhere(),
        status: { in: ['authorized', 'active', 'past_due', 'paused', 'pending'] },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Público desde o S5 dos CRÉDITOS (05/07): o CreditRechargeService (mesmo módulo)
  // grava a receita da recarga AQUI — o Livro Caixa/DAS só enxerga receita que está no
  // MasterBillingLedgerEntry (JOIN com FinanceiroCharge.ledgerEntryId). `db` opcional
  // permite rodar DENTRO da transação do chamador (charge+ledger commitam juntos).
  async insertBillingLedgerEntry(input: {
    companyId: number;
    createdByUserId?: number | null;
    entryType: string;
    entryGroup?: string;
    status?: string;
    origin?: string | null;
    competence?: string | null;
    amount: number;
    dueDate?: Date | null;
    paidAt?: Date | null;
    paymentMethod?: string | null;
    referenceLabel?: string | null;
    observation?: string | null;
    metadata?: Record<string, unknown> | null;
  }, db: { $executeRaw: (...args: any[]) => Promise<unknown> } = this.prisma) {
    await ensureMasterBillingRuntimeSchema(this.prisma);
    const id = randomUUID();
    const now = new Date();
    await db.$executeRaw(
      Prisma.sql`
        INSERT INTO "MasterBillingLedgerEntry"
        ("id", "companyId", "entryType", "entryGroup", "status", "origin", "currency", "competence", "amount", "dueDate", "paidAt", "paymentMethod", "referenceLabel", "observation", "metadata", "createdByUserId", "createdAt", "updatedAt")
        VALUES (
          ${id},
          ${Number(input.companyId)},
          ${String(input.entryType)},
          ${String(input.entryGroup || 'revenue')},
          ${String(input.status || 'PENDING').toUpperCase()},
          ${input.origin ? String(input.origin) : null},
          'BRL',
          ${input.competence ? String(input.competence) : null},
          ${this.normalizeCurrencyAmount(input.amount)},
          ${input.dueDate || null},
          ${input.paidAt || null},
          ${input.paymentMethod ? String(input.paymentMethod) : null},
          ${input.referenceLabel ? String(input.referenceLabel) : null},
          ${input.observation ? String(input.observation) : null},
          ${input.metadata ? JSON.stringify(input.metadata) : null},
          ${input.createdByUserId ? Number(input.createdByUserId) : null},
          ${now},
          ${now}
        )
      `,
    );
    return id;
  }

  private async updateLedgerEntryStatus(input: {
    entryId?: string | null;
    status: string;
    paidAt?: Date | null;
    paymentMethod?: string | null;
    metadata?: Record<string, unknown> | null;
    observation?: string | null;
  }) {
    const entryId = String(input.entryId || '').trim();
    if (!entryId) return;
    await ensureMasterBillingRuntimeSchema(this.prisma);
    await this.prisma.$executeRaw(
      Prisma.sql`
        UPDATE "MasterBillingLedgerEntry"
        SET
          "status" = ${String(input.status || 'PENDING').toUpperCase()},
          "paidAt" = ${input.paidAt || null},
          "paymentMethod" = ${input.paymentMethod ? String(input.paymentMethod) : null},
          "metadata" = ${input.metadata ? JSON.stringify(input.metadata) : null},
          "observation" = ${input.observation ? String(input.observation) : null},
          "updatedAt" = ${new Date()}
        WHERE "id" = ${entryId}
      `,
    );
  }

  private async syncGraceCommercialEntitlementsTx(
    tx: any,
    companyId: number,
    planKey: string,
    graceStartedAt: Date,
    graceEndsAt: Date,
    source: string,
  ) {
    const normalizedPlanKey = this.normalizeCommercialPlanKey(planKey);
    const metadata = {
      selectedPlanKey: normalizedPlanKey,
      graceStartedAt: graceStartedAt.toISOString(),
      graceEndsAt: graceEndsAt.toISOString(),
      source,
    };
    const activeKeys = new Set(COMMERCIAL_PLAN_ENTITLEMENT_KEYS[normalizedPlanKey] || []);
    const allKeys = [
      COMMERCIAL_ENTITLEMENT_KEYS.VENDAS,
      COMMERCIAL_ENTITLEMENT_KEYS.ATENDIMENTO_CHAT,
      COMMERCIAL_ENTITLEMENT_KEYS.WEBSCRAPING,
    ];

    for (const key of allKeys) {
      const active = activeKeys.has(key);
      await tx.companyCommercialEntitlement.upsert({
        where: {
          companyId_key: {
            companyId,
            key,
          },
        },
        update: {
          status: active ? 'grace' : 'canceled',
          source: active ? source : 'billing_grace',
          currentPeriodStart: active ? graceStartedAt : null,
          currentPeriodEnd: active ? graceEndsAt : null,
          metadataJson: JSON.stringify(metadata),
        },
        create: {
          companyId,
          key,
          status: active ? 'grace' : 'canceled',
          source: active ? source : 'billing_grace',
          currentPeriodStart: active ? graceStartedAt : null,
          currentPeriodEnd: active ? graceEndsAt : null,
          metadataJson: JSON.stringify(metadata),
        },
      });
    }
  }

  private async safeSendBillingGraceEmail(company: any, subscription: any | null, stage: 1 | 2 | 3, endsAt: Date) {
    const to = this.billingGraceEmailRecipient(company, subscription);
    if (!to) {
      this.logger.warn(`billing_grace_email_without_recipient companyId=${company?.id || 'unknown'} stage=${stage}`);
      return false;
    }

    const supportEmail = this.supportEmail();
    const supportPhone = this.supportPhone();
    const supportWhatsAppUrl = this.supportWhatsAppUrl();
    const companyName = String(company?.name || 'sua empresa').trim();
    const endsAtLabel = this.formatDateTimePtBr(endsAt);
    const supportText = `Se precisar, fale com o suporte HBX pelo e-mail ${supportEmail}${supportPhone ? ` ou WhatsApp ${supportPhone}` : ''}. A gente te ajuda por lá.`;

    const subject =
      stage === 1
        ? 'HBX: pagamento não autorizado, acesso liberado por 48h'
        : stage === 2
          ? 'HBX: faltam 24h para normalizar o pagamento'
          : 'HBX: acesso bloqueado por pagamento não autorizado';

    const intro =
      stage === 1
        ? `Oi, tudo bem? O Mercado Pago não autorizou a cobrança da assinatura HBX da empresa ${companyName}. Seu acesso continua liberado por 48 horas, até ${endsAtLabel}, para você conseguir normalizar com calma.`
        : stage === 2
          ? `Passando para lembrar que a cobrança da assinatura HBX da empresa ${companyName} ainda não foi autorizada. Restam cerca de 24 horas, até ${endsAtLabel}, para normalizar antes do bloqueio automático.`
          : `Não conseguimos normalizar o pagamento da assinatura HBX da empresa ${companyName} dentro da tolerância de 48 horas. Por isso, o acesso foi bloqueado até a regularização.`;

    const text = `${intro}\n\n${supportText}`;
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
        <p>${this.escapeHtml(intro)}</p>
        <p>${this.escapeHtml(supportText)}</p>
        ${
          supportWhatsAppUrl
            ? `<p><a href="${this.escapeHtml(supportWhatsAppUrl)}" style="color:#2563eb">Chamar suporte HBX no WhatsApp</a></p>`
            : ''
        }
      </div>
    `;

    try {
      await this.mailService.sendMail({
        to,
        subject,
        text,
        html,
        replyTo: supportEmail,
      });
      return true;
    } catch (error: any) {
      this.logger.warn(
        `billing_grace_email_failed companyId=${company?.id || 'unknown'} stage=${stage} error=${String(error?.message || error)}`,
      );
      return false;
    }
  }

  private async safeSendTrialNoticeEmail(company: any, stage: 1 | 2, endsAt: Date) {
    const to = this.billingGraceEmailRecipient(company, null);
    if (!to) {
      this.logger.warn(`trial_notice_email_without_recipient companyId=${company?.id || 'unknown'} stage=${stage}`);
      return false;
    }

    const supportEmail = this.supportEmail();
    const supportPhone = this.supportPhone();
    const supportWhatsAppUrl = this.supportWhatsAppUrl();
    const companyName = String(company?.name || 'sua empresa').trim();
    const endsAtLabel = this.formatDateTimePtBr(endsAt);
    const supportText = `Se precisar de ajuda para escolher a forma de pagamento, fale com o suporte HBX pelo e-mail ${supportEmail}${supportPhone ? ` ou WhatsApp ${supportPhone}` : ''}.`;
    const checkoutText = 'Ao finalizar o checkout, os módulos comerciais voltam a seguir a liberação do plano contratado.';

    const subject =
      stage === 1
        ? 'HBX: seu free trial termina em breve'
        : 'HBX: seu free trial terminou';

    const intro =
      stage === 1
        ? `Oi, tudo bem? O free trial da empresa ${companyName} termina em ${endsAtLabel}. Para continuar usando o HBX sem interrupção, você pode concluir o checkout antes do fim do período gratuito.`
        : `O free trial da empresa ${companyName} terminou em ${endsAtLabel}. O acesso aos módulos comerciais fica pausado até a contratação ser concluída no checkout.`;

    const text = `${intro}\n\n${checkoutText}\n\n${supportText}`;
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
        <p>${this.escapeHtml(intro)}</p>
        <p>${this.escapeHtml(checkoutText)}</p>
        <p>${this.escapeHtml(supportText)}</p>
        ${
          supportWhatsAppUrl
            ? `<p><a href="${this.escapeHtml(supportWhatsAppUrl)}" style="color:#2563eb">Chamar suporte HBX no WhatsApp</a></p>`
            : ''
        }
      </div>
    `;

    try {
      await this.mailService.sendMail({
        to,
        subject,
        text,
        html,
        replyTo: supportEmail,
      });
      return true;
    } catch (error: any) {
      this.logger.warn(
        `trial_notice_email_failed companyId=${company?.id || 'unknown'} stage=${stage} error=${String(error?.message || error)}`,
      );
      return false;
    }
  }

  private async markBillingGraceEmailStage(companyId: number, stage: number, sentAt = new Date()) {
    await this.prisma.company.update({
      where: { id: companyId },
      data: {
        billingGraceEmailStage: stage,
        billingGraceLastEmailAt: sentAt,
      },
    });
  }

  private async markTrialNoticeEmailStage(companyId: number, stage: number, sentAt = new Date()) {
    await this.prisma.company.update({
      where: { id: companyId },
      data: {
        trialNoticeEmailStage: stage,
        trialNoticeLastEmailAt: sentAt,
      },
    });
  }

  private async startBillingGraceForSubscription(input: {
    subscription: any;
    provider?: any;
    charge?: any | null;
    planKey?: string | null;
    billingCycle?: string | null;
    reasonCode: 'payment_rejected' | 'provider_pending' | 'provider_past_due';
    sendInitialEmail: boolean;
    failureMessage?: string | null;
    companyContactData?: Record<string, unknown> | null;
  }) {
    await ensureMasterBillingRuntimeSchema(this.prisma);

    const subscription = input.subscription;
    const companyId = Number(subscription?.companyId || 0);
    if (!companyId) throw new BadRequestException('Empresa da assinatura nao identificada.');

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: {
        users: {
          select: {
            email: true,
            role: true,
            isActive: true,
          },
        },
      },
    });
    if (!company) throw new BadRequestException('Empresa nao encontrada.');

    const now = new Date();
    const existingEndsAt = this.parseBillingGraceDate(company.billingGraceEndsAt);
    const existingStartedAt = this.parseBillingGraceDate(company.billingGraceStartedAt);
    const existingReason = String(company.billingGraceReason || '').trim().toLowerCase();
    const failureAfterSilentGrace =
      input.sendInitialEmail && (this.isBillingGraceEmailSuppressed(existingReason) || existingReason === 'provider_pending');
    const keepExistingWindow = Boolean(
      existingEndsAt &&
      existingEndsAt.getTime() > now.getTime() &&
      !failureAfterSilentGrace,
    );
    const graceStartedAt = keepExistingWindow && existingStartedAt ? existingStartedAt : now;
    const graceEndsAt = keepExistingWindow && existingEndsAt ? existingEndsAt : this.billingGraceEndsFrom(now);
    const currentStage = keepExistingWindow ? Math.max(0, Number(company.billingGraceEmailStage || 0)) : 0;
    const planKey = this.normalizeCommercialPlanKey(input.planKey || subscription.planKey || company.selectedPlanKey);
    const billingCycle = this.normalizeBillingCycle(input.billingCycle || subscription.billingCycle || company.billingCycle);
    const failureGrace = input.sendInitialEmail;
    const providerStatus = failureGrace ? 'past_due' : 'pending';
    const companySubscriptionStatus = failureGrace ? 'past_due' : 'grace';
    const card = this.subscriptionCardSnapshot(input.provider, subscription);

    await this.prisma.$transaction(async (tx) => {
      await tx.companySubscription.update({
        where: { id: subscription.id },
        data: {
          planKey,
          billingCycle,
          status: providerStatus,
          lastProviderStatus: input.provider?.status ? String(input.provider.status) : providerStatus,
          currentPeriodStart: graceStartedAt,
          currentPeriodEnd: graceEndsAt,
          nextBillingAt: this.parseDate(input.provider?.next_payment_date) || subscription.nextBillingAt || graceEndsAt,
          cardBrand: card.brand || subscription.cardBrand,
          cardLast4: card.last4 || subscription.cardLast4,
          providerPayloadJson: this.providerJson({
            provider: input.provider || null,
            chargeId: input.charge?.id || null,
            billingGrace: {
              reasonCode: input.reasonCode,
              failureMessage: input.failureMessage || null,
              graceStartedAt: graceStartedAt.toISOString(),
              graceEndsAt: graceEndsAt.toISOString(),
            },
          }),
        },
      });

      await tx.company.update({
        where: { id: companyId },
        data: {
          selectedPlanKey: planKey,
          trialModuleSelection: planKey === COMMERCIAL_PLAN_KEYS.PADRAO ? 'vendas' : null,
          // Estado unico nativo (PR-002 A.3): graça = overdue com prazo
          // (billingGraceEndsAt). A leitura canonica libera enquanto a graça
          // vale — sem espelho legado (DROP).
          status: 'overdue',
          statusChangedAt: now,
          isActive: true,
          billingProvider: 'mercadopago',
          paymentMethod: 'CARD',
          billingCycle,
          subscriptionCurrentPeriodStart: graceStartedAt,
          subscriptionCurrentPeriodEnd: graceEndsAt,
          billingCardBrand: card.brand || company.billingCardBrand || null,
          billingCardLast4: card.last4 || company.billingCardLast4 || null,
          billingCardUpdatedAt: card.last4 || card.brand ? now : company.billingCardUpdatedAt,
          billingGraceStartedAt: graceStartedAt,
          billingGraceEndsAt: graceEndsAt,
          billingGraceReason: input.reasonCode,
          billingGraceEmailStage: currentStage,
          billingGraceLastFailureAt: failureGrace ? now : company.billingGraceLastFailureAt,
          deactivatedAt: null,
          ...(input.companyContactData || {}),
        },
      });

      await this.syncPaidPlanModulesTx(tx, companyId, planKey);
      await this.syncGraceCommercialEntitlementsTx(
        tx,
        companyId,
        planKey,
        graceStartedAt,
        graceEndsAt,
        failureGrace ? 'billing_failure_grace' : 'subscription_processing_grace',
      );
    });

    let initialEmailSent = false;
    if (input.sendInitialEmail && currentStage < 1) {
      const refreshedCompany = await this.prisma.company.findUnique({
        where: { id: companyId },
        include: {
          users: {
            select: {
              email: true,
              role: true,
              isActive: true,
            },
          },
        },
      });
      initialEmailSent = await this.safeSendBillingGraceEmail(refreshedCompany || company, subscription, 1, graceEndsAt);
      if (initialEmailSent) {
        await this.markBillingGraceEmailStage(companyId, 1);
      }
    }

    return {
      active: true,
      reasonCode: input.reasonCode,
      startedAt: graceStartedAt.toISOString(),
      endsAt: graceEndsAt.toISOString(),
      remainingHours: Math.max(0, Math.ceil((graceEndsAt.getTime() - now.getTime()) / (60 * 60 * 1000))),
      emailStage: initialEmailSent ? Math.max(1, currentStage) : currentStage,
    };
  }

  private async blockCompanyAfterBillingGrace(company: any, subscription: any | null, blockedAt = new Date()) {
    await this.prisma.$transaction(async (tx) => {
      await tx.company.update({
        where: { id: company.id },
        data: {
          // Estado unico nativo (PR-002 A.3): graça vencida = suspended.
          status: 'suspended',
          statusChangedAt: blockedAt,
          isActive: false,
          billingGraceEmailStage: 3,
          billingGraceLastEmailAt: blockedAt,
          deactivatedAt: blockedAt,
        },
      });
      await tx.companyModule.updateMany({ where: { companyId: company.id }, data: { enabled: false } });
      await tx.companyCommercialEntitlement.updateMany({
        where: { companyId: company.id, status: 'grace' },
        data: {
          status: 'canceled',
          source: 'billing_grace_expired',
          currentPeriodEnd: blockedAt,
        },
      });
      if (subscription?.id) {
        await tx.companySubscription.update({
          where: { id: subscription.id },
          data: {
            status: 'past_due',
            lastProviderStatus: subscription.lastProviderStatus || 'billing_grace_expired',
            currentPeriodEnd: blockedAt,
          },
        });
      }
    });
  }

  private async processBillingGracePeriods(source: 'startup' | 'interval' | 'manual' = 'manual') {
    try {
      await ensureMasterBillingRuntimeSchema(this.prisma);
      const companies = await this.prisma.company.findMany({
        where: {
          billingGraceEndsAt: { not: null },
          billingGraceEmailStage: { lt: 3 },
          // Cortesia (decisao master) nunca recebe regua de cobranca.
          status: { not: 'courtesy' },
        },
        include: {
          users: {
            select: {
              email: true,
              role: true,
              isActive: true,
            },
          },
        },
        orderBy: { billingGraceEndsAt: 'asc' },
        take: 100,
      });
      const now = new Date();

      for (const company of companies) {
        const endsAt = this.parseBillingGraceDate(company.billingGraceEndsAt);
        if (!endsAt) continue;

        const subscription = await this.prisma.companySubscription.findFirst({
          where: { companyId: company.id, provider: this.subscriptionProviderWhere() },
          orderBy: { createdAt: 'desc' },
        });
        const stage = Math.max(0, Number(company.billingGraceEmailStage || 0));
        const suppressed = this.isBillingGraceEmailSuppressed(company.billingGraceReason);

        if (endsAt.getTime() <= now.getTime()) {
          if (!suppressed && stage < 3) {
            await this.safeSendBillingGraceEmail(company, subscription, 3, endsAt);
          }
          await this.blockCompanyAfterBillingGrace(company, subscription, now);
          continue;
        }

        const remainingMs = endsAt.getTime() - now.getTime();
        if (!suppressed && stage < 2 && remainingMs <= BILLING_GRACE_SECOND_NOTICE_MS) {
          const sent = await this.safeSendBillingGraceEmail(company, subscription, 2, endsAt);
          if (sent) {
            await this.markBillingGraceEmailStage(company.id, 2);
          }
        }
      }
    } catch (error: any) {
      this.logger.warn(`billing_grace_sweep_failed source=${source} error=${String(error?.message || error)}`);
    }
  }

  private async processTrialNoticeEmails(source: 'startup' | 'interval' | 'manual' = 'manual') {
    try {
      await ensureMasterBillingRuntimeSchema(this.prisma);
      const companies = await this.prisma.company.findMany({
        where: {
          isActive: true,
          trialEndsAt: { not: null },
          trialNoticeEmailStage: { lt: 2 },
          // Estado unico: só trial recebe aviso de trial (cortesia fica de fora
          // naturalmente, pois tem status proprio).
          status: 'trial',
        },
        include: {
          users: {
            select: {
              email: true,
              role: true,
              isActive: true,
            },
          },
        },
        orderBy: { trialEndsAt: 'asc' },
        take: 100,
      });
      const now = new Date();

      for (const company of companies) {
        const endsAt = company.trialEndsAt instanceof Date ? company.trialEndsAt : this.parseDate(company.trialEndsAt);
        if (!endsAt) continue;

        const stage = Math.max(0, Number(company.trialNoticeEmailStage || 0));
        const remainingMs = endsAt.getTime() - now.getTime();

        if (remainingMs <= 0) {
          const sent = await this.safeSendTrialNoticeEmail(company, 2, endsAt);
          if (sent) {
            await this.markTrialNoticeEmailStage(company.id, 2);
          }
          continue;
        }

        if (stage < 1 && remainingMs <= TRIAL_NOTICE_WINDOW_MS) {
          const sent = await this.safeSendTrialNoticeEmail(company, 1, endsAt);
          if (sent) {
            await this.markTrialNoticeEmailStage(company.id, 1);
          }
        }
      }
    } catch (error: any) {
      this.logger.warn(`trial_notice_sweep_failed source=${source} error=${String(error?.message || error)}`);
    }
  }

  private async activateCompanyFromCharge(companyId: number, charge: any, paidAt: Date) {
    const [company, masterConfig] = await Promise.all([
      this.prisma.company.findUnique({ where: { id: companyId } }),
      getMasterGlobalIntegrationConfig(this.prisma),
    ]);
    if (!company) throw new BadRequestException('Empresa nao encontrada.');
    const billingCycle = this.normalizeBillingCycle(charge?.billingCycle);
    const periodEnd = this.computePeriodEnd(paidAt, billingCycle);
    const referral = this.buildReferralSnapshot(company, masterConfig);
    const selectedPlanKey = this.normalizeCommercialPlanKey(company.selectedPlanKey);
    await this.prisma.$transaction(async (tx) => {
      await tx.company.update({
        where: { id: companyId },
        data: {
          selectedPlanKey,
          trialModuleSelection: selectedPlanKey === COMMERCIAL_PLAN_KEYS.PADRAO ? 'vendas' : null,
          // Estado unico nativo (PR-002 A.3): pagamento confirmado = active
          // (sem espelho legado — DROP).
          status: 'active',
          statusChangedAt: paidAt,
          courtesyEndsAt: null,
          courtesyReason: null,
          isActive: true,
          billingProvider: 'mercadopago',
          paymentMethod: this.normalizePaymentMethod(charge?.paymentMethod),
          subscriptionCurrentPeriodStart: paidAt,
          subscriptionCurrentPeriodEnd: periodEnd,
          ...this.billingGraceClearData(),
          referralDiscountConsumedAt:
            referral.referralDiscountAppliesNow && referral.referralDiscountMode === 'ONCE'
              ? paidAt
              : company?.referralDiscountConsumedAt || null,
          deactivatedAt: null,
        },
      });
      await this.syncPaidPlanModulesTx(tx, companyId, selectedPlanKey);
      await this.syncPaidCommercialEntitlementsTx(tx, companyId, selectedPlanKey, paidAt, periodEnd);
    });
    await this.hbxCommissionSync.syncActivatedCompany(companyId, { source: 'financeiro_charge_paid' }).catch((error: any) => {
      this.logger.warn(`commission_sync_charge_failed company=${companyId} error=${String(error?.message || error)}`);
    });
  }

  private async activateCompanyFromSubscription(subscription: any, paidAt: Date, provider?: any) {
    const companyId = Number(subscription?.companyId || 0);
    if (!companyId) throw new BadRequestException('Empresa da assinatura nao identificada.');

    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new BadRequestException('Empresa nao encontrada.');

    const billingCycle = this.normalizeBillingCycle(subscription.billingCycle);
    const periodStart = paidAt;
    const periodEnd =
      this.parseDate(provider?.auto_recurring?.end_date) ||
      this.parseDate(provider?.current_period_end) ||
      this.computePeriodEnd(periodStart, billingCycle);
    const nextBillingAt = this.inferNextBillingAt(provider, periodStart, billingCycle) || periodEnd;
    const selectedPlanKey = this.normalizeCommercialPlanKey(subscription.planKey || company.selectedPlanKey);
    const card = this.subscriptionCardSnapshot(provider, subscription);

    await this.prisma.$transaction(async (tx) => {
      await tx.companySubscription.update({
        where: { id: subscription.id },
        data: {
          status: 'active',
          lastProviderStatus: provider?.status ? String(provider.status) : subscription.lastProviderStatus || 'active',
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          nextBillingAt,
          cardBrand: card.brand || subscription.cardBrand,
          cardLast4: card.last4 || subscription.cardLast4,
          providerPayloadJson: this.providerJson({ provider }),
        },
      });

      await tx.company.update({
        where: { id: companyId },
        data: {
          selectedPlanKey,
          trialModuleSelection: selectedPlanKey === COMMERCIAL_PLAN_KEYS.PADRAO ? 'vendas' : null,
          // Estado unico nativo (PR-002 A.3): assinatura ativa = active
          // (sem espelho legado — DROP).
          status: 'active',
          statusChangedAt: paidAt,
          courtesyEndsAt: null,
          courtesyReason: null,
          isActive: true,
          billingProvider: 'mercadopago',
          paymentMethod: 'CARD',
          billingCycle,
          subscriptionCurrentPeriodStart: periodStart,
          subscriptionCurrentPeriodEnd: periodEnd,
          ...this.billingGraceClearData(),
          billingCardBrand: card.brand || company.billingCardBrand || null,
          billingCardLast4: card.last4 || company.billingCardLast4 || null,
          billingCardHolderName: null,
          billingCardExpMonth: null,
          billingCardExpYear: null,
          billingCardUpdatedAt: card.last4 || card.brand ? new Date() : company.billingCardUpdatedAt,
          deactivatedAt: null,
        },
      });

      await this.syncPaidPlanModulesTx(tx, companyId, selectedPlanKey);
      await this.syncPaidCommercialEntitlementsTx(tx, companyId, selectedPlanKey, periodStart, periodEnd);
    });
    await this.hbxCommissionSync.syncActivatedCompany(companyId, { source: 'financeiro_subscription_active' }).catch((error: any) => {
      this.logger.warn(`commission_sync_subscription_failed company=${companyId} error=${String(error?.message || error)}`);
    });
  }

  private async settleMockCheckoutCharge(input: {
    user: any;
    context: { companyId: number; userId: number };
    charge: any;
    company: any;
    pricing: any;
    selectedPlanKey: string;
    requestedBillingCycle: string;
    paymentMethod: string;
    amount: number;
    competence: string;
    externalReference: string;
    paymentProfile: PaymentContactProfile | null;
    companyWithPaymentProfile: any;
  }) {
    const paidAt = new Date();
    const ledgerEntryId = await this.insertBillingLedgerEntry({
      companyId: input.context.companyId,
      createdByUserId: input.context.userId,
      entryType: `${input.paymentMethod}_MOCK_CHECKOUT`,
      entryGroup: 'revenue',
      status: 'APPROVED',
      origin: 'financeiro_mock',
      competence: input.competence,
      amount: input.amount,
      paidAt,
      paymentMethod: input.paymentMethod,
      referenceLabel: this.resolveChargeReferenceLabel(input.companyWithPaymentProfile, input.pricing),
      observation: 'Cobrança aprovada pelo provider mock em desenvolvimento.',
      metadata: {
        chargeId: input.charge.id,
        externalReference: input.externalReference,
        planKey: input.selectedPlanKey,
        billingCycle: input.requestedBillingCycle,
        seatBilling: this.pricingSeatBillingMetadata(input.pricing),
        provider: 'mock',
        ...(input.paymentProfile ? {
          contactName: input.paymentProfile.contactName,
          taxDocumentProvided: Boolean(input.paymentProfile.taxDocument),
          acceptedTerms: true,
        } : {}),
      },
    });

    const updated = await this.prisma.financeiroCharge.update({
      where: { id: input.charge.id },
      data: {
        status: 'approved',
        lifecycle: 'paid',
        ledgerEntryId,
        paidAt,
        paymentUrl: this.buildCheckoutReturnUrl(input.charge.id),
        providerPayload: this.providerJson({
          provider: {
            id: `mock-payment-${input.charge.id}`,
            status: 'approved',
            transaction_amount: input.amount,
            external_reference: input.externalReference,
          },
        }),
        lastWebhookAt: paidAt,
        lastWebhookPayload: this.json({ source: 'mock_provider' }),
      },
    });

    await this.activateCompanyFromCharge(input.context.companyId, updated, paidAt);
    await this.prisma.company.update({
      where: { id: input.context.companyId },
      data: {
        billingProvider: 'mock',
        selectedPlanKey: input.selectedPlanKey,
        billingCycle: input.requestedBillingCycle,
      },
    });

    return {
      ok: true,
      mock: true,
      charge: this.serializeCharge(updated),
      overview: await this.getOverviewForUser(input.user),
    };
  }

  private async createMockSubscriptionForUser(input: {
    user: any;
    context: { companyId: number; userId: number };
    company: any;
    plan: ReturnType<FinanceiroService['buildCommercialPlanProviderSnapshot']>;
    payerEmail: string;
    billingContactPhone?: string | null;
    companyContactData?: Record<string, unknown> | null;
  }) {
    const now = new Date();
    const trialDays = Math.max(0, Math.trunc(Number(input.plan.trialDays) || 0));
    const isTrialSub = trialDays > 0;
    const existingTrialEnd = input.company?.trialEndsAt instanceof Date
      ? input.company.trialEndsAt
      : this.parseDate(input.company?.trialEndsAt);
    const trialEnd = existingTrialEnd && existingTrialEnd.getTime() > now.getTime()
      ? existingTrialEnd
      : new Date(now.getTime() + trialDays * 86400000);
    const periodEnd = isTrialSub ? trialEnd : this.computePeriodEnd(now, input.plan.billingCycle);
    const existing = await this.prisma.companySubscription.findFirst({
      where: {
        companyId: input.context.companyId,
        provider: 'mock',
        status: { in: ['authorized', 'active', 'past_due', 'paused', 'pending'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    const providerPreapprovalId = existing?.providerPreapprovalId || `mock-sub-${input.context.companyId}-${Date.now()}`;
    const providerPayload = {
      provider: {
        id: providerPreapprovalId,
        status: 'authorized',
        payer_email: input.payerEmail,
        preapproval_plan_id: `mock-plan-${input.plan.planKey}-${input.plan.billingCycle}`,
        auto_recurring: {
          end_date: periodEnd.toISOString(),
          transaction_amount: input.plan.amount,
          currency_id: input.plan.currency,
        },
        card: {
          last_four_digits: '4242',
          payment_method: { id: 'mock', name: 'Mock' },
        },
      },
    };

    const subscription = existing
      ? await this.prisma.companySubscription.update({
          where: { id: existing.id },
          data: {
            provider: 'mock',
            providerPreapprovalId,
            providerPreapprovalPlanId: `mock-plan-${input.plan.planKey}-${input.plan.billingCycle}`,
            planKey: input.plan.planKey,
            billingCycle: input.plan.billingCycle,
            status: 'authorized',
            payerEmail: input.payerEmail,
            billingContactPhone: input.billingContactPhone || undefined,
            cardBrand: 'Mock',
            cardLast4: '4242',
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            nextBillingAt: periodEnd,
            cancelAtPeriodEnd: false,
            canceledAt: null,
            lastProviderStatus: 'authorized',
            providerPayloadJson: this.providerJson(providerPayload),
            createdByUserId: input.context.userId,
          },
        })
      : await this.prisma.companySubscription.create({
          data: {
            companyId: input.context.companyId,
            provider: 'mock',
            providerPreapprovalId,
            providerPreapprovalPlanId: `mock-plan-${input.plan.planKey}-${input.plan.billingCycle}`,
            planKey: input.plan.planKey,
            billingCycle: input.plan.billingCycle,
            status: 'authorized',
            payerEmail: input.payerEmail,
            billingContactPhone: input.billingContactPhone || undefined,
            cardBrand: 'Mock',
            cardLast4: '4242',
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            nextBillingAt: periodEnd,
            lastProviderStatus: 'authorized',
            providerPayloadJson: this.providerJson(providerPayload),
            createdByUserId: input.context.userId,
          },
        });

    if (isTrialSub) {
      // Plano B (trial com cartão): o cartão fica autorizado, mas a 1ª cobrança é só
      // no fim do trial (X+14) — NADA é cobrado agora (sem charge, sem ledger). A
      // empresa segue em 'trial' com o cartão na ficha pra cobrar quando vencer.
      await this.prisma.companySubscription.update({
        where: { id: subscription.id },
        data: { status: 'trialing', lastProviderStatus: 'authorized' },
      });
      await this.prisma.company.update({
        where: { id: input.context.companyId },
        data: {
          status: 'trial',
          isActive: true,
          trialEndsAt: periodEnd,
          subscriptionCurrentPeriodStart: now,
          subscriptionCurrentPeriodEnd: periodEnd,
          billingProvider: 'mock',
          paymentMethod: 'CARD',
          billingCardBrand: 'Mock',
          billingCardLast4: '4242',
          billingCardUpdatedAt: now,
          ...(input.companyContactData || {}),
        },
      });
      const refreshedTrial = await this.prisma.companySubscription.findUnique({ where: { id: subscription.id } });
      return {
        ok: true,
        mock: true,
        trial: true,
        status: 'trialing',
        providerPreapprovalId,
        subscription: this.serializeSubscription(refreshedTrial || subscription),
        overview: await this.getOverviewForUser(input.user),
      };
    }

    const charge = await this.prisma.financeiroCharge.create({
      data: {
        companyId: input.context.companyId,
        amount: input.plan.amount,
        description: `${input.plan.title} ${input.plan.billingCycle === 'ANNUAL' ? 'anual' : 'mensal'}`,
        billingCycle: input.plan.billingCycle,
        paymentMethod: 'CARD',
        status: 'approved',
        lifecycle: 'paid',
        competence: this.monthKey(now),
        externalReference: `hbx-mock-subpay-${input.context.companyId}-${Date.now()}`,
        paidAt: now,
        createdByUserId: input.context.userId,
        providerPayload: this.providerJson({ source: 'mock_provider', subscriptionId: subscription.id }),
        lastWebhookAt: now,
        lastWebhookPayload: this.json({ source: 'mock_provider' }),
      },
    });
    const ledgerEntryId = await this.insertBillingLedgerEntry({
      companyId: input.context.companyId,
      createdByUserId: input.context.userId,
      entryType: 'SUBSCRIPTION_CARD_MOCK',
      entryGroup: 'revenue',
      status: 'APPROVED',
      origin: 'financeiro_mock_subscription',
      competence: this.monthKey(now),
      amount: input.plan.amount,
      paidAt: now,
      paymentMethod: 'CARD',
      referenceLabel: input.plan.title,
      observation: 'Assinatura aprovada pelo provider mock em desenvolvimento.',
      metadata: {
        chargeId: charge.id,
        companySubscriptionId: subscription.id,
        providerPreapprovalId,
        provider: 'mock',
      },
    });
    await this.prisma.financeiroCharge.update({
      where: { id: charge.id },
      data: { ledgerEntryId },
    });

    await this.activateCompanyFromSubscription(subscription, now, providerPayload.provider);
    await this.prisma.company.update({
      where: { id: input.context.companyId },
      data: {
        billingProvider: 'mock',
        billingCardBrand: 'Mock',
        billingCardLast4: '4242',
        billingCardUpdatedAt: now,
        ...(input.companyContactData || {}),
      },
    });

    const refreshed = await this.prisma.companySubscription.findUnique({ where: { id: subscription.id } });
    return {
      ok: true,
      mock: true,
      status: refreshed?.status || 'active',
      providerPreapprovalId,
      subscription: this.serializeSubscription(refreshed || subscription),
      overview: await this.getOverviewForUser(input.user),
    };
  }

  private async applySubscriptionProviderState(subscription: any, provider: any, options?: { forceBlock?: boolean }) {
    const providerStatus = this.normalizeProviderSubscriptionStatus(provider?.status || subscription?.lastProviderStatus);
    const now = new Date();
    const hasPaidPeriod =
      subscription?.currentPeriodEnd instanceof Date && subscription.currentPeriodEnd.getTime() > now.getTime();
    const shouldKeepAccessAfterCancel = providerStatus === 'canceled' && hasPaidPeriod && !options?.forceBlock;

    await this.prisma.companySubscription.update({
      where: { id: subscription.id },
      data: {
        status: providerStatus,
        lastProviderStatus: provider?.status ? String(provider.status) : providerStatus,
        cancelAtPeriodEnd: shouldKeepAccessAfterCancel,
        canceledAt: providerStatus === 'canceled' ? now : subscription.canceledAt || null,
        nextBillingAt: this.parseDate(provider?.next_payment_date) || subscription.nextBillingAt,
        providerPayloadJson: this.providerJson({ provider }),
      },
    });

    if (providerStatus === 'authorized') {
      const periodStart =
        subscription.currentPeriodStart instanceof Date
          ? subscription.currentPeriodStart
          : this.parseDate(provider?.date_created) || new Date();
      await this.activateCompanyFromSubscription(subscription, periodStart, provider);
      return;
    }

    if (providerStatus === 'pending') {
      await this.startBillingGraceForSubscription({
        subscription,
        provider,
        reasonCode: 'provider_pending',
        sendInitialEmail: false,
      });
      return;
    }

    if (providerStatus === 'paused' || providerStatus === 'past_due') {
      await this.startBillingGraceForSubscription({
        subscription,
        provider,
        reasonCode: 'provider_past_due',
        sendInitialEmail: true,
      });
      return;
    }

    if (providerStatus === 'canceled' && !shouldKeepAccessAfterCancel) {
      await this.prisma.company.update({
        where: { id: subscription.companyId },
        data: {
          // Assinatura cancelada sem manter acesso = suspended (estado unico).
          status: 'suspended',
          statusChangedAt: now,
          isActive: false,
          deactivatedAt: now,
        },
      });
      await this.hbxCommissionSync.syncActivatedCompany(Number(subscription.companyId), { source: 'financeiro_subscription_canceled' }).catch((error: any) => {
        this.logger.warn(`commission_sync_subscription_cancel_failed company=${subscription.companyId} error=${String(error?.message || error)}`);
      });
    }
  }

  private async settleComplimentaryCycle(companyId: number, userId: number) {
    const [company, masterConfig] = await Promise.all([
      this.prisma.company.findUnique({
      where: { id: companyId },
      include: {
        companyModules: {
          include: { systemModule: true },
        },
        users: {
          select: { id: true, isActive: true, isSystemMaster: true, deactivatedAt: true },
        },
        commercialEntitlements: true,
      },
      }),
      getMasterGlobalIntegrationConfig(this.prisma),
    ]);
    if (!company) throw new BadRequestException('Empresa nao encontrada.');
    const pricing = await this.buildPricing(company, masterConfig, []);
    const now = new Date();
    const charge = await this.prisma.financeiroCharge.create({
      data: {
        companyId,
        amount: 0,
        description: `${this.resolveChargeDescription(company, pricing)} - ciclo promocional`,
        billingCycle: pricing.billingCycle,
        paymentMethod: 'BONUS',
        status: 'approved',
        lifecycle: 'paid',
        competence: this.monthKey(now),
        externalReference: `hbx-financeiro-bonus-${companyId}-${Date.now()}`,
        paidAt: now,
        createdByUserId: userId,
        providerPayload: this.json({ source: 'free_month' }),
      },
    });
    const ledgerEntryId = await this.insertBillingLedgerEntry({
      companyId,
      createdByUserId: userId,
      entryType: 'BONUS_CYCLE',
      entryGroup: 'revenue',
      status: 'APPROVED',
      origin: 'financeiro_bonus',
      competence: this.monthKey(now),
      amount: 0,
      paidAt: now,
      paymentMethod: 'BONUS',
      referenceLabel: this.resolveChargeReferenceLabel(company, pricing),
      observation: 'Ciclo liquidado por mês grátis configurado no MASTER.',
      metadata: { chargeId: charge.id, freeMonthsBefore: Number(company.freeMonths || 0) },
    });
    await this.prisma.financeiroCharge.update({
      where: { id: charge.id },
      data: { ledgerEntryId },
    });
    await this.prisma.company.update({
      where: { id: companyId },
      data: {
        freeMonths: Math.max(0, Math.trunc(Number(company.freeMonths || 0) || 0) - 1),
      },
    });
    await this.activateCompanyFromCharge(companyId, charge, now);
    return this.prisma.financeiroCharge.findUnique({ where: { id: charge.id } });
  }

  private async findReusableCharge(
    companyId: number,
    paymentMethod: string,
    options?: { billingCycle?: string; amount?: number },
  ) {
    const row = await this.prisma.financeiroCharge.findFirst({
      where: {
        companyId,
        paymentMethod,
        ...(options?.billingCycle ? { billingCycle: this.normalizeBillingCycle(options.billingCycle) } : {}),
        ...(typeof options?.amount === 'number' ? { amount: this.normalizeCurrencyAmount(options.amount) } : {}),
        status: 'pending',
        lifecycle: 'in_progress',
      },
      orderBy: { createdAt: 'desc' },
    });
    return row || null;
  }

  private async syncChargeFromProvider(companyId: number, paymentId: string, context?: any) {
    const { accessToken } = await this.resolveFinanceContext(companyId);
    const provider = await this.mercadoPagoClient.getPayment(accessToken, paymentId);
    const status = this.normalizeProviderPaymentStatus(provider.status);
    const lifecycle = this.normalizeLifecycle(status);
    const amount = Math.max(0, this.normalizeCurrencyAmount(provider.transaction_amount || 0));
    const refunded = Math.max(0, this.normalizeCurrencyAmount(provider.transaction_amount_refunded || 0));
    const paidAt = provider.date_approved ? new Date(provider.date_approved) : null;
    const refundedAt = refunded > 0 && provider.date_last_updated ? new Date(provider.date_last_updated) : null;
    const metadata = (provider.metadata || {}) as Record<string, unknown>;
    const externalReference = String(provider.external_reference || '').trim() || null;
    const chargeId = String(metadata.financeiro_charge_id || metadata.charge_id || '').trim();

    let charge = await this.prisma.financeiroCharge.findFirst({
      where: { companyId, mpPaymentId: String(paymentId) },
    });
    if (!charge && externalReference) {
      charge = await this.prisma.financeiroCharge.findFirst({ where: { companyId, externalReference } });
    }
    if (!charge && chargeId) {
      charge = await this.prisma.financeiroCharge.findFirst({ where: { companyId, id: chargeId } });
    }
    if (!charge) return { updated: false, status };

    charge = await this.prisma.financeiroCharge.update({
      where: { id: charge.id },
      data: {
        amount,
        status,
        lifecycle,
        mpPaymentId: String(paymentId),
        mpMerchantOrderId:
          provider?.order?.id !== undefined && provider?.order?.id !== null ? String(provider.order.id) : charge.mpMerchantOrderId,
        externalReference: externalReference || charge.externalReference,
        paidAt: paidAt || charge.paidAt,
        refundedAt,
        refundAmount: refunded,
        providerPayload: this.providerJson({ context: context || null, provider }),
        lastWebhookAt: new Date(),
        lastWebhookPayload: this.json({ query: context?.query || null, body: context?.body || null }),
      },
    });

    await this.updateLedgerEntryStatus({
      entryId: charge.ledgerEntryId,
      status,
      paidAt: paidAt || null,
      paymentMethod: this.normalizePaymentMethod(charge.paymentMethod),
      observation:
        status === 'approved'
          ? 'Pagamento aprovado automaticamente pelo Mercado Pago.'
          : status === 'refunded' || status === 'partially_refunded'
            ? 'Cobrança atualizada com estorno vindo do Mercado Pago.'
            : status === 'failed'
              ? 'Cobrança marcada como falha pelo Mercado Pago.'
              : 'Cobrança atualizada automaticamente pelo Mercado Pago.',
      metadata: {
        chargeId: charge.id,
        mpPaymentId: paymentId,
        mpStatus: provider.status,
        refundAmount: refunded,
      },
    });

    // F3: cobrança aprovada que nunca teve lançamento (ex.: checkout avulso confirmado
    // só pelo webhook) não pode sumir do Financeiro do master — cria o lançamento agora.
    // Guard `!ledgerEntryId` evita duplicar quando o fluxo já criou um na origem.
    if (!charge.ledgerEntryId && status === 'approved' && paidAt) {
      const ledgerEntryId = await this.insertBillingLedgerEntry({
        companyId,
        createdByUserId: charge.createdByUserId || null,
        entryType: 'CHECKOUT_CHARGE',
        entryGroup: 'revenue',
        status,
        origin: 'financeiro_checkout',
        competence: charge.competence || this.monthKey(paidAt),
        amount,
        paidAt,
        paymentMethod: this.normalizePaymentMethod(charge.paymentMethod),
        referenceLabel: charge.description || 'HBX Financeiro',
        observation: 'Cobrança aprovada pelo Mercado Pago.',
        metadata: { chargeId: charge.id, mpPaymentId: paymentId },
      });
      charge = await this.prisma.financeiroCharge.update({
        where: { id: charge.id },
        data: { ledgerEntryId },
      });
    }

    if (status === 'approved' && paidAt) {
      await this.activateCompanyFromCharge(companyId, charge, paidAt);
    }

    return { updated: true, status, charge: this.serializeCharge(charge) };
  }

  private async resolveSubscriptionFromPaymentProvider(provider: any) {
    const metadata = (provider?.metadata || {}) as Record<string, unknown>;
    const explicitSubscriptionId = String(
      metadata.company_subscription_id ||
        metadata.subscription_id ||
        metadata.hbx_subscription_id ||
        '',
    ).trim();
    if (explicitSubscriptionId) {
      const byId = await this.prisma.companySubscription.findUnique({ where: { id: explicitSubscriptionId } });
      if (byId) return byId;
    }

    const external = this.parseSubscriptionExternalReference(provider?.external_reference);
    if (external?.subscriptionId) {
      const byExternal = await this.prisma.companySubscription.findFirst({
        where: {
          id: external.subscriptionId,
          companyId: external.companyId || undefined,
        },
      });
      if (byExternal) return byExternal;
    }

    const preapprovalId = String(
      provider?.preapproval_id ||
        provider?.subscription_id ||
        provider?.point_of_interaction?.transaction_data?.subscription_id ||
        metadata.preapproval_id ||
        '',
    ).trim();
    if (preapprovalId) {
      const byPreapproval = await this.prisma.companySubscription.findUnique({
        where: { providerPreapprovalId: preapprovalId },
      });
      if (byPreapproval) return byPreapproval;
    }

    return null;
  }

  private async syncSubscriptionPaymentFromProvider(
    provider: any,
    context?: any,
  ) {
    const paymentId = String(provider?.id || '').trim();
    if (!paymentId) return { updated: false, reason: 'payment_id ausente.' };

    const subscription = await this.resolveSubscriptionFromPaymentProvider(provider);
    if (!subscription) return { updated: false, paymentId, reason: 'assinatura local nao encontrada.' };

    const status = this.normalizeProviderPaymentStatus(provider.status);
    const lifecycle = this.normalizeLifecycle(status);
    const paidAt = provider.date_approved ? new Date(provider.date_approved) : null;
    const amount = Math.max(
      0,
      this.normalizeCurrencyAmount(
        provider.transaction_amount || computeCommercialPlanCycleAmount(subscription.planKey, subscription.billingCycle),
      ),
    );
    const refunded = Math.max(0, this.normalizeCurrencyAmount(provider.transaction_amount_refunded || 0));
    const refundedAt = refunded > 0 && provider.date_last_updated ? new Date(provider.date_last_updated) : null;
    const chargeExternalReference = `hbx-subpay-${paymentId}`;
    const description = `${getCommercialPlanTitle(subscription.planKey)} ${this.normalizeBillingCycle(subscription.billingCycle) === 'ANNUAL' ? 'anual' : 'mensal'}`;
    const competence = this.monthKey(paidAt || new Date());

    let charge = await this.prisma.financeiroCharge.findFirst({
      where: { mpPaymentId: paymentId },
    });

    if (!charge) {
      charge = await this.prisma.financeiroCharge.create({
        data: {
          companyId: subscription.companyId,
          amount,
          description,
          billingCycle: this.normalizeBillingCycle(subscription.billingCycle),
          paymentMethod: 'CARD',
          status,
          lifecycle,
          competence,
          externalReference: chargeExternalReference,
          mpPaymentId: paymentId,
          mpMerchantOrderId:
            provider?.order?.id !== undefined && provider?.order?.id !== null ? String(provider.order.id) : null,
          paidAt,
          refundedAt,
          refundAmount: refunded,
          providerPayload: this.providerJson({ context: context || null, provider }),
          lastWebhookAt: new Date(),
          lastWebhookPayload: this.json({ query: context?.query || null, body: context?.body || null }),
          createdByUserId: subscription.createdByUserId || null,
        },
      });
    } else {
      charge = await this.prisma.financeiroCharge.update({
        where: { id: charge.id },
        data: {
          amount,
          status,
          lifecycle,
          mpPaymentId: paymentId,
          mpMerchantOrderId:
            provider?.order?.id !== undefined && provider?.order?.id !== null ? String(provider.order.id) : charge.mpMerchantOrderId,
          paidAt: paidAt || charge.paidAt,
          refundedAt,
          refundAmount: refunded,
          providerPayload: this.providerJson({ context: context || null, provider }),
          lastWebhookAt: new Date(),
          lastWebhookPayload: this.json({ query: context?.query || null, body: context?.body || null }),
        },
      });
    }

    if (!charge.ledgerEntryId) {
      const ledgerEntryId = await this.insertBillingLedgerEntry({
        companyId: subscription.companyId,
        createdByUserId: subscription.createdByUserId || null,
        entryType: 'SUBSCRIPTION_CARD',
        entryGroup: 'revenue',
        status,
        origin: 'financeiro_subscription',
        competence,
        amount,
        paidAt: paidAt || null,
        paymentMethod: 'CARD',
        referenceLabel: getCommercialPlanTitle(subscription.planKey),
        observation:
          status === 'approved'
            ? 'Pagamento recorrente aprovado automaticamente pelo Mercado Pago.'
            : 'Pagamento recorrente atualizado pelo Mercado Pago.',
        metadata: {
          chargeId: charge.id,
          companySubscriptionId: subscription.id,
          providerPreapprovalId: subscription.providerPreapprovalId,
          mpPaymentId: paymentId,
          mpStatus: provider.status,
        },
      });
      charge = await this.prisma.financeiroCharge.update({
        where: { id: charge.id },
        data: { ledgerEntryId },
      });
    } else {
      await this.updateLedgerEntryStatus({
        entryId: charge.ledgerEntryId,
        status,
        paidAt: paidAt || null,
        paymentMethod: 'CARD',
        observation:
          status === 'approved'
            ? 'Pagamento recorrente aprovado automaticamente pelo Mercado Pago.'
            : status === 'failed'
              ? 'Pagamento recorrente marcado como falho pelo Mercado Pago.'
              : 'Pagamento recorrente atualizado pelo Mercado Pago.',
        metadata: {
          chargeId: charge.id,
          companySubscriptionId: subscription.id,
          providerPreapprovalId: subscription.providerPreapprovalId,
          mpPaymentId: paymentId,
          mpStatus: provider.status,
        },
      });
    }

    if (status === 'approved' && paidAt) {
      await this.activateCompanyFromSubscription(subscription, paidAt, provider);
    } else if (status === 'failed' || status === 'cancelled') {
      const updatedSubscription = await this.prisma.companySubscription.update({
        where: { id: subscription.id },
        data: {
          status: 'past_due',
          lastProviderStatus: provider?.status ? String(provider.status) : status,
          providerPayloadJson: this.providerJson({ provider }),
        },
      });
      await this.startBillingGraceForSubscription({
        subscription: updatedSubscription,
        provider,
        charge,
        reasonCode: 'payment_rejected',
        sendInitialEmail: true,
        failureMessage: String(provider?.status_detail || provider?.status || status),
      });
    }

    return {
      updated: true,
      paymentId,
      status,
      companyId: subscription.companyId,
      subscription: this.serializeSubscription(subscription),
      charge: this.serializeCharge(charge),
    };
  }

  private async syncPreapprovalFromProvider(preapprovalId: string, context?: any) {
    let subscription = await this.prisma.companySubscription.findUnique({
      where: { providerPreapprovalId: preapprovalId },
    });

    let accessToken = '';
    if (subscription) {
      accessToken = (await this.resolveFinanceContext(subscription.companyId)).accessToken;
    } else {
      accessToken = await this.resolveWebhookMercadoPagoAccessToken();
    }

    const provider = await this.mercadoPagoClient.getPreapproval(accessToken, preapprovalId);
    if (!subscription) {
      const external = this.parseSubscriptionExternalReference(provider?.external_reference);
      if (external?.subscriptionId) {
        subscription = await this.prisma.companySubscription.findFirst({
          where: {
            id: external.subscriptionId,
            companyId: external.companyId || undefined,
          },
        });
      }
    }
    if (!subscription) return { updated: false, preapprovalId, reason: 'assinatura local nao encontrada.' };

    await this.prisma.companySubscription.update({
      where: { id: subscription.id },
      data: {
        providerPreapprovalId: provider?.id ? String(provider.id) : subscription.providerPreapprovalId,
        providerPreapprovalPlanId: provider?.preapproval_plan_id
          ? String(provider.preapproval_plan_id)
          : subscription.providerPreapprovalPlanId,
        status: this.normalizeProviderSubscriptionStatus(provider?.status),
        payerEmail: this.normalizePayerEmail(provider?.payer_email) || subscription.payerEmail,
        nextBillingAt: this.parseDate(provider?.next_payment_date) || subscription.nextBillingAt,
        lastProviderStatus: provider?.status ? String(provider.status) : subscription.lastProviderStatus,
        providerPayloadJson: this.providerJson({ context: context || null, provider }),
      },
    });

    await this.applySubscriptionProviderState(subscription, provider);
    return {
      updated: true,
      companyId: subscription.companyId,
      preapprovalId,
      status: this.normalizeProviderSubscriptionStatus(provider?.status),
    };
  }

  async getOverviewForUser(user: any) {
    const context = this.resolveUserContext(user);
    await ensureMasterBillingRuntimeSchema(this.prisma);
    const companyOverviewInclude = {
      companyModules: {
        include: { systemModule: true },
        orderBy: { systemModule: { name: 'asc' } },
      },
      users: {
        select: { id: true, isActive: true, isSystemMaster: true, deactivatedAt: true },
      },
      commercialEntitlements: true,
    } satisfies Prisma.CompanyInclude;

    let [company, ledgerRows, masterConfig, latestCharge, latestSubscription] = await Promise.all([
      this.prisma.company.findUnique({
        where: { id: context.companyId },
        include: companyOverviewInclude,
      }),
      this.listLedgerRows(context.companyId, 24),
      getMasterGlobalIntegrationConfig(this.prisma),
      this.prisma.financeiroCharge.findFirst({
        where: { companyId: context.companyId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.companySubscription.findFirst({
        where: { companyId: context.companyId, provider: this.subscriptionProviderWhere() },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    if (!company) throw new BadRequestException('Empresa nao encontrada.');

    // Projecao do estado unico (PR-002 C.4): checkout pendente e quem o
    // canonico diz — fim da re-derivacao de campos crus aqui.
    const companyPendingCheckout = resolveCompanyAccessState(company).pendingCheckout;
    const latestSubscriptionAuthorized =
      latestSubscription &&
      this.normalizeProviderSubscriptionStatus(latestSubscription.status || latestSubscription.lastProviderStatus) === 'authorized';
    const latestSubscriptionStatus = latestSubscription
      ? this.normalizeProviderSubscriptionStatus(latestSubscription.status || latestSubscription.lastProviderStatus)
      : null;
    if (companyPendingCheckout && latestSubscriptionAuthorized) {
      await this.activateCompanyFromSubscription(
        latestSubscription,
        latestSubscription.currentPeriodStart instanceof Date ? latestSubscription.currentPeriodStart : new Date(),
        { status: 'authorized' },
      );
      [company, latestSubscription] = await Promise.all([
        this.prisma.company.findUnique({
          where: { id: context.companyId },
          include: companyOverviewInclude,
        }),
        this.prisma.companySubscription.findFirst({
          where: { companyId: context.companyId, provider: this.subscriptionProviderWhere() },
          orderBy: { createdAt: 'desc' },
        }),
      ]);
      if (!company) throw new BadRequestException('Empresa nao encontrada.');
    } else if (
      companyPendingCheckout &&
      latestSubscription?.providerPreapprovalId &&
      ['pending', 'past_due', 'paused'].includes(String(latestSubscriptionStatus || ''))
    ) {
      await this.startBillingGraceForSubscription({
        subscription: latestSubscription,
        reasonCode: latestSubscriptionStatus === 'pending' ? 'provider_pending' : 'payment_rejected',
        sendInitialEmail: latestSubscriptionStatus !== 'pending',
        failureMessage: latestSubscriptionStatus === 'pending'
          ? null
          : 'Assinatura existente sem autorização de pagamento.',
      });
      [company, latestSubscription] = await Promise.all([
        this.prisma.company.findUnique({
          where: { id: context.companyId },
          include: companyOverviewInclude,
        }),
        this.prisma.companySubscription.findFirst({
          where: { companyId: context.companyId, provider: this.subscriptionProviderWhere() },
          orderBy: { createdAt: 'desc' },
        }),
      ]);
      if (!company) throw new BadRequestException('Empresa nao encontrada.');
    }

    const pricing = await this.buildPricing(company, masterConfig, ledgerRows);
    const activeModules = (company.companyModules || [])
      .filter((row: any) => row?.enabled && row?.systemModule?.companyAssignable)
      .map((row: any) => ({
        key: row.systemModule.key,
        name: row.systemModule.name,
        monthlyPrice: this.normalizeCurrencyAmount(row.systemModule.monthlyPrice || 0),
      }));
    const lastPayment =
      ledgerRows.find((row) => String(row.status || '').toUpperCase() === 'APPROVED') || null;
    const lastFailure =
      ledgerRows.find((row) => ['FAILED', 'CANCELLED'].includes(String(row.status || '').toUpperCase())) || null;

    const canManageBilling = context.canManageBilling;
    const visiblePricing = canManageBilling ? pricing : this.maskPricingForUser(pricing);
    const graceEndsAt = this.parseBillingGraceDate(company.billingGraceEndsAt);
    const graceActive = this.isBillingGraceActive(company);
    // Projecao do estado unico (PR-002 C.4): a tela financeira do contratante
    // le ESTE bloco; os campos crus continuam no payload apenas como espelho
    // de transicao ate o DROP da fase A.4.
    const access = resolveCompanyAccessState(company);

    return {
      generatedAt: new Date().toISOString(),
      permissions: {
        canManageBilling,
        canStartCheckout: canManageBilling,
        deniedMessage: canManageBilling
          ? null
          : 'Seu usuário não pode alterar cobrança. Contate seu ADMIN ou o suporte da empresa.',
      },
      company: {
        id: company.id,
        name: company.name,
        access: {
          state: access.state,
          statusLabel: access.statusLabel,
          riskLevel: access.riskLevel,
          released: access.canUse && access.state !== 'platform_infra',
          pendingCheckout: access.pendingCheckout,
          detailCode: access.detailCode,
        },
        paymentMethod: company.paymentMethod,
        billingCycle: pricing.billingCycle,
        billingProvider: company.billingProvider,
        selectedPlanKey: company.selectedPlanKey || pricing.commercialPlan?.planKey || null,
        trialStartsAt: company.trialStartsAt instanceof Date ? company.trialStartsAt.toISOString() : null,
        trialEndsAt: company.trialEndsAt instanceof Date ? company.trialEndsAt.toISOString() : null,
        trialRemainingDays: this.computeTrialRemainingDays(company.trialEndsAt),
        billingGraceStartedAt:
          company.billingGraceStartedAt instanceof Date ? company.billingGraceStartedAt.toISOString() : null,
        billingGraceEndsAt: graceEndsAt ? graceEndsAt.toISOString() : null,
        billingGraceRemainingHours: graceActive && graceEndsAt
          ? Math.max(0, Math.ceil((graceEndsAt.getTime() - Date.now()) / (60 * 60 * 1000)))
          : null,
        billingGraceReason: canManageBilling ? this.normalizeOptionalString(company.billingGraceReason) : null,
        billingGraceEmailStage: canManageBilling ? Number(company.billingGraceEmailStage || 0) : null,
        isActive: Boolean(company.isActive),
        acquisitionSource: this.normalizeOptionalString(company.acquisitionSource),
        acquisitionSourceDetail: this.normalizeOptionalString(company.acquisitionSourceDetail),
        referralReferrerName: this.normalizeOptionalString(company.referralReferrerName),
        referralCode: this.normalizeOptionalString(company.referralCode),
        contactEmail: canManageBilling ? this.normalizeOptionalString(company.contactEmail) : null,
        primaryContactName: canManageBilling ? this.normalizeOptionalString(company.primaryContactName) : null,
        contactPhone: canManageBilling ? this.normalizeOptionalString(company.contactPhone) : null,
        taxDocument: canManageBilling ? this.normalizeOptionalString(company.taxDocument) : null,
      },
      modules: activeModules,
      pricing: visiblePricing,
      paymentOptions: {
        selectedMethod: canManageBilling ? this.normalizePaymentMethod(company.paymentMethod) : 'NONE',
        card: {
          configured: canManageBilling ? Boolean(pricing.cardConfigured || latestSubscription?.cardLast4) : false,
          brand: canManageBilling ? company.billingCardBrand || latestSubscription?.cardBrand || null : null,
          last4: canManageBilling ? company.billingCardLast4 || latestSubscription?.cardLast4 || null : null,
          holderName: null,
          expMonth: null,
          expYear: null,
          updatedAt: canManageBilling && company.billingCardUpdatedAt instanceof Date ? company.billingCardUpdatedAt.toISOString() : null,
        },
        pix: {
          available: canManageBilling,
          preferred: canManageBilling && this.normalizePaymentMethod(company.paymentMethod) === 'PIX',
        },
      },
      subscription: this.serializeSubscription(latestSubscription, canManageBilling),
      accountStatus: {
        // Label projetado do estado canonico (sem re-derivar campos crus).
        label:
          access.state === 'grace'
            ? 'Acesso em tolerancia'
            : access.state === 'trial' || access.state === 'trial_ending'
            ? 'Conta em free trial'
            : access.state === 'paying'
              ? 'Conta paga e ativa'
              : access.state === 'manual' || access.state === 'exempt'
                ? 'Cortesia ativa'
                : access.state === 'overdue'
                  ? 'Conta com pendencia'
                  : access.state === 'pending_checkout'
                    ? 'Checkout pendente'
                    : access.state === 'suspended'
                      ? 'Conta suspensa'
                      : 'Conta em acompanhamento',
        nextDueAt:
          company.subscriptionCurrentPeriodEnd instanceof Date
            ? company.subscriptionCurrentPeriodEnd.toISOString()
            : company.trialEndsAt instanceof Date
              ? company.trialEndsAt.toISOString()
              : null,
        lastPayment: canManageBilling && lastPayment ? this.normalizeLedgerEntry(lastPayment) : null,
        lastFailure: canManageBilling && lastFailure ? this.normalizeLedgerEntry(lastFailure) : null,
      },
      latestCharge: canManageBilling ? this.serializeCharge(latestCharge) : null,
      history: canManageBilling ? ledgerRows.map((row) => this.normalizeLedgerEntry(row)) : [],
    };
  }

  async updatePreferencesForUser(
    user: any,
    dto: { paymentMethod?: string; billingCycle?: string },
  ) {
    const context = this.resolveUserContext(user);
    this.assertCanManageBilling(context);
    await ensureMasterBillingRuntimeSchema(this.prisma);
    await this.prisma.company.update({
      where: { id: context.companyId },
      data: {
        paymentMethod:
          dto?.paymentMethod !== undefined
            ? this.normalizePaymentMethod(dto.paymentMethod)
            : undefined,
        billingCycle:
          dto?.billingCycle !== undefined
            ? this.normalizeBillingCycle(dto.billingCycle)
            : undefined,
      },
    });
    return this.getOverviewForUser(user);
  }

  async saveCardForUser(
    user: any,
    dto: {
      cardTokenId?: string;
    },
  ) {
    const context = this.resolveUserContext(user);
    this.assertCanManageBilling(context);
    if (this.normalizeCardToken(dto?.cardTokenId)) {
      throw new BadRequestException('Use /financeiro/subscription/create ou /financeiro/subscription/change-card com token Mercado Pago.');
    }
    throw new BadRequestException('O HBX nao salva cartao manualmente. Use tokenizacao segura do Mercado Pago.');
  }

  async removeCardForUser(user: any) {
    const context = this.resolveUserContext(user);
    this.assertCanManageBilling(context);
    await ensureMasterBillingRuntimeSchema(this.prisma);
    const company = await this.prisma.company.findUnique({ where: { id: context.companyId } });
    if (!company) throw new BadRequestException('Empresa nao encontrada.');

    await this.prisma.company.update({
      where: { id: context.companyId },
      data: {
        paymentMethod: this.normalizePaymentMethod(company.paymentMethod) === 'CARD' ? 'NONE' : company.paymentMethod,
        billingCardBrand: null,
        billingCardLast4: null,
        billingCardHolderName: null,
        billingCardExpMonth: null,
        billingCardExpYear: null,
        billingCardUpdatedAt: null,
      },
    });

    return this.getOverviewForUser(user);
  }

  // Config que o front precisa pra renderizar o cartão da assinatura (Sprint 4
  // PR14062026012): modo (mock em dev / live) + chave PÚBLICA do Mercado Pago
  // (NUNCA o access token — esse é secreto e fica só no backend). Em mock, o front
  // assina sem SDK; em live, renderiza o Card Brick com a publicKey.
  getPaymentsConfigForUser(user: any) {
    const context = this.resolveUserContext(user);
    this.assertCanManageBilling(context);
    return {
      mode: this.isMockPaymentsProvider() ? 'mock' : 'live',
      publicKey: String(process.env.MERCADO_PAGO_PUBLIC_KEY || '').trim() || null,
    };
  }

  async createCheckoutForUser(user: any, dto: {
    paymentMethod?: string;
    planKey?: string;
    billingCycle?: string;
    contactPhone?: string;
    contactName?: string;
    taxDocument?: string;
    acceptedTerms?: boolean;
  }) {
    const context = this.resolveUserContext(user);
    this.assertCanManageBilling(context);
    const paymentMethod = this.normalizePaymentMethod(dto?.paymentMethod);
    if (!['PIX', 'CARD', 'BOLETO'].includes(paymentMethod)) {
      throw new BadRequestException('Metodo de pagamento invalido para checkout.');
    }

    const company = await this.prisma.company.findUnique({
      where: { id: context.companyId },
      include: {
        companyModules: {
          include: { systemModule: true },
        },
        users: {
          select: { id: true, isActive: true, isSystemMaster: true, deactivatedAt: true },
        },
        commercialEntitlements: true,
      },
    });
    if (!company) throw new BadRequestException('Empresa nao encontrada.');
    const masterConfig = await getMasterGlobalIntegrationConfig(this.prisma);
    const selectedPlanKey = this.normalizeCommercialPlanKey(dto?.planKey || company.selectedPlanKey);
    if (selectedPlanKey === COMMERCIAL_PLAN_KEYS.MELHOR) {
      throw new BadRequestException({
        code: 'ASSISTED_SETUP_REQUIRED',
        message: 'HBX Full exige implantação assistida. Fale com a HBX para configurar bot, automação e atendimento completo.',
      });
    }
    const requestedBillingCycle =
      dto?.billingCycle !== undefined
        ? this.normalizeBillingCycle(dto.billingCycle)
        : this.normalizeBillingCycle(company.billingCycle);
    const pricingCompany = {
      ...company,
      selectedPlanKey,
      billingCycle: requestedBillingCycle,
    };
    const pricing = await this.buildPricing(pricingCompany, masterConfig, []);

    if (pricing.freeMonths > 0) {
      const complimentary = await this.settleComplimentaryCycle(context.companyId, context.userId);
      return {
        ok: true,
        complimentary: true,
        charge: this.serializeCharge(complimentary),
        overview: await this.getOverviewForUser(user),
      };
    }

    const amount = this.normalizeCurrencyAmount(pricing.finalCycleAmount);
    if (amount <= 0) {
      throw new BadRequestException('Nao ha valor disponivel para cobranca neste ciclo.');
    }

    const paymentProfile = this.resolvePaymentContactProfile(dto || {}, {
      contactName: company.primaryContactName || company.name,
      contactPhone: company.contactPhone,
      taxDocument: company.taxDocument,
      allowExistingWithoutTerms: true,
    });
    const companyWithPaymentProfile = {
      ...company,
      primaryContactName: paymentProfile?.contactName || company.primaryContactName,
      contactPhone: paymentProfile?.contactPhone || company.contactPhone,
      taxDocument: paymentProfile?.taxDocument || company.taxDocument,
    };
    const reusable = await this.findReusableCharge(context.companyId, paymentMethod, {
      billingCycle: pricing.billingCycle,
      amount,
    });
    if (reusable) {
      await this.prisma.company.update({
        where: { id: context.companyId },
        data: {
          selectedPlanKey,
          billingCycle: requestedBillingCycle,
          ...(paymentProfile ? this.companyContactUpdateFromPaymentProfile(paymentProfile) : {}),
        },
      });
      return {
        ok: true,
        reused: true,
        charge: this.serializeCharge(reusable),
        overview: await this.getOverviewForUser(user),
      };
    }

    const payerEmail =
      this.normalizeOptionalString(company.contactEmail) ||
      this.normalizeOptionalString(user?.email) ||
      `financeiro+${company.id}@hbx.local`;
    const description = this.resolveChargeDescription(company, pricing);
    const competence = this.monthKey();
    const notificationUrl = this.buildNotificationUrl(context.companyId);
    const externalReference = `hbx-fin-${context.companyId}-${Date.now()}`;

    const baseCharge = await this.prisma.financeiroCharge.create({
      data: {
        companyId: context.companyId,
        amount,
        description,
        billingCycle: pricing.billingCycle,
        paymentMethod,
        status: 'pending',
        lifecycle: 'in_progress',
        competence,
        externalReference,
        notificationUrl,
        createdByUserId: context.userId,
      },
    });
    await this.prisma.company.update({
      where: { id: context.companyId },
      data: {
        selectedPlanKey,
        billingCycle: requestedBillingCycle,
        ...(paymentProfile ? this.companyContactUpdateFromPaymentProfile(paymentProfile) : {}),
      },
    });

    if (this.isMockPaymentsProvider()) {
      return this.settleMockCheckoutCharge({
        user,
        context,
        charge: baseCharge,
        company,
        pricing,
        selectedPlanKey,
        requestedBillingCycle,
        paymentMethod,
        amount,
        competence,
        externalReference,
        paymentProfile,
        companyWithPaymentProfile,
      });
    }

    const { accessToken } = await this.resolveFinanceContext(context.companyId);

    try {
      if (paymentMethod === 'PIX') {
        const provider = await this.mercadoPagoClient.createPayment(
          accessToken,
          {
            transaction_amount: amount,
            description,
            payment_method_id: 'pix',
            notification_url: notificationUrl,
            external_reference: externalReference,
            metadata: {
              company_id: context.companyId,
              financeiro_charge_id: baseCharge.id,
              plan_key: selectedPlanKey,
              billing_cycle: requestedBillingCycle,
            },
            payer: {
              email: payerEmail,
            },
          },
          randomUUID(),
        );

        const ledgerEntryId = await this.insertBillingLedgerEntry({
          companyId: context.companyId,
          createdByUserId: context.userId,
          entryType: 'PIX_CHECKOUT',
          entryGroup: 'revenue',
          status: 'PENDING',
          origin: 'financeiro_pix',
          competence,
          amount,
          paymentMethod: 'PIX',
          referenceLabel: this.resolveChargeReferenceLabel(companyWithPaymentProfile, pricing),
          observation: 'Cobranca PIX criada pelo autoatendimento do cliente.',
          metadata: {
            chargeId: baseCharge.id,
            externalReference,
            planKey: selectedPlanKey,
            billingCycle: requestedBillingCycle,
            seatBilling: this.pricingSeatBillingMetadata(pricing),
            ...(paymentProfile ? {
              contactName: paymentProfile.contactName,
              taxDocumentProvided: Boolean(paymentProfile.taxDocument),
              acceptedTerms: true,
            } : {}),
          },
        });

        const updated = await this.prisma.financeiroCharge.update({
          where: { id: baseCharge.id },
          data: {
            mpPaymentId: provider?.id !== undefined && provider?.id !== null ? String(provider.id) : null,
            ledgerEntryId,
            pixQrCode: provider?.point_of_interaction?.transaction_data?.qr_code || null,
            pixQrCodeBase64: provider?.point_of_interaction?.transaction_data?.qr_code_base64 || null,
            pixTicketUrl: provider?.point_of_interaction?.transaction_data?.ticket_url || null,
            providerPayload: this.providerJson({ provider }),
          },
        });

        return {
          ok: true,
          charge: this.serializeCharge(updated),
          overview: await this.getOverviewForUser(user),
        };
      }

      const isBoletoCheckout = paymentMethod === 'BOLETO';
      const returnUrl = this.buildCheckoutReturnUrl(baseCharge.id);
      const preference = await this.mercadoPagoClient.createPreference(
        accessToken,
        {
          external_reference: externalReference,
          notification_url: notificationUrl,
          back_urls: {
            success: returnUrl,
            failure: returnUrl,
            pending: returnUrl,
          },
          auto_return: 'approved',
          payment_methods: {
            excluded_payment_types: isBoletoCheckout
              ? [{ id: 'credit_card' }, { id: 'debit_card' }, { id: 'bank_transfer' }, { id: 'atm' }]
              : [{ id: 'ticket' }, { id: 'atm' }, { id: 'bank_transfer' }],
            installments: 1,
          },
          metadata: {
            company_id: context.companyId,
            financeiro_charge_id: baseCharge.id,
            plan_key: selectedPlanKey,
            billing_cycle: requestedBillingCycle,
          },
          payer: {
            email: payerEmail,
          },
          items: [
            {
              id: baseCharge.id,
              title: description,
              description,
              quantity: 1,
              unit_price: amount,
              currency_id: 'BRL',
            },
          ],
          expires: true,
          date_of_expiration: this.addDays(new Date(), 3).toISOString(),
        },
        randomUUID(),
      );

      const paymentUrl = String(preference?.init_point || preference?.sandbox_init_point || '').trim();
      if (!paymentUrl) throw new Error('Mercado Pago nao retornou checkout URL.');

      const ledgerEntryId = await this.insertBillingLedgerEntry({
        companyId: context.companyId,
        createdByUserId: context.userId,
        entryType: isBoletoCheckout ? 'BOLETO_CHECKOUT' : 'CARD_CHECKOUT',
        entryGroup: 'revenue',
        status: 'PENDING',
        origin: isBoletoCheckout ? 'financeiro_boleto' : 'financeiro_card',
        competence,
        amount,
        paymentMethod,
        referenceLabel: this.resolveChargeReferenceLabel(companyWithPaymentProfile, pricing),
        observation: isBoletoCheckout
          ? 'Checkout de boleto criado pelo autoatendimento do cliente.'
          : 'Checkout de cartao criado pelo autoatendimento do cliente.',
        metadata: {
          chargeId: baseCharge.id,
          externalReference,
          planKey: selectedPlanKey,
          billingCycle: requestedBillingCycle,
          seatBilling: this.pricingSeatBillingMetadata(pricing),
          ...(paymentProfile ? {
            contactName: paymentProfile.contactName,
            taxDocumentProvided: Boolean(paymentProfile.taxDocument),
            acceptedTerms: true,
          } : {}),
        },
      });

      const updated = await this.prisma.financeiroCharge.update({
        where: { id: baseCharge.id },
        data: {
          mpPreferenceId: preference?.id ? String(preference.id) : null,
          paymentUrl,
          ledgerEntryId,
          providerPayload: this.json({ preference }),
        },
      });

      return {
        ok: true,
        charge: this.serializeCharge(updated),
        overview: await this.getOverviewForUser(user),
      };
    } catch (error: any) {
      await this.prisma.financeiroCharge.update({
        where: { id: baseCharge.id },
        data: {
          status: 'failed',
          lifecycle: 'cancelled',
          providerPayload: this.json({ error: String(error?.message || 'Falha ao gerar cobranca') }),
        },
      });
      throw new BadRequestException(`Falha ao gerar cobranca: ${String(error?.message || 'erro desconhecido')}`);
    }
  }

  async createSubscriptionForUser(
    user: any,
    dto: {
      planKey?: string;
      billingCycle?: string;
      cardTokenId?: string;
      contactPhone?: string;
      contactName?: string;
      taxDocument?: string;
      acceptedTerms?: boolean;
      payerEmail?: string;
      paymentMethodId?: string;
      issuerId?: string;
    },
  ) {
    const context = this.resolveUserContext(user);
    this.assertCanManageBilling(context);
    await ensureMasterBillingRuntimeSchema(this.prisma);

    const cardTokenId = this.normalizeCardToken(dto?.cardTokenId);
    if (!cardTokenId) throw new BadRequestException('Token do cartão Mercado Pago ausente ou inválido.');
    const financeContext = this.isMockPaymentsProvider()
      ? {
          company: await this.prisma.company.findUnique({ where: { id: context.companyId } }),
          accessToken: '',
        }
      : await this.resolveFinanceContext(context.companyId);
    const { company, accessToken } = financeContext;
    if (!company) throw new BadRequestException('Empresa nao encontrada.');
    const paymentProfile = this.resolvePaymentContactProfile(dto || {}, {
      contactName: company.primaryContactName || company.name,
      contactPhone: company.contactPhone,
      taxDocument: company.taxDocument,
      allowExistingWithoutTerms: true,
    });
    const billingContactPhone = paymentProfile?.contactPhone || this.normalizeContactPhone(dto?.contactPhone) || this.normalizeContactPhone(company.contactPhone);
    const companyContactData = paymentProfile ? this.companyContactUpdateFromPaymentProfile(paymentProfile) : null;
    const plan = this.buildCommercialPlanProviderSnapshot(dto?.planKey || company.selectedPlanKey, dto?.billingCycle || 'ANNUAL');
    if (plan.planKey === COMMERCIAL_PLAN_KEYS.MELHOR) {
      throw new BadRequestException({
        code: 'ASSISTED_SETUP_REQUIRED',
        message: 'HBX Full exige implantação assistida. Fale com a HBX para configurar bot, automação e atendimento completo.',
      });
    }
    const payerEmail =
      this.normalizePayerEmail(dto?.payerEmail) ||
      this.normalizePayerEmail(company.contactEmail) ||
      this.normalizePayerEmail(user?.email);
    if (!payerEmail) throw new BadRequestException('Informe um e-mail válido para a assinatura.');

    if (companyContactData) {
      await this.prisma.company.update({
        where: { id: context.companyId },
        data: companyContactData,
      });
    }

    // F4/F7 (19/06): anti-abuso de trial RELIGADO no nascimento do trial.
    // Telefone e CPF saíram do cadastro e chegam AQUI (checkout) — um telefone/
    // CPF não reusa o trial grátis. Fonte única em commercial-plans/trial-usage.
    // Só p/ planos COM trial; mesma empresa = idempotente (retry ok); reuso
    // cross-empresa viva → 409 (TRIAL_PHONE/TAX_DOCUMENT_ALREADY_USED). Roda
    // ANTES do provider (mock e live) pra falhar cedo, sem deixar assinatura órfã.
    const planHasTrialWindow = Math.max(0, Math.trunc(Number(plan.trialDays) || 0)) > 0;
    if (planHasTrialWindow && paymentProfile?.contactPhone) {
      await reserveTrialUsageTx(this.prisma, {
        companyId: context.companyId,
        phoneNormalized: paymentProfile.contactPhone,
        taxDocumentNormalized: paymentProfile.taxDocument || null,
        contactName: paymentProfile.contactName,
        selectedPlanKey: plan.planKey,
        selectedByUserId: context.userId,
        source: 'checkout_trial',
        mode: 'activate',
        firstTrialStartsAt: new Date(),
      });
    }

    if (this.isMockPaymentsProvider()) {
      return this.createMockSubscriptionForUser({
        user,
        context,
        company,
        plan,
        payerEmail,
        billingContactPhone,
        companyContactData,
      });
    }

    const existing = await this.findCurrentCompanySubscription(context.companyId);
    if (existing?.providerPreapprovalId && !['canceled', 'blocked'].includes(String(existing.status || '').toLowerCase())) {
      // Cartao NOVO numa assinatura travada (pending/past_due/paused): atualiza o
      // cartao NA preapproval antes de re-sincronizar, pra liberar o acesso com o
      // cartao novo (dunning "trocar cartao libera"). NAO recria a assinatura —
      // evita re-conceder trial / preapproval orfa. Saudavel (authorized) OU sem
      // token novo = so re-sincroniza, como antes.
      if (cardTokenId && this.normalizeProviderSubscriptionStatus(existing.status) !== 'authorized') {
        try {
          await this.mercadoPagoClient.changePreapprovalCard(accessToken, existing.providerPreapprovalId, cardTokenId);
        } catch (error: any) {
          this.logger.warn(`subscription_change_card_on_reuse_failed company=${context.companyId} error=${String(error?.message || error)}`);
        }
      }
      try {
        await this.syncPreapprovalFromProvider(existing.providerPreapprovalId, {
          source: 'subscription_create_reuse',
          companyId: context.companyId,
        });
      } catch {
        if (this.normalizeProviderSubscriptionStatus(existing.status) === 'authorized') {
          await this.activateCompanyFromSubscription(
            existing,
            existing.currentPeriodStart instanceof Date ? existing.currentPeriodStart : new Date(),
            { status: 'authorized' },
          );
        }
      }
      const refreshed = await this.findCurrentCompanySubscription(context.companyId);
      const refreshedStatus = this.normalizeProviderSubscriptionStatus(refreshed?.status || refreshed?.lastProviderStatus || existing.status);
      if (refreshed && (refreshedStatus === 'past_due' || refreshedStatus === 'paused')) {
        const grace = await this.startBillingGraceForSubscription({
          subscription: refreshed,
          reasonCode: 'payment_rejected',
          sendInitialEmail: true,
          failureMessage: 'Assinatura existente sem autorização de pagamento.',
          companyContactData,
        });
        return {
          ok: false,
          grace: true,
          message: 'O Mercado Pago não autorizou a cobrança. O acesso fica liberado por 48 horas para normalização.',
          status: 'past_due',
          providerPreapprovalId: refreshed.providerPreapprovalId,
          billingGrace: grace,
          subscription: this.serializeSubscription(refreshed),
          overview: await this.getOverviewForUser(user),
        };
      }
      if (refreshed && refreshedStatus === 'pending') {
        const grace = await this.startBillingGraceForSubscription({
          subscription: refreshed,
          reasonCode: 'provider_pending',
          sendInitialEmail: false,
          companyContactData,
        });
        return {
          ok: true,
          grace: true,
          message: 'A assinatura ainda está em processamento. O acesso fica liberado por 48 horas.',
          status: 'pending',
          providerPreapprovalId: refreshed.providerPreapprovalId,
          billingGrace: grace,
          subscription: this.serializeSubscription(refreshed),
          overview: await this.getOverviewForUser(user),
        };
      }
      return {
        ok: true,
        reused: true,
        status: refreshed?.status || existing.status,
        providerPreapprovalId: refreshed?.providerPreapprovalId || existing.providerPreapprovalId,
        subscription: this.serializeSubscription(refreshed || existing),
        overview: await this.getOverviewForUser(user),
      };
    }

    const providerPlan = await this.ensureMercadoPagoPreapprovalPlan(accessToken, plan.planKey, plan.billingCycle);
    const subscription = existing && !existing.providerPreapprovalId
      ? await this.prisma.companySubscription.update({
          where: { id: existing.id },
          data: {
            providerPreapprovalPlanId: providerPlan.providerPlanId,
            planKey: plan.planKey,
            billingCycle: plan.billingCycle,
            status: 'pending',
            payerEmail,
            billingContactPhone: billingContactPhone || undefined,
            createdByUserId: context.userId,
            providerPayloadJson: null,
          },
        })
      : await this.prisma.companySubscription.create({
          data: {
            companyId: context.companyId,
            provider: 'mercadopago',
            providerPreapprovalPlanId: providerPlan.providerPlanId,
            planKey: plan.planKey,
            billingCycle: plan.billingCycle,
            status: 'pending',
            payerEmail,
            billingContactPhone: billingContactPhone || undefined,
            createdByUserId: context.userId,
          },
        });

    const externalReference = `hbx-sub-${context.companyId}-${subscription.id}`;

    try {
      const provider = await this.mercadoPagoClient.createPreapproval(
        accessToken,
        {
          preapproval_plan_id: providerPlan.providerPlanId,
          reason: plan.reason,
          external_reference: externalReference,
          payer_email: payerEmail,
          card_token_id: cardTokenId,
          auto_recurring: {
            frequency: plan.frequency,
            frequency_type: plan.frequencyType,
            transaction_amount: plan.amount,
            currency_id: plan.currency,
          },
          back_url: this.buildSubscriptionBackUrl(),
          status: 'authorized',
        },
        randomUUID(),
      );

      const providerPreapprovalId = String(provider?.id || '').trim();
      if (!providerPreapprovalId) throw new Error('Mercado Pago nao retornou preapproval_id.');
      const providerStatus = this.normalizeProviderSubscriptionStatus(provider?.status || 'authorized');
      const nextBillingAt = this.parseDate(provider?.next_payment_date) || null;

      const updated = await this.prisma.companySubscription.update({
        where: { id: subscription.id },
        data: {
          providerPreapprovalId,
          providerPreapprovalPlanId: provider?.preapproval_plan_id
            ? String(provider.preapproval_plan_id)
            : providerPlan.providerPlanId,
          status: providerStatus,
          payerEmail: this.normalizePayerEmail(provider?.payer_email) || payerEmail,
          billingContactPhone: billingContactPhone || undefined,
          nextBillingAt,
          lastProviderStatus: provider?.status ? String(provider.status) : providerStatus,
          providerPayloadJson: this.providerJson({ provider }),
        },
      });

      if (providerStatus === 'authorized') {
        if (plan.trialDays > 0) {
          // Plano B em live: o free_trial autorizou o cartão, mas a 1ª cobrança é só
          // no fim do trial — a empresa SEGUE 'trial' (não vira 'active'/paga), com o
          // cartão na ficha pra cobrar quando o período gratuito vencer.
          const liveNow = new Date();
          const liveTrialEnd =
            this.parseDate(provider?.next_payment_date) ||
            (company.trialEndsAt instanceof Date ? company.trialEndsAt : this.parseDate(company.trialEndsAt)) ||
            new Date(liveNow.getTime() + plan.trialDays * 86400000);
          const liveCard = this.subscriptionCardSnapshot(provider, updated);
          await this.prisma.companySubscription.update({
            where: { id: updated.id },
            data: {
              status: 'trialing',
              currentPeriodStart: liveNow,
              currentPeriodEnd: liveTrialEnd,
              nextBillingAt: liveTrialEnd,
            },
          });
          await this.prisma.company.update({
            where: { id: context.companyId },
            data: {
              status: 'trial',
              isActive: true,
              trialEndsAt: liveTrialEnd,
              subscriptionCurrentPeriodStart: liveNow,
              subscriptionCurrentPeriodEnd: liveTrialEnd,
              billingProvider: 'mercadopago',
              paymentMethod: 'CARD',
              billingCardBrand: liveCard.brand || undefined,
              billingCardLast4: liveCard.last4 || undefined,
              billingCardUpdatedAt: liveNow,
              ...(companyContactData || {}),
            },
          });
        } else {
          await this.activateCompanyFromSubscription(updated, new Date(), provider);
        }
      } else {
        const grace = await this.startBillingGraceForSubscription({
          subscription: updated,
          provider,
          planKey: plan.planKey,
          billingCycle: plan.billingCycle,
          reasonCode: providerStatus === 'pending' ? 'provider_pending' : 'provider_past_due',
          sendInitialEmail: providerStatus !== 'pending',
          companyContactData,
        });
        return {
          ok: providerStatus === 'pending',
          grace: true,
          message:
            providerStatus === 'pending'
              ? 'A assinatura ainda está em processamento. O acesso fica liberado por 48 horas.'
              : 'O Mercado Pago não autorizou a cobrança. O acesso fica liberado por 48 horas para normalização.',
          status: updated.status,
          providerPreapprovalId,
          billingGrace: grace,
          subscription: this.serializeSubscription(updated),
          overview: await this.getOverviewForUser(user),
        };
      }

      return {
        ok: true,
        status: updated.status,
        providerPreapprovalId,
        subscription: this.serializeSubscription(updated),
        overview: await this.getOverviewForUser(user),
      };
    } catch (error: any) {
      await this.prisma.companySubscription.update({
        where: { id: subscription.id },
        data: {
          status: 'pending',
          providerPayloadJson: this.json({ error: String(error?.message || 'Falha ao criar assinatura') }),
        },
      });
      if (this.isPaymentAuthorizationFailure(error)) {
        const updated = await this.prisma.companySubscription.update({
          where: { id: subscription.id },
          data: {
            status: 'past_due',
            lastProviderStatus: 'payment_rejected',
            providerPayloadJson: this.providerJson({ error: this.paymentAuthorizationFailureText(error) }),
          },
        });
        const grace = await this.startBillingGraceForSubscription({
          subscription: updated,
          provider: { status: 'rejected', error: this.paymentAuthorizationFailureText(error) },
          planKey: plan.planKey,
          billingCycle: plan.billingCycle,
          reasonCode: 'payment_rejected',
          sendInitialEmail: true,
          failureMessage: this.paymentAuthorizationFailureText(error),
          companyContactData,
        });
        return {
          ok: false,
          grace: true,
          message: 'O Mercado Pago não autorizou a cobrança. O acesso fica liberado por 48 horas para normalização.',
          status: 'past_due',
          billingGrace: grace,
          subscription: this.serializeSubscription(updated),
          overview: await this.getOverviewForUser(user),
        };
      }
      throw new BadRequestException(`Falha ao criar assinatura: ${String(error?.message || 'erro desconhecido')}`);
    }
  }

  async cancelSubscriptionForUser(user: any) {
    const context = this.resolveUserContext(user);
    this.assertCanManageBilling(context);
    const subscription = await this.findCurrentCompanySubscription(context.companyId);
    if (!subscription?.providerPreapprovalId) throw new NotFoundException('Assinatura Mercado Pago nao encontrada.');

    try {
      if (this.isMockPaymentsProvider() && String(subscription.provider || '').toLowerCase() === 'mock') {
        await this.applySubscriptionProviderState(subscription, { status: 'canceled' });
        await this.prisma.company.update({
          where: { id: context.companyId },
          data: { billingProvider: 'mock' },
        });
        return {
          ok: true,
          mock: true,
          subscription: await this.getSubscriptionStatusForUser(user),
        };
      }
      const { accessToken } = await this.resolveFinanceContext(context.companyId);
      const provider = await this.mercadoPagoClient.cancelPreapproval(accessToken, subscription.providerPreapprovalId);
      await this.applySubscriptionProviderState(subscription, {
        ...provider,
        status: provider?.status || 'canceled',
      });
      return {
        ok: true,
        subscription: await this.getSubscriptionStatusForUser(user),
      };
    } catch (error: any) {
      throw new BadRequestException(
        `Não conseguimos cancelar a assinatura no provedor. Tente novamente ou fale com suporte. ${String(error?.message || '').trim()}`,
      );
    }
  }

  async changeSubscriptionCardForUser(user: any, dto: {
    cardTokenId?: string;
    contactName?: string;
    contactPhone?: string;
    taxDocument?: string;
    acceptedTerms?: boolean;
  }) {
    const context = this.resolveUserContext(user);
    this.assertCanManageBilling(context);
    const cardTokenId = this.normalizeCardToken(dto?.cardTokenId);
    if (!cardTokenId) throw new BadRequestException('Token do cartão Mercado Pago ausente ou inválido.');

    const subscription = await this.findCurrentCompanySubscription(context.companyId);
    if (!subscription?.providerPreapprovalId) throw new NotFoundException('Assinatura Mercado Pago nao encontrada.');

    try {
      if (this.isMockPaymentsProvider() && String(subscription.provider || '').toLowerCase() === 'mock') {
        const now = new Date();
        await this.prisma.companySubscription.update({
          where: { id: subscription.id },
          data: {
            cardBrand: 'Mock',
            cardLast4: '4242',
            lastProviderStatus: 'authorized',
            providerPayloadJson: this.providerJson({ source: 'mock_provider', action: 'change_card' }),
          },
        });
        await this.prisma.company.update({
          where: { id: context.companyId },
          data: {
            billingProvider: 'mock',
            billingCardBrand: 'Mock',
            billingCardLast4: '4242',
            billingCardUpdatedAt: now,
          },
        });
        return {
          ok: true,
          mock: true,
          subscription: await this.getSubscriptionStatusForUser(user),
        };
      }
      const { company, accessToken } = await this.resolveFinanceContext(context.companyId);
      const paymentProfile = this.resolvePaymentContactProfile(dto || {}, {
        contactName: company.primaryContactName || company.name,
        contactPhone: company.contactPhone,
        taxDocument: company.taxDocument,
        allowExistingWithoutTerms: true,
      });
      const companyContactData = paymentProfile ? this.companyContactUpdateFromPaymentProfile(paymentProfile) : null;
      if (companyContactData) {
        await this.prisma.company.update({
          where: { id: context.companyId },
          data: companyContactData,
        });
      }
      const provider = await this.mercadoPagoClient.changePreapprovalCard(
        accessToken,
        subscription.providerPreapprovalId,
        cardTokenId,
      );
      await this.prisma.companySubscription.update({
        where: { id: subscription.id },
        data: {
          lastProviderStatus: provider?.status ? String(provider.status) : subscription.lastProviderStatus,
          providerPayloadJson: this.providerJson({ provider }),
        },
      });
      return {
        ok: true,
        subscription: await this.getSubscriptionStatusForUser(user),
      };
    } catch (error: any) {
      throw new BadRequestException(`Falha ao trocar cartão no Mercado Pago: ${String(error?.message || 'erro desconhecido')}`);
    }
  }

  // Troca de plano de uma assinatura ATIVA (B6 — PR17062026043). Upgrade cobra a
  // diferença proporcional aos dias restantes e libera na hora; downgrade NÃO cobra,
  // mantém o acesso até o fim do período já pago e gera crédito proporcional. A regra
  // de direção é o RANK do catálogo (igual ao front), nunca o preço. Cálculo puro em
  // commercial-plans/plan-proration.util (testado). dryRun=true só devolve o preview.
  //
  // LIVE Mercado Pago: o ajuste do valor recorrente (updatePreapproval) e a cobrança
  // avulsa da diferença (createPayment) ficam ligados mas precisam de validação com
  // credenciais de teste na VPS — não dá pra provar live aqui. O consumo do crédito na
  // próxima fatura é ato do master (MP não abate parcial de cobrança recorrente fixa).
  async changePlanForUser(
    user: any,
    dto: {
      planKey?: string;
      billingCycle?: string;
      cardTokenId?: string;
      recurringCardTokenId?: string;
      paymentMethodId?: string;
      taxDocument?: string;
      dryRun?: boolean;
    },
  ) {
    const context = this.resolveUserContext(user);
    this.assertCanManageBilling(context);
    await ensureMasterBillingRuntimeSchema(this.prisma);

    const company = await this.prisma.company.findUnique({ where: { id: context.companyId } });
    if (!company) throw new BadRequestException('Empresa nao encontrada.');

    const targetPlanKey = normalizeCatalogCommercialPlanKey(dto?.planKey);
    if (targetPlanKey === COMMERCIAL_PLAN_KEYS.MELHOR) {
      throw new BadRequestException({
        code: 'CONTACT_ONLY_PLAN',
        message: 'Implantação é montada com a HBX, não pela troca automática. Use o contato.',
      });
    }
    // Self-Checkout (F2): plano pausado pelo master não aceita troca/contratação.
    if (isCommercialPlanPaused(targetPlanKey)) {
      throw new BadRequestException({
        code: 'PLAN_PAUSED',
        message: 'Este plano está temporariamente indisponível. Tente novamente mais tarde.',
      });
    }
    const currentPlanKey = company.selectedPlanKey
      ? normalizeCatalogCommercialPlanKey(company.selectedPlanKey)
      : null;
    const direction = classifyPlanChange(currentPlanKey, targetPlanKey);
    if (direction === 'same') {
      return { ok: true, noop: true, direction, message: 'Você já está neste plano.' };
    }

    const billingCycle = this.normalizeBillingCycle(dto?.billingCycle || company.billingCycle);
    const fromCycleAmount = currentPlanKey ? computeCommercialPlanCycleAmount(currentPlanKey, billingCycle) : 0;
    const toCycleAmount = computeCommercialPlanCycleAmount(targetPlanKey, billingCycle);
    const periodStart = company.subscriptionCurrentPeriodStart instanceof Date ? company.subscriptionCurrentPeriodStart : null;
    const periodEnd = company.subscriptionCurrentPeriodEnd instanceof Date ? company.subscriptionCurrentPeriodEnd : null;
    const now = new Date();
    const proration = computePlanProration({ fromCycleAmount, toCycleAmount, periodStart, periodEnd, now });
    const access = resolveCompanyAccessState(company);
    const isPaying = access.state === 'paying';

    const subscription = await this.findCurrentCompanySubscription(context.companyId);
    const mockMode = this.isMockPaymentsProvider();
    const hasLivePreapproval = Boolean(
      subscription?.providerPreapprovalId &&
        !['canceled', 'cancelled', 'blocked'].includes(String(subscription.status || '').toLowerCase()),
    );

    // ANTI-BRECHA / ANTI-DUPLA-COBRANÇA: "está pagando" (status) NÃO basta — o
    // discriminador real é se o período ATUAL foi COBRADO (caiu no cartão), não só
    // autorizado. Empresa em trial-com-cartão pode estar 'active'/autorizada sem nenhuma
    // cobrança (a #23 é assim: List carregando o trial do Lead). Uma única leitura serve
    // pra duas decisões: (1) crédito do downgrade só vale se houve cobrança; (2) trocar de
    // plano SEM cobrança = ainda no trial → encerra o trial e cobra o plano novo.
    const collectedThisPeriod = await this.hasCollectedRevenueSince(context.companyId, periodStart);
    let effectiveCredit = proration.creditGenerated;
    if (direction === 'downgrade' && effectiveCredit > 0 && !collectedThisPeriod) {
      effectiveCredit = 0;
    }

    const preview = {
      direction,
      fromPlanKey: currentPlanKey,
      toPlanKey: targetPlanKey,
      fromPlanTitle: currentPlanKey ? getCommercialPlanTitle(currentPlanKey) : null,
      toPlanTitle: getCommercialPlanTitle(targetPlanKey),
      billingCycle,
      fromCycleAmount,
      toCycleAmount,
      chargeNow: proration.chargeNow,
      creditGenerated: effectiveCredit,
      remainingDays: prorationRemainingDays(periodEnd, now),
      // Modelo B: tanto upgrade quanto downgrade trocam o plano AGORA. No upgrade cobra a
      // diferença proporcional; no downgrade credita a diferença proporcional (a sobra do
      // plano maior não usado). Nada de "manter o plano maior até o fim".
      effectiveAt: now.toISOString(),
      isPaying,
      // Troca durante o trial (preapproval viva, nada cobrado): a troca ENCERRA o trial e
      // cobra o plano novo cheio. O front usa isto pro aviso e pra coletar os 2 tokens.
      trialEnding: hasLivePreapproval && !collectedThisPeriod,
    };

    if (dto?.dryRun) return { ok: true, dryRun: true, preview };

    // FIM DE TRIAL (regra do dono 24/06): há assinatura recorrente VIVA mas NADA foi
    // cobrado neste período = ainda no trial grátis. Trocar de plano (subir OU descer)
    // encerra o trial e cobra o plano novo cheio. Cobra o avulso AGORA (síncrono, Regra de
    // Ouro) e recria a recorrência; recusa/desistência → NADA muda.
    if (hasLivePreapproval && !collectedThisPeriod) {
      return this.applyTrialEndingPlanChange({
        user, context, company, subscription, targetPlanKey, billingCycle,
        toCycleAmount, direction: direction as 'upgrade' | 'downgrade', preview,
        cardTokenId: this.normalizeCardToken(dto?.cardTokenId),
        recurringCardTokenId: this.normalizeCardToken(dto?.recurringCardTokenId),
        paymentMethodId: String(dto?.paymentMethodId || '').trim() || null,
        taxDocument: String(dto?.taxDocument || '').trim() || null,
        mockMode, now,
      });
    }

    // Sem assinatura ativa nem trial-com-cartão (pending_checkout/cortesia): não há o que
    // proratar/creditar. Upgrade exige checkout; downgrade só registra a intenção.
    if (!isPaying) {
      if (direction === 'upgrade') {
        return {
          ok: false,
          code: 'NEEDS_CHECKOUT',
          direction,
          preview,
          message: 'Sua empresa ainda não tem assinatura ativa. Conclua a assinatura para liberar este plano.',
        };
      }
      await this.prisma.company.update({
        where: { id: context.companyId },
        data: {
          selectedPlanKey: targetPlanKey,
          trialModuleSelection: targetPlanKey === COMMERCIAL_PLAN_KEYS.PADRAO ? 'vendas' : null,
        },
      });
      return { ok: true, direction, applied: 'intent', preview, overview: await this.getOverviewForUser(user) };
    }

    if (direction === 'upgrade') {
      return this.applyUpgradePlanChange({
        user, context, company, subscription, targetPlanKey, billingCycle,
        toCycleAmount, chargeNow: proration.chargeNow, preview,
        cardTokenId: this.normalizeCardToken(dto?.cardTokenId),
        paymentMethodId: String(dto?.paymentMethodId || '').trim() || null,
        taxDocument: String(dto?.taxDocument || '').trim() || null,
        mockMode, periodStart, periodEnd, now,
      });
    }
    return this.applyDowngradePlanChange({
      user, context, company, subscription, targetPlanKey, billingCycle,
      toCycleAmount, creditGenerated: effectiveCredit, preview, mockMode, periodStart, periodEnd, now,
    });
  }

  private async applyUpgradePlanChange(input: {
    user: any;
    context: { companyId: number; userId: number };
    company: any;
    subscription: any;
    targetPlanKey: ActiveCommercialPlanKey;
    billingCycle: string;
    toCycleAmount: number;
    chargeNow: number;
    preview: Record<string, unknown>;
    cardTokenId: string | null;
    paymentMethodId: string | null;
    taxDocument: string | null;
    mockMode: boolean;
    periodStart: Date | null;
    periodEnd: Date | null;
    now: Date;
  }) {
    const { context, company, subscription, targetPlanKey, billingCycle, toCycleAmount, chargeNow, mockMode, now } = input;
    const periodStart = input.periodStart || now;
    const periodEnd = input.periodEnd || this.computePeriodEnd(periodStart, billingCycle);
    const planTitle = getCommercialPlanTitle(targetPlanKey);

    // LIVE: cobra a diferença proporcional AGORA como pagamento avulso de cartão
    // (one-off). Regra de Ouro: só libera o plano DEPOIS do pagamento aprovado — se
    // recusar/falhar, devolve código e NÃO mexe em nada. Sem cartão na requisição,
    // pede pro front coletar e re-chamar com o token (CARD_REQUIRED).
    if (!mockMode && chargeNow > 0) {
      if (!input.cardTokenId || !input.paymentMethodId) {
        return {
          ok: false,
          code: 'CARD_REQUIRED',
          direction: 'upgrade',
          preview: input.preview,
          message: `Para subir para ${planTitle} cobramos a diferença proporcional no cartão.`,
        };
      }
      const { accessToken } = await this.resolveFinanceContext(context.companyId);
      const payerEmail =
        this.normalizePayerEmail(subscription?.payerEmail) ||
        this.normalizePayerEmail(input.user?.email) ||
        '';
      const docDigits = String(input.taxDocument || company.taxDocument || '').replace(/\D/g, '');
      let payment: any;
      try {
        payment = await this.mercadoPagoClient.createPayment(
          accessToken,
          {
            transaction_amount: this.normalizeCurrencyAmount(chargeNow),
            token: input.cardTokenId,
            installments: 1,
            payment_method_id: input.paymentMethodId,
            description: `${planTitle} — diferença proporcional do upgrade`,
            external_reference: `hbx-proration-${context.companyId}-${Date.now()}`,
            metadata: {
              company_id: context.companyId,
              source: 'plan_change_upgrade',
              target_plan: targetPlanKey,
            },
            payer: {
              email: payerEmail,
              ...(docDigits
                ? { identification: { type: docDigits.length > 11 ? 'CNPJ' : 'CPF', number: docDigits } }
                : {}),
            },
          },
          randomUUID(),
        );
      } catch (error: any) {
        this.logger.warn(
          `plan_change_upgrade_proration_charge_failed company=${context.companyId} error=${String(error?.message || error)}`,
        );
        return {
          ok: false,
          code: 'CHARGE_FAILED',
          direction: 'upgrade',
          preview: input.preview,
          message: String(error?.message || 'Não foi possível cobrar a diferença no cartão. Tente outro cartão.'),
        };
      }
      const payStatus = this.normalizeProviderPaymentStatus(payment?.status);
      if (payStatus !== 'approved') {
        return {
          ok: false,
          code: 'CHARGE_DECLINED',
          direction: 'upgrade',
          preview: input.preview,
          message: 'Pagamento da diferença recusado. Confira os dados do cartão ou tente outro.',
        };
      }
      await this.recordProrationCharge({
        context,
        billingCycle,
        amount: chargeNow,
        planTitle,
        entryType: 'PLAN_UPGRADE_PRORATION',
        observation: `Diferença proporcional do upgrade para ${planTitle}.`,
        metadata: {
          targetPlanKey,
          fromPlanKey: company.selectedPlanKey,
          source: 'plan_change_upgrade',
          providerPaymentId: payment?.id ? String(payment.id) : null,
        },
      });
    }

    // 1) Cobra a diferença AGORA (mock — Regra de Ouro: só libera com pagamento ok).
    if (mockMode && chargeNow > 0) {
      await this.recordProrationCharge({
        context, billingCycle, amount: chargeNow, planTitle,
        entryType: 'PLAN_UPGRADE_PRORATION_MOCK',
        observation: `Diferença proporcional do upgrade para ${planTitle} (mock).`,
        metadata: { targetPlanKey, fromPlanKey: company.selectedPlanKey, source: 'plan_change_upgrade' },
      });
    }

    // 2) Ajusta o valor recorrente pro novo plano no próximo ciclo (LIVE, best-effort).
    if (!mockMode && subscription?.providerPreapprovalId) {
      try {
        const { accessToken } = await this.resolveFinanceContext(context.companyId);
        await this.mercadoPagoClient.updatePreapproval(accessToken, subscription.providerPreapprovalId, {
          auto_recurring: { transaction_amount: this.normalizeCurrencyAmount(toCycleAmount) },
        } as any);
      } catch (error: any) {
        this.logger.warn(`plan_change_upgrade_preapproval_update_failed company=${context.companyId} error=${String(error?.message || error)}`);
      }
    }

    // 3) Libera o plano AGORA, preservando o período já pago (não reinicia o ciclo).
    await this.prisma.$transaction(async (tx) => {
      if (subscription?.id) {
        await tx.companySubscription.update({
          where: { id: subscription.id },
          data: { planKey: targetPlanKey, billingCycle },
        });
      }
      await tx.company.update({
        where: { id: context.companyId },
        data: {
          selectedPlanKey: targetPlanKey,
          billingCycle,
          trialModuleSelection: targetPlanKey === COMMERCIAL_PLAN_KEYS.PADRAO ? 'vendas' : null,
        },
      });
      await this.syncPaidPlanModulesTx(tx, context.companyId, targetPlanKey);
      await this.syncPaidCommercialEntitlementsTx(tx, context.companyId, targetPlanKey, periodStart, periodEnd);
    });

    return {
      ok: true,
      direction: 'upgrade',
      charged: this.normalizeCurrencyAmount(chargeNow),
      preview: input.preview,
      liveProrationPending: false,
      overview: await this.getOverviewForUser(input.user),
    };
  }

  // FIM DE TRIAL ao trocar de plano (regra do dono 24/06) — vale pra upgrade E downgrade.
  // Encerra o período grátis e cobra o plano NOVO cheio. Mecânica escolhida (opção 3):
  // cobra avulso AGORA (síncrono, Regra de Ouro) + recria a recorrência.
  //   token do MP é de USO ÚNICO → o front manda 2 tokens: cardTokenId (avulso) e
  //   recurringCardTokenId (nova preapproval). Sem aprovação/sem token → NADA muda.
  // ⚠️ LIVE-ONLY: a recriação (cancel + create no MP) e o start_date futuro só dá pra
  //   validar no VPS com cartão real — aqui só prova em mock.
  private async applyTrialEndingPlanChange(input: {
    user: any;
    context: { companyId: number; userId: number };
    company: any;
    subscription: any;
    targetPlanKey: ActiveCommercialPlanKey;
    billingCycle: string;
    toCycleAmount: number;
    direction: 'upgrade' | 'downgrade';
    preview: Record<string, unknown>;
    cardTokenId: string | null;
    recurringCardTokenId: string | null;
    paymentMethodId: string | null;
    taxDocument: string | null;
    mockMode: boolean;
    now: Date;
  }) {
    const { context, company, subscription, targetPlanKey, billingCycle, toCycleAmount, direction, mockMode, now } = input;
    const planTitle = getCommercialPlanTitle(targetPlanKey);
    const periodStart = now;
    const periodEnd = this.computePeriodEnd(periodStart, billingCycle);
    const chargeNow = this.normalizeCurrencyAmount(toCycleAmount);

    let providerPaymentId: string | null = null;
    let newPreapprovalId: string | null = null;
    let newPreapprovalPlanId: string | null = null;
    let cardSnapshot: { brand: string | null; last4: string | null } = { brand: null, last4: null };

    if (!mockMode) {
      // 2 tokens de uso único: avulso + nova recorrência. Falta algum → o front coleta.
      if (!input.cardTokenId || !input.paymentMethodId) {
        return {
          ok: false,
          code: 'CARD_REQUIRED',
          direction,
          preview: input.preview,
          message: `Trocar de plano durante o teste encerra o período grátis e passa a cobrar o ${planTitle} agora. Confirme o cartão.`,
        };
      }
      if (!input.recurringCardTokenId) {
        return {
          ok: false,
          code: 'RECURRING_CARD_REQUIRED',
          direction,
          preview: input.preview,
          message: 'Confirme o cartão para encerrar o teste e ativar a nova assinatura.',
        };
      }
      const { accessToken } = await this.resolveFinanceContext(context.companyId);
      const payerEmail =
        this.normalizePayerEmail(subscription?.payerEmail) ||
        this.normalizePayerEmail(input.user?.email) ||
        '';
      const docDigits = String(input.taxDocument || company.taxDocument || '').replace(/\D/g, '');

      // 1) Cobra o plano NOVO cheio AGORA (avulso, síncrono). Só encerra o trial DEPOIS de
      //    aprovado — recusa/erro → NADA muda (trial e plano intactos).
      let payment: any;
      try {
        payment = await this.mercadoPagoClient.createPayment(
          accessToken,
          {
            transaction_amount: chargeNow,
            token: input.cardTokenId,
            installments: 1,
            payment_method_id: input.paymentMethodId,
            description: `${planTitle} — primeira cobrança (fim do teste)`,
            external_reference: `hbx-trialend-${context.companyId}-${Date.now()}`,
            metadata: {
              company_id: context.companyId,
              source: 'plan_change_trial_end',
              target_plan: targetPlanKey,
              direction,
            },
            payer: {
              email: payerEmail,
              ...(docDigits
                ? { identification: { type: docDigits.length > 11 ? 'CNPJ' : 'CPF', number: docDigits } }
                : {}),
            },
          },
          randomUUID(),
        );
      } catch (error: any) {
        this.logger.warn(`plan_change_trial_end_charge_failed company=${context.companyId} error=${String(error?.message || error)}`);
        return {
          ok: false,
          code: 'CHARGE_FAILED',
          direction,
          preview: input.preview,
          message: String(error?.message || 'Não foi possível cobrar no cartão. Tente outro cartão.'),
        };
      }
      if (this.normalizeProviderPaymentStatus(payment?.status) !== 'approved') {
        return {
          ok: false,
          code: 'CHARGE_DECLINED',
          direction,
          preview: input.preview,
          message: 'Pagamento recusado. Confira os dados do cartão ou tente outro.',
        };
      }
      providerPaymentId = payment?.id ? String(payment.id) : null;
      cardSnapshot = this.subscriptionCardSnapshot(payment, subscription);
      await this.recordProrationCharge({
        context,
        billingCycle,
        amount: chargeNow,
        planTitle,
        entryType: 'PLAN_TRIAL_END_CHARGE',
        observation: `Encerramento do teste — primeira cobrança do ${planTitle}.`,
        metadata: { targetPlanKey, fromPlanKey: company.selectedPlanKey, source: 'plan_change_trial_end', direction, providerPaymentId },
      });

      // 2) Recria a recorrência. Cancela a preapproval com trial ANTES de criar a nova —
      //    prioriza "nunca cobrar dobrado": se o create falhar, fica SEM recorrência
      //    (reparável pelo master), nunca com a antiga viva cobrando no fim do trial.
      if (subscription?.providerPreapprovalId) {
        try {
          await this.mercadoPagoClient.cancelPreapproval(accessToken, subscription.providerPreapprovalId);
        } catch (error: any) {
          this.logger.warn(`plan_change_trial_end_cancel_old_failed company=${context.companyId} error=${String(error?.message || error)}`);
        }
      }
      try {
        const providerPlan = await this.ensureMercadoPagoPreapprovalPlan(accessToken, targetPlanKey, billingCycle);
        const snap = this.buildCommercialPlanProviderSnapshot(targetPlanKey, billingCycle);
        const provider = await this.mercadoPagoClient.createPreapproval(
          accessToken,
          {
            preapproval_plan_id: providerPlan.providerPlanId,
            reason: snap.reason,
            external_reference: `hbx-sub-${context.companyId}-${subscription.id}`,
            payer_email: payerEmail,
            card_token_id: input.recurringCardTokenId,
            auto_recurring: {
              frequency: snap.frequency,
              frequency_type: snap.frequencyType,
              transaction_amount: snap.amount,
              currency_id: snap.currency,
              // 1ª recorrência no PRÓXIMO ciclo — este já foi cobrado avulso acima.
              start_date: periodEnd.toISOString(),
            },
            back_url: this.buildSubscriptionBackUrl(),
            status: 'authorized',
          },
          randomUUID(),
        );
        newPreapprovalId = String(provider?.id || '').trim() || null;
        newPreapprovalPlanId = provider?.preapproval_plan_id ? String(provider.preapproval_plan_id) : providerPlan.providerPlanId;
        if (!cardSnapshot.last4) cardSnapshot = this.subscriptionCardSnapshot(provider, subscription);
      } catch (error: any) {
        this.logger.error(
          `plan_change_trial_end_recreate_failed company=${context.companyId} error=${String(error?.message || error)} ` +
            `— cobrança do ciclo OK, mas RECORRÊNCIA ficou sem preapproval (reparo manual).`,
        );
      }
    } else if (chargeNow > 0) {
      // MOCK: só escritura, sem gateway.
      await this.recordProrationCharge({
        context,
        billingCycle,
        amount: chargeNow,
        planTitle,
        entryType: 'PLAN_TRIAL_END_CHARGE_MOCK',
        observation: `Encerramento do teste — primeira cobrança do ${planTitle} (mock).`,
        metadata: { targetPlanKey, fromPlanKey: company.selectedPlanKey, source: 'plan_change_trial_end', direction },
      });
    }

    // 3) Encerra o trial localmente + aplica o plano (atômico no DB). Novo período começa
    //    AGORA (ciclo pago). Guarda a preapproval nova quando o live recriou.
    await this.prisma.$transaction(async (tx) => {
      if (subscription?.id) {
        await tx.companySubscription.update({
          where: { id: subscription.id },
          data: {
            planKey: targetPlanKey,
            billingCycle,
            status: 'active',
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            nextBillingAt: periodEnd,
            ...(newPreapprovalId
              ? { providerPreapprovalId: newPreapprovalId, providerPreapprovalPlanId: newPreapprovalPlanId, lastProviderStatus: 'authorized' }
              : {}),
            ...(cardSnapshot.brand ? { cardBrand: cardSnapshot.brand } : {}),
            ...(cardSnapshot.last4 ? { cardLast4: cardSnapshot.last4 } : {}),
          },
        });
      }
      await tx.company.update({
        where: { id: context.companyId },
        data: {
          selectedPlanKey: targetPlanKey,
          billingCycle,
          status: 'active',
          isActive: true,
          trialEndsAt: null,
          subscriptionCurrentPeriodStart: periodStart,
          subscriptionCurrentPeriodEnd: periodEnd,
          billingProvider: 'mercadopago',
          paymentMethod: 'CARD',
          ...(cardSnapshot.brand ? { billingCardBrand: cardSnapshot.brand } : {}),
          ...(cardSnapshot.last4 ? { billingCardLast4: cardSnapshot.last4 } : {}),
          billingCardUpdatedAt: now,
          trialModuleSelection: targetPlanKey === COMMERCIAL_PLAN_KEYS.PADRAO ? 'vendas' : null,
        },
      });
      await this.syncPaidPlanModulesTx(tx, context.companyId, targetPlanKey);
      await this.syncPaidCommercialEntitlementsTx(tx, context.companyId, targetPlanKey, periodStart, periodEnd);
    });

    return {
      ok: true,
      direction,
      trialEnded: true,
      charged: chargeNow,
      recurringRecreated: Boolean(newPreapprovalId) || mockMode,
      preview: input.preview,
      overview: await this.getOverviewForUser(input.user),
    };
  }

  private async applyDowngradePlanChange(input: {
    user: any;
    context: { companyId: number; userId: number };
    company: any;
    subscription: any;
    targetPlanKey: ActiveCommercialPlanKey;
    billingCycle: string;
    toCycleAmount: number;
    creditGenerated: number;
    preview: Record<string, unknown>;
    mockMode: boolean;
    periodStart: Date | null;
    periodEnd: Date | null;
    now: Date;
  }) {
    const { context, company, subscription, targetPlanKey, billingCycle, toCycleAmount, creditGenerated, mockMode, now } = input;
    const planTitle = getCommercialPlanTitle(targetPlanKey);
    const creditCents = Math.max(0, Math.round(this.normalizeCurrencyAmount(creditGenerated) * 100));

    // 1) Crédito proporcional — NÃO cobra nada. Saldo abate na próxima fatura.
    if (creditCents > 0) {
      await this.prisma.company.update({
        where: { id: context.companyId },
        data: { billingCreditCents: { increment: creditCents } },
      });
      await this.insertBillingLedgerEntry({
        companyId: context.companyId,
        createdByUserId: context.userId,
        entryType: 'PLAN_DOWNGRADE_CREDIT',
        entryGroup: 'credit',
        status: 'APPROVED',
        origin: 'plan_change_downgrade',
        competence: this.monthKey(now),
        amount: this.normalizeCurrencyAmount(creditGenerated),
        paidAt: now,
        paymentMethod: 'CREDIT',
        referenceLabel: `Crédito de redução para ${planTitle}`,
        observation: `Sobra proporcional do plano atual ao reduzir para ${planTitle}. Abate na próxima fatura.`,
        metadata: { targetPlanKey, fromPlanKey: company.selectedPlanKey, source: 'plan_change_downgrade', creditCents },
      });
    }

    // 2) Modelo B: troca o plano AGORA (espelho do upgrade). O cliente NÃO mantém o plano
    //    maior — cai pro menor na hora; o crédito acima devolve a sobra proporcional do que
    //    foi pago. Não reinicia o ciclo (preserva o período vigente).
    const periodStart = input.periodStart || now;
    const periodEnd = input.periodEnd || this.computePeriodEnd(periodStart, billingCycle);
    await this.prisma.$transaction(async (tx) => {
      if (subscription?.id) {
        await tx.companySubscription.update({
          where: { id: subscription.id },
          data: { planKey: targetPlanKey, billingCycle },
        });
      }
      await tx.company.update({
        where: { id: context.companyId },
        data: {
          selectedPlanKey: targetPlanKey,
          billingCycle,
          trialModuleSelection: targetPlanKey === COMMERCIAL_PLAN_KEYS.PADRAO ? 'vendas' : null,
        },
      });
      await this.syncPaidPlanModulesTx(tx, context.companyId, targetPlanKey);
      await this.syncPaidCommercialEntitlementsTx(tx, context.companyId, targetPlanKey, periodStart, periodEnd);
    });

    // 3) LIVE: baixa o valor recorrente pro próximo ciclo.
    if (!mockMode && subscription?.providerPreapprovalId) {
      try {
        const { accessToken } = await this.resolveFinanceContext(context.companyId);
        await this.mercadoPagoClient.updatePreapproval(accessToken, subscription.providerPreapprovalId, {
          auto_recurring: { transaction_amount: this.normalizeCurrencyAmount(toCycleAmount) },
        } as any);
      } catch (error: any) {
        this.logger.warn(`plan_change_downgrade_preapproval_update_failed company=${context.companyId} error=${String(error?.message || error)}`);
      }
    }

    return {
      ok: true,
      direction: 'downgrade',
      creditGenerated: this.normalizeCurrencyAmount(creditGenerated),
      effectiveAt: now.toISOString(),
      preview: input.preview,
      overview: await this.getOverviewForUser(input.user),
    };
  }

  // F6 — compra de bloco de assentos extras pelo ADMIN. paga-primeiro: a capacidade
  // (seatCap) só sobe com a cobrança proporcional CONFIRMADA. O valor cheio entra no
  // recorrente do próximo mês sozinho (o seat snapshot conta o usuário ativo no novo
  // ciclo). Mesmo gate do upgrade: live com cobrança > 0 depende de validação na VPS;
  // mock roda ponta a ponta. Gerente (ADMIN sem billing) é barrado por
  // assertCanManageBilling — cobrança nunca cruza com quem só preenche cadastro.
  async purchaseExtraSeats(
    user: any,
    dto: { seats?: number; cardTokenId?: string; dryRun?: boolean },
  ) {
    const context = this.resolveUserContext(user);
    this.assertCanManageBilling(context);
    await ensureMasterBillingRuntimeSchema(this.prisma);

    const seats = Math.max(0, Math.trunc(Number(dto?.seats || 0) || 0));
    if (seats <= 0) throw new BadRequestException('Informe quantos assentos extras comprar.');
    if (seats > 50) throw new BadRequestException('Máximo de 50 assentos por compra.');

    const company = await this.prisma.company.findUnique({ where: { id: context.companyId } });
    if (!company) throw new BadRequestException('Empresa nao encontrada.');

    const planKey = normalizeCatalogCommercialPlanKey(company.selectedPlanKey);
    if (!canBillExtraSeatsForPlan(planKey)) {
      throw new BadRequestException({
        code: 'PLAN_NO_EXTRA_SEATS',
        message: 'Seu plano não trabalha com assentos extras. Faça upgrade para liberar mais acessos.',
      });
    }

    const now = new Date();
    // Valor do assento extra vem do catálogo — reflete o que o master editou no
    // Self-Checkout (F2) para este plano.
    const extraSeatMonthly = this.normalizeCurrencyAmount(getCommercialPlanExtraUserMonthlyPrice(planKey));
    const immediate = computeImmediateExtraSeatCharge({ seats, extraSeatMonthly, now });
    const currentSeatCap = Math.max(0, Number(company.seatCap || 0) || 0);
    const newSeatCap = currentSeatCap + seats;
    const nextCycleFullAmount = this.normalizeCurrencyAmount(extraSeatMonthly * seats);
    const access = resolveCompanyAccessState(company);
    const isPaying = access.state === 'paying';

    const preview = {
      seats,
      extraSeatMonthly,
      remainingDays: immediate.remainingDays,
      daysInMonth: immediate.daysInMonth,
      chargeNow: immediate.chargeNow,
      nextCycleFullAmount,
      currentSeatCap,
      newSeatCap,
      isPaying,
    };

    if (dto?.dryRun) return { ok: true, dryRun: true, preview };

    // paga-primeiro: sem assinatura ativa não há cartão recorrente — assina antes.
    if (!isPaying) {
      return {
        ok: false,
        code: 'NEEDS_CHECKOUT',
        preview,
        message: 'Ative sua assinatura antes de comprar assentos extras.',
      };
    }

    const subscription = await this.findCurrentCompanySubscription(context.companyId);
    const mockMode = this.isMockPaymentsProvider();

    // LIVE: a cobrança avulsa no cartão real (Mercado Pago) ainda precisa ser validada
    // na VPS — mesmo gate do upgrade. Regra de Ouro / paga-primeiro: NÃO sobe a
    // capacidade sem pagamento confirmado. Devolve código sinalizado, sem mexer em nada.
    if (!mockMode && immediate.chargeNow > 0) {
      return {
        ok: false,
        code: 'LIVE_SEAT_CHARGE_TODO',
        preview,
        message: 'A cobrança proporcional no cartão (Mercado Pago real) ainda precisa ser validada na VPS com credenciais de teste.',
      };
    }

    // 1) Cobra a proporcional AGORA (mock — só libera com pagamento ok).
    if (mockMode && immediate.chargeNow > 0) {
      await this.recordProrationCharge({
        context,
        billingCycle: this.normalizeBillingCycle(company.billingCycle),
        amount: immediate.chargeNow,
        planTitle: getCommercialPlanTitle(planKey),
        entryType: 'EXTRA_SEAT_PRORATION_MOCK',
        observation: `Cobrança proporcional de ${seats} assento(s) extra (mock) — ${immediate.remainingDays} dia(s) restantes do mês.`,
        metadata: { seats, extraSeatMonthly, chargeNow: immediate.chargeNow, newSeatCap, source: 'extra_seat_purchase' },
      });
    }

    // 2) LIVE best-effort: registra a intenção de subir o recorrente no próximo ciclo.
    //    (O valor full por assento já é recomputado pelo seat snapshot na renovação.)
    if (!mockMode && subscription?.providerPreapprovalId) {
      this.logger.log(`extra_seat_purchase company=${context.companyId} seats=${seats} newSeatCap=${newSeatCap} (recorrente full no próximo ciclo via seat snapshot)`);
    }

    // 3) Sobe a capacidade paga (seatCap). Admin distribui o acesso depois.
    await this.prisma.company.update({
      where: { id: context.companyId },
      data: { seatCap: newSeatCap },
    });

    return {
      ok: true,
      charged: this.normalizeCurrencyAmount(immediate.chargeNow),
      newSeatCap,
      preview,
      overview: await this.getOverviewForUser(user),
    };
  }

  private async recordProrationCharge(input: {
    context: { companyId: number; userId: number };
    billingCycle: string;
    amount: number;
    planTitle: string;
    entryType: string;
    observation: string;
    status?: string;
    paidAt?: Date | null;
    metadata?: Record<string, unknown>;
  }) {
    const now = new Date();
    const status = input.status || 'APPROVED';
    const paidAt = input.paidAt !== undefined ? input.paidAt : now;
    const charge = await this.prisma.financeiroCharge.create({
      data: {
        companyId: input.context.companyId,
        amount: this.normalizeCurrencyAmount(input.amount),
        description: `${input.planTitle} — diferença proporcional`,
        billingCycle: input.billingCycle,
        paymentMethod: 'CARD',
        status: status === 'APPROVED' ? 'approved' : 'pending',
        lifecycle: status === 'APPROVED' ? 'paid' : 'pending',
        competence: this.monthKey(now),
        externalReference: `hbx-proration-${input.context.companyId}-${Date.now()}`,
        paidAt,
        createdByUserId: input.context.userId,
        providerPayload: this.json({ source: input.entryType }),
      },
    });
    const ledgerEntryId = await this.insertBillingLedgerEntry({
      companyId: input.context.companyId,
      createdByUserId: input.context.userId,
      entryType: input.entryType,
      entryGroup: 'revenue',
      status,
      origin: 'financeiro_plan_change',
      competence: this.monthKey(now),
      amount: this.normalizeCurrencyAmount(input.amount),
      paidAt,
      paymentMethod: 'CARD',
      referenceLabel: input.planTitle,
      observation: input.observation,
      metadata: { chargeId: charge.id, ...(input.metadata || {}) },
    });
    await this.prisma.financeiroCharge.update({ where: { id: charge.id }, data: { ledgerEntryId } });
    return charge;
  }

  // ── REEMBOLSO (primitivo compartilhado: F2 exclusão de empresa + F3 botão do master) ──
  // Estorna (total ou parcial) uma cobrança JÁ PAGA: dispara o refund no Mercado Pago,
  // atualiza a FinanceiroCharge (refundAmount/refundedAt/status) e rebaixa o lançamento do
  // ledger pra REFUNDED/PARTIALLY_REFUNDED (= o painel do master mostra "estornado"). Mock
  // (sem mpPaymentId ou PAYMENTS_PROVIDER=mock) pula o gateway e só escritura. NÃO mexe em
  // acesso/assinatura — estorno é dinheiro de volta, não cancelamento de plano.
  private async refundFinanceiroChargeById(input: {
    companyId: number;
    chargeId: string;
    amount?: number | null;
    actorUserId?: number | null;
    reason?: string | null;
    source?: string;
  }) {
    const companyId = Number(input.companyId);
    const charge = await this.prisma.financeiroCharge.findFirst({
      where: { id: String(input.chargeId), companyId },
    });
    if (!charge) throw new NotFoundException('Cobrança não encontrada para esta empresa.');
    if (charge.lifecycle !== 'paid') {
      throw new BadRequestException('Só é possível estornar uma cobrança que foi paga.');
    }

    const paidAmount = this.normalizeCurrencyAmount(charge.amount);
    const alreadyRefunded = this.normalizeCurrencyAmount(charge.refundAmount || 0);
    const maxRefundable = this.normalizeCurrencyAmount(Math.max(0, paidAmount - alreadyRefunded));
    if (maxRefundable <= 0) {
      throw new BadRequestException('Esta cobrança já foi totalmente estornada.');
    }

    const requested =
      typeof input.amount === 'number' && Number.isFinite(input.amount) && input.amount > 0
        ? this.normalizeCurrencyAmount(input.amount)
        : maxRefundable;
    if (requested > maxRefundable + 0.005) {
      throw new BadRequestException(`Valor do estorno acima do disponível (R$ ${maxRefundable.toFixed(2)}).`);
    }
    const refundValue = Math.min(requested, maxRefundable);

    const mpPaymentId = String(charge.mpPaymentId || '').trim();
    const newRefundTotal = this.normalizeCurrencyAmount(alreadyRefunded + refundValue);
    const fullyRefunded = newRefundTotal + 0.005 >= paidAmount;

    let providerRefund: unknown = null;
    if (mpPaymentId && !this.isMockPaymentsProvider()) {
      const { accessToken } = await this.resolveFinanceContext(companyId);
      providerRefund = await this.mercadoPagoClient.refundPayment(
        accessToken,
        mpPaymentId,
        fullyRefunded ? undefined : refundValue,
      );
    }

    const now = new Date();
    const reasonText = this.normalizeOptionalString(input.reason);
    const originLabel =
      input.source === 'company_deletion' ? ' (exclusão da empresa)' : input.source === 'master_refund' ? ' pelo MASTER' : '';

    const updated = await this.prisma.financeiroCharge.update({
      where: { id: charge.id },
      data: {
        status: fullyRefunded ? 'refunded' : 'partially_refunded',
        refundAmount: newRefundTotal,
        refundedAt: now,
        providerPayload: this.providerJson({
          refund: {
            amount: refundValue,
            total: newRefundTotal,
            source: input.source || 'manual',
            actorUserId: input.actorUserId || null,
            at: now.toISOString(),
          },
          provider: providerRefund,
        }),
      },
    });

    await this.updateLedgerEntryStatus({
      entryId: charge.ledgerEntryId,
      status: fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
      paidAt: charge.paidAt,
      paymentMethod: this.normalizePaymentMethod(charge.paymentMethod),
      observation:
        `Estorno de R$ ${refundValue.toFixed(2)}${originLabel}` +
        (reasonText ? ` — ${reasonText}` : '') +
        ` em ${this.formatDateTimePtBr(now)}.`,
      metadata: {
        chargeId: charge.id,
        mpPaymentId: mpPaymentId || null,
        refundAmount: refundValue,
        refundTotal: newRefundTotal,
        source: input.source || 'manual',
      },
    });

    this.logger.log(
      `financeiro_refund company=${companyId} charge=${charge.id} amount=${refundValue} total=${newRefundTotal} ` +
        `full=${fullyRefunded} source=${input.source || 'manual'} mp=${mpPaymentId || 'mock'}`,
    );

    return {
      ok: true,
      chargeId: charge.id,
      refundAmount: refundValue,
      refundTotal: newRefundTotal,
      fullyRefunded,
      charge: this.serializeCharge(updated),
    };
  }

  // Estorno acionado pelo MASTER (botão "Reembolsar" no painel de empresas → F3).
  async refundChargeByMaster(
    user: any,
    companyId: number,
    chargeId: string,
    input?: { amount?: number | null; reason?: string | null },
  ) {
    if (!user?.isSystemMaster) {
      throw new ForbiddenException('Apenas o MASTER pode estornar cobranças.');
    }
    return this.refundFinanceiroChargeById({
      companyId: Number(companyId),
      chargeId: String(chargeId),
      amount: input?.amount ?? null,
      actorUserId: Number(user?.id) || null,
      reason: input?.reason ?? null,
      source: 'master_refund',
    });
  }

  // Cancelamento da assinatura recorrente acionado pelo MASTER no painel de empresas
  // (aba Financeiro). Cancela a preapproval no Mercado Pago (o cartão deixa de ser
  // cobrado nas próximas faturas) e marca o estado local. Se ainda há período já pago,
  // mantém o acesso até o fim dele (cancelAtPeriodEnd) — só corta o futuro, sem suspender
  // na hora. Guard duplo: MasterGuard na rota + checagem isSystemMaster aqui.
  async cancelSubscriptionByMaster(user: any, companyId: number) {
    if (!user?.isSystemMaster) {
      throw new ForbiddenException('Apenas o MASTER pode cancelar assinaturas.');
    }
    const id = Number(companyId);
    if (!id) throw new BadRequestException('Empresa inválida.');
    await ensureMasterBillingRuntimeSchema(this.prisma);

    const subscription = await this.findCurrentCompanySubscription(id);
    if (!subscription?.providerPreapprovalId) {
      throw new NotFoundException('Esta empresa não tem assinatura recorrente ativa no Mercado Pago.');
    }

    try {
      if (this.isMockPaymentsProvider() && String(subscription.provider || '').toLowerCase() === 'mock') {
        await this.applySubscriptionProviderState(subscription, { status: 'canceled' });
      } else {
        const { accessToken } = await this.resolveFinanceContext(id);
        const provider = await this.mercadoPagoClient.cancelPreapproval(accessToken, subscription.providerPreapprovalId);
        await this.applySubscriptionProviderState(subscription, {
          ...provider,
          status: provider?.status || 'cancelled',
        });
      }
      const refreshed = await this.prisma.companySubscription.findFirst({
        where: { companyId: id, provider: this.subscriptionProviderWhere() },
        orderBy: { createdAt: 'desc' },
      });
      return { ok: true, subscription: this.serializeSubscription(refreshed) };
    } catch (error: any) {
      throw new BadRequestException(
        `Não conseguimos cancelar a assinatura no Mercado Pago. ${String(error?.message || '').trim()}`,
      );
    }
  }

  async getSubscriptionStatusForUser(user: any) {
    const context = this.resolveUserContext(user);
    this.assertCanManageBilling(context);
    const subscription = await this.prisma.companySubscription.findFirst({
      where: { companyId: context.companyId, provider: this.subscriptionProviderWhere() },
      orderBy: { createdAt: 'desc' },
    });
    return {
      ok: true,
      subscription: this.serializeSubscription(subscription),
      overview: await this.getOverviewForUser(user),
    };
  }

  // Re-sincroniza a assinatura da empresa com o MP UMA vez, sob demanda (chamado
  // pela tela de bloqueio ao abrir). Pega webhook perdido sem poll de fundo: é um
  // GET no MP (nao recobra cartao) e o guard de etapa do e-mail evita reenvio.
  // Sem preapproval (pending_checkout) ou em mock = no-op.
  async syncSubscriptionForUser(user: any) {
    const context = this.resolveUserContext(user);
    this.assertCanManageBilling(context);
    await ensureMasterBillingRuntimeSchema(this.prisma);
    const subscription = await this.findCurrentCompanySubscription(context.companyId);
    if (subscription?.providerPreapprovalId && !this.isMockPaymentsProvider()) {
      try {
        await this.syncPreapprovalFromProvider(subscription.providerPreapprovalId, {
          source: 'manual_sync_on_block',
          companyId: context.companyId,
        });
      } catch (error: any) {
        this.logger.warn(`subscription_sync_on_block_failed company=${context.companyId} error=${String(error?.message || error)}`);
      }
    }
    return { ok: true, overview: await this.getOverviewForUser(user) };
  }

  async refreshChargeForUser(user: any, chargeId: string, paymentIdRaw?: string) {
    const context = this.resolveUserContext(user);
    this.assertCanManageBilling(context);
    const charge = await this.prisma.financeiroCharge.findFirst({
      where: { id: String(chargeId), companyId: context.companyId },
    });
    if (!charge) throw new NotFoundException('Cobranca nao encontrada para esta empresa.');

    const paymentId = String(paymentIdRaw || charge.mpPaymentId || '').trim();
    if (paymentId) {
      await this.syncChargeFromProvider(context.companyId, paymentId, { source: 'manual_refresh' });
    }

    return this.getOverviewForUser(user);
  }

  async processMercadoPagoWebhook(input: { companyId?: number; query: Record<string, any>; body: any }) {
    const query = input?.query || {};
    const body = input?.body;
    const preapprovalId = this.extractPreapprovalId(query, body);
    if (preapprovalId) {
      try {
        const synced = await this.syncPreapprovalFromProvider(preapprovalId, {
          source: 'webhook',
          query,
          body,
        });
        return { processed: synced.updated, ...synced };
      } catch (error: any) {
        return { processed: false, preapprovalId, reason: String(error?.message || 'Erro no webhook de assinatura') };
      }
    }

    let companyId = Number(input?.companyId || 0);
    const paymentId = this.extractPaymentId(query, body);
    if (!paymentId) return { processed: false, companyId: companyId || undefined, reason: 'payment_id/preapproval_id ausente no webhook.' };
    try {
      if (!companyId) {
        const accessToken = await this.resolveWebhookMercadoPagoAccessToken();
        const provider = await this.mercadoPagoClient.getPayment(accessToken, paymentId);
        const subscriptionSynced = await this.syncSubscriptionPaymentFromProvider(provider, {
          source: 'webhook',
          query,
          body,
        });
        if (subscriptionSynced.updated) {
          return {
            processed: true,
            companyId: subscriptionSynced.companyId,
            paymentId,
            status: subscriptionSynced.status,
            subscriptionPayment: true,
          };
        }
        const metadata = (provider?.metadata || {}) as Record<string, unknown>;
        companyId = Number(metadata.company_id || this.parseSubscriptionExternalReference(provider?.external_reference)?.companyId || 0);
        if (!companyId) return { processed: false, paymentId, reason: 'company_id ausente no webhook.' };
      }

      const synced = await this.syncChargeFromProvider(companyId, paymentId, {
        source: 'webhook',
        query,
        body,
      });
      return { processed: synced.updated, companyId, paymentId, status: synced.status };
    } catch (error: any) {
      return { processed: false, companyId, paymentId, reason: String(error?.message || 'Erro no webhook') };
    }
  }
}
