import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ensureMasterBillingRuntimeSchema } from '../modules/master-runtime';
import {
  getMasterGlobalIntegrationConfig,
  resolveCompanyMercadoPagoAccess,
} from '../modules/master-global-integrations.util';
import { MercadoPagoClientService } from '../payments/mercado-pago-client.service';

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

@Injectable()
export class FinanceiroService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mercadoPagoClient: MercadoPagoClientService,
  ) {}

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

  private monthKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  private addDays(date: Date, days: number) {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
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

  private resolveCompanyMonthlyValue(company: any) {
    const enabledModuleTotal = Array.isArray(company?.companyModules)
      ? company.companyModules
          .filter((row: any) => row?.enabled && row?.systemModule?.companyAssignable)
          .reduce(
            (total: number, row: any) => total + this.normalizeCurrencyAmount(row?.systemModule?.monthlyPrice || 0),
            0,
          )
      : 0;
    if (enabledModuleTotal > 0) {
      return this.normalizeCurrencyAmount(enabledModuleTotal);
    }
    return this.normalizeCurrencyAmount(company?.plan?.price || 0);
  }

  private resolveExtraSeatMonthlyAmount(pricingPolicy: any) {
    return this.normalizeCurrencyAmount(
      pricingPolicy?.extraSeatMonthlyAmount ?? process.env.HBX_EXTRA_SEAT_MONTHLY_AMOUNT ?? 0,
    );
  }

  private buildSeatBillingSnapshot(company: any, billingCycle: string, pricingPolicy: any) {
    const activeUsers = Array.isArray(company?.users)
      ? company.users.filter((user: any) => Boolean(user?.isActive) && !Boolean(user?.isSystemMaster)).length
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

  private resolveUserContext(user: any) {
    const companyId = Number(user?.masterContext?.active ? user?.masterContext?.companyId : user?.companyId || 0);
    const userId = Number(user?.id || 0);
    if (!companyId) throw new ForbiddenException('Empresa nao identificada.');
    if (!userId) throw new ForbiddenException('Usuario nao identificado.');
    return { companyId, userId };
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

  private buildPricing(company: any, pricingPolicy: any, ledgerRows: BillingLedgerEntryRow[]) {
    const monthlyValue = this.resolveCompanyMonthlyValue(company);
    const billingCycle = this.normalizeBillingCycle(company?.billingCycle);
    const annualPlanDiscountPercent = Math.max(
      0,
      this.normalizeCurrencyAmount(pricingPolicy?.annualPlanDiscountPercent || 0),
    );
    const manualDiscountPercent = Math.max(0, this.normalizeCurrencyAmount(company?.manualDiscountPercent || 0));
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
      baseCycleAmount,
      finalCycleAmount,
      pendingCount,
      failedCount,
      refundCount,
      refundAmount: this.normalizeCurrencyAmount(refundAmount),
      cardConfigured: Boolean(company?.billingCardLast4),
      pixAvailable: true,
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
          users: {
            select: { id: true, isActive: true, isSystemMaster: true },
          },
        },
      }),
    ]);

    if (!company) throw new BadRequestException('Empresa nao encontrada.');
    const accessToken = String(resolved.accessToken || '').trim();
    if (!accessToken) {
      throw new BadRequestException(
        resolved.source === 'master_missing'
          ? 'Empresa marcada para usar o token MASTER, mas o Mercado Pago global ainda nao foi configurado.'
          : 'Mercado Pago nao configurado para esta empresa. Configure no MASTER.',
      );
    }
    return { company, accessToken };
  }

  private async insertBillingLedgerEntry(input: {
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
  }) {
    await ensureMasterBillingRuntimeSchema(this.prisma);
    const id = randomUUID();
    const now = new Date();
    await this.prisma.$executeRaw(
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

  private async activateCompanyFromCharge(companyId: number, charge: any, paidAt: Date) {
    const [company, masterConfig] = await Promise.all([
      this.prisma.company.findUnique({ where: { id: companyId } }),
      getMasterGlobalIntegrationConfig(this.prisma),
    ]);
    const billingCycle = this.normalizeBillingCycle(charge?.billingCycle);
    const periodEnd = this.computePeriodEnd(paidAt, billingCycle);
    const referral = this.buildReferralSnapshot(company, masterConfig);
    await this.prisma.$transaction([
      this.prisma.company.update({
        where: { id: companyId },
        data: {
          isActive: true,
          onboardingStatus: 'active_paid',
          paymentStatus: 'PAID',
          subscriptionStatus: 'active',
          billingProvider: 'mercadopago',
          paymentMethod: this.normalizePaymentMethod(charge?.paymentMethod),
          premiumAccess: true,
          subscriptionCurrentPeriodStart: paidAt,
          subscriptionCurrentPeriodEnd: periodEnd,
          referralDiscountConsumedAt:
            referral.referralDiscountAppliesNow && referral.referralDiscountMode === 'ONCE'
              ? paidAt
              : company?.referralDiscountConsumedAt || null,
          deactivatedAt: null,
        },
      }),
      this.prisma.companyModule.updateMany({
        where: { companyId },
        data: { enabled: true },
      }),
    ]);
  }

  private async settleComplimentaryCycle(companyId: number, userId: number) {
    const [company, masterConfig] = await Promise.all([
      this.prisma.company.findUnique({
      where: { id: companyId },
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
        },
        users: {
          select: { id: true, isActive: true, isSystemMaster: true },
        },
      },
      }),
      getMasterGlobalIntegrationConfig(this.prisma),
    ]);
    if (!company) throw new BadRequestException('Empresa nao encontrada.');
    const pricing = this.buildPricing(company, masterConfig, []);
    const now = new Date();
    const charge = await this.prisma.financeiroCharge.create({
      data: {
        companyId,
        amount: 0,
        description: `HBX ${pricing.billingCycle === 'ANNUAL' ? 'anual' : 'mensal'} - ciclo promocional`,
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
      referenceLabel: company.plan?.name || 'HBX Financeiro',
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

  private async findReusableCharge(companyId: number, paymentMethod: string) {
    const row = await this.prisma.financeiroCharge.findFirst({
      where: {
        companyId,
        paymentMethod,
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
        providerPayload: this.json({ context: context || null, provider }),
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

    if (status === 'approved' && paidAt) {
      await this.activateCompanyFromCharge(companyId, charge, paidAt);
    }

    return { updated: true, status, charge: this.serializeCharge(charge) };
  }

  async getOverviewForUser(user: any) {
    const context = this.resolveUserContext(user);
    await ensureMasterBillingRuntimeSchema(this.prisma);
    const [company, ledgerRows, masterConfig, latestCharge] = await Promise.all([
      this.prisma.company.findUnique({
        where: { id: context.companyId },
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
          users: {
            select: { id: true, isActive: true, isSystemMaster: true },
          },
        },
      }),
      this.listLedgerRows(context.companyId, 24),
      getMasterGlobalIntegrationConfig(this.prisma),
      this.prisma.financeiroCharge.findFirst({
        where: { companyId: context.companyId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    if (!company) throw new BadRequestException('Empresa nao encontrada.');

    const pricing = this.buildPricing(company, masterConfig, ledgerRows);
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

    return {
      generatedAt: new Date().toISOString(),
      company: {
        id: company.id,
        name: company.name,
        paymentStatus: company.paymentStatus,
        paymentMethod: company.paymentMethod,
        billingCycle: pricing.billingCycle,
        billingProvider: company.billingProvider,
        subscriptionStatus: company.subscriptionStatus,
        premiumAccess: Boolean(company.premiumAccess),
        trialStartsAt: company.trialStartsAt instanceof Date ? company.trialStartsAt.toISOString() : null,
        trialEndsAt: company.trialEndsAt instanceof Date ? company.trialEndsAt.toISOString() : null,
        trialRemainingDays: this.computeTrialRemainingDays(company.trialEndsAt),
        isActive: Boolean(company.isActive),
        acquisitionSource: this.normalizeOptionalString(company.acquisitionSource),
        acquisitionSourceDetail: this.normalizeOptionalString(company.acquisitionSourceDetail),
        referralReferrerName: this.normalizeOptionalString(company.referralReferrerName),
        referralCode: this.normalizeOptionalString(company.referralCode),
        plan: company.plan
          ? {
              id: company.plan.id,
              name: company.plan.name,
              price: this.normalizeCurrencyAmount(company.plan.price || 0),
            }
          : null,
      },
      modules: activeModules,
      pricing,
      paymentOptions: {
        selectedMethod: this.normalizePaymentMethod(company.paymentMethod),
        card: {
          configured: pricing.cardConfigured,
          brand: company.billingCardBrand || null,
          last4: company.billingCardLast4 || null,
          holderName: company.billingCardHolderName || null,
          expMonth: Number(company.billingCardExpMonth || 0) || null,
          expYear: Number(company.billingCardExpYear || 0) || null,
          updatedAt: company.billingCardUpdatedAt instanceof Date ? company.billingCardUpdatedAt.toISOString() : null,
        },
        pix: {
          available: true,
          preferred: this.normalizePaymentMethod(company.paymentMethod) === 'PIX',
        },
      },
      accountStatus: {
        label:
          String(company.subscriptionStatus || '').toLowerCase() === 'trialing'
            ? 'Conta em free trial'
            : String(company.paymentStatus || '').toUpperCase() === 'PAID'
              ? 'Conta paga e ativa'
              : String(company.paymentStatus || '').toUpperCase() === 'OVERDUE'
                ? 'Conta com pendencia'
                : 'Conta em acompanhamento',
        nextDueAt:
          company.subscriptionCurrentPeriodEnd instanceof Date
            ? company.subscriptionCurrentPeriodEnd.toISOString()
            : company.trialEndsAt instanceof Date
              ? company.trialEndsAt.toISOString()
              : null,
        lastPayment: lastPayment ? this.normalizeLedgerEntry(lastPayment) : null,
        lastFailure: lastFailure ? this.normalizeLedgerEntry(lastFailure) : null,
      },
      latestCharge: this.serializeCharge(latestCharge),
      history: ledgerRows.map((row) => this.normalizeLedgerEntry(row)),
    };
  }

  async updatePreferencesForUser(
    user: any,
    dto: { paymentMethod?: string; billingCycle?: string },
  ) {
    const context = this.resolveUserContext(user);
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
      brand: string;
      last4: string;
      holderName: string;
      expMonth: number;
      expYear: number;
    },
  ) {
    const context = this.resolveUserContext(user);
    await ensureMasterBillingRuntimeSchema(this.prisma);
    const last4 = String(dto?.last4 || '').replace(/\D/g, '').slice(-4);
    if (last4.length !== 4) {
      throw new BadRequestException('Informe os 4 últimos dígitos do cartão.');
    }
    if (!Number.isFinite(Number(dto?.expMonth)) || Number(dto.expMonth) < 1 || Number(dto.expMonth) > 12) {
      throw new BadRequestException('Mês de expiração inválido.');
    }

    const expYear = Math.trunc(Number(dto?.expYear || 0));
    if (expYear < new Date().getFullYear() - 1) {
      throw new BadRequestException('Ano de expiração inválido.');
    }

    await this.prisma.company.update({
      where: { id: context.companyId },
      data: {
        paymentMethod: 'CARD',
        billingCardBrand: this.normalizeOptionalString(dto.brand),
        billingCardLast4: last4,
        billingCardHolderName: this.normalizeOptionalString(dto.holderName),
        billingCardExpMonth: Math.trunc(Number(dto.expMonth)),
        billingCardExpYear: expYear,
        billingCardUpdatedAt: new Date(),
      },
    });

    return this.getOverviewForUser(user);
  }

  async removeCardForUser(user: any) {
    const context = this.resolveUserContext(user);
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

  async createCheckoutForUser(user: any, dto: { paymentMethod?: string }) {
    const context = this.resolveUserContext(user);
    const paymentMethod = this.normalizePaymentMethod(dto?.paymentMethod);
    if (!['PIX', 'CARD'].includes(paymentMethod)) {
      throw new BadRequestException('Metodo de pagamento invalido para checkout.');
    }

    const reusable = await this.findReusableCharge(context.companyId, paymentMethod);
    if (reusable) {
      return {
        ok: true,
        reused: true,
        charge: this.serializeCharge(reusable),
        overview: await this.getOverviewForUser(user),
      };
    }

    const company = await this.prisma.company.findUnique({
      where: { id: context.companyId },
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
        },
        users: {
          select: { id: true, isActive: true, isSystemMaster: true },
        },
      },
    });
    if (!company) throw new BadRequestException('Empresa nao encontrada.');
    const masterConfig = await getMasterGlobalIntegrationConfig(this.prisma);
    const pricing = this.buildPricing(company, masterConfig, []);

    if (pricing.freeMonths > 0) {
      const complimentary = await this.settleComplimentaryCycle(context.companyId, context.userId);
      return {
        ok: true,
        complimentary: true,
        charge: this.serializeCharge(complimentary),
        overview: await this.getOverviewForUser(user),
      };
    }

    const { accessToken } = await this.resolveFinanceContext(context.companyId);

    const amount = this.normalizeCurrencyAmount(pricing.finalCycleAmount);
    if (amount <= 0) {
      throw new BadRequestException('Nao ha valor disponivel para cobranca neste ciclo.');
    }

    const payerEmail =
      this.normalizeOptionalString(company.contactEmail) ||
      this.normalizeOptionalString(user?.email) ||
      `financeiro+${company.id}@hbx.local`;
    const description = `HBX ${pricing.billingCycle === 'ANNUAL' ? 'anual' : 'mensal'} - ${company.name}`;
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
            },
            payer: {
              email: payerEmail,
              first_name: this.normalizeOptionalString(company.primaryContactName) || company.name,
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
          referenceLabel: company.plan?.name || 'HBX Financeiro',
          observation: 'Cobranca PIX criada pelo autoatendimento do cliente.',
          metadata: {
            chargeId: baseCharge.id,
            externalReference,
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
            providerPayload: this.json({ provider }),
          },
        });

        return {
          ok: true,
          charge: this.serializeCharge(updated),
          overview: await this.getOverviewForUser(user),
        };
      }

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
            excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }, { id: 'bank_transfer' }],
            installments: 1,
          },
          metadata: {
            company_id: context.companyId,
            financeiro_charge_id: baseCharge.id,
          },
          payer: {
            name: this.normalizeOptionalString(company.primaryContactName) || company.name,
            email: payerEmail,
          },
          items: [
            {
              id: baseCharge.id,
              title: description,
              description: `HBX ${pricing.billingCycle === 'ANNUAL' ? 'anual' : 'mensal'}`,
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
        entryType: 'CARD_CHECKOUT',
        entryGroup: 'revenue',
        status: 'PENDING',
        origin: 'financeiro_card',
        competence,
        amount,
        paymentMethod: 'CARD',
        referenceLabel: company.plan?.name || 'HBX Financeiro',
        observation: 'Checkout de cartao criado pelo autoatendimento do cliente.',
        metadata: {
          chargeId: baseCharge.id,
          externalReference,
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

  async refreshChargeForUser(user: any, chargeId: string, paymentIdRaw?: string) {
    const context = this.resolveUserContext(user);
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
    const companyId = Number(input?.companyId || 0);
    if (!companyId) return { processed: false, reason: 'company_id ausente no webhook.' };
    const paymentId = this.extractPaymentId(input?.query || {}, input?.body);
    if (!paymentId) return { processed: false, companyId, reason: 'payment_id ausente no webhook.' };
    try {
      const synced = await this.syncChargeFromProvider(companyId, paymentId, {
        source: 'webhook',
        query: input.query,
        body: input.body,
      });
      return { processed: synced.updated, companyId, paymentId, status: synced.status };
    } catch (error: any) {
      return { processed: false, companyId, paymentId, reason: String(error?.message || 'Erro no webhook') };
    }
  }
}
