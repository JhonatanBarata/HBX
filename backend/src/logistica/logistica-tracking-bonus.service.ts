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
  async getAdminStatement(companyId: number, monthInput?: string | null) {
    const month = String(monthInput || saoPauloMonth()).trim();
    if (!isMonth(month)) throw new BadRequestException('Competência inválida. Use YYYY-MM.');

    const [balanceCredits, trackedClaims, essentialCredits, bonusRows] = await Promise.all([
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

    return {
      month,
      balanceCredits,
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

function isUniqueError(error: unknown): boolean {
  return Boolean(error) && typeof error === 'object' && (error as any).code === 'P2002';
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error || 'unknown_error');
}
