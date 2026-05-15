import { ConflictException, Injectable } from '@nestjs/common';
import { MASTER_WHATSAPP_ENGINE_COMPANY_SLUG } from '../companies/master-whatsapp-company.constants';
import { PrismaService } from '../prisma/prisma.service';
import { COMMERCIAL_PLAN_KEYS, normalizeCommercialPlanKey } from './commercial-plan-catalog';

const FALLBACK_TIMEZONE = 'America/Sao_Paulo';
const CARD_SUCCESS_EVENTS = ['card_import_success', 'vendas_card_imported', 'radar_card_claimed'];

type UsageKind = 'cards' | 'emails';

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

  private async getCompanyPlan(companyId: number) {
    const company = await this.prisma.company.findUnique({
      where: { id: Number(companyId) },
      select: { selectedPlanKey: true, timezone: true, slug: true },
    });
    const planKey = normalizeCommercialPlanKey(company?.selectedPlanKey || COMMERCIAL_PLAN_KEYS.PADRAO);
    return {
      planKey,
      timezone: this.normalizeTimezone(company?.timezone),
      isMasterOperationalCompany: company?.slug === MASTER_WHATSAPP_ENGINE_COMPANY_SLUG,
    };
  }

  private async isSystemMasterUser(userId?: number | null) {
    const normalizedUserId = Number(userId || 0) || null;
    if (!normalizedUserId) return false;
    const user = await this.prisma.user.findUnique({
      where: { id: normalizedUserId },
      select: { isSystemMaster: true },
    });
    return Boolean(user?.isSystemMaster);
  }

  private buildUnlimitedSnapshot(input: {
    planKey: string;
    timezone: string;
    dayStart: Date;
    dayEnd: Date;
  }) {
    const unlimited = 999999;
    return {
      planKey: input.planKey,
      timezone: input.timezone,
      dayStart: input.dayStart.toISOString(),
      dayEnd: input.dayEnd.toISOString(),
      cards: {
        used: 0,
        limit: unlimited,
        remaining: unlimited,
        perUserLimit: null as number | null,
        companyCap: unlimited,
        userUsed: 0,
        userLimit: unlimited,
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
      billableUsers: 0,
      resetAt: input.dayEnd.toISOString(),
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

  private computeLimits(planKey: string, billableUsers: number) {
    if (planKey === COMMERCIAL_PLAN_KEYS.MELHOR) {
      return {
        cards: { perUserLimit: 100, companyCap: 500, limit: Math.min(Math.max(1, billableUsers) * 100, 500) },
        emails: { perUserLimit: 35, companyCap: 150, limit: Math.min(Math.max(1, billableUsers) * 35, 150) },
      };
    }
    return {
      cards: { perUserLimit: null as number | null, companyCap: 50, limit: 50 },
      emails: { perUserLimit: null as number | null, companyCap: 25, limit: 25 },
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

  async getDailyUsageSnapshot(companyId: number, userId?: number | null) {
    const company = await this.getCompanyPlan(companyId);
    const { dayStart, dayEnd } = this.getDayBounds(company.timezone);
    if (company.isMasterOperationalCompany || await this.isSystemMasterUser(userId)) {
      return this.buildUnlimitedSnapshot({
        planKey: company.isMasterOperationalCompany ? 'hbx_master' : company.planKey,
        timezone: company.timezone,
        dayStart,
        dayEnd,
      });
    }
    const billableUsers = await this.getBillableUserCount(companyId);
    const limits = this.computeLimits(company.planKey, billableUsers);
    const normalizedUserId = Number(userId || 0) || null;

    const [cardsUsed, cardsUserUsed, emailAttempted, emailSent, emailFailed, emailBlocked, emailUserSent] = await Promise.all([
      this.countLogs(companyId, CARD_SUCCESS_EVENTS, dayStart, dayEnd),
      normalizedUserId ? this.countLogs(companyId, CARD_SUCCESS_EVENTS, dayStart, dayEnd, normalizedUserId) : Promise.resolve(0),
      this.countLogs(companyId, ['presentation_email_attempt'], dayStart, dayEnd),
      this.countLogs(companyId, ['presentation_email_sent'], dayStart, dayEnd),
      this.countLogs(companyId, ['presentation_email_failed'], dayStart, dayEnd),
      this.countLogs(companyId, ['presentation_email_blocked_limit', 'presentation_email_blocked_policy'], dayStart, dayEnd),
      normalizedUserId ? this.countLogs(companyId, ['presentation_email_sent'], dayStart, dayEnd, normalizedUserId) : Promise.resolve(0),
    ]);

    return {
      planKey: company.planKey,
      timezone: company.timezone,
      dayStart: dayStart.toISOString(),
      dayEnd: dayEnd.toISOString(),
      cards: {
        used: cardsUsed,
        limit: limits.cards.limit,
        remaining: Math.max(0, limits.cards.limit - cardsUsed),
        perUserLimit: limits.cards.perUserLimit,
        companyCap: limits.cards.companyCap,
        userUsed: cardsUserUsed,
        userLimit: limits.cards.perUserLimit || limits.cards.limit,
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
      billableUsers,
      resetAt: dayEnd.toISOString(),
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
    const snapshot = await this.getDailyUsageSnapshot(companyId, userId);
    const userBlocked = snapshot.cards.perUserLimit != null && snapshot.cards.userUsed >= snapshot.cards.userLimit;
    if (snapshot.cards.remaining <= 0 || userBlocked) {
      await this.log(companyId, Number(userId || 0) || null, 'card_import_blocked', 'usage_limit', {
        reason: userBlocked ? 'daily_user_card_limit_reached' : 'daily_card_limit_reached',
      });
      throw new ConflictException({
        code: 'DAILY_CARD_LIMIT_REACHED',
        message: snapshot.planKey === COMMERCIAL_PLAN_KEYS.MELHOR
          ? 'Limite diário da empresa atingido. Aguarde o reset ou reduza uso por equipe.'
          : 'Limite diário atingido. O contador reinicia às 00:00.',
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

  async assertCanSendPresentationEmail(companyId: number, userId?: number | null) {
    const snapshot = await this.getDailyUsageSnapshot(companyId, userId);
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
