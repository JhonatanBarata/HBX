import { ConflictException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CreditWalletService } from '../credits/credit-wallet.service';
import { CREDIT_ACTION_KEYS } from '../credits/credit-action-catalog';
import { CreditActionConfigService } from '../credits/credit-action-config.service';
import { LogisticaNivelPlanoService } from './logistica-nivel-plano.service';
import { PrismaService } from '../prisma/prisma.service';
import { isLogisticaTrackingEnabled } from './logistica-tracking.flags';
import {
  LogisticaTrackedBillingService,
  type PreparedTrackedDeliveryCharge,
  trackedUsageKey,
} from './logistica-tracked-billing.service';

const OFFLINE_RESERVATION_GRACE_MS = 72 * 60 * 60 * 1000;

/**
 * Extensão do billing canônico: reserva cada entrega TRACKED quando a cápsula é
 * emitida e reaproveita a claim ao sincronizar. A conclusão continua na mesma
 * transação da Entrega pelo método herdado completeWithinTransaction.
 */
@Injectable()
export class OfflineAwareLogisticaTrackedBillingService extends LogisticaTrackedBillingService {
  constructor(
    private readonly offlinePrisma: PrismaService,
    private readonly offlineWallet: CreditWalletService,
    offlineActionConfig: CreditActionConfigService,
    // PR28072026 HÍBRIDO — a franquia do plano desce pro billing herdado; a
    // cápsula offline usa o MESMO prepareDeliveryCompletion, então cobre a
    // franquia de graça (sem duplicar a regra aqui).
    offlineNivelPlano: LogisticaNivelPlanoService,
  ) {
    super(offlinePrisma, offlineWallet, offlineActionConfig, offlineNivelPlano);
  }

  async reserveRouteDeliveries(input: {
    companyId: number;
    routeId: string;
    deviceId: string;
    userId: number;
    actorUserId: number | null;
    routeExpiresAt: Date;
  }): Promise<{ reserved: number; alreadyReserved: number; releaseAt: Date }> {
    // 💰 27/07 — preço do CATÁLOGO (mesma fonte do débito online). mode 'free'
    // pula as reservas mas NÃO pula o vínculo do aparelho à sessão (abaixo):
    // free muda o dinheiro, nunca o contrato de rastreio/vínculo da cápsula.
    const definition = await this.actionConfig.resolveEffective(CREDIT_ACTION_KEYS.LOGISTICA_TRACKED_DELIVERY);
    if (!definition || (definition.mode === 'debit' && !(definition.cost > 0))) {
      throw new Error('Contrato de crédito da Rota Rastreada inválido.');
    }
    const route = await (this.offlinePrisma as any).logisticaRoute.findFirst({
      where: {
        companyId: input.companyId,
        id: input.routeId,
        entregadorId: input.userId,
        mode: 'TRACKED',
        status: 'ACTIVE',
      },
      include: {
        trackingSession: true,
        stops: { select: { deliveryId: true } },
      },
    });
    if (!route) throw new ConflictException('Rota rastreada ativa não encontrada para este aparelho.');
    let session = route.trackingSession;
    if (!session) throw new ConflictException('A sessão de rastreamento ainda não foi criada.');
    if (session.deviceId && session.deviceId !== input.deviceId) {
      throw new ConflictException('Esta rota já está vinculada a outro aparelho.');
    }
    if (!session.deviceId) {
      await (this.offlinePrisma as any).logisticaTrackingSession.updateMany({
        where: {
          id: session.id,
          companyId: input.companyId,
          routeId: route.id,
          entregadorId: input.userId,
          status: 'ACTIVE',
          deviceId: null,
        },
        data: { deviceId: input.deviceId, deviceBoundAt: new Date() },
      });
      session = await (this.offlinePrisma as any).logisticaTrackingSession.findFirst({
        where: { id: session.id, companyId: input.companyId },
      });
      if (!session || session.deviceId !== input.deviceId) {
        throw new ConflictException('Outro aparelho vinculou esta rota primeiro.');
      }
    }

    const releaseAt = new Date(input.routeExpiresAt.getTime() + OFFLINE_RESERVATION_GRACE_MS);
    if (definition.mode !== 'debit') {
      return { reserved: 0, alreadyReserved: 0, releaseAt };
    }
    const newlyReserved: Array<{ claimId: string; usageKey: string }> = [];
    let alreadyReserved = 0;
    try {
      for (const stop of route.stops || []) {
        const outcome = await this.reserveOne({
          companyId: input.companyId,
          routeId: route.id,
          trackingSessionId: session.id,
          deliveryId: String(stop.deliveryId),
          actorUserId: input.actorUserId,
          releaseAt,
          cost: definition.cost,
        });
        if (outcome.newlyReserved) newlyReserved.push({ claimId: outcome.claimId, usageKey: outcome.usageKey });
        else alreadyReserved += 1;
      }
    } catch (error) {
      await Promise.all(
        newlyReserved.map(async (reservation) => {
          await this.offlineWallet.refund(input.companyId, {
            usageKey: reservation.usageKey,
            userId: input.actorUserId,
            metadata: { reason: 'offline_route_prepare_failed', claimId: reservation.claimId },
          }).catch(() => undefined);
          await (this.offlinePrisma as any).logisticaTrackedCreditClaim.updateMany({
            where: { id: reservation.claimId, companyId: input.companyId, status: { not: 'COMPLETED' } },
            data: {
              status: 'REFUNDED',
              refundedAt: new Date(),
              processingToken: null,
              leaseUntil: null,
              lastError: 'offline_route_prepare_failed',
            },
          }).catch(() => undefined);
        }),
      );
      throw error;
    }
    return { reserved: newlyReserved.length, alreadyReserved, releaseAt };
  }

  override async prepareDeliveryCompletion(
    companyId: number,
    deliveryId: string,
    actorUserId: number | null,
    now = new Date(),
  ): Promise<PreparedTrackedDeliveryCharge | null> {
    const stop = await (this.offlinePrisma as any).logisticaRouteStop.findFirst({
      where: { companyId, deliveryId },
      include: { route: { include: { trackingSession: true } } },
    });
    if (stop?.route?.mode === 'TRACKED') {
      const session = stop.route.trackingSession;
      const claim = session
        ? await (this.offlinePrisma as any).logisticaTrackedCreditClaim.findUnique({
            where: {
              companyId_trackingSessionId_deliveryId: {
                companyId,
                trackingSessionId: session.id,
                deliveryId,
              },
            },
          })
        : null;
      if (
        claim?.status === 'DEBITED' &&
        claim.processingToken &&
        claim.debitUsageKey &&
        (!claim.leaseUntil || new Date(claim.leaseUntil).getTime() > now.getTime())
      ) {
        // Falha aqui acontece ANTES de LogisticaService considerar que há charge;
        // uma posição ainda não sincronizada não estorna a reserva da rota.
        await this.assertReservedCompletionEligible(companyId, stop.route, session, now);
        return {
          claimId: claim.id,
          companyId,
          trackingSessionId: session.id,
          routeId: stop.route.id,
          deliveryId,
          debitUsageKey: claim.debitUsageKey,
          processingToken: claim.processingToken,
          paidCreditsConsumed: Number(claim.paidCreditsConsumed || 0),
        };
      }
    }
    return super.prepareDeliveryCompletion(companyId, deliveryId, actorUserId, now);
  }

  private async reserveOne(input: {
    companyId: number;
    routeId: string;
    trackingSessionId: string;
    deliveryId: string;
    actorUserId: number | null;
    releaseAt: Date;
    /** Custo efetivo por entrega, já resolvido do catálogo pelo chamador. */
    cost: number;
  }): Promise<{ claimId: string; usageKey: string; newlyReserved: boolean }> {
    const delegate = (this.offlinePrisma as any).logisticaTrackedCreditClaim;
    let claim = await delegate.findUnique({
      where: {
        companyId_trackingSessionId_deliveryId: {
          companyId: input.companyId,
          trackingSessionId: input.trackingSessionId,
          deliveryId: input.deliveryId,
        },
      },
    });
    if (!claim) {
      claim = await delegate.create({
        data: {
          companyId: input.companyId,
          routeId: input.routeId,
          trackingSessionId: input.trackingSessionId,
          deliveryId: input.deliveryId,
        },
      }).catch(async (error: any) => {
        if (String(error?.code || '') !== 'P2002') throw error;
        return delegate.findUnique({
          where: {
            companyId_trackingSessionId_deliveryId: {
              companyId: input.companyId,
              trackingSessionId: input.trackingSessionId,
              deliveryId: input.deliveryId,
            },
          },
        });
      });
    }
    if (!claim || claim.routeId !== input.routeId) throw new ConflictException('Reserva vinculada a outra rota.');
    if (claim.status === 'COMPLETED') {
      return { claimId: claim.id, usageKey: claim.debitUsageKey || '', newlyReserved: false };
    }
    if (
      claim.status === 'DEBITED' &&
      claim.debitUsageKey &&
      claim.processingToken &&
      (!claim.leaseUntil || new Date(claim.leaseUntil).getTime() > Date.now())
    ) {
      if (!claim.leaseUntil || new Date(claim.leaseUntil).getTime() < input.releaseAt.getTime()) {
        await delegate.updateMany({
          where: { id: claim.id, companyId: input.companyId, status: 'DEBITED' },
          data: { leaseUntil: input.releaseAt },
        });
      }
      return { claimId: claim.id, usageKey: claim.debitUsageKey, newlyReserved: false };
    }
    if (['PROCESSING', 'DEBITED', 'REFUNDING'].includes(String(claim.status))) {
      throw new ConflictException('A reserva de créditos desta rota ainda está sendo reconciliada.');
    }

    const billingAttempt = Number(claim.billingAttempt || 0) + 1;
    const processingToken = randomUUID();
    const usageKey = trackedUsageKey(
      input.companyId,
      input.trackingSessionId,
      input.deliveryId,
      billingAttempt,
    );
    const acquired = await delegate.updateMany({
      where: {
        id: claim.id,
        companyId: input.companyId,
        status: claim.status,
        billingAttempt: claim.billingAttempt,
        processingToken: claim.processingToken,
      },
      data: {
        status: 'PROCESSING',
        billingAttempt,
        debitUsageKey: usageKey,
        processingToken,
        leaseUntil: input.releaseAt,
        refundedAt: null,
        lastError: null,
      },
    });
    if (acquired.count !== 1) throw new ConflictException('Outro processo está reservando os créditos da rota.');

    const debit = await this.offlineWallet.debit(input.companyId, input.cost, {
      actionKey: CREDIT_ACTION_KEYS.LOGISTICA_TRACKED_DELIVERY,
      usageKey,
      userId: input.actorUserId,
      metadata: {
        trigger: 'offline_route_prepared',
        claimId: claim.id,
        routeId: input.routeId,
        trackingSessionId: input.trackingSessionId,
        deliveryId: input.deliveryId,
        billingAttempt,
      },
    });
    if (debit.debited !== input.cost || debit.partial) {
      if (debit.debited > 0) {
        await this.offlineWallet.refund(input.companyId, {
          usageKey,
          userId: input.actorUserId,
          metadata: { reason: 'offline_route_insufficient_balance', claimId: claim.id },
        });
      }
      await delegate.updateMany({
        where: { id: claim.id, companyId: input.companyId, processingToken },
        data: {
          status: debit.debited > 0 ? 'REFUNDED' : 'FAILED',
          refundedAt: debit.debited > 0 ? new Date() : null,
          processingToken: null,
          leaseUntil: null,
          lastError: 'insufficient_balance',
        },
      });
      throw new HttpException('Créditos insuficientes para preparar a rota rastreada.', HttpStatus.PAYMENT_REQUIRED);
    }

    const paidCreditsConsumed = await this.offlinePaidCreditsForUsage(input.companyId, usageKey);
    const finalized = await delegate.updateMany({
      where: {
        id: claim.id,
        companyId: input.companyId,
        status: 'PROCESSING',
        processingToken,
      },
      data: {
        status: 'DEBITED',
        paidCreditsConsumed,
        debitedAt: new Date(),
        leaseUntil: input.releaseAt,
        lastError: null,
      },
    });
    if (finalized.count !== 1) {
      await this.offlineWallet.refund(input.companyId, {
        usageKey,
        userId: input.actorUserId,
        metadata: { reason: 'offline_route_reservation_finalize_failed', claimId: claim.id },
      });
      throw new Error('Falha ao confirmar a reserva de créditos da rota rastreada.');
    }
    return { claimId: claim.id, usageKey, newlyReserved: true };
  }

  private async assertReservedCompletionEligible(companyId: number, route: any, session: any, completedAt: Date) {
    if (!isLogisticaTrackingEnabled()) {
      throw new ConflictException('O rastreamento está indisponível no momento.');
    }
    const config = await (this.offlinePrisma as any).logisticaConfig.findFirst({
      where: { companyId },
      select: { trackingAtivo: true },
    });
    if (!config?.trackingAtivo) throw new ConflictException('O rastreamento está desativado para esta empresa.');
    if (!route || route.companyId !== companyId || route.mode !== 'TRACKED' || route.status !== 'ACTIVE') {
      throw new ConflictException('A rota rastreada precisa estar ativa para concluir a entrega.');
    }
    if (
      !session ||
      session.companyId !== companyId ||
      session.routeId !== route.id ||
      session.status !== 'ACTIVE' ||
      !session.deviceId ||
      !session.hasValidPositions ||
      new Date(session.startedAt).getTime() > completedAt.getTime()
    ) {
      throw new ConflictException('A sessão de rastreamento ainda não possui GPS válido.');
    }
    const positions = await (this.offlinePrisma as any).logisticaTrackingPoint.count({
      where: {
        companyId,
        sessionId: session.id,
        capturedAt: { gte: session.startedAt, lte: completedAt },
      },
    });
    if (positions < 1) throw new ConflictException('A posição da entrega ainda não chegou ao servidor.');
  }

  private async offlinePaidCreditsForUsage(companyId: number, usageKey: string): Promise<number> {
    const debits = await (this.offlinePrisma as any).creditLedgerEntry.findMany({
      where: { companyId, usageKey, kind: 'debit' },
      select: { amount: true, parentEntryId: true },
    });
    const parentIds = Array.from(new Set(debits.map((row: any) => row.parentEntryId).filter(Boolean))) as string[];
    if (parentIds.length === 0) return 0;
    const lots = await (this.offlinePrisma as any).creditLedgerEntry.findMany({
      where: { companyId, id: { in: parentIds } },
      select: { id: true, grantType: true },
    });
    const paid = new Set(lots.filter((lot: any) => lot.grantType === 'paid').map((lot: any) => lot.id));
    return debits.reduce(
      (sum: number, row: any) => sum + (row.parentEntryId && paid.has(row.parentEntryId) ? Number(row.amount || 0) : 0),
      0,
    );
  }
}
