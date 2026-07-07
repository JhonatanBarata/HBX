import { ConflictException, Injectable, Optional } from '@nestjs/common';
import { isPlatformInfraCompany } from '../common/company-kind';
import { PrismaService } from '../prisma/prisma.service';
import { CreditsService } from '../credits/credits.service';
import { COMMERCIAL_PLAN_KEYS, COMMERCIAL_PLAN_QUOTAS, resolveCommercialPlanKeyForCapabilities } from './commercial-plan-catalog';
import { resolveRadarSearchAllowance, resolveSellerCardQuota } from './seller-card-quota.util';
import {
  TEAM_POLICY_UNLIMITED_LIMIT,
  loadUserTeamPolicyRuntime,
  resolveTeamPolicyStoredLimit,
  type RuntimeTeamPolicy,
} from '../team/team-policy-persistence';

const FALLBACK_TIMEZONE = 'America/Sao_Paulo';
const CARD_SUCCESS_EVENTS = ['card_import_success', 'vendas_card_imported', 'radar_card_claimed', 'card_commercial_used'];
const CARD_REFUND_EVENTS = ['vendas_card_refunded'];
const LEAD_ENRICHMENT_SUCCESS_EVENTS = ['lead_enrichment_used'];
const SELLER_ACTIVE_CARD_LIMIT_MIN = 5;
const SELLER_ACTIVE_CARD_LIMIT_MAX = 100;
// Sentinela "sem teto" — vendedor ilimitado até o teto do plano (lei do dono 27/06).
const SELLER_ACTIVE_CARD_LIMIT_UNLIMITED = 999999;
// VENDAS-REFAB S1: penalidade automática de inatividade (corta effectiveLimit sozinha
// com o vendedor sumido) só roda se o admin ligar explicitamente. Default OFF — mesmo
// vendedor COM teto configurado (targetStockPerSeller) não perde slot por inatividade
// até o admin optar. Isso é adicional à regra-mãe: sem teto nenhum, já é ilimitado.
function isSellerInactivityPenaltyEnabled(): boolean {
  return String(process.env.HBX_SELLER_INACTIVITY_PENALTY_ENABLED || '').trim().toLowerCase() === 'true';
}
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
  // unlimited = vendedor SEM teto de cards ativos (lei do dono 27/06: nasce no
  // máximo, até o teto do plano). Só vira limitado quando o admin OPTA por um
  // teto — targetStockPerSeller (regra de distribuição) ou activeCards (team policy).
  unlimited: boolean;
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
  constructor(
    private readonly prisma: PrismaService,
    // CRÉDITOS S2 — shadow-debit (MEDIÇÃO atrás de HBX_CREDITS_SHADOW, default OFF). Emitido
    // do DONO da baixa (este service), no ponto único onde a cota mensal da empresa é de fato
    // consumida — cobre TODOS os callers (vendas + radar) por construção. Direção de import
    // única: CommercialPlansModule -> CreditsModule (CreditsModule só depende de PrismaModule,
    // não fecha ciclo). Injetado como opcional-defensivo: se ausente, os logs de cota seguem
    // normais (o shadow simplesmente não dispara).
    @Optional() private readonly creditsService?: CreditsService,
  ) {}

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
      select: { selectedPlanKey: true, timezone: true, companyKind: true },
    });
    const quotaOverrideRows = await this.prisma.$queryRawUnsafe<Array<{
      commercialCardsMonthlyLimitOverride: number | null;
      commercialCardsDailyLimitOverride: number | null;
    }>>(
      'SELECT "commercialCardsMonthlyLimitOverride", "commercialCardsDailyLimitOverride" FROM "Company" WHERE "id" = $1 LIMIT 1',
      Number(companyId),
    ).catch(() => []);
    const quotaOverride = quotaOverrideRows[0] || null;
    const platformInfra = isPlatformInfraCompany(company);
    const planKey = platformInfra ? 'platform_infra' : resolveCommercialPlanKeyForCapabilities(company || {});
    return {
      planKey,
      timezone: this.normalizeTimezone(company?.timezone),
      isPlatformInfra: platformInfra,
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

  // Teto de cards ativos por vendedor configurado PELO ADMIN (regra de
  // distribuição da empresa). null = admin NÃO setou teto → vendedor nasce
  // ILIMITADO (lei do dono 27/06): o teto é o do plano, não um número de fábrica.
  // O 20 antigo era default escondido — agora só existe quando o admin opta.
  private async getSellerActiveCardBaseLimit(companyId: number): Promise<number | null> {
    const rule = await this.prisma.radarAutoDistributionRule.findFirst({
      where: {
        companyId,
        scope: 'company',
      },
      orderBy: [{ status: 'desc' }, { updatedAt: 'desc' }],
      select: { targetStockPerSeller: true },
    }).catch(() => null);
    const target = Math.trunc(Number(rule?.targetStockPerSeller || 0) || 0);
    if (!Number.isFinite(target) || target <= 0) return null;
    return this.clampInteger(target, SELLER_ACTIVE_CARD_LIMIT_MIN, SELLER_ACTIVE_CARD_LIMIT_MAX);
  }

  private async countSellerActiveVendasCards(companyId: number, userId: number) {
    const now = new Date();
    return this.prisma.vendasLead.count({
      where: {
        companyId,
        assignedUserId: userId,
        status: { in: ACTIVE_VENDAS_CARD_STATUSES },
        closedAt: null,
        // cards com retorno agendado pro futuro NÃO ocupam vaga (voltam quando returnAt passar)
        OR: [{ returnAt: null }, { returnAt: { lte: now } }],
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

  async getSellerActiveCardQuotaSnapshot(companyIdRaw: number, userIdRaw: number): Promise<SellerActiveCardQuotaSnapshot> {
    const companyId = Math.trunc(Number(companyIdRaw || 0));
    const userId = Math.trunc(Number(userIdRaw || 0));
    const unlimited = SELLER_ACTIVE_CARD_LIMIT_UNLIMITED;
    if (!companyId || !userId) {
      return {
        companyId,
        userId,
        seller: false,
        paused: false,
        unlimited: true,
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
        select: { companyKind: true },
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
        unlimited: true,
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
    const [baseLimit, teamPolicy, vendasActive, radarActive, salesWonLast30, lastSeenAt] = await Promise.all([
      this.getSellerActiveCardBaseLimit(companyId),
      loadUserTeamPolicyRuntime(this.prisma, userId),
      this.countSellerActiveVendasCards(companyId, userId),
      this.countSellerActiveRadarCards(companyId, userId),
      this.countSellerWonCardsLast30Days(companyId, userId, now),
      this.getSellerLastSeenAt(userId, this.parseDate(user?.createdAt)),
    ]);
    const activeCount = Math.max(0, Math.trunc(Number(vendasActive || 0) + Number(radarActive || 0)));
    const activeCardsPolicy = resolveTeamPolicyStoredLimit(teamPolicy, 'activeCards');
    const policyActiveLimit = activeCardsPolicy.applies
      ? Math.max(0, Math.trunc(Number(activeCardsPolicy.limit || 0) || 0))
      : null;

    // Precedência do teto (lei do dono 27/06): (1) teto da PESSOA na team policy,
    // (2) teto da EMPRESA (regra de distribuição), senão ILIMITADO até o plano.
    // A cota dinâmica (base/bônus/penalidade) só roda quando há teto configurado.
    let isUnlimited = false;
    let bonus = 0;
    let inactivityPenalty = 0;
    let resolvedBase: number;
    let effectiveLimit: number;
    if (policyActiveLimit !== null) {
      resolvedBase = policyActiveLimit;
      effectiveLimit = paused ? 0 : policyActiveLimit;
    } else if (baseLimit !== null) {
      const quota = resolveSellerCardQuota({
        config: {
          baseActiveCardLimit: baseLimit,
          minActiveCardLimit: SELLER_ACTIVE_CARD_LIMIT_MIN,
          maxActiveCardLimit: SELLER_ACTIVE_CARD_LIMIT_MAX,
          paused,
          allowInactivityPenalty: isSellerInactivityPenaltyEnabled(),
        },
        salesWonLast30,
        inactivityDays: this.daysSince(lastSeenAt, now),
      });
      resolvedBase = baseLimit;
      bonus = quota.bonus;
      inactivityPenalty = quota.inactivityPenalty;
      effectiveLimit = quota.effectiveLimit;
    } else {
      isUnlimited = true;
      resolvedBase = SELLER_ACTIVE_CARD_LIMIT_UNLIMITED;
      effectiveLimit = paused ? 0 : SELLER_ACTIVE_CARD_LIMIT_UNLIMITED;
    }
    const availableSlots = isUnlimited && !paused
      ? SELLER_ACTIVE_CARD_LIMIT_UNLIMITED
      : Math.max(0, effectiveLimit - activeCount);
    return {
      companyId,
      userId,
      seller: true,
      paused,
      unlimited: isUnlimited,
      activeCount,
      baseLimit: resolvedBase,
      bonus,
      inactivityPenalty,
      effectiveLimit,
      availableSlots,
      salesWonLast30,
      lastSeenAt: lastSeenAt ? lastSeenAt.toISOString() : null,
      code: paused
        ? 'SELLER_QUOTA_PAUSED'
        : !isUnlimited && availableSlots <= 0
          ? 'SELLER_CARD_QUOTA_REACHED'
          : null,
    };
  }

  // Capacidade da carteira para a UI de Vendas (faixa "por que o Radar parou de
  // buscar"): traduz o snapshot de cota em números prontos pro medidor. Para quem
  // NÃO é vendedor (gestor/admin), devolve o teto-alvo da empresa por vendedor como
  // capacidade de referência — o gestor enxerga exatamente o limite que trava os
  // vendedores dele, sem inventar número. READ-ONLY: não cobra, não move dinheiro.
  async getSellerCardCapacitySnapshot(companyIdRaw: number, userIdRaw?: number | null) {
    const companyId = Math.trunc(Number(companyIdRaw || 0));
    const userId = Math.trunc(Number(userIdRaw || 0)) || 0;
    const [snapshot, companyTarget] = await Promise.all([
      this.getSellerActiveCardQuotaSnapshot(companyId, userId),
      this.getSellerActiveCardBaseLimit(companyId).catch(() => null),
    ]);
    if (snapshot.seller) {
      return {
        isSeller: true,
        unlimited: snapshot.unlimited,
        activeCards: snapshot.activeCount,
        capacity: snapshot.effectiveLimit,
        availableSlots: snapshot.availableSlots,
        paused: snapshot.paused,
        full: snapshot.paused || (!snapshot.unlimited && snapshot.availableSlots <= 0),
        code: snapshot.code,
        companyTarget,
      };
    }
    // Gestor/admin: numerador (cards ativos) é resolvido por quem chama (board),
    // aqui só entregamos o teto de referência da empresa. Sem teto configurado
    // (companyTarget null) = sem teto de referência (ilimitado).
    return {
      isSeller: false,
      unlimited: companyTarget == null,
      activeCards: null as number | null,
      capacity: companyTarget ?? SELLER_ACTIVE_CARD_LIMIT_UNLIMITED,
      availableSlots: null as number | null,
      paused: false,
      full: false,
      code: null as string | null,
      companyTarget,
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
    const [snapshot, teamPolicy] = await Promise.all([
      this.getSellerActiveCardQuotaSnapshot(companyId, userId),
      loadUserTeamPolicyRuntime(this.prisma, userId),
    ]);
    if (!snapshot.seller) return { limit: requested, quota: snapshot };
    const allowance = resolveRadarSearchAllowance({
      sellerId: userId,
      companyId,
      requestedLimit: requested,
      activeCount: snapshot.activeCount,
      effectiveLimit: snapshot.effectiveLimit,
    });
    const vendasPullPolicy = resolveTeamPolicyStoredLimit(teamPolicy, 'vendasPullQuantity');
    const policyLimitedAllowance = vendasPullPolicy.applies
      ? Math.min(allowance.allowedLimit, Math.max(0, Math.trunc(Number(vendasPullPolicy.limit || 0) || 0)))
      : allowance.allowedLimit;
    return {
      limit: policyLimitedAllowance,
      quota: snapshot,
    };
  }

  private async isSystemMasterUser(userId?: number | null) {
    const context = await this.getUsageUserContext(userId);
    return context.isSystemMaster;
  }

  private async getUsageUserContext(userId?: number | null) {
    const normalizedUserId = Number(userId || 0) || null;
    if (!normalizedUserId) {
      return {
        isSystemMaster: false,
        role: null as string | null,
        teamPolicy: null as RuntimeTeamPolicy | null,
      };
    }
    const [user, teamPolicy] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: normalizedUserId },
        select: { isSystemMaster: true, role: true },
      }).catch(() => null),
      loadUserTeamPolicyRuntime(this.prisma, normalizedUserId),
    ]);
    return {
      isSystemMaster: Boolean(user?.isSystemMaster),
      role: String(user?.role || '').trim().toUpperCase() || null,
      teamPolicy,
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
        dailyLimitSource: 'system_master',
        configuredDailyLimit: null as number | null,
        fallbackDailyLimit: null as number | null,
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

  private buildZeroSnapshot(input: {
    planKey: string;
    timezone: string;
    dayStart: Date;
    dayEnd: Date;
    monthStart: Date;
    monthEnd: Date;
  }) {
    return {
      planKey: input.planKey,
      timezone: input.timezone,
      dayStart: input.dayStart.toISOString(),
      dayEnd: input.dayEnd.toISOString(),
      monthStart: input.monthStart.toISOString(),
      monthEnd: input.monthEnd.toISOString(),
      cards: {
        used: 0,
        limit: 0,
        remaining: 0,
        perUserLimit: 0,
        companyCap: 0,
        userUsed: 0,
        userLimit: 0,
        period: 'monthly',
        monthlyUsed: 0,
        monthlyLimit: 0,
        monthlyRemaining: 0,
        dailyUsed: 0,
        dailySafetyLimit: 0,
        dailyRemaining: 0,
      },
      emails: {
        attempted: 0,
        sent: 0,
        failed: 0,
        blocked: 0,
        limit: 0,
        remaining: 0,
        perUserLimit: 0,
        companyCap: 0,
        userSent: 0,
        userLimit: 0,
      },
      enrichment: {
        used: 0,
        limit: 0,
        remaining: 0,
        dailyUsed: 0,
        dailyLimit: 0,
        dailyRemaining: 0,
        dailyLimitSource: 'platform_infra',
        configuredDailyLimit: null as number | null,
        fallbackDailyLimit: null as number | null,
        canAutoEnrich: false,
        canManualEnrich: false,
        mode: 'blocked',
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
        dailyLimitSource: 'plan',
        configuredDailyLimit: null as number | null,
        fallbackDailyLimit: null as number | null,
      },
    };
  }

  private applyTeamPolicyUsageLimits(limits: any, policy: RuntimeTeamPolicy | null) {
    if (!policy) {
      return {
        dailyCardsUseUserScope: false,
        enrichmentUseUserScope: false,
      };
    }
    const bounded = (value: number, planLimit: number) => {
      const normalized = Math.max(0, Math.trunc(Number(value || 0) || 0));
      const plan = Math.max(0, Math.trunc(Number(planLimit || 0) || 0));
      return Math.min(normalized, plan);
    };

    let dailyCardsUseUserScope = false;
    let enrichmentUseUserScope = false;

    const cardDeliveryDaily = resolveTeamPolicyStoredLimit(policy, 'cardDeliveryDaily');
    if (cardDeliveryDaily.applies) {
      const currentDailyLimit = Math.max(0, Math.trunc(Number(limits.cards.dailySafetyLimit || 0) || 0));
      const dailyLimit = cardDeliveryDaily.mode === 'unlimited'
        ? currentDailyLimit
        : bounded(Number(cardDeliveryDaily.limit || 0), currentDailyLimit || TEAM_POLICY_UNLIMITED_LIMIT);
      limits.cards.dailySafetyLimit = dailyLimit;
      limits.cards.dailyLimitSource = 'team_policy';
      dailyCardsUseUserScope = true;
    }

    const monthlyCards = resolveTeamPolicyStoredLimit(policy, 'monthlyCards');
    if (monthlyCards.applies) {
      if (monthlyCards.mode === 'unlimited') {
        limits.cards.perUserLimit = null;
      } else {
        limits.cards.perUserLimit = bounded(Number(monthlyCards.limit || 0), Number(limits.cards.limit || 0));
      }
      limits.cards.userLimitSource = 'team_policy';
    }

    const enrichmentDaily = resolveTeamPolicyStoredLimit(policy, 'enrichmentDaily');
    if (enrichmentDaily.applies) {
      const currentEnrichmentLimit = Math.max(0, Math.trunc(Number(limits.enrichment.dailyLimit || 0) || 0));
      const dailyLimit = enrichmentDaily.mode === 'unlimited'
        ? currentEnrichmentLimit
        : bounded(Number(enrichmentDaily.limit || 0), currentEnrichmentLimit || TEAM_POLICY_UNLIMITED_LIMIT);
      limits.enrichment.dailyLimit = dailyLimit;
      limits.enrichment.dailyLimitSource = 'team_policy';
      limits.enrichment.configuredDailyLimit = enrichmentDaily.configuredLimit;
      limits.enrichment.fallbackDailyLimit = currentEnrichmentLimit;
      enrichmentUseUserScope = true;
    }

    return {
      dailyCardsUseUserScope,
      enrichmentUseUserScope,
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
    if (company.isPlatformInfra) {
      return this.buildZeroSnapshot({
        planKey: company.planKey,
        timezone: company.timezone,
        dayStart,
        dayEnd,
        monthStart,
        monthEnd,
      });
    }
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
    const planKey = company.planKey;
    const limits = this.computeLimits(company.planKey, billableUsers, company.quotaOverride);
    const policyScope = this.applyTeamPolicyUsageLimits(limits, userContext.teamPolicy);

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
    const cardsDailyUsedForLimit = policyScope.dailyCardsUseUserScope ? cardsDailyUserUsed : cardsDailyUsed;
    const enrichmentDailyLimit = Math.max(0, Math.trunc(Number(limits.enrichment.dailyLimit || 0) || 0));
    const enrichmentDailyUsedForLimit = policyScope.enrichmentUseUserScope ? enrichmentDailyUserUsed : enrichmentDailyUsed;
    const enrichmentDailyRemaining = Math.max(0, enrichmentDailyLimit - Math.max(0, enrichmentDailyUsedForLimit));
    const enrichmentAutoEnabled = false;

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
        userLimit: limits.cards.perUserLimit != null ? limits.cards.perUserLimit : limits.cards.limit,
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
        userLimit: limits.emails.perUserLimit != null ? limits.emails.perUserLimit : limits.emails.limit,
      },
      enrichment: {
        used: Math.max(0, enrichmentDailyUsedForLimit),
        limit: enrichmentDailyLimit,
        remaining: enrichmentDailyRemaining,
        dailyUsed: Math.max(0, enrichmentDailyUsedForLimit),
        dailyUserUsed: Math.max(0, enrichmentDailyUserUsed),
        dailyLimit: enrichmentDailyLimit,
        dailyRemaining: enrichmentDailyRemaining,
        dailyLimitSource: limits.enrichment.dailyLimitSource,
        configuredDailyLimit: limits.enrichment.configuredDailyLimit,
        fallbackDailyLimit: limits.enrichment.fallbackDailyLimit,
        canAutoEnrich: enrichmentAutoEnabled,
        canManualEnrich: enrichmentDailyRemaining > 0,
        mode: enrichmentDailyRemaining > 0
          ? 'manual_only'
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

  // R5 (FASE 2 — REMOÇÃO, definitivo): cota count-based (mensal/diária por
  // plano) DEIXA DE BLOQUEAR — vira só leitura/telemetria. O teto real agora é
  // o saldo de crédito (CreditWalletService, gate em enforceLeadDeliveryDebit
  // logo abaixo, que continua rodando normalmente). Mantém o LOG de "teria
  // bloqueado" (mesmo evento de antes) para não perder o dado histórico/
  // comparativo, mas nunca mais lança ConflictException por conta disso.
  async assertCanImportCard(companyId: number, userId?: number | null) {
    const snapshot = await this.getUsageSnapshot(companyId, userId);
    const userBlocked = snapshot.cards.perUserLimit != null && snapshot.cards.userUsed >= snapshot.cards.userLimit;
    const monthlyBlocked = snapshot.cards.remaining <= 0 || userBlocked;
    const dailyBlocked = Number(snapshot.cards.dailyRemaining || 0) <= 0;
    if (monthlyBlocked || dailyBlocked) {
      // FRONTEIRA cota-de-plano × crédito (decisão do dono 07/07): conta de CRÉDITO (cortesia,
      // modelo grátis) NÃO tem cota de plano — o teto real é o saldo, checado no débito por-lead
      // (enforceLeadDeliveryDebit logo abaixo no fluxo). Registrar `card_import_limit_shadow`
      // ("limite de plano atingido") pra ela seria RUÍDO/mentira. Só consultamos o CreditsService
      // AQUI (caminho frio: a cota de plano já teria "estourado") — custo zero no caminho normal.
      // Reusa o método público isCreditsAccountCompany (sem duplicar o critério exempt/manual).
      const isCreditAccount = this.creditsService && typeof this.creditsService.isCreditsAccountCompany === 'function'
        ? await this.creditsService.isCreditsAccountCompany(companyId).catch(() => false)
        : false;
      if (!isCreditAccount) {
        await this.log(companyId, Number(userId || 0) || null, 'card_import_limit_shadow', 'usage_limit', {
          reason: userBlocked
            ? 'monthly_user_card_limit_reached'
            : monthlyBlocked
              ? 'monthly_card_limit_reached'
              : 'daily_card_safety_limit_reached',
        });
      }
    }
    await this.log(companyId, Number(userId || 0) || null, 'card_import_attempt', 'usage_limit');
    return snapshot;
  }

  async recordCardImport(companyId: number, userId: number | null, metadata: Record<string, any> = {}) {
    const source = String(metadata.source || 'vendas');
    const eventType = metadata.eventType || (source === 'radar_claim' ? 'radar_card_claimed' : 'vendas_card_imported');
    // CRÉDITOS R1 — gate REAL ANTES do log de sucesso: sem saldo (fail-closed), a entrega
    // PARA e nada é gravado como sucesso. Com o gate OFF (2 chaves), é no-op transparente.
    await this.enforceLeadDeliveryDebit(companyId, userId, metadata);
    const result = await this.log(companyId, userId, eventType, source, { status: 'success', ...metadata });
    // CRÉDITOS S2 — shadow-debit no ponto ÚNICO da baixa. recordCardImport loga
    // vendas_card_imported/radar_card_claimed (2 dos 4 CARD_SUCCESS_EVENTS que contam a cota);
    // hookear aqui cobre a entrega automática do Radar (radar_claim) + imports diretos por
    // construção, sem caçar call-site.
    this.emitLeadDeliveryShadowDebit(companyId, userId, metadata);
    return result;
  }

  private normalizeUsageKey(value: unknown) {
    return String(value || '').trim().replace(/[^a-zA-Z0-9:_-]+/g, '-').slice(0, 160);
  }

  /**
   * CRÉDITOS S2 — chave CANÔNICA de lead para o shadow-debit. Precisa ser IDÊNTICA quando
   * recordCardImport e recordCardCommercialUseOnce falam do mesmo lead, senão a idempotência 1:1
   * fura (2 shadows p/ 1 baixa). Os callers passam a mesma origem por caminhos diferentes:
   *   - vendas: usageKey já vem `vendas:<id>` OU `radar:<id>`
   *   - radar recordCardCommercialUseOnce: usageKey `radar:<id>`
   *   - radar recordCardImport: SÓ `radarLeadId: <id>` cru (sem usageKey)
   * Então: se veio usageKey explícita, usa; senão reconstrói `radar:<radarLeadId>` /
   * `vendas:<vendasLeadId>` — o MESMO shape que os outros caminhos produzem. Assim
   * `radar_claim` (import) e `radar_contact_click` (commercial-use) do mesmo lead colidem em 1.
   */
  private resolveLeadDeliveryKey(metadata: Record<string, any>): string {
    const explicit = this.normalizeUsageKey(metadata?.usageKey || '');
    if (explicit) return explicit;
    const radarLeadId = String(metadata?.radarLeadId ?? '').trim();
    if (radarLeadId) return this.normalizeUsageKey(`radar:${radarLeadId}`);
    const vendasLeadId = String(metadata?.vendasLeadId ?? '').trim();
    if (vendasLeadId) return this.normalizeUsageKey(`vendas:${vendasLeadId}`);
    return '';
  }

  /**
   * CRÉDITOS S2 — dispara o shadow-debit (MEDIÇÃO, sem enforcement) a partir do dono da baixa.
   * Best-effort e fire-and-forget: NÃO await bloqueante, o try/catch mora dentro do próprio
   * recordShadowDebit (que também é no-op com HBX_CREDITS_SHADOW OFF). A idempotência por
   * usageKey lá dentro garante 1 shadow por lead mesmo que recordCardImport E
   * recordCardCommercialUseOnce disparem pro MESMO lead (a cota real também só conta 1×, via o
   * findFirst de CARD_SUCCESS_EVENTS).
   */
  private emitLeadDeliveryShadowDebit(companyId: number, userId: number | null, metadata: Record<string, any>) {
    if (!this.creditsService) return;
    const leadId = this.resolveLeadDeliveryKey(metadata);
    if (!leadId) return;
    void this.creditsService
      .recordShadowDebit(companyId, userId, { leadId, actionKey: 'lead_delivery' })
      .catch(() => undefined);
  }

  /**
   * CRÉDITOS R1 — gate REAL (bloqueante) no MESMO ponto/MESMA chave canônica do shadow (S2).
   * Diferente do shadow (fire-and-forget), este AWAIT e PODE LANÇAR: se o gate (2 chaves) está
   * ON e não há saldo (ou o vendedor estourou o teto S4), a exceção sobe e a chamada de fora
   * (recordCardImport/recordCardCommercialUseOnce) PARA antes de logar sucesso — fail-closed.
   * Com o gate OFF (`isEnforceActiveForCompany` false), o próprio CreditsService devolve
   * `applied: false` sem tocar o banco — no-op transparente, shadow continua sendo a única
   * medição ativa.
   */
  private async enforceLeadDeliveryDebit(companyId: number, userId: number | null, metadata: Record<string, any>) {
    // Defensivo: se o provider injetado (fake/mock de teste, ou versão antiga do módulo) não
    // expõe assertAndDebitLeadDelivery, trata como enforcement indisponível/OFF — nunca quebra
    // o caminho de venda por causa de um shape de objeto diferente.
    if (!this.creditsService || typeof this.creditsService.assertAndDebitLeadDelivery !== 'function') return;
    const leadId = this.resolveLeadDeliveryKey(metadata);
    if (!leadId) return;
    const isBillingAudienceUser = Boolean(metadata?.isBillingAudienceUser);
    await this.creditsService.assertAndDebitLeadDelivery(companyId, userId, {
      leadId,
      actionKey: 'lead_delivery',
      isBillingAudienceUser,
    });
  }

  async recordCardCommercialUseOnce(companyId: number, userId: number | null, metadata: Record<string, any> = {}) {
    const usageKey = this.normalizeUsageKey(metadata.usageKey || metadata.vendasLeadId || metadata.radarLeadId);
    if (!usageKey) {
      await this.assertCanImportCard(companyId, userId);
      // CRÉDITOS R1 — gate REAL ANTES do log de sucesso (ver enforceLeadDeliveryDebit).
      await this.enforceLeadDeliveryDebit(companyId, userId, metadata);
      await this.log(companyId, userId, 'card_commercial_used', String(metadata.source || 'commercial_use'), {
        status: 'success',
        ...metadata,
      });
      // CRÉDITOS S2 — shadow-debit no ponto único da baixa (ver emitLeadDeliveryShadowDebit).
      this.emitLeadDeliveryShadowDebit(companyId, userId, metadata);
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
    // CRÉDITOS R1 — gate REAL ANTES do log de sucesso. Passa a usageKey já normalizada para
    // bater EXATAMENTE com a mesma chave do shadow/recordCardImport do mesmo lead.
    await this.enforceLeadDeliveryDebit(companyId, userId, { ...metadata, usageKey });
    await this.log(companyId, userId, 'card_commercial_used', String(metadata.source || 'commercial_use'), {
      status: 'success',
      ...metadata,
      usageKey,
    });
    // CRÉDITOS S2 — shadow-debit no ponto único da baixa. Passa a usageKey já normalizada para o
    // leadId bater EXATAMENTE com o de recordCardImport do mesmo lead (idempotência 1:1).
    this.emitLeadDeliveryShadowDebit(companyId, userId, { ...metadata, usageKey });
    return { debited: true, alreadyDebited: false };
  }

  // R5 (FASE 2 — REMOÇÃO, definitivo): enriquecimento é capacidade GRÁTIS
  // (D1 do PLANO — RBAC decide se pode, não crédito nem cota de plano). O
  // limite diário por plano deixa de bloquear; mantém o log de telemetria.
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
      await this.log(companyId, Number(userId || 0) || null, 'lead_enrichment_limit_shadow', 'lead_enrichment', {
        reason: 'daily_enrichment_limit_reached',
        ...metadata,
        usageKey: usageKey || undefined,
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
    const result = await Promise.all(writes);
    // CRÉDITOS R1 — refund atômico on-failure no MESMO ponto do evento `vendas_card_refunded`
    // já existente (spec R1). Best-effort: reusa a chave canônica do lead (mesma resolvida no
    // enforcement/shadow); se o gate estiver OFF ou não houver débito pra essa usageKey, o
    // CreditsService.refundLeadDelivery é no-op silencioso (nada a reverter).
    if (this.creditsService && typeof this.creditsService.refundLeadDelivery === 'function') {
      const leadId = this.resolveLeadDeliveryKey(metadata);
      if (leadId) {
        void this.creditsService
          .refundLeadDelivery(companyId, userId, { leadId, actionKey: 'lead_delivery' })
          .catch(() => undefined);
      }
    }
    return result;
  }

  // R5 (FASE 2 — REMOÇÃO, definitivo): cota diária de e-mail por plano deixa
  // de bloquear (mesma régua do resto da cota count-based). Mantém telemetria.
  async assertCanSendPresentationEmail(companyId: number, userId?: number | null) {
    const snapshot = await this.getUsageSnapshot(companyId, userId);
    const userBlocked = snapshot.emails.perUserLimit != null && snapshot.emails.userSent >= snapshot.emails.userLimit;
    if (snapshot.emails.remaining <= 0 || userBlocked) {
      await this.log(companyId, Number(userId || 0) || null, 'presentation_email_limit_shadow', 'email_presentation', {
        reason: userBlocked ? 'daily_user_email_limit_reached' : 'daily_email_limit_reached',
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
