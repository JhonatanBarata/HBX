import { MASTER_WHATSAPP_ENGINE_COMPANY_SLUG } from '../companies/master-whatsapp-company.constants';
import {
  COMMERCIAL_PLAN_KEYS,
  COMMERCIAL_PRICING,
  buildCommercialPlansCatalog,
  normalizeCommercialPlanKey,
  toCommercialCurrency,
  type ActiveCommercialPlanKey,
} from './commercial-plan-catalog';

const DAY_MS = 24 * 60 * 60 * 1000;

type SeatInterval = {
  startedAt: Date | string;
  endedAt?: Date | string | null;
};

export type SeatBillingSnapshot = {
  activeUsers: number;
  includedActiveUsers: number;
  extraActiveUsers: number;
  extraSeatMonthlyAmount: number;
  extraSeatCycleAmount: number;
  extraSeatFullMonthAmount: number;
  extraSeatBillableDays: number;
  extraSeatAverageUsers: number;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  billingMode: 'month_end_prorated';
  billedImmediately: false;
};

export function startOfBillingMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function startOfNextBillingMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

export function resolveExtraSeatMonthlyAmount(value: unknown) {
  const configured = Number(value);
  if (Number.isFinite(configured) && configured > 0) return toCommercialCurrency(configured);
  const envValue = Number(process.env.HBX_EXTRA_SEAT_MONTHLY_AMOUNT);
  if (Number.isFinite(envValue) && envValue > 0) return toCommercialCurrency(envValue);
  return COMMERCIAL_PRICING.extraUserMonthly;
}

export function resolveIncludedBillableUsers(planKeyRaw: unknown) {
  const planKey = normalizeCommercialPlanKey(planKeyRaw);
  if (planKey === COMMERCIAL_PLAN_KEYS.LITE) return 1;
  const plan = buildCommercialPlansCatalog({ includeHidden: true }).find((item) => item.key === planKey);
  return Math.max(1, Number(plan?.includedUsers || 1) || 1);
}

export function canBillExtraSeatsForPlan(planKeyRaw: unknown) {
  return normalizeCommercialPlanKey(planKeyRaw) !== COMMERCIAL_PLAN_KEYS.LITE;
}

export function isMasterOperationalCompanySlug(slug: unknown) {
  return String(slug || '').trim().toLowerCase() === MASTER_WHATSAPP_ENGINE_COMPANY_SLUG;
}

export function isBillableUserSeatSnapshot(user: any, company?: any) {
  if (!user) return false;
  if (company && isMasterOperationalCompanySlug(company.slug)) return false;
  const role = String(user?.role || '').trim().toUpperCase();
  return (
    Boolean(user?.companyId) &&
    Boolean(user?.isActive) &&
    !user?.deactivatedAt &&
    !Boolean(user?.isSystemMaster) &&
    role !== 'USERMASTER'
  );
}

function normalizeDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function buildSeatBillingFromIntervals(input: {
  intervals: SeatInterval[];
  activeUsers: number;
  includedUsers: number;
  extraSeatMonthlyAmount: number;
  periodStart: Date;
  periodEnd: Date;
  canBillExtraSeats?: boolean;
}): SeatBillingSnapshot {
  const periodStart = input.periodStart;
  const periodEnd = input.periodEnd;
  const periodMs = Math.max(1, periodEnd.getTime() - periodStart.getTime());
  const includedUsers = Math.max(1, Math.trunc(Number(input.includedUsers || 1) || 1));
  const extraSeatMonthlyAmount = toCommercialCurrency(input.extraSeatMonthlyAmount);
  const canBillExtraSeats = input.canBillExtraSeats !== false && extraSeatMonthlyAmount > 0;
  const events: Array<{ at: number; delta: number }> = [];

  for (const interval of input.intervals || []) {
    const rawStart = normalizeDate(interval.startedAt);
    if (!rawStart) continue;
    const rawEnd = normalizeDate(interval.endedAt) || periodEnd;
    const start = Math.max(rawStart.getTime(), periodStart.getTime());
    const end = Math.min(rawEnd.getTime(), periodEnd.getTime());
    if (end <= periodStart.getTime() || start >= periodEnd.getTime() || end <= start) continue;
    events.push({ at: start, delta: 1 }, { at: end, delta: -1 });
  }

  events.sort((a, b) => a.at - b.at || a.delta - b.delta);

  let cursor = periodStart.getTime();
  let active = 0;
  let extraSeatMs = 0;
  for (let index = 0; index < events.length;) {
    const at = Math.min(Math.max(events[index].at, periodStart.getTime()), periodEnd.getTime());
    if (at > cursor && canBillExtraSeats) {
      extraSeatMs += (at - cursor) * Math.max(0, active - includedUsers);
      cursor = at;
    }
    while (index < events.length && events[index].at === at) {
      active += events[index].delta;
      index += 1;
    }
  }
  if (cursor < periodEnd.getTime() && canBillExtraSeats) {
    extraSeatMs += (periodEnd.getTime() - cursor) * Math.max(0, active - includedUsers);
  }

  const extraSeatAverageUsers = canBillExtraSeats ? extraSeatMs / periodMs : 0;
  const extraSeatCycleAmount = canBillExtraSeats
    ? toCommercialCurrency(extraSeatMonthlyAmount * extraSeatAverageUsers)
    : 0;
  const extraActiveUsers = canBillExtraSeats
    ? Math.max(0, Math.trunc(Number(input.activeUsers || 0) || 0) - includedUsers)
    : 0;

  return {
    activeUsers: Math.max(0, Math.trunc(Number(input.activeUsers || 0) || 0)),
    includedActiveUsers: includedUsers,
    extraActiveUsers,
    extraSeatMonthlyAmount: canBillExtraSeats ? extraSeatMonthlyAmount : 0,
    extraSeatCycleAmount,
    extraSeatFullMonthAmount: canBillExtraSeats
      ? toCommercialCurrency(extraActiveUsers * extraSeatMonthlyAmount)
      : 0,
    extraSeatBillableDays: canBillExtraSeats ? Number((extraSeatMs / DAY_MS).toFixed(2)) : 0,
    extraSeatAverageUsers: canBillExtraSeats ? Number(extraSeatAverageUsers.toFixed(4)) : 0,
    billingPeriodStart: periodStart.toISOString(),
    billingPeriodEnd: periodEnd.toISOString(),
    billingMode: 'month_end_prorated',
    billedImmediately: false,
  };
}

async function hasSeatUsageTable(prisma: any) {
  if (typeof prisma?.hasTable !== 'function') return true;
  return prisma.hasTable('CompanyBillableSeatUsage');
}

export async function computeCompanySeatBillingSnapshot(prisma: any, input: {
  companyId: number;
  planKey: ActiveCommercialPlanKey | string | null | undefined;
  extraSeatMonthlyAmount?: number | null;
  asOf?: Date;
}): Promise<SeatBillingSnapshot> {
  const companyId = Number(input.companyId || 0);
  const asOf = input.asOf || new Date();
  const periodStart = startOfBillingMonth(asOf);
  const periodEnd = startOfNextBillingMonth(asOf);
  const planKey = normalizeCommercialPlanKey(input.planKey);
  const includedUsers = resolveIncludedBillableUsers(planKey);
  const extraSeatMonthlyAmount = resolveExtraSeatMonthlyAmount(input.extraSeatMonthlyAmount);
  const canBillExtraSeats = canBillExtraSeatsForPlan(planKey);

  if (!companyId) {
    return buildSeatBillingFromIntervals({
      intervals: [],
      activeUsers: 0,
      includedUsers,
      extraSeatMonthlyAmount,
      periodStart,
      periodEnd,
      canBillExtraSeats: false,
    });
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, slug: true },
  });
  if (!company || isMasterOperationalCompanySlug(company.slug)) {
    return buildSeatBillingFromIntervals({
      intervals: [],
      activeUsers: 0,
      includedUsers,
      extraSeatMonthlyAmount,
      periodStart,
      periodEnd,
      canBillExtraSeats: false,
    });
  }

  const activeUsers = await prisma.user.count({
    where: {
      companyId,
      isActive: true,
      deactivatedAt: null,
      isSystemMaster: false,
      role: { notIn: ['USERMASTER'] },
    },
  });

  let intervals: SeatInterval[] = [];
  if (await hasSeatUsageTable(prisma)) {
    intervals = await prisma.companyBillableSeatUsage.findMany({
      where: {
        companyId,
        startedAt: { lt: periodEnd },
        OR: [{ endedAt: null }, { endedAt: { gt: periodStart } }],
      },
      select: {
        startedAt: true,
        endedAt: true,
      },
    });
  }

  if (!intervals.length && activeUsers > 0) {
    intervals = await prisma.user.findMany({
      where: {
        companyId,
        createdAt: { lt: periodEnd },
        isSystemMaster: false,
        role: { notIn: ['USERMASTER'] },
        OR: [{ deactivatedAt: null }, { deactivatedAt: { gt: periodStart } }],
      },
      select: {
        createdAt: true,
        deactivatedAt: true,
      },
    }).then((rows: Array<{ createdAt: Date; deactivatedAt: Date | null }>) =>
      rows.map((row) => ({ startedAt: row.createdAt, endedAt: row.deactivatedAt })),
    );
  }

  return buildSeatBillingFromIntervals({
    intervals,
    activeUsers,
    includedUsers,
    extraSeatMonthlyAmount,
    periodStart,
    periodEnd,
    canBillExtraSeats,
  });
}
