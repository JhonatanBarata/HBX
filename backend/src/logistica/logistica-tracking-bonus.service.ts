import { BadRequestException, ConflictException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CreditWalletService } from '../credits/credit-wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import { saoPauloMonth } from './logistica-tracked-billing.service';

const BONUS_PERCENT = 20;
const BONUS_VALIDITY_MS = 30 * 24 * 60 * 60 * 1000;
const BONUS_LEASE_MS = 2 * 60_000;
const BONUS_SCAN_INTERVAL_MS = 60 * 60_000;
const BONUS_BOOT_DELAY_MS = 60_000;

type BonusRow = {
  id: string;
  companyId: number;
  sourceMonth: string;
  eligiblePaidCredits: number;
  bonusCredits: number;
  status: string;
  usageKey: string | null;
  processingToken: string | null;
  leaseUntil: Date | null;
  expiresAt: Date | null;
  grantedAt: Date | null;
};

/**
 * Concede o cashback de créditos no mês seguinte. A base elegível já foi
 * congelada em cada claim rastreada a partir dos lotes `grantType=paid`, então
 * promo/cortesia jamais gera bônus recursivo.
 */
@Injectable()
export class LogisticaTrackingBonusService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LogisticaTrackingBonusService.name);
  private scanTimer: ReturnType<typeof setInterval> | null = null;
  private bootTimer: ReturnType<typeof setTimeout> | null = null;
  private scanning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: CreditWalletService,
  ) {}

  onModuleInit(): void {
    this.scanTimer = setInterval(() => {
      void this.runScan().catch((error) => {
        this.logger.error(`[logistica] bônus tracked falhou: ${errorText(error)}`);
      });
    }, BONUS_SCAN_INTERVAL_MS);
    this.scanTimer.unref?.();
    this.bootTimer = setTimeout(() => {
      void this.runScan().catch((error) => {
        this.logger.error(`[logistica] varredura inicial do bônus falhou: ${errorText(error)}`);
      });
    }, BONUS_BOOT_DELAY_MS);
    this.bootTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.scanTimer) clearInterval(this.scanTimer);
    if (this.bootTimer) clearTimeout(this.bootTimer);
    this.scanTimer = null;
    this.bootTimer = null;
  }

  async processClosedMonths(now = new Date()): Promise<{ processed: number; granted: number; failures: number }> {
    const result = { processed: 0, granted: 0, failures: 0 };
    const currentMonth = saoPauloMonth(now);
    // Descoberta global limitada às empresas que já possuem configuração de
    // logística; todo processamento subsequente inclui companyId no predicado.
    const configs = (await (this.prisma as any).logisticaConfig.findMany({
      select: { companyId: true },
    })) as Array<{ companyId: number }>;
    for (const config of configs) {
      const companyId = Number(config.companyId);
      if (!Number.isInteger(companyId) || companyId <= 0) continue;
      const monthRows = (await (this.prisma as any).logisticaTrackedCreditClaim.findMany({
        where: {
          companyId,
          status: 'COMPLETED',
          sourceMonth: { not: null, lt: currentMonth },
        },
        select: { sourceMonth: true },
        distinct: ['sourceMonth'],
      })) as Array<{ sourceMonth: string | null }>;
      for (const row of monthRows) {
        if (!row.sourceMonth || !isMonth(row.sourceMonth)) continue;
        result.processed += 1;
        try {
          const grant = await this.processCompanyMonth(companyId, row.sourceMonth, now);
          if (grant.grantedNow) result.granted += grant.bonusCredits;
        } catch (error) {
          result.failures += 1;
          this.logger.error(
            `[logistica] bônus pendente company=${companyId} month=${row.sourceMonth}: ${errorText(error)}`,
          );
        }
      }
    }
    return result;
  }

  async processCompanyMonth(
    companyId: number,
    sourceMonth: string,
    now = new Date(),
  ): Promise<{ eligiblePaidCredits: number; bonusCredits: number; grantedNow: boolean }> {
    if (!Number.isInteger(companyId) || companyId <= 0 || !isMonth(sourceMonth)) {
      throw new Error('Competência de bônus inválida.');
    }
    if (sourceMonth >= saoPauloMonth(now)) {
      throw new ConflictException('O bônus só pode ser concedido no mês seguinte.');
    }

    const aggregate = await (this.prisma as any).logisticaTrackedCreditClaim.aggregate({
      where: { companyId, sourceMonth, status: 'COMPLETED' },
      _sum: { paidCreditsConsumed: true },
    });
    const eligiblePaidCredits = Math.max(0, Number(aggregate?._sum?.paidCreditsConsumed || 0));
    const bonusCredits = Math.floor((eligiblePaidCredits * BONUS_PERCENT) / 100);
    let row = await this.ensureBonusRow(companyId, sourceMonth);
    if (row.status === 'GRANTED') {
      return { eligiblePaidCredits: row.eligiblePaidCredits, bonusCredits: row.bonusCredits, grantedNow: false };
    }
    const currentNow = new Date();
    if (row.status === 'PROCESSING' && row.leaseUntil && row.leaseUntil > currentNow) {
      throw new ConflictException('Bônus desta competência já está em processamento.');
    }

    const processingToken = randomUUID();
    const usageKey = trackingBonusUsageKey(companyId, sourceMonth);
    const expiresAt = bonusCredits > 0 ? new Date(now.getTime() + BONUS_VALIDITY_MS) : null;
    const reserved = await (this.prisma as any).logisticaTrackingBonusGrant.updateMany({
      where: {
        id: row.id,
        companyId,
        sourceMonth,
        status: row.status,
        processingToken: row.processingToken,
      },
      data: {
        status: 'PROCESSING',
        eligiblePaidCredits,
        bonusCredits,
        usageKey,
        processingToken,
        leaseUntil: new Date(currentNow.getTime() + BONUS_LEASE_MS),
        expiresAt,
        lastError: null,
      },
    });
    if (reserved.count !== 1) throw new ConflictException('A competência do bônus perdeu a reserva.');

    try {
      if (bonusCredits > 0) {
        await this.wallet.grant(companyId, bonusCredits, {
          kind: 'promo',
          grantType: 'promo',
          expiresAt,
          sourceRef: `logistica-tracking-bonus:${sourceMonth}`,
          usageKey,
          metadata: {
            sourceMonth,
            eligiblePaidCredits,
            bonusPercent: BONUS_PERCENT,
          },
        });
      }
      const grantedAt = new Date();
      const completed = await (this.prisma as any).logisticaTrackingBonusGrant.updateMany({
        where: { id: row.id, companyId, status: 'PROCESSING', processingToken },
        data: {
          status: 'GRANTED',
          grantedAt,
          processingToken: null,
          leaseUntil: null,
          lastError: null,
        },
      });
      if (completed.count !== 1) throw new Error('Falha ao confirmar o bônus no extrato.');
      return { eligiblePaidCredits, bonusCredits, grantedNow: true };
    } catch (error) {
      // grant() é idempotente pela usageKey; mesmo que tenha commitado antes do
      // erro, a próxima passagem só relê a mesma entrada e conclui a linha.
      await (this.prisma as any).logisticaTrackingBonusGrant.updateMany({
        where: { id: row.id, companyId, processingToken },
        data: {
          status: 'FAILED',
          processingToken: null,
          leaseUntil: null,
          lastError: errorText(error).slice(0, 500),
        },
      }).catch(() => undefined);
      throw error;
    }
  }

  /** Extrato comercial: endpoint ADMIN-only; nunca usado por payload operacional. */
  async getAdminStatement(companyId: number, monthInput?: string | null, now = new Date()) {
    const month = String(monthInput || saoPauloMonth(now)).trim();
    if (!isMonth(month)) throw new BadRequestException('Competência inválida. Use YYYY-MM.');

    // Janelas de CONSUMO no fuso America/Sao_Paulo (créditos gastos, não saldo).
    // Essencial usa a string routeDate (YYYY-MM-DD); rastreada usa completedAt.
    const todayStr = saoPauloDate(now);
    const startOfTodaySp = saoPauloDayStart(todayStr);
    const weekStartStr = saoPauloDate(new Date(startOfTodaySp.getTime() - 6 * 24 * 60 * 60 * 1000));
    const startOfWeekSp = saoPauloDayStart(weekStartStr);
    const startOfMonthSp = saoPauloDayStart(`${month}-01`);
    const startOfNextMonthSp = saoPauloDayStart(nextMonthFirstDay(month));
    // DEBITED debita na entrega; COMPLETED é o estado final da saga — ambos já
    // consumiram crédito, então os dois entram na conta de uso rastreado.
    const trackedUsageWhere = { companyId, status: { in: ['DEBITED', 'COMPLETED'] } };

    const [
      balanceCredits,
      trackedClaims,
      essentialCredits,
      bonusRows,
      essentialToday,
      essentialWeek,
      trackedToday,
      trackedWeek,
      trackedMonth,
    ] = await Promise.all([
      this.wallet.getBalance(companyId),
      (this.prisma as any).logisticaTrackedCreditClaim.findMany({
        where: { companyId, sourceMonth: month, status: 'COMPLETED' },
        select: {
          id: true,
          routeId: true,
          trackingSessionId: true,
          deliveryId: true,
          paidCreditsConsumed: true,
          completedAt: true,
        },
        orderBy: { completedAt: 'desc' },
        take: 100,
      }),
      (this.prisma as any).logisticaEssentialCreditClaim.count({
        where: { companyId, routeDate: { startsWith: month }, status: 'DEBITED' },
      }),
      (this.prisma as any).logisticaTrackingBonusGrant.findMany({
        where: { companyId },
        select: {
          sourceMonth: true,
          eligiblePaidCredits: true,
          bonusCredits: true,
          status: true,
          grantedAt: true,
          expiresAt: true,
        },
        orderBy: { sourceMonth: 'desc' },
        take: 12,
      }),
      // Essencial = 1 crédito por bloco (claim DEBITED); janela por routeDate.
      (this.prisma as any).logisticaEssentialCreditClaim.count({
        where: { companyId, routeDate: todayStr, status: 'DEBITED' },
      }),
      (this.prisma as any).logisticaEssentialCreditClaim.count({
        where: { companyId, routeDate: { gte: weekStartStr, lte: todayStr }, status: 'DEBITED' },
      }),
      // Rastreada = créditos pagos consumidos; janela por completedAt.
      (this.prisma as any).logisticaTrackedCreditClaim.aggregate({
        where: { ...trackedUsageWhere, completedAt: { gte: startOfTodaySp } },
        _sum: { paidCreditsConsumed: true },
      }),
      (this.prisma as any).logisticaTrackedCreditClaim.aggregate({
        where: { ...trackedUsageWhere, completedAt: { gte: startOfWeekSp } },
        _sum: { paidCreditsConsumed: true },
      }),
      (this.prisma as any).logisticaTrackedCreditClaim.aggregate({
        where: { ...trackedUsageWhere, completedAt: { gte: startOfMonthSp, lt: startOfNextMonthSp } },
        _sum: { paidCreditsConsumed: true },
      }),
    ]);

    const tracked = trackedClaims as Array<{
      id: string;
      routeId: string;
      trackingSessionId: string;
      deliveryId: string;
      paidCreditsConsumed: number;
      completedAt: Date;
    }>;
    const trackedCredits = tracked.length * 2;
    const paidTrackedCredits = tracked.reduce((sum, row) => sum + Number(row.paidCreditsConsumed || 0), 0);
    const bonusForMonth = (bonusRows as BonusRow[]).find((row) => row.sourceMonth === month);

    // Consumo combinado (essencial + rastreada) por janela; sempre >= 0.
    const trackedSum = (agg: any) => Math.max(0, Number(agg?._sum?.paidCreditsConsumed || 0));
    const usage = {
      hoje: Number(essentialToday || 0) + trackedSum(trackedToday),
      semana: Number(essentialWeek || 0) + trackedSum(trackedWeek),
      mes: Number(essentialCredits || 0) + trackedSum(trackedMonth),
    };

    return {
      month,
      balanceCredits,
      usage,
      totals: {
        essentialCredits: Number(essentialCredits || 0),
        trackedDeliveries: tracked.length,
        trackedCredits,
        paidTrackedCredits,
        bonusCredits: Number(bonusForMonth?.bonusCredits || 0),
      },
      trackedDeliveries: tracked.map((row) => ({
        claimId: row.id,
        routeId: row.routeId,
        trackingSessionId: row.trackingSessionId,
        deliveryId: row.deliveryId,
        credits: 2,
        paidCredits: Number(row.paidCreditsConsumed || 0),
        completedAt: row.completedAt,
      })),
      bonuses: bonusRows,
    };
  }

  private async runScan(): Promise<void> {
    if (this.scanning) return;
    this.scanning = true;
    try {
      const result = await this.processClosedMonths();
      if (result.processed > 0) {
        this.logger.log(
          `[logistica] bônus tracked: competências=${result.processed} créditos=${result.granted} falhas=${result.failures}`,
        );
      }
    } finally {
      this.scanning = false;
    }
  }

  private async ensureBonusRow(companyId: number, sourceMonth: string): Promise<BonusRow> {
    const delegate = (this.prisma as any).logisticaTrackingBonusGrant;
    const where = { companyId_sourceMonth: { companyId, sourceMonth } };
    const existing = (await delegate.findUnique({ where })) as BonusRow | null;
    if (existing) return existing;
    try {
      return (await delegate.create({ data: { companyId, sourceMonth } })) as BonusRow;
    } catch (error) {
      if (!isUniqueError(error)) throw error;
      const winner = (await delegate.findUnique({ where })) as BonusRow | null;
      if (winner) return winner;
      throw error;
    }
  }
}

export function trackingBonusUsageKey(companyId: number, sourceMonth: string): string {
  return `logistica:tracked-bonus:v1:${companyId}:${sourceMonth}`;
}

function isMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** Data de hoje no fuso America/Sao_Paulo como string 'YYYY-MM-DD'. */
function saoPauloDate(value = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Instante UTC do início do dia em São Paulo. O fuso é UTC-3 fixo (o Brasil
 * abandonou o horário de verão em 2019), então o offset literal é seguro.
 */
function saoPauloDayStart(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00-03:00`);
}

/** Primeiro dia do mês seguinte a 'YYYY-MM' como 'YYYY-MM-DD'. */
function nextMonthFirstDay(month: string): string {
  const [year, mon] = month.split('-').map(Number);
  const nextYear = mon >= 12 ? year + 1 : year;
  const nextMon = mon >= 12 ? 1 : mon + 1;
  return `${nextYear}-${String(nextMon).padStart(2, '0')}-01`;
}

function isUniqueError(error: unknown): boolean {
  return Boolean(error) && typeof error === 'object' && (error as any).code === 'P2002';
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error || 'unknown_error');
}
