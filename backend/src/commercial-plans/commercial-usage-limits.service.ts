import { ConflictException, Injectable } from '@nestjs/common';
import { MASTER_WHATSAPP_ENGINE_COMPANY_SLUG } from '../companies/master-whatsapp-company.constants';
import { PrismaService } from '../prisma/prisma.service';
import { COMMERCIAL_PLAN_KEYS, COMMERCIAL_PLAN_QUOTAS, resolveCommercialPlanKeyForCapabilities } from './commercial-plan-catalog';

const FALLBACK_TIMEZONE = 'America/Sao_Paulo';
const CARD_SUCCESS_EVENTS = ['card_import_success', 'vendas_card_imported', 'radar_card_claimed', 'card_commercial_used'];
const CARD_REFUND_EVENTS = ['vendas_card_refunded'];
const LEAD_ENRICHMENT_SUCCESS_EVENTS = ['lead_enrichment_used'];
const HBX_SELLER_DAILY_CARD_LIMIT = 30;
const HBX_SELLER_DAILY_ENRICHMENT_LIMIT = 30;
const HBX_SELLER_MONTHLY_CARD_LIMIT = 999999;
const HBX_SELLER_ACTIVE_CARD_LIMIT = 30;
const SELLER_ACTIVE_CARD_LIMIT_DEFAULT = 20;
const SELLER_ACTIVE_CARD_LIMIT_MIN = 5;
const SELLER_ACTIVE_CARD_LIMIT_MAX = 100;
const ACTIVE_VENDAS_CARD_STATUSES = [
  'novo',
  'contato',
  'retorno',
  'qualificado',
  'new',
  'assigned',
  'contacted',
  'follow_up',
  'waiting_reply',
  'pending_activation',
  'trial',
  'negotiation',
];
const ACTIVE_RADAR_CARD_STATUSES = [
  'new',
  'clean',
  'reserved',
  'delivered',
  'assigned',
  'contacted',
  'follow_up',
  'waiting_reply',
  'pending_activation',
  'trial',
  'negotiation',
];

type UsageKind = 'cards' | 'emails';
type SellerActiveCardQuotaSnapshot = {
  companyId: number;
  userId: number;
  seller: boolean;
  paused: boolean;
  activeCount: number;
  baseLimit: number;
  bonus: number;
  inactivityPenalty: number;
  effectiveLimit: number;
  availableSlots: number;
  salesWonLast30: number;
  lastSeenAt: string | null;
  code: string | null;
};

@Injectable()
export class CommercialUsageLimitsService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeTimezone(value: unknown) {
    const timezone = String(value || '').trim() || FALLBACK_TIMEZONE;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
      return timezone;
    } catch {
      return FALLBACK_TIMEZONE;
    }
  }

  private getDateParts(date: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
    return {
      year: pick('year'),
      month: pick('month'),
      day: pick('day'),
      hour: pick('hour'),
      minute: pick('minute'),
      second: pick('second'),
    };
  }

  private toLocalDateKey(date: Date, timezone: string) {
    const parts = this.getDateParts(date, timezone);
    return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  }

  private buildDateInTimezone(dateKey: string, time: string, timezone: string) {
    const [year, month, day] = dateKey.split('-').map((part) => Number(part));
    const [hour, minute, second] = time.split(':').map((part) => Number(part || 0));
    const guessedUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, second || 0));
    const rendered = this.getDateParts(guessedUtc, timezone);
    const diffMs = Date.UTC(year, month - 1, day, hour, minute, second || 0) -
      Date.UTC(rendered.year, rendered.month - 1, rendered.day, rendered.hour, rendered.minute, rendered.second);
    return new Date(guessedUtc.getTime() + diffMs);
  }

  private getDayBounds(timezone: string) {
    const now = new Date();
    const dateKey = this.toLocalDateKey(now, timezone);
    const dayStart = this.buildDateInTimezone(dateKey, '00:00:00', timezone);
    const nextDate = new Date(dayStart.getTime() + 36 * 60 * 60 * 1000);
    const nextKey = this.toLocalDateKey(nextDate, timezone);
    const dayEnd = this.buildDateInTimezone(nextKey, '00:00:00', timezone);
    return { dayStart, dayEnd };
  }

  private getMonthBounds(timezone: string) {
    const now = new Date();
    const parts = this.getDateParts(now, timezone);
    const monthStartKey = `${parts.year}-${String(parts.month).padStart(2, '0')}-01`;
    const nextMonth = parts.month === 12 ? 1 : parts.month + 1;
    const nextYear = parts.month === 12 ? parts.year + 1 : parts.year;
    const nextMonthStartKey = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
    return {
      monthStart: this.buildDateInTimezone(monthStartKey, '00:00:00', timezone),
      monthEnd: this.buildDateInTimezone(nextMonthStartKey, '00:00:00', timezone),
    };
  }

  private async getCompanyPlan(companyId: number) {
    const company = await this.prisma.company.findUnique({
      where: { id: Number(companyId) },
      select: { selectedPlanKey: true, premiumAccess: true, paymentStatus: true, subscriptionStatus: true, timezone: true, slug: true },
    });
    const quotaOverrideRows = await this.prisma.$queryRawUnsafe<Array<{
      commercialCardsMonthlyLimitOverride: number | null;
      commercialCardsDailyLimitOverride: number | null;
    }>>(
      'SELECT "commercialCardsMonthlyLimitOverride", "commercialCardsDailyLimitOverride" FROM "Company" WHERE "id" = $1 LIMIT 1',
      Number(companyId),
    ).catch(() => []);
    const quotaOverride = quotaOverrideRows[0] || null;
    const planKey = company?.slug === MASTER_WHATSAPP_ENGINE_COMPANY_SLUG
      ? COMMERCIAL_PLAN_KEYS.MELHOR
      : resolveCommercialPlanKeyForCapabilities(company || {});
    return {
      planKey,
      timezone: this.normalizeTimezone(company?.timezone),
      isMasterOperationalCompany: company?.slug === MASTER_WHATSAPP_ENGINE_COMPANY_SLUG,
      quotaOverride: {
        cardsPerMonth: this.normalizePositiveOverride(quotaOverride?.commercialCardsMonthlyLimitOverride),
        dailyCardSafetyLimit: this.normalizePositiveOverride(quotaOverride?.commercialCardsDailyLimitOverride),
      },
    };
  }

  private normalizePositiveOverride(value: unknown) {
    const parsed = Math.trunc(Number(value || 0));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private clampInteger(value: unknown, min: number, max: number) {
    const parsed = Math.trunc(Number(value || 0));
    if (!Number.isFinite(parsed)) return min;
    return Math.max(min, Math.min(max, parsed));
  }

  private parseDate(value: unknown) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private daysSince(date: Date | null, now = new Date()) {
    if (!date) return 0;
    return Math.max(0, Math.floor((now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000)));
  }

  private normalizeSellerMode(value: unknown) {
    const normalized = String(value || 'learning').trim().toLowerCase();
    return ['learning', 'normal', 'priority', 'paused'].includes(normalized) ? normalized : 'learning';
  }

  private isSellerPaused(user: any, now = new Date()) {
    const mode = this.normalizeSellerMode(user?.sellerDistributionMode);
    if (mode !== 'paused') return false;
    const pausedUntil = this.parseDate(user?.sellerDistributionPausedUntil);
    return !pausedUntil || pausedUntil.getTime() > now.getTime();
  }

  private async getSellerActiveCardBaseLimit(companyId: number, hbxOperationCompany: boolean) {
    if (hbxOperationCompany) return HBX_SELLER_ACTIVE_CARD_LIMIT;
    const rule = await this.prisma.radarAutoDistributionRule.findFirst({
      where: {
        companyId,
        scope: hbxOperationCompany ? 'hbx_master' : 'company',
      },
      orderBy: [{ status: 'desc' }, { updatedAt: 'desc' }],
      select: { targetStockPerSeller: true },
    }).catch(() => null);
    return this.clampInteger(
      rule?.targetStockPerSeller || SELLER_ACTIVE_CARD_LIMIT_DEFAULT,
      SELLER_ACTIVE_CARD_LIMIT_MIN,
      SELLER_ACTIVE_CARD_LIMIT_MAX,
    );
  }

  private async countSellerActiveVendasCards(companyId: number, userId: number) {
    return this.prisma.vendasLead.count({
      where: {
        companyId,
        assignedUserId: userId,
        status: { in: ACTIVE_VENDAS_CARD_STATUSES },
        closedAt: null,
      },
    }).catch(() => 0);
  }

  private async countSellerActiveRadarCards(companyId: number, userId: number) {
    return this.prisma.radarLeadCompanyState.count({
      where: {
        companyId,
        assignedUserId: userId,
        vendasLeadId: null,
        status: { in: ACTIVE_RADAR_CARD_STATUSES },
      },
    }).catch(() => 0);
  }

  private async countSellerWonCardsLast30Days(companyId: number, userId: number, now = new Date()) {
    const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return this.prisma.vendasLead.count({
      where: {
        companyId,
        assignedUserId: userId,
        OR: [
          { saleStatus: { in: ['trial_started', 'sale_confirmed'] }, updatedAt: { gte: since } },
          { saleConfirmedAt: { gte: since } },
        ],
      },
    }).catch(() => 0);
  }

  private async getSellerLastSeenAt(userId: number, fallback?: Date | null) {
    const session = await this.prisma.authSession.findFirst({
      where: { userId },
      orderBy: { lastSeenAt: 'desc' },
      select: { lastSeenAt: true },
    }).catch(() => null);
    return this.parseDate(session?.lastSeenAt) || fallback || null;
  }

  private resolveInactivityPenalty(baseWithBonus: number, lastSeenAt: Date | null, now = new Date()) {
    const days = this.daysSince(lastSeenAt, now);
    if (days <= 3) return 0;
    if (days <= 7) return Math.floor(baseWithBonus * 0.25);
    if (days <= 14) return Math.floor(baseWithBonus * 0.5);
    return Math.max(0, baseWithBonus - SELLER_ACTIVE_CARD_LIMIT_MIN);
  }

  async getSellerActiveCardQuotaSnapshot(companyIdRaw: number, userIdRaw: number): Promise<SellerActiveCardQuotaSnapshot> {
    const companyId = Math.trunc(Number(companyIdRaw || 0));
    const userId = Math.trunc(Number(userIdRaw || 0));
    const unlimited = 999999;
    if (!companyId || !userId) {
      return {
        companyId,
        userId,
        seller: false,
        paused: false,
        activeCount: 0,
        baseLimit: unlimited,
        bonus: 0,
        inactivityPenalty: 0,
        effectiveLimit: unlimited,
        availableSlots: unlimited,
        salesWonLast30: 0,
        lastSeenAt: null,
        code: null,
      };
    }

    const [company, user] = await Promise.all([
      this.prisma.company.findUnique({
        where: { id: companyId },
        select: { slug: true },
      }).catch(() => null),
      this.prisma.user.findFirst({
        where: { id: userId, companyId },
        select: {
          id: true,
          role: true,
          isSystemMaster: true,
          isActive: true,
          deactivatedAt: true,
          createdAt: true,
          sellerDistributionMode: true,
          sellerDistributionPausedUntil: true,
        },
      }).catch(() => null),
    ]);

    const role = String(user?.role || '').trim().toUpperCase();
    const seller = Boolean(user && role === 'USER' && !user.isSystemMaster);
    if (!seller) {
      return {
        companyId,
        userId,
        seller: false,
        paused: false,
        activeCount: 0,
        baseLimit: unlimited,
        bonus: 0,
        inactivityPenalty: 0,
        effectiveLimit: unlimited,
        availableSlots: unlimited,
        salesWonLast30: 0,
        lastSeenAt: null,
        code: null,
      };
    }

    const now = new Date();
    const active = Boolean(user?.isActive && !user?.deactivatedAt);
    const paused = !active || this.isSellerPaused(user, now);
    const hbxOperationCompany = company?.slug === MASTER_WHATSAPP_ENGINE_COMPANY_SLUG;
    const baseLimit = await this.getSellerActiveCardBaseLimit(companyId, hbxOperationCompany);
    const [vendasActive, radarActive, salesWonLast30, lastSeenAt] = await Promise.all([
      this.countSellerActiveVendasCards(companyId, userId),
      this.countSellerActiveRadarCards(companyId, userId),
      this.countSellerWonCardsLast30Days(companyId, userId, now),
      this.getSellerLastSeenAt(userId, this.parseDate(user?.createdAt)),
    ]);
    const activeCount = Math.max(0, Math.trunc(Number(vendasActive || 0) + Number(radarActive || 0)));
    const bonus = Math.floor(Math.max(0, salesWonLast30) / 3) * 5;
    const inactivityPenalty = this.resolveInactivityPenalty(baseLimit + bonus, lastSeenAt, now);
    const effectiveLimit = paused
      ? 0
      : this.clampInteger(baseLimit + bonus - inactivityPenalty, SELLER_ACTIVE_CARD_LIMIT_MIN, SELLER_ACTIVE_CARD_LIMIT_MAX);
    const availableSlots = Math.max(0, effectiveLimit - activeCount);
    return {
      companyId,
      userId,
      seller: true,
      paused,
      activeCount,
      baseLimit,
      bonus,
      inactivityPenalty,
      effectiveLimit,
      availableSlots,
      salesWonLast30,
      lastSeenAt: lastSeenAt ? lastSeenAt.toISOString() : null,
      code: paused
        ? 'SELLER_QUOTA_PAUSED'
        : availableSlots <= 0
          ? 'SELLER_CARD_QUOTA_REACHED'
          : null,
    };
  }

  async assertSellerActiveCardSlots(companyId: number, userId: number, requestedCount = 1) {
    const snapshot = await this.getSellerActiveCardQuotaSnapshot(companyId, userId);
    if (!snapshot.seller) return snapshot;
    const requested = Math.max(1, Math.trunc(Number(requestedCount || 1) || 1));
    if (snapshot.paused || snapshot.availableSlots < requested) {
      await this.log(companyId, userId, 'seller_card_quota_blocked', 'seller_active_card_quota', {
        reason: snapshot.paused ? 'paused' : 'active_card_limit_reached',
        activeCount: snapshot.activeCount,
        effectiveLimit: snapshot.effectiveLimit,
        availableSlots: snapshot.availableSlots,
        requestedCount: requested,
      }).catch(() => null);
      throw new ConflictException({
        ok: false,
        code: snapshot.paused ? 'SELLER_QUOTA_PAUSED' : 'SELLER_CARD_QUOTA_REACHED',
        message: 'Seu limite de cards ativos foi atingido. Finalize, transfira ou peça mais cards ao responsável.',
        activeCount: snapshot.activeCount,
        effectiveLimit: snapshot.effectiveLimit,
        availableSlots: snapshot.availableSlots,
        quota: snapshot,
      });
    }
    return snapshot;
  }

  async limitRequestedCardsBySellerActiveQuota(companyId: number, userId: number, requestedLimit: number) {
    const requested = Math.max(0, Math.trunc(Number(requestedLimit || 0) || 0));
    const snapshot = await this.getSellerActiveCardQuotaSnapshot(companyId, userId);
    if (!snapshot.seller) return { limit: requested, quota: snapshot };
    return {
      limit: Math.max(0, Math.min(requested, snapshot.availableSlots)),
      quota: snapshot,
    };
  }

  private async isSystemMasterUser(userId?: number | null) {
    const context = await this.getUsageUserContext(userId);
    return context.isSystemMaster;
  }

  private async getUsageUserContext(userId?: number | null) {
    const normalizedUserId = Number(userId || 0) || null;
    if (!normalizedUserId) return { isSystemMaster: false, role: null as string | null };
    const user = await this.prisma.user.findUnique({
      where: { id: normalizedUserId },
      select: { isSystemMaster: true, role: true },
    }).catch(() => null);
    return {
      isSystemMaster: Boolean(user?.isSystemMaster),
      role: String(user?.role || '').trim().toUpperCase() || null,
    };
  }

  private buildUnlimitedSnapshot(input: {
    planKey: string;
    timezone: string;
    dayStart: Date;
    dayEnd: Date;
    monthStart: Date;
    monthEnd: Date;
  }) {
    const unlimited = 999999;
    return {
      planKey: input.planKey,
      timezone: input.timezone,
      dayStart: input.dayStart.toISOString(),
      dayEnd: input.dayEnd.toISOString(),
      monthStart: input.monthStart.toISOString(),
      monthEnd: input.monthEnd.toISOString(),
      cards: {
        used: 0,
        limit: unlimited,
        remaining: unlimited,
        perUserLimit: null as number | null,
        companyCap: unlimited,
        userUsed: 0,
        userLimit: unlimited,
        period: 'monthly',
        monthlyUsed: 0,
        monthlyLimit: unlimited,
        monthlyRemaining: unlimited,
        dailyUsed: 0,
        dailySafetyLimit: unlimited,
        dailyRemaining: unlimited,
      },
      emails: {
        attempted: 0,
        sent: 0,
        failed: 0,
        blocked: 0,
        limit: unlimited,
        remaining: unlimited,
        perUserLimit: null as number | null,
        companyCap: unlimited,
        userSent: 0,
        userLimit: unlimited,
      },
      enrichment: {
        used: 0,
        limit: unlimited,
        remaining: unlimited,
        dailyUsed: 0,
        dailyLimit: unlimited,
        dailyRemaining: unlimited,
        canAutoEnrich: true,
        canManualEnrich: true,
        mode: 'auto',
        period: 'daily',
      },
      billableUsers: 0,
      resetAt: input.monthEnd.toISOString(),
      dailyResetAt: input.dayEnd.toISOString(),
    };
  }

  private async getBillableUserCount(companyId: number) {
    return this.prisma.user.count({
      where: {
        companyId: Number(companyId),
        isActive: true,
        deactivatedAt: null,
        isSystemMaster: false,
      },
    });
  }

  private computeLimits(planKey: string, billableUsers: number, override?: { cardsPerMonth?: number | null; dailyCardSafetyLimit?: number | null }) {
    const quotas = COMMERCIAL_PLAN_QUOTAS[planKey as keyof typeof COMMERCIAL_PLAN_QUOTAS] || COMMERCIAL_PLAN_QUOTAS[COMMERCIAL_PLAN_KEYS.PADRAO];
    const monthlyCardLimit = override?.cardsPerMonth || quotas.cardsPerMonth || quotas.totalCards || 500;
    const dailyCardSafetyLimit = override?.dailyCardSafetyLimit || quotas.dailyCardSafetyLimit || 100;
    const userCount = Math.max(1, billableUsers);
    return {
      cards: {
        perUserLimit: null as number | null,
        companyCap: monthlyCardLimit,
        limit: monthlyCardLimit,
        monthlyLimit: monthlyCardLimit,
        dailySafetyLimit: dailyCardSafetyLimit,
      },
      emails: planKey === COMMERCIAL_PLAN_KEYS.MELHOR
        ? { perUserLimit: 35, companyCap: 150, limit: Math.min(userCount * 35, 150) }
        : { perUserLimit: null as number | null, companyCap: 25, limit: 25 },
      enrichment: {
        dailyLimit: quotas.enrichmentsPerDay || (planKey === COMMERCIAL_PLAN_KEYS.LITE ? 3 : dailyCardSafetyLimit),
      },
    };
  }

  private computeHbxSellerOperationalLimits(billableUsers: number) {
    const melhorLimits = this.computeLimits(COMMERCIAL_PLAN_KEYS.MELHOR, billableUsers);
    return {
      cards: {
        perUserLimit: null as number | null,
        companyCap: HBX_SELLER_MONTHLY_CARD_LIMIT,
        limit: HBX_SELLER_MONTHLY_CARD_LIMIT,
        monthlyLimit: HBX_SELLER_MONTHLY_CARD_LIMIT,
        dailySafetyLimit: HBX_SELLER_DAILY_CARD_LIMIT,
      },
      emails: melhorLimits.emails,
      enrichment: {
        dailyLimit: HBX_SELLER_DAILY_ENRICHMENT_LIMIT,
      },
    };
  }

  private async countLogs(companyId: number, eventTypes: string[], dayStart: Date, dayEnd: Date, userId?: number | null) {
    return this.prisma.companyCommercialUsageLog.count({
      where: {
        companyId,
        eventType: { in: eventTypes },
        createdAt: { gte: dayStart, lt: dayEnd },
        ...(userId ? { userId } : {}),
      },
    });
  }

  async getUsageSnapshot(companyId: number, userId?: number | null) {
    const company = await this.getCompanyPlan(companyId);
    const { dayStart, dayEnd } = this.getDayBounds(company.timezone);
    const { monthStart, monthEnd } = this.getMonthBounds(company.timezone);
    const userContext = await this.getUsageUserContext(userId);
    if (userContext.isSystemMaster) {
      return this.buildUnlimitedSnapshot({
        planKey: company.planKey,
        timezone: company.timezone,
        dayStart,
        dayEnd,
        monthStart,
        monthEnd,
      });
    }
    const billableUsers = await this.getBillableUserCount(companyId);
    const normalizedUserId = Number(userId || 0) || null;
    const hbxSellerOperation = Boolean(company.isMasterOperationalCompany && normalizedUserId && userContext.role === 'USER');
    const planKey = hbxSellerOperation ? 'hbx_seller' : company.planKey;
    const limits = hbxSellerOperation
      ? this.computeHbxSellerOperationalLimits(billableUsers)
      : this.computeLimits(company.planKey, billableUsers, company.quotaOverride);

    const [cardsGrossUsed, cardsUserGrossUsed, cardsDailyGrossUsed, cardsDailyUserGrossUsed, cardsRefunded, cardsUserRefunded, cardsDailyRefunded, cardsDailyUserRefunded, emailAttempted, emailSent, emailFailed, emailBlocked, emailUserSent, enrichmentDailyUsed, enrichmentDailyUserUsed] = await Promise.all([
      this.countLogs(companyId, CARD_SUCCESS_EVENTS, monthStart, monthEnd),
      normalizedUserId ? this.countLogs(companyId, CARD_SUCCESS_EVENTS, monthStart, monthEnd, normalizedUserId) : Promise.resolve(0),
      this.countLogs(companyId, CARD_SUCCESS_EVENTS, dayStart, dayEnd),
      normalizedUserId ? this.countLogs(companyId, CARD_SUCCESS_EVENTS, dayStart, dayEnd, normalizedUserId) : Promise.resolve(0),
      this.countLogs(companyId, CARD_REFUND_EVENTS, monthStart, monthEnd),
      normalizedUserId ? this.countLogs(companyId, CARD_REFUND_EVENTS, monthStart, monthEnd, normalizedUserId) : Promise.resolve(0),
      this.countLogs(companyId, CARD_REFUND_EVENTS, dayStart, dayEnd),
      normalizedUserId ? this.countLogs(companyId, CARD_REFUND_EVENTS, dayStart, dayEnd, normalizedUserId) : Promise.resolve(0),
      this.countLogs(companyId, ['presentation_email_attempt'], dayStart, dayEnd),
      this.countLogs(companyId, ['presentation_email_sent'], dayStart, dayEnd),
      this.countLogs(companyId, ['presentation_email_failed'], dayStart, dayEnd),
      this.countLogs(companyId, ['presentation_email_blocked_limit', 'presentation_email_blocked_policy'], dayStart, dayEnd),
      normalizedUserId ? this.countLogs(companyId, ['presentation_email_sent'], dayStart, dayEnd, normalizedUserId) : Promise.resolve(0),
      this.countLogs(companyId, LEAD_ENRICHMENT_SUCCESS_EVENTS, dayStart, dayEnd),
      normalizedUserId ? this.countLogs(companyId, LEAD_ENRICHMENT_SUCCESS_EVENTS, dayStart, dayEnd, normalizedUserId) : Promise.resolve(0),
    ]);
    const cardsUsed = Math.max(0, cardsGrossUsed - cardsRefunded);
    const cardsUserUsed = Math.max(0, cardsUserGrossUsed - cardsUserRefunded);
    const cardsDailyUsed = Math.max(0, cardsDailyGrossUsed - cardsDailyRefunded);
    const cardsDailyUserUsed = Math.max(0, cardsDailyUserGrossUsed - cardsDailyUserRefunded);
    const cardsDailyUsedForLimit = hbxSellerOperation ? cardsDailyUserUsed : cardsDailyUsed;
    const enrichmentDailyLimit = Math.max(0, Math.trunc(Number(limits.enrichment.dailyLimit || 0) || 0));
    const enrichmentDailyUsedForLimit = hbxSellerOperation ? enrichmentDailyUserUsed : enrichmentDailyUsed;
    const enrichmentDailyRemaining = Math.max(0, enrichmentDailyLimit - Math.max(0, enrichmentDailyUsedForLimit));
    const enrichmentAutoEnabled = planKey !== COMMERCIAL_PLAN_KEYS.LITE && enrichmentDailyRemaining > 0;

    return {
      planKey,
      timezone: company.timezone,
      dayStart: dayStart.toISOString(),
      dayEnd: dayEnd.toISOString(),
      monthStart: monthStart.toISOString(),
      monthEnd: monthEnd.toISOString(),
      cards: {
        used: cardsUsed,
        limit: limits.cards.limit,
        remaining: Math.max(0, limits.cards.limit - cardsUsed),
        perUserLimit: limits.cards.perUserLimit,
        companyCap: limits.cards.companyCap,
        userUsed: cardsUserUsed,
        userLimit: limits.cards.perUserLimit || limits.cards.limit,
        period: 'monthly',
        monthlyUsed: cardsUsed,
        monthlyLimit: limits.cards.monthlyLimit,
        monthlyRemaining: Math.max(0, limits.cards.monthlyLimit - cardsUsed),
        dailyUsed: cardsDailyUsedForLimit,
        dailyUserUsed: cardsDailyUserUsed,
        dailySafetyLimit: limits.cards.dailySafetyLimit,
        dailyRemaining: Math.max(0, limits.cards.dailySafetyLimit - cardsDailyUsedForLimit),
        refunded: cardsRefunded,
        grossUsed: cardsGrossUsed,
        dailyRefunded: cardsDailyRefunded,
        dailyGrossUsed: cardsDailyGrossUsed,
      },
      emails: {
        attempted: emailAttempted,
        sent: emailSent,
        failed: emailFailed,
        blocked: emailBlocked,
        limit: limits.emails.limit,
        remaining: Math.max(0, limits.emails.limit - emailSent),
        perUserLimit: limits.emails.perUserLimit,
        companyCap: limits.emails.companyCap,
        userSent: emailUserSent,
        userLimit: limits.emails.perUserLimit || limits.emails.limit,
      },
      enrichment: {
        used: Math.max(0, enrichmentDailyUsedForLimit),
        limit: enrichmentDailyLimit,
        remaining: enrichmentDailyRemaining,
        dailyUsed: Math.max(0, enrichmentDailyUsedForLimit),
        dailyUserUsed: Math.max(0, enrichmentDailyUserUsed),
        dailyLimit: enrichmentDailyLimit,
        dailyRemaining: enrichmentDailyRemaining,
        canAutoEnrich: enrichmentAutoEnabled,
        canManualEnrich: enrichmentDailyRemaining > 0,
        mode: planKey === COMMERCIAL_PLAN_KEYS.LITE
          ? 'manual_only'
          : enrichmentDailyRemaining > 0
            ? 'auto'
            : 'blocked_until_reset',
        period: 'daily',
      },
      billableUsers,
      resetAt: monthEnd.toISOString(),
      dailyResetAt: dayEnd.toISOString(),
    };
  }

  private async log(companyId: number, userId: number | null, eventType: string, source: string, metadata: Record<string, any> = {}) {
    const company = await this.getCompanyPlan(companyId);
    return this.prisma.companyCommercialUsageLog.create({
      data: {
        companyId,
        userId: Number(userId || 0) || null,
        planKey: company.planKey,
        eventType,
        source,
        metadataJson: JSON.stringify({ planKey: company.planKey, userId: Number(userId || 0) || null, ...metadata }),
      },
    });
  }

  async assertCanImportCard(companyId: number, userId?: number | null) {
    const snapshot = await this.getUsageSnapshot(companyId, userId);
    const userBlocked = snapshot.cards.perUserLimit != null && snapshot.cards.userUsed >= snapshot.cards.userLimit;
    const monthlyBlocked = snapshot.cards.remaining <= 0 || userBlocked;
    const dailyBlocked = Number(snapshot.cards.dailyRemaining || 0) <= 0;
    if (monthlyBlocked || dailyBlocked) {
      await this.log(companyId, Number(userId || 0) || null, 'card_import_blocked', 'usage_limit', {
        reason: userBlocked
          ? 'monthly_user_card_limit_reached'
          : monthlyBlocked
            ? 'monthly_card_limit_reached'
            : 'daily_card_safety_limit_reached',
      });
      throw new ConflictException({
        code: monthlyBlocked ? 'MONTHLY_CARD_LIMIT_REACHED' : 'DAILY_CARD_SAFETY_LIMIT_REACHED',
        message: monthlyBlocked
          ? 'Limite mensal de cards atingido. O contador reinicia no próximo ciclo mensal.'
          : 'Trava diária de segurança atingida. O limite mensal continua o mesmo; tente novamente após 00:00.',
        usage: snapshot,
      });
    }
    await this.log(companyId, Number(userId || 0) || null, 'card_import_attempt', 'usage_limit');
    return snapshot;
  }

  async recordCardImport(companyId: number, userId: number | null, metadata: Record<string, any> = {}) {
    const source = String(metadata.source || 'vendas');
    const eventType = metadata.eventType || (source === 'radar_claim' ? 'radar_card_claimed' : 'vendas_card_imported');
    return this.log(companyId, userId, eventType, source, { status: 'success', ...metadata });
  }

  private normalizeUsageKey(value: unknown) {
    return String(value || '').trim().replace(/[^a-zA-Z0-9:_-]+/g, '-').slice(0, 160);
  }

  async recordCardCommercialUseOnce(companyId: number, userId: number | null, metadata: Record<string, any> = {}) {
    const usageKey = this.normalizeUsageKey(metadata.usageKey || metadata.vendasLeadId || metadata.radarLeadId);
    if (!usageKey) {
      await this.assertCanImportCard(companyId, userId);
      await this.log(companyId, userId, 'card_commercial_used', String(metadata.source || 'commercial_use'), {
        status: 'success',
        ...metadata,
      });
      return { debited: true, alreadyDebited: false };
    }
    const existing = await this.prisma.companyCommercialUsageLog.findFirst({
      where: {
        companyId,
        eventType: { in: CARD_SUCCESS_EVENTS },
        metadataJson: { contains: `"usageKey":"${usageKey}"` },
      },
      select: { id: true },
    });
    if (existing) return { debited: false, alreadyDebited: true };
    await this.assertCanImportCard(companyId, userId);
    await this.log(companyId, userId, 'card_commercial_used', String(metadata.source || 'commercial_use'), {
      status: 'success',
      ...metadata,
      usageKey,
    });
    return { debited: true, alreadyDebited: false };
  }

  async recordLeadEnrichmentUseOnce(companyId: number, userId: number | null, metadata: Record<string, any> = {}) {
    const usageKey = this.normalizeUsageKey(metadata.usageKey || metadata.vendasLeadId || metadata.leadId);
    if (usageKey) {
      const existing = await this.prisma.companyCommercialUsageLog.findFirst({
        where: {
          companyId,
          eventType: { in: LEAD_ENRICHMENT_SUCCESS_EVENTS },
          metadataJson: { contains: `"usageKey":"${usageKey}"` },
        },
        select: { id: true },
      });
      if (existing) {
        return { debited: false, alreadyDebited: true, usage: await this.getUsageSnapshot(companyId, userId) };
      }
    }

    const snapshot = await this.getUsageSnapshot(companyId, userId);
    if (Number(snapshot.enrichment?.dailyRemaining || 0) <= 0) {
      await this.log(companyId, Number(userId || 0) || null, 'lead_enrichment_blocked', 'lead_enrichment', {
        reason: 'daily_enrichment_limit_reached',
        ...metadata,
        usageKey: usageKey || undefined,
      });
      throw new ConflictException({
        code: 'DAILY_LEAD_ENRICHMENT_LIMIT_REACHED',
        message: 'Créditos de enriquecimento de hoje acabaram. Cards novos seguem básicos até o reset diário.',
        usage: snapshot,
      });
    }

    await this.log(companyId, userId, 'lead_enrichment_used', String(metadata.source || 'lead_enrichment'), {
      status: 'success',
      ...metadata,
      usageKey: usageKey || undefined,
    });
    return { debited: true, alreadyDebited: false, usage: await this.getUsageSnapshot(companyId, userId) };
  }

  async recordCardRefund(companyId: number, userId: number | null, metadata: Record<string, any> = {}) {
    const count = Math.max(1, Math.min(100, Math.trunc(Number(metadata.count || 1) || 1)));
    const writes = Array.from({ length: count }, (_, index) =>
      this.log(companyId, userId, 'vendas_card_refunded', 'vendas_complaint_refund', {
        status: 'refunded',
        refundIndex: index + 1,
        ...metadata,
        count,
      }),
    );
    return Promise.all(writes);
  }

  async assertCanSendPresentationEmail(companyId: number, userId?: number | null) {
    const snapshot = await this.getUsageSnapshot(companyId, userId);
    const userBlocked = snapshot.emails.perUserLimit != null && snapshot.emails.userSent >= snapshot.emails.userLimit;
    if (snapshot.emails.remaining <= 0 || userBlocked) {
      await this.log(companyId, Number(userId || 0) || null, 'presentation_email_blocked_limit', 'email_presentation', {
        reason: userBlocked ? 'daily_user_email_limit_reached' : 'daily_email_limit_reached',
      });
      throw new ConflictException({
        code: 'DAILY_EMAIL_LIMIT_REACHED',
        message: snapshot.planKey === COMMERCIAL_PLAN_KEYS.MELHOR
          ? 'Limite diário da empresa atingido. Aguarde o reset ou reduza uso por equipe.'
          : 'Limite diário atingido. O contador reinicia às 00:00.',
        usage: snapshot,
      });
    }
    return snapshot;
  }

  async recordPresentationEmailAttempt(companyId: number, userId: number | null, metadata: Record<string, any> = {}) {
    return this.log(companyId, userId, 'presentation_email_attempt', 'email_presentation', metadata);
  }

  async recordPresentationEmailResult(companyId: number, userId: number | null, metadata: Record<string, any> = {}) {
    const status = String(metadata.status || '').trim();
    const eventType = status === 'sent'
      ? 'presentation_email_sent'
      : status === 'blocked'
        ? 'presentation_email_blocked_policy'
        : 'presentation_email_failed';
    return this.log(companyId, userId, eventType, 'email_presentation', metadata);
  }
}
