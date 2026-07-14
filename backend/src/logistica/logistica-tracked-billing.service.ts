import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CreditWalletService } from '../credits/credit-wallet.service';
import {
  CREDIT_ACTION_KEYS,
  getCreditActionDefinition,
} from '../credits/credit-action-catalog';
import { PrismaService } from '../prisma/prisma.service';
import { canonicalRouteDate } from './logistica-route-billing.service';
import { lockLogisticaRouteTransaction } from './logistica-route-lock';
import { isLogisticaTrackingEnabled } from './logistica-tracking.flags';

type TrackedClaimRow = {
  id: string;
  companyId: number;
  trackingSessionId: string;
  routeId: string;
  deliveryId: string;
  status: string;
  billingAttempt: number;
  debitUsageKey: string | null;
  processingToken: string | null;
  leaseUntil: Date | null;
  paidCreditsConsumed: number;
};

export type PreparedTrackedDeliveryCharge = {
  claimId: string;
  companyId: number;
  trackingSessionId: string;
  routeId: string;
  deliveryId: string;
  debitUsageKey: string;
  processingToken: string;
  paidCreditsConsumed: number;
};

const TRACKED_DELIVERY_COST = 2;
const CLAIM_LEASE_MS = 90_000;
const RECONCILE_INTERVAL_MS = 5 * 60_000;
const RECONCILE_BOOT_DELAY_MS = 45_000;

/**
 * Saga do débito da Rota Rastreada.
 *
 * O dinheiro sai antes do efeito (confirmar a entrega), mas a claim só vira
 * COMPLETED na mesma transação da Entrega. Qualquer falha no meio reserva um
 * estorno idempotente; leases vencidas são recuperadas pelo reconciliador.
 */
@Injectable()
export class LogisticaTrackedBillingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LogisticaTrackedBillingService.name);
  private reconcileTimer: ReturnType<typeof setInterval> | null = null;
  private bootTimer: ReturnType<typeof setTimeout> | null = null;
  private reconciling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: CreditWalletService,
  ) {}

  onModuleInit(): void {
    this.reconcileTimer = setInterval(() => {
      void this.runReconciliation().catch((error) => {
        this.logger.error(`[logistica] reconciliador tracked falhou: ${errorText(error)}`);
      });
    }, RECONCILE_INTERVAL_MS);
    this.reconcileTimer.unref?.();
    this.bootTimer = setTimeout(() => {
      void this.runReconciliation().catch((error) => {
        this.logger.error(`[logistica] reconciliação inicial tracked falhou: ${errorText(error)}`);
      });
    }, RECONCILE_BOOT_DELAY_MS);
    this.bootTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.reconcileTimer) clearInterval(this.reconcileTimer);
    if (this.bootTimer) clearTimeout(this.bootTimer);
    this.reconcileTimer = null;
    this.bootTimer = null;
  }

  /**
   * Retorna null para entregas fora de uma rota TRACKED. Se a empresa escolheu
   * TRACKED, porém a sessão/GPS não é válido, falha antes de concluir a entrega.
   */
  async prepareDeliveryCompletion(
    companyId: number,
    deliveryId: string,
    actorUserId: number | null,
    now = new Date(),
  ): Promise<PreparedTrackedDeliveryCharge | null> {
    const definition = getCreditActionDefinition(CREDIT_ACTION_KEYS.LOGISTICA_TRACKED_DELIVERY);
    if (
      !definition ||
      definition.mode !== 'debit' ||
      definition.cost !== TRACKED_DELIVERY_COST
    ) {
      throw new Error('Contrato de crédito da Rota Rastreada inválido.');
    }

    const stop = await (this.prisma as any).logisticaRouteStop.findFirst({
      where: { companyId, deliveryId },
      include: { route: { include: { trackingSession: true } } },
    });
    if (!stop?.route) {
      await this.assertNoUnsnappedTrackedRoute(companyId, deliveryId);
      return null;
    }
    if (stop.route.mode !== 'TRACKED') return null;

    const session = stop.route.trackingSession;
    await this.assertTrackingEligible({ companyId, route: stop.route, session, completedAt: now });

    let claim = await this.ensureClaim({
      companyId,
      routeId: stop.route.id,
      trackingSessionId: session.id,
      deliveryId,
    });
    claim = await this.reconcileClaim(claim);
    if (claim.status === 'COMPLETED') {
      throw new ConflictException('Esta entrega rastreada já foi concluída. Atualize a rota.');
    }
    claim = await this.acquireClaim(claim);
    const usageKey = claim.debitUsageKey!;
    const processingToken = claim.processingToken!;

    try {
      const debit = await this.wallet.debit(companyId, TRACKED_DELIVERY_COST, {
        actionKey: CREDIT_ACTION_KEYS.LOGISTICA_TRACKED_DELIVERY,
        usageKey,
        userId: actorUserId,
        metadata: {
          claimId: claim.id,
          routeId: claim.routeId,
          trackingSessionId: claim.trackingSessionId,
          deliveryId: claim.deliveryId,
          billingAttempt: claim.billingAttempt,
        },
      });
      if (debit.debited !== TRACKED_DELIVERY_COST || debit.partial) {
        if (debit.debited > 0) {
          await this.wallet.refund(companyId, {
            usageKey,
            userId: actorUserId,
            metadata: { reason: 'tracked_insufficient_balance', claimId: claim.id },
          });
        }
        await this.failClaim(
          claim,
          debit.debited > 0 ? 'REFUNDED' : 'FAILED',
          'insufficient_balance',
        );
        throw trackedCommercialUnavailable();
      }

      const paidCreditsConsumed = await this.paidCreditsForUsage(companyId, usageKey);
      const updated = await (this.prisma as any).logisticaTrackedCreditClaim.updateMany({
        where: {
          companyId,
          id: claim.id,
          status: 'PROCESSING',
          processingToken,
        },
        data: {
          status: 'DEBITED',
          paidCreditsConsumed,
          debitedAt: new Date(),
          lastError: null,
        },
      });
      if (updated.count !== 1) {
        const current = await this.findClaim(companyId, claim.id);
        if (current?.status !== 'DEBITED' || current.processingToken !== processingToken) {
          await this.wallet.refund(companyId, {
            usageKey,
            userId: actorUserId,
            metadata: { reason: 'tracked_claim_finalize_failed', claimId: claim.id },
          });
          throw new Error('Falha ao confirmar o débito da entrega rastreada.');
        }
      }

      return {
        claimId: claim.id,
        companyId,
        trackingSessionId: claim.trackingSessionId,
        routeId: claim.routeId,
        deliveryId: claim.deliveryId,
        debitUsageKey: usageKey,
        processingToken,
        paidCreditsConsumed,
      };
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === HttpStatus.PAYMENT_REQUIRED) {
        throw error;
      }
      const current = await this.findClaim(companyId, claim.id).catch(() => null);
      if (current && current.status !== 'COMPLETED') {
        let debited: number;
        try {
          debited = await this.debitedCreditsForUsage(companyId, usageKey);
        } catch (reconcileError) {
          // Estado financeiro incerto nunca vira FAILED: o débito pode ter
          // commitado antes da queda da resposta. Expira a lease e deixa o
          // reconciliador reler o ledger antes de decidir pelo estorno.
          await (this.prisma as any).logisticaTrackedCreditClaim.updateMany({
            where: { id: claim.id, companyId, status: { not: 'COMPLETED' } },
            data: {
              leaseUntil: new Date(),
              lastError: `ledger_reconcile_pending:${errorText(reconcileError)}`.slice(0, 500),
            },
          }).catch(() => undefined);
          throw error;
        }
        if (debited > 0) {
          await this.refundFailedCompletion(
            {
              claimId: claim.id,
              companyId,
              trackingSessionId: claim.trackingSessionId,
              routeId: claim.routeId,
              deliveryId: claim.deliveryId,
              debitUsageKey: usageKey,
              processingToken,
              paidCreditsConsumed: 0,
            },
            error,
            actorUserId,
          );
        } else {
          await this.failClaim(claim, 'FAILED', errorText(error));
        }
      }
      throw error;
    }
  }

  /** Deve ser chamado dentro da MESMA transação que marca Entrega=entregue. */
  async completeWithinTransaction(
    tx: any,
    charge: PreparedTrackedDeliveryCharge,
    completedAt: Date,
  ): Promise<void> {
    await lockLogisticaRouteTransaction(tx, charge.companyId, charge.routeId);
    const session = await tx.logisticaTrackingSession.findFirst({
      where: {
        id: charge.trackingSessionId,
        companyId: charge.companyId,
        routeId: charge.routeId,
      },
      include: { route: true },
    });
    await this.assertTrackingEligible({
      companyId: charge.companyId,
      route: session?.route,
      session,
      completedAt,
      tx,
    });

    const updated = await tx.logisticaTrackedCreditClaim.updateMany({
      where: {
        id: charge.claimId,
        companyId: charge.companyId,
        trackingSessionId: charge.trackingSessionId,
        deliveryId: charge.deliveryId,
        status: 'DEBITED',
        processingToken: charge.processingToken,
      },
      data: {
        status: 'COMPLETED',
        sourceMonth: saoPauloMonth(completedAt),
        completedAt,
        processingToken: null,
        leaseUntil: null,
        lastError: null,
      },
    });
    if (updated.count !== 1) {
      throw new ConflictException('A cobrança rastreada perdeu a reserva. Tente novamente.');
    }
  }

  /** Reserva e executa o estorno somente se a claim ainda não foi concluída. */
  async refundFailedCompletion(
    charge: PreparedTrackedDeliveryCharge,
    error: unknown,
    actorUserId: number | null,
  ): Promise<void> {
    const claim = await this.findClaim(charge.companyId, charge.claimId);
    if (!claim || claim.status === 'COMPLETED' || claim.status === 'REFUNDED') return;
    const token = randomUUID();
    const reserved = await (this.prisma as any).logisticaTrackedCreditClaim.updateMany({
      where: {
        id: charge.claimId,
        companyId: charge.companyId,
        status: { in: ['PROCESSING', 'DEBITED', 'REFUNDING'] },
        ...(claim.status === 'REFUNDING' ? {} : { processingToken: charge.processingToken }),
      },
      data: {
        status: 'REFUNDING',
        processingToken: token,
        leaseUntil: new Date(Date.now() + CLAIM_LEASE_MS),
        lastError: errorText(error).slice(0, 500),
      },
    });
    if (reserved.count !== 1) return;

    try {
      await this.wallet.refund(charge.companyId, {
        usageKey: charge.debitUsageKey,
        userId: actorUserId,
        metadata: { reason: 'tracked_delivery_completion_failed', claimId: charge.claimId },
      });
      await (this.prisma as any).logisticaTrackedCreditClaim.updateMany({
        where: {
          id: charge.claimId,
          companyId: charge.companyId,
          status: 'REFUNDING',
          processingToken: token,
        },
        data: {
          status: 'REFUNDED',
          refundedAt: new Date(),
          processingToken: null,
          leaseUntil: null,
        },
      });
    } catch (refundError) {
      await (this.prisma as any).logisticaTrackedCreditClaim.updateMany({
        where: { id: charge.claimId, companyId: charge.companyId, processingToken: token },
        data: {
          leaseUntil: new Date(),
          lastError: `refund_pending:${errorText(refundError)}`.slice(0, 500),
        },
      }).catch(() => undefined);
      throw refundError;
    }
  }

  async reconcilePendingRefunds(now = new Date()): Promise<{ scanned: number; refunded: number; failed: number }> {
    const result = { scanned: 0, refunded: 0, failed: 0 };
    const configs = (await (this.prisma as any).logisticaConfig.findMany({
      select: { companyId: true },
    })) as Array<{ companyId: number }>;
    for (const config of configs) {
      const companyId = Number(config.companyId);
      if (!Number.isInteger(companyId) || companyId <= 0) continue;
      const claims = (await (this.prisma as any).logisticaTrackedCreditClaim.findMany({
        where: {
          companyId,
          status: { in: ['PROCESSING', 'DEBITED', 'REFUNDING'] },
          OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
        },
        take: 100,
      })) as TrackedClaimRow[];
      for (const original of claims) {
        result.scanned += 1;
        try {
          const claim = await this.reconcileClaim(original);
          if (claim.status === 'COMPLETED' || claim.status === 'REFUNDED') continue;
          if (!claim.debitUsageKey) {
            await this.failClaim(claim, 'FAILED', 'expired_claim_without_usage_key');
            result.failed += 1;
            continue;
          }
          const debited = await this.debitedCreditsForUsage(companyId, claim.debitUsageKey);
          if (debited <= 0) {
            await this.failClaim(claim, 'FAILED', 'expired_claim_without_debit');
            result.failed += 1;
            continue;
          }
          await this.refundStaleClaim(claim, now);
          result.refunded += 1;
        } catch (error) {
          result.failed += 1;
          this.logger.error(
            `[logistica] claim tracked pendente company=${companyId} id=${original.id}: ${errorText(error)}`,
          );
        }
      }
    }
    return result;
  }

  private async runReconciliation(): Promise<void> {
    if (this.reconciling) return;
    this.reconciling = true;
    try {
      const result = await this.reconcilePendingRefunds();
      if (result.scanned > 0) {
        this.logger.log(
          `[logistica] reconciliador tracked: lidas=${result.scanned} estornadas=${result.refunded} falhas=${result.failed}`,
        );
      }
    } finally {
      this.reconciling = false;
    }
  }

  private async assertNoUnsnappedTrackedRoute(companyId: number, deliveryId: string): Promise<void> {
    const delivery = await this.prisma.entrega.findFirst({
      where: { companyId, id: deliveryId },
      select: { entregadorId: true, scheduledAt: true },
    });
    if (!delivery?.entregadorId) return;
    const routeDate = canonicalRouteDate(undefined, delivery.scheduledAt ?? new Date());
    const active = await (this.prisma as any).logisticaRoute.findFirst({
      where: { companyId, entregadorId: delivery.entregadorId, routeDate, mode: 'TRACKED', status: 'ACTIVE' },
      select: { id: true },
    });
    if (active) {
      throw new ConflictException('Esta entrega ainda não pertence ao snapshot da rota rastreada. Recalcule a rota.');
    }
  }

  private async assertTrackingEligible(input: {
    companyId: number;
    route: any;
    session: any;
    completedAt: Date;
    tx?: any;
  }): Promise<void> {
    if (!isLogisticaTrackingEnabled()) {
      throw new ConflictException('O rastreamento está indisponível no momento.');
    }
    const db = input.tx ?? (this.prisma as any);
    const config = await db.logisticaConfig.findFirst({
      where: { companyId: input.companyId },
      select: { trackingAtivo: true },
    });
    if (!config?.trackingAtivo) {
      throw new ConflictException('O rastreamento está desativado para esta empresa.');
    }
    if (!input.route || input.route.companyId !== input.companyId || input.route.mode !== 'TRACKED') {
      throw new ConflictException('Rota rastreada inválida para esta empresa.');
    }
    if (input.route.status !== 'ACTIVE') {
      throw new ConflictException('A rota rastreada precisa estar ativa para concluir a entrega.');
    }
    const session = input.session;
    if (
      !session ||
      session.companyId !== input.companyId ||
      session.routeId !== input.route.id ||
      session.status !== 'ACTIVE' ||
      !session.deviceId ||
      !session.hasValidPositions ||
      new Date(session.startedAt).getTime() > input.completedAt.getTime()
    ) {
      throw new ConflictException('A sessão de rastreamento ainda não possui GPS válido.');
    }
    const validPositions = await db.logisticaTrackingPoint.count({
      where: {
        companyId: input.companyId,
        sessionId: session.id,
        capturedAt: { gte: session.startedAt, lte: input.completedAt },
      },
    });
    if (validPositions < 1) {
      throw new ConflictException('A sessão de rastreamento ainda não possui posição válida para esta entrega.');
    }
  }

  private async ensureClaim(input: {
    companyId: number;
    trackingSessionId: string;
    routeId: string;
    deliveryId: string;
  }): Promise<TrackedClaimRow> {
    const delegate = (this.prisma as any).logisticaTrackedCreditClaim;
    const where = {
      companyId_trackingSessionId_deliveryId: {
        companyId: input.companyId,
        trackingSessionId: input.trackingSessionId,
        deliveryId: input.deliveryId,
      },
    };
    const existing = (await delegate.findUnique({ where })) as TrackedClaimRow | null;
    if (existing) {
      if (existing.routeId !== input.routeId) throw new ConflictException('Claim rastreada vinculada a outra rota.');
      return existing;
    }
    try {
      return (await delegate.create({ data: input })) as TrackedClaimRow;
    } catch (error) {
      if (!isUniqueError(error)) throw error;
      const winner = (await delegate.findUnique({ where })) as TrackedClaimRow | null;
      if (winner?.routeId === input.routeId) return winner;
      throw error;
    }
  }

  private async acquireClaim(initial: TrackedClaimRow): Promise<TrackedClaimRow> {
    let claim = initial;
    const delegate = (this.prisma as any).logisticaTrackedCreditClaim;
    for (let retry = 0; retry < 6; retry++) {
      claim = await this.reconcileClaim(claim);
      if (claim.status === 'COMPLETED') {
        throw new ConflictException('Esta entrega rastreada já foi concluída. Atualize a rota.');
      }
      const now = new Date();
      if (
        ['PROCESSING', 'DEBITED', 'REFUNDING'].includes(claim.status) &&
        claim.leaseUntil &&
        claim.leaseUntil > now
      ) {
        throw new ConflictException('Cobrança da entrega em processamento. Tente novamente.');
      }
      if (claim.status === 'PROCESSING' || claim.status === 'DEBITED' || claim.status === 'REFUNDING') {
        if (claim.debitUsageKey) await this.refundStaleClaim(claim, now);
        else await this.failClaim(claim, 'FAILED', 'expired_claim_without_usage_key');
        claim = (await this.findClaim(claim.companyId, claim.id))!;
        continue;
      }

      const billingAttempt = claim.billingAttempt + 1;
      const processingToken = randomUUID();
      const debitUsageKey = trackedUsageKey(
        claim.companyId,
        claim.trackingSessionId,
        claim.deliveryId,
        billingAttempt,
      );
      const updated = await delegate.updateMany({
        where: {
          id: claim.id,
          companyId: claim.companyId,
          status: claim.status,
          billingAttempt: claim.billingAttempt,
          processingToken: claim.processingToken,
        },
        data: {
          status: 'PROCESSING',
          billingAttempt,
          debitUsageKey,
          processingToken,
          leaseUntil: new Date(now.getTime() + CLAIM_LEASE_MS),
          refundedAt: null,
          lastError: null,
        },
      });
      if (updated.count === 1) {
        return {
          ...claim,
          status: 'PROCESSING',
          billingAttempt,
          debitUsageKey,
          processingToken,
          leaseUntil: new Date(now.getTime() + CLAIM_LEASE_MS),
        };
      }
      const current = await this.findClaim(claim.companyId, claim.id);
      if (!current) throw new ConflictException('Claim rastreada não encontrada.');
      claim = current;
    }
    throw new ConflictException('Não foi possível reservar a cobrança rastreada.');
  }

  private async reconcileClaim(claim: TrackedClaimRow): Promise<TrackedClaimRow> {
    if (!claim.debitUsageKey || claim.status === 'COMPLETED') return claim;
    const refunded = await (this.prisma as any).creditLedgerEntry.count({
      where: { companyId: claim.companyId, kind: 'refund', usageKey: `refund:${claim.debitUsageKey}` },
    });
    if (refunded > 0 && claim.status !== 'REFUNDED') {
      await (this.prisma as any).logisticaTrackedCreditClaim.updateMany({
        where: { id: claim.id, companyId: claim.companyId, status: { not: 'COMPLETED' } },
        data: { status: 'REFUNDED', refundedAt: new Date(), processingToken: null, leaseUntil: null },
      });
      return (await this.findClaim(claim.companyId, claim.id)) ?? claim;
    }
    const debited = await this.debitedCreditsForUsage(claim.companyId, claim.debitUsageKey);
    if (debited > 0 && claim.status === 'PROCESSING') {
      const paidCreditsConsumed = await this.paidCreditsForUsage(claim.companyId, claim.debitUsageKey);
      await (this.prisma as any).logisticaTrackedCreditClaim.updateMany({
        where: { id: claim.id, companyId: claim.companyId, status: 'PROCESSING' },
        data: { status: 'DEBITED', debitedAt: new Date(), paidCreditsConsumed },
      });
      return (await this.findClaim(claim.companyId, claim.id)) ?? claim;
    }
    return claim;
  }

  private async refundStaleClaim(claim: TrackedClaimRow, now: Date): Promise<void> {
    if (!claim.debitUsageKey) {
      await this.failClaim(claim, 'FAILED', 'expired_claim_without_usage_key');
      return;
    }
    const token = randomUUID();
    const reserved = await (this.prisma as any).logisticaTrackedCreditClaim.updateMany({
      where: {
        id: claim.id,
        companyId: claim.companyId,
        status: { in: ['PROCESSING', 'DEBITED', 'REFUNDING'] },
        OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
      },
      data: {
        status: 'REFUNDING',
        processingToken: token,
        leaseUntil: new Date(now.getTime() + CLAIM_LEASE_MS),
        lastError: 'stale_claim_refund',
      },
    });
    if (reserved.count !== 1) return;
    await this.wallet.refund(claim.companyId, {
      usageKey: claim.debitUsageKey,
      metadata: { reason: 'tracked_stale_claim', claimId: claim.id },
    });
    await (this.prisma as any).logisticaTrackedCreditClaim.updateMany({
      where: { id: claim.id, companyId: claim.companyId, status: 'REFUNDING', processingToken: token },
      data: {
        status: 'REFUNDED',
        refundedAt: new Date(),
        processingToken: null,
        leaseUntil: null,
      },
    });
  }

  private async paidCreditsForUsage(companyId: number, usageKey: string): Promise<number> {
    const debits = (await (this.prisma as any).creditLedgerEntry.findMany({
      where: { companyId, usageKey, kind: 'debit' },
      select: { amount: true, parentEntryId: true },
    })) as Array<{ amount: number; parentEntryId: string | null }>;
    const parentIds = Array.from(new Set(debits.map((row) => row.parentEntryId).filter(Boolean))) as string[];
    if (parentIds.length === 0) return 0;
    const lots = (await (this.prisma as any).creditLedgerEntry.findMany({
      where: { companyId, id: { in: parentIds } },
      select: { id: true, grantType: true },
    })) as Array<{ id: string; grantType: string | null }>;
    const paid = new Set(lots.filter((lot) => lot.grantType === 'paid').map((lot) => lot.id));
    return debits.reduce((sum, row) => sum + (row.parentEntryId && paid.has(row.parentEntryId) ? row.amount : 0), 0);
  }

  private async debitedCreditsForUsage(companyId: number, usageKey: string): Promise<number> {
    const rows = (await (this.prisma as any).creditLedgerEntry.findMany({
      where: { companyId, usageKey, kind: 'debit' },
      select: { amount: true },
    })) as Array<{ amount: number }>;
    return rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  }

  private findClaim(companyId: number, claimId: string): Promise<TrackedClaimRow | null> {
    return (this.prisma as any).logisticaTrackedCreditClaim.findFirst({ where: { id: claimId, companyId } });
  }

  private async failClaim(claim: TrackedClaimRow, status: 'FAILED' | 'REFUNDED', message: string): Promise<void> {
    await (this.prisma as any).logisticaTrackedCreditClaim.updateMany({
      where: { id: claim.id, companyId: claim.companyId, status: { not: 'COMPLETED' } },
      data: {
        status,
        refundedAt: status === 'REFUNDED' ? new Date() : null,
        processingToken: null,
        leaseUntil: null,
        lastError: message.slice(0, 500),
      },
    });
  }
}

export function trackedUsageKey(
  companyId: number,
  trackingSessionId: string,
  deliveryId: string,
  billingAttempt: number,
): string {
  return `logistica:tracked:v1:${companyId}:${trackingSessionId}:${deliveryId}:a${billingAttempt}`;
}

export function saoPauloMonth(value = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}`;
}

function trackedCommercialUnavailable(): HttpException {
  return new HttpException(
    'Créditos insuficientes para concluir a entrega rastreada.',
    HttpStatus.PAYMENT_REQUIRED,
  );
}

function isUniqueError(error: unknown): boolean {
  return Boolean(error) && typeof error === 'object' && (error as any).code === 'P2002';
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 500);
  return String(error || 'unknown_error').slice(0, 500);
}
