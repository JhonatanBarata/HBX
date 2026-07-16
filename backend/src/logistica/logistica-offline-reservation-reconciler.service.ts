import { ConflictException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CreditWalletService } from '../credits/credit-wallet.service';
import { PrismaService } from '../prisma/prisma.service';

const RECONCILE_INTERVAL_MS = 5 * 60_000;
const RECONCILE_BOOT_DELAY_MS = 45_000;
const REFUND_LEASE_MS = 90_000;

/**
 * Libera reservas TRACKED que não viraram entrega. FINALIZE_ROUTE faz isso assim
 * que a fila ordenada termina; o scheduler é a rede de segurança após a lease.
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

  async releaseRouteReservations(input: {
    companyId: number;
    routeId: string;
    actorUserId?: number | null;
  }): Promise<{ released: number; consumed: number; alreadyReleased: number }> {
    const route = await (this.prisma as any).logisticaRoute.findFirst({
      where: {
        id: input.routeId,
        companyId: input.companyId,
        mode: 'TRACKED',
        status: { in: ['ACTIVE', 'COMPLETED'] },
      },
      include: {
        stops: {
          select: {
            deliveryId: true,
            delivery: { select: { status: true } },
          },
        },
      },
    });
    if (!route) throw new NotFoundException('Rota rastreada não encontrada para finalizar.');
    const open = (route.stops || []).filter((stop: any) =>
      ['agendada', 'em_rota'].includes(String(stop.delivery?.status || '').toLowerCase()),
    );
    if (open.length > 0) {
      throw new ConflictException('Ainda há entregas abertas nesta rota. Sincronize todas antes de finalizar.');
    }

    const statusByDelivery = new Map(
      (route.stops || []).map((stop: any) => [String(stop.deliveryId), String(stop.delivery?.status || '').toLowerCase()]),
    );
    const claims = await (this.prisma as any).logisticaTrackedCreditClaim.findMany({
      where: { companyId: input.companyId, routeId: input.routeId },
      orderBy: { createdAt: 'asc' },
    });
    let released = 0;
    let consumed = 0;
    let alreadyReleased = 0;
    for (const claim of claims) {
      const deliveryStatus = statusByDelivery.get(String(claim.deliveryId));
      if (claim.status === 'COMPLETED' || deliveryStatus === 'entregue') {
        consumed += 1;
        continue;
      }
      if (claim.status === 'REFUNDED') {
        alreadyReleased += 1;
        continue;
      }
      if (claim.status !== 'DEBITED' || !claim.debitUsageKey) {
        if (['PROCESSING', 'REFUNDING'].includes(String(claim.status))) {
          throw new ConflictException('A reserva de créditos ainda está sendo reconciliada.');
        }
        continue;
      }
      const ok = await this.refundClaim(claim, input.actorUserId ?? null, 'offline_route_finalized_unused_stop');
      if (!ok) throw new ConflictException('Não foi possível liberar todos os créditos ainda. Tente novamente.');
      released += 1;
    }
    return { released, consumed, alreadyReleased };
  }

  async reconcile(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const now = new Date();
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
          leaseUntil: { lte: now },
        },
        orderBy: { updatedAt: 'asc' },
        take: 200,
      });
      let released = 0;
      for (const claim of claims) {
        if (await this.refundClaim(claim, null, 'offline_route_unused_reservation_expired')) released += 1;
      }
      return released;
    } finally {
      this.running = false;
    }
  }

  private async refundClaim(claim: any, actorUserId: number | null, reason: string): Promise<boolean> {
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
        lastError: reason,
      },
    });
    if (locked.count !== 1) {
      const current = await (this.prisma as any).logisticaTrackedCreditClaim.findFirst({
        where: { id: claim.id, companyId: claim.companyId },
        select: { status: true },
      });
      return current?.status === 'REFUNDED';
    }
    try {
      await this.wallet.refund(claim.companyId, {
        usageKey: claim.debitUsageKey,
        userId: actorUserId,
        metadata: {
          reason,
          claimId: claim.id,
          routeId: claim.routeId,
          deliveryId: claim.deliveryId,
        },
      });
      const finalized = await (this.prisma as any).logisticaTrackedCreditClaim.updateMany({
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
      return finalized.count === 1;
    } catch (error) {
      await (this.prisma as any).logisticaTrackedCreditClaim.updateMany({
        where: { id: claim.id, companyId: claim.companyId, processingToken: token },
        data: {
          leaseUntil: new Date(),
          lastError: `offline_refund_retry:${errorText(error)}`.slice(0, 500),
        },
      }).catch(() => undefined);
      return false;
    }
  }

  private logError(error: unknown) {
    this.logger.error(`[logistica] reconciliador offline falhou: ${errorText(error)}`);
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'erro desconhecido');
}
