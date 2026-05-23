import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  getCommercialPlanMonthlyPrice,
  normalizeCommercialPlanKey,
} from '../commercial-plans/commercial-plan-catalog';

type HbxClientState = {
  saleStatus: 'activation_pending' | 'trial_started' | 'sale_confirmed' | 'inactive' | 'canceled' | 'none';
  commissionStatus: 'pending' | 'payable' | 'canceled' | 'none';
  recurring: boolean;
  eventAt: Date;
};

type SyncOptions = {
  source?: string;
  salesCompanyId?: number | null;
};

@Injectable()
export class HbxCommissionSyncService {
  private readonly logger = new Logger(HbxCommissionSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  private normalizeEmail(value: unknown) {
    const normalized = String(value || '').trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
  }

  private normalizePhone(value: unknown) {
    const digits = String(value || '').replace(/\D/g, '');
    const withoutCountry = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
    const normalized = withoutCountry.slice(0, 11);
    return normalized.length >= 10 ? normalized : null;
  }

  private buildPhoneCandidates(value: unknown) {
    const normalized = this.normalizePhone(value);
    if (!normalized) return [];
    const candidates = new Set<string>([normalized]);
    if (normalized.length === 11) candidates.add(normalized.slice(0, 2) + normalized.slice(3));
    return Array.from(candidates);
  }

  private money(value: unknown) {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric)) return 0;
    return Number(Math.max(0, numeric).toFixed(2));
  }

  private addBusinessDays(date: Date, days: number) {
    const next = new Date(date);
    let added = 0;
    while (added < days) {
      next.setDate(next.getDate() + 1);
      const day = next.getDay();
      if (day !== 0 && day !== 6) added += 1;
    }
    return next;
  }

  private cycleKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  private cycleIndex(key: string) {
    const [year, month] = String(key || '').split('-').map((part) => Math.trunc(Number(part)));
    if (!year || !month) return 0;
    return year * 12 + month;
  }

  private resolveClientState(company: any): HbxClientState {
    const paymentStatus = String(company?.paymentStatus || '').trim().toUpperCase();
    const subscriptionStatus = String(company?.subscriptionStatus || '').trim().toLowerCase();
    const onboardingStatus = String(company?.onboardingStatus || '').trim().toLowerCase();
    const now = new Date();
    const eventAt =
      company?.subscriptionCurrentPeriodStart instanceof Date
        ? company.subscriptionCurrentPeriodStart
        : company?.trialStartsAt instanceof Date
          ? company.trialStartsAt
          : company?.createdAt instanceof Date
            ? company.createdAt
            : now;

    if (
      paymentStatus === 'PAID' ||
      paymentStatus === 'MANUAL' ||
      subscriptionStatus === 'active' ||
      subscriptionStatus === 'authorized' ||
      subscriptionStatus === 'manual' ||
      onboardingStatus === 'active_paid'
    ) {
      return { saleStatus: 'sale_confirmed', commissionStatus: 'payable', recurring: true, eventAt };
    }

    if (paymentStatus === 'TRIAL' || subscriptionStatus === 'trialing' || onboardingStatus === 'active_trial') {
      return { saleStatus: 'trial_started', commissionStatus: 'payable', recurring: true, eventAt };
    }

    if (
      paymentStatus === 'DISABLED' ||
      paymentStatus === 'EXPIRED' ||
      subscriptionStatus === 'canceled' ||
      subscriptionStatus === 'expired' ||
      onboardingStatus === 'suspended'
    ) {
      return { saleStatus: 'inactive', commissionStatus: 'canceled', recurring: false, eventAt: now };
    }

    if (
      paymentStatus === 'PENDING' ||
      subscriptionStatus === 'pending' ||
      subscriptionStatus === 'pending_checkout' ||
      subscriptionStatus === 'pending_trial_activation' ||
      onboardingStatus === 'pending_checkout' ||
      onboardingStatus === 'pending_trial_activation'
    ) {
      return { saleStatus: 'activation_pending', commissionStatus: 'pending', recurring: false, eventAt };
    }

    return { saleStatus: 'none', commissionStatus: 'none', recurring: false, eventAt };
  }

  private resolvePlanAmount(company: any) {
    const planKey = normalizeCommercialPlanKey(company?.selectedPlanKey);
    return this.money(getCommercialPlanMonthlyPrice(planKey));
  }

  private async resolveCommissionPercent(lead: any) {
    const snapshot = Number(lead?.commissionPercentSnapshot || 0);
    if (Number.isFinite(snapshot) && snapshot > 0) return Math.min(100, Math.max(0, snapshot));
    const userId = Math.trunc(Number(lead?.assignedUserId || 0));
    if (!userId) return 0;
    const owner = await this.prisma.user.findFirst({
      where: { id: userId, companyId: Number(lead?.companyId || 0) },
      select: { commissionPercent: true },
    }).catch(() => null);
    return Math.min(100, Math.max(0, Number(owner?.commissionPercent || 0) || 0));
  }

  private companyIdentity(company: any) {
    const emails = new Set<string>();
    const phones = new Set<string>();
    const contactEmail = this.normalizeEmail(company?.contactEmail);
    if (contactEmail) emails.add(contactEmail);
    for (const user of Array.isArray(company?.users) ? company.users : []) {
      const email = this.normalizeEmail(user?.email);
      if (email) emails.add(email);
    }
    for (const value of [
      company?.contactPhone,
      company?.whatsappNumber,
      company?.whatsappDisplayNumber,
      company?.whatsappModalPhone,
      company?.whatsappTemporaryDisplayNumber,
    ]) {
      for (const phone of this.buildPhoneCandidates(value)) phones.add(phone);
    }
    return { emails: Array.from(emails), phones: Array.from(phones) };
  }

  private buildLeadMatchWhere(company: any, options: SyncOptions) {
    const identity = this.companyIdentity(company);
    const or: any[] = [];
    if (identity.emails.length) or.push({ email: { in: identity.emails } });
    if (identity.phones.length) or.push({ phoneNormalized: { in: identity.phones } });
    if (!or.length) return null;

    const configuredSalesCompanies = String(process.env.HBX_COMMISSION_SALES_COMPANY_IDS || '')
      .split(',')
      .map((item) => Math.trunc(Number(item.trim())))
      .filter((id) => Number.isInteger(id) && id > 0);

    const salesCompanyId = Math.trunc(Number(options.salesCompanyId || 0)) || null;
    const companyFilter =
      salesCompanyId
        ? { companyId: salesCompanyId }
        : configuredSalesCompanies.length
          ? { companyId: { in: configuredSalesCompanies } }
          : { companyId: { not: Number(company.id) } };

    return {
      ...companyFilter,
      assignedUserId: { not: null },
      OR: or,
      AND: [
        {
          OR: [
            { commissionLinkedCompanyId: null },
            { commissionLinkedCompanyId: Number(company.id) },
          ],
        },
      ],
    };
  }

  private async updateLeadFromCompany(lead: any, company: any, state: HbxClientState, options: SyncOptions) {
    const percent = await this.resolveCommissionPercent(lead);
    const baseAmount = this.resolvePlanAmount(company);
    const commissionAmount = this.money((baseAmount * percent) / 100);
    const now = new Date();
    const currentCommissionStatus = String(lead?.commissionStatus || 'none').trim().toLowerCase();
    const keepPaid = currentCommissionStatus === 'paid';
    const nextCommissionStatus = keepPaid
      ? 'paid'
      : state.commissionStatus === 'payable' && commissionAmount <= 0
        ? 'pending'
        : state.commissionStatus;
    const nextDueAt =
      nextCommissionStatus === 'payable'
        ? (lead?.commissionDueAt instanceof Date ? lead.commissionDueAt : this.addBusinessDays(state.eventAt, 3))
        : null;

    const data: any = {
      saleStatus: state.saleStatus,
      saleValue: baseAmount,
      salePlanKey: normalizeCommercialPlanKey(company?.selectedPlanKey),
      saleConfirmedAt: ['trial_started', 'sale_confirmed'].includes(state.saleStatus)
        ? (lead?.saleConfirmedAt instanceof Date ? lead.saleConfirmedAt : state.eventAt)
        : null,
      saleCanceledAt: state.saleStatus === 'inactive' || state.saleStatus === 'canceled' ? now : null,
      commissionStatus: nextCommissionStatus,
      commissionBaseAmount: baseAmount,
      commissionAmount,
      commissionDueAt: nextDueAt,
      commissionPaidAt: keepPaid ? lead.commissionPaidAt : null,
      commissionRecurring: Boolean(state.recurring && nextCommissionStatus !== 'canceled'),
      commissionLinkedCompanyId: Number(company.id),
      commissionLinkedAt: lead?.commissionLinkedAt instanceof Date ? lead.commissionLinkedAt : now,
      commissionAutoSyncedAt: now,
      commissionSyncSource: String(options.source || 'hbx_company_sync').slice(0, 120),
    };

    const changed =
      String(lead?.saleStatus || 'none') !== data.saleStatus ||
      String(lead?.commissionStatus || 'none') !== data.commissionStatus ||
      Number(lead?.commissionLinkedCompanyId || 0) !== Number(company.id) ||
      this.money(lead?.commissionAmount) !== data.commissionAmount;

    if (!changed) {
      await this.prisma.vendasLead.update({
        where: { id: lead.id },
        data: {
          commissionAutoSyncedAt: now,
          commissionSyncSource: data.commissionSyncSource,
        },
      }).catch(() => null);
      return false;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.vendasLead.update({
        where: { id: lead.id },
        data,
      });
      await tx.vendasLeadTimelineEvent.create({
        data: {
          leadId: lead.id,
          eventType: 'commission_auto_synced',
          title: 'Comissão sincronizada automaticamente',
          description: `Cliente HBX vinculado por telefone/e-mail. Status: ${state.saleStatus}. Comissão: ${nextCommissionStatus}.`,
          sourceType: 'hbx_company_sync',
          statusFrom: String(lead?.saleStatus || 'none'),
          statusTo: state.saleStatus,
          resultLabel: nextCommissionStatus,
          createdByUserId: Number(lead?.assignedByUserId || lead?.createdByUserId || 0) || null,
        },
      });
    });
    return true;
  }

  async syncActivatedCompany(companyId: number, options: SyncOptions = {}) {
    const targetCompanyId = Math.trunc(Number(companyId || 0));
    if (!targetCompanyId) return { scannedCompanies: 0, matchedLeads: 0, updatedLeads: 0 };
    const company = await this.prisma.company.findUnique({
      where: { id: targetCompanyId },
      include: {
        users: {
          select: { email: true },
          take: 10,
        },
      },
    }).catch(() => null);
    if (!company) return { scannedCompanies: 0, matchedLeads: 0, updatedLeads: 0 };

    const where = this.buildLeadMatchWhere(company, options);
    if (!where) return { scannedCompanies: 1, matchedLeads: 0, updatedLeads: 0 };
    const leads = await this.prisma.vendasLead.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }],
      take: 50,
      select: {
        id: true,
        companyId: true,
        assignedUserId: true,
        assignedByUserId: true,
        createdByUserId: true,
        commissionPercentSnapshot: true,
        saleStatus: true,
        commissionStatus: true,
        commissionAmount: true,
        commissionDueAt: true,
        commissionPaidAt: true,
        saleConfirmedAt: true,
        commissionLinkedCompanyId: true,
        commissionLinkedAt: true,
      },
    });

    const state = this.resolveClientState(company);
    let updatedLeads = 0;
    for (const lead of leads) {
      if (await this.updateLeadFromCompany(lead, company, state, options).catch((error) => {
        this.logger.warn(`commission_sync_lead_failed lead=${lead.id} company=${targetCompanyId} error=${String((error as any)?.message || error)}`);
        return false;
      })) {
        updatedLeads += 1;
      }
    }
    return { scannedCompanies: 1, matchedLeads: leads.length, updatedLeads };
  }

  async syncSalesCompanyCommissions(salesCompanyId: number, options: SyncOptions = {}) {
    const normalizedSalesCompanyId = Math.trunc(Number(salesCompanyId || 0));
    if (!normalizedSalesCompanyId) return { scannedCompanies: 0, matchedLeads: 0, updatedLeads: 0 };

    const leads = await this.prisma.vendasLead.findMany({
      where: {
        companyId: normalizedSalesCompanyId,
        assignedUserId: { not: null },
        OR: [
          { email: { not: null } },
          { phoneNormalized: { not: null } },
        ],
      },
      select: {
        email: true,
        phoneNormalized: true,
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 1000,
    });

    const emails = Array.from(new Set(leads.map((lead) => this.normalizeEmail(lead.email)).filter(Boolean) as string[]));
    const phones = Array.from(new Set(leads.flatMap((lead) => this.buildPhoneCandidates(lead.phoneNormalized))));
    const or: any[] = [];
    if (emails.length) {
      or.push({ contactEmail: { in: emails } });
      or.push({ users: { some: { email: { in: emails } } } });
    }
    if (phones.length) {
      or.push({ contactPhone: { in: phones } });
      or.push({ whatsappNumber: { in: phones } });
      or.push({ whatsappDisplayNumber: { in: phones } });
      or.push({ whatsappModalPhone: { in: phones } });
    }
    if (!or.length) {
      const recurring = await this.generateSalesCompanyRecurringReceivables(normalizedSalesCompanyId, options).catch((error) => {
        this.logger.warn(`commission_recurring_generation_failed company=${normalizedSalesCompanyId} error=${String((error as any)?.message || error)}`);
        return { createdReceivables: 0, skippedReceivables: 0, canceledReceivables: 0 };
      });
      return { scannedCompanies: 0, matchedLeads: 0, updatedLeads: 0, ...recurring };
    }

    const companies = await this.prisma.company.findMany({
      where: {
        id: { not: normalizedSalesCompanyId },
        OR: or,
      },
      select: { id: true },
      take: 100,
    });

    let matchedLeads = 0;
    let updatedLeads = 0;
    for (const company of companies) {
      const result = await this.syncActivatedCompany(company.id, {
        ...options,
        salesCompanyId: normalizedSalesCompanyId,
        source: options.source || 'gerencial_commission_sync',
      });
      matchedLeads += Number(result.matchedLeads || 0);
      updatedLeads += Number(result.updatedLeads || 0);
    }

    const recurring = await this.generateSalesCompanyRecurringReceivables(normalizedSalesCompanyId, options).catch((error) => {
      this.logger.warn(`commission_recurring_generation_failed company=${normalizedSalesCompanyId} error=${String((error as any)?.message || error)}`);
      return { createdReceivables: 0, skippedReceivables: 0, canceledReceivables: 0 };
    });

    return {
      scannedCompanies: companies.length,
      matchedLeads,
      updatedLeads,
      ...recurring,
    };
  }

  async generateSalesCompanyRecurringReceivables(salesCompanyId: number, options: SyncOptions = {}) {
    const companyId = Math.trunc(Number(salesCompanyId || 0));
    if (!companyId) return { createdReceivables: 0, skippedReceivables: 0, canceledReceivables: 0 };
    const now = new Date();
    const cycleKey = this.cycleKey(now);
    const cycleIndex = this.cycleIndex(cycleKey);

    const canceledReceivablesResult = await this.prisma.vendasCommissionReceivable.updateMany({
      where: {
        companyId,
        status: 'payable',
        lead: {
          saleStatus: { in: ['inactive', 'canceled'] },
        },
      },
      data: {
        status: 'canceled',
      },
    }).catch(() => ({ count: 0 }));

    const leads = await this.prisma.vendasLead.findMany({
      where: {
        companyId,
        assignedUserId: { not: null },
        commissionRecurring: true,
        commissionLinkedCompanyId: { not: null },
        saleStatus: { in: ['trial_started', 'sale_confirmed'] },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 2000,
      select: {
        id: true,
        companyId: true,
        assignedUserId: true,
        assignedByUserId: true,
        createdByUserId: true,
        saleConfirmedAt: true,
        commissionLinkedAt: true,
        createdAt: true,
        commissionLinkedCompanyId: true,
        commissionBaseAmount: true,
        saleValue: true,
        commissionPercentSnapshot: true,
      },
    });

    let createdReceivables = 0;
    let skippedReceivables = 0;
    for (const lead of leads) {
      const activatedAt =
        lead.saleConfirmedAt instanceof Date
          ? lead.saleConfirmedAt
          : lead.commissionLinkedAt instanceof Date
            ? lead.commissionLinkedAt
            : lead.createdAt instanceof Date
              ? lead.createdAt
              : now;
      if (this.cycleIndex(this.cycleKey(activatedAt)) >= cycleIndex) {
        skippedReceivables += 1;
        continue;
      }
      const baseAmount = this.money(lead.commissionBaseAmount || lead.saleValue);
      const percent = Math.min(100, Math.max(0, Number(lead.commissionPercentSnapshot || 0) || 0));
      const amount = this.money((baseAmount * percent) / 100);
      if (amount <= 0) {
        skippedReceivables += 1;
        continue;
      }
      const exists = await this.prisma.vendasCommissionReceivable.findFirst({
        where: {
          leadId: lead.id,
          cycleKey,
          kind: 'recurring',
        },
        select: { id: true },
      });
      if (exists) {
        skippedReceivables += 1;
        continue;
      }
      await this.prisma.vendasCommissionReceivable.create({
        data: {
          companyId,
          leadId: lead.id,
          sellerUserId: Number(lead.assignedUserId || 0) || null,
          linkedCompanyId: Number(lead.commissionLinkedCompanyId || 0) || null,
          cycleKey,
          kind: 'recurring',
          status: 'payable',
          baseAmount,
          commissionPercent: percent,
          amount,
          dueAt: this.addBusinessDays(now, 3),
          source: String(options.source || 'hbx_recurring').slice(0, 120),
          createdByUserId: Number(lead.assignedByUserId || lead.createdByUserId || 0) || null,
        },
      }).then(() => {
        createdReceivables += 1;
      }).catch((error) => {
        if (String((error as any)?.code || '') === 'P2002') {
          skippedReceivables += 1;
          return;
        }
        throw error;
      });
    }

    return {
      createdReceivables,
      skippedReceivables,
      canceledReceivables: Number((canceledReceivablesResult as any)?.count || 0) || 0,
    };
  }
}
