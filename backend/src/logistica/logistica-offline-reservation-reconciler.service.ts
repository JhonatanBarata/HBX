import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CreditWalletService } from '../credits/credit-wallet.service';
import { PrismaService } from '../prisma/prisma.service';

const RECONCILE_INTERVAL_MS = 5 * 60_000;
const RECONCILE_BOOT_DELAY_MS = 45_000;
const REFUND_LEASE_MS = 90_000;

/**
 * Quando a rota termina, claims TRACKED ainda DEBITED representam paradas não
 * concluídas. O ledger devolve esses créditos de forma idempotente.
 */
@Injectable()
export class LogisticaOfflineReservationReconcilerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LogisticaOfflineReservationReconcilerService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private bootTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: CreditWalletService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.reconcile().catch((error) => this.logError(error)), RECONCILE_INTERVAL_MS);
    this.timer.unref?.();
    this.bootTimer = setTimeout(() => void this.reconcile().catch((error) => this.logError(error)), RECONCILE_BOOT_DELAY_MS);
    this.bootTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.bootTimer) clearTimeout(this.bootTimer);
    this.timer = null;
    this.bootTimer = null;
  }

  async reconcile(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const routes = await (this.prisma as any).logisticaRoute.findMany({
        where: { status: 'COMPLETED' },
        select: { id: true, companyId: true },
        take: 100,
      });
      if (!routes.length) return 0;
      const routeIds = routes.map((route: any) => route.id);
      const claims = await (this.prisma as any).logisticaTrackedCreditClaim.findMany({
        where: {
          routeId: { in: routeIds },
          status: 'DEBITED',
          debitUsageKey: { not: null },
        },
        orderBy: { updatedAt: 'asc' },
        take: 200,
      });
      let released = 0;
      for (const claim of claims) {
        const token = randomUUID();
        const locked = await (this.prisma as any).logisticaTrackedCreditClaim.updateMany({
          where: {
            id: claim.id,
            companyId: claim.companyId,
            status: 'DEBITED',
            debitUsageKey: claim.debitUsageKey,
          },
          data: {
            status: 'REFUNDING',
            processingToken: token,
            leaseUntil: new Date(Date.now() + REFUND_LEASE_MS),
            lastError: 'offline_route_unused_reservation',
          },
        });
        if (locked.count !== 1) continue;
        try {
          await this.wallet.refund(claim.companyId, {
            usageKey: claim.debitUsageKey,
            metadata: {
              reason: 'offline_route_unused_stop',
              claimId: claim.id,
              routeId: claim.routeId,
              deliveryId: claim.deliveryId,
            },
          });
          await (this.prisma as any).logisticaTrackedCreditClaim.updateMany({
            where: {
              id: claim.id,
              companyId: claim.companyId,
              status: 'REFUNDING',
              processingToken: token,
            },
            data: {
              status: 'REFUNDED',
              refundedAt: new Date(),
              processingToken: null,
              leaseUntil: null,
              lastError: null,
            },
          });
          released += 1;
        } catch (error) {
          await (this.prisma as any).logisticaTrackedCreditClaim.updateMany({
            where: { id: claim.id, companyId: claim.companyId, processingToken: token },
            data: {
              leaseUntil: new Date(),
              lastError: `offline_refund_retry:${errorText(error)}`.slice(0, 500),
            },
          }).catch(() => undefined);
        }
      }
      return released;
    } finally {
      this.running = false;
    }
  }

  private logError(error: unknown) {
    this.logger.error(`[logistica] reconciliador offline falhou: ${errorText(error)}`);
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'erro desconhecido');
}
