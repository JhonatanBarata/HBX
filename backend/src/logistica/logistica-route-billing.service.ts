import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreditWalletService } from '../credits/credit-wallet.service';
import {
  CREDIT_ACTION_KEYS,
  getCreditActionDefinition,
} from '../credits/credit-action-catalog';
import { LogisticaConfigService } from './logistica-config.service';

export type LogisticaRouteMode = 'ESSENTIAL' | 'TRACKED';

export type PreparedLogisticaRoute = {
  routeId: string;
  mode: LogisticaRouteMode;
  status: string;
  totalUniqueDeliveries: number;
  newlyDebitedUsageKeys: string[];
  billingRevision: number;
};

type RouteRow = {
  id: string;
  companyId: number;
  entregadorId: number;
  routeDate: string;
  mode: string;
  status: string;
  billingRevision: number;
  initializationToken: string | null;
  initializationLeaseUntil: Date | null;
};

type ClaimRow = {
  id: string;
  companyId: number;
  routeId: string;
  entregadorId: number;
  routeDate: string;
  blockIndex: number;
  status: string;
  billingRevision: number;
  billingAttempt: number;
  debitUsageKey: string | null;
  processingToken: string | null;
  leaseUntil: Date | null;
};

const CLAIM_LEASE_MS = 60_000;
const INITIALIZATION_LEASE_MS = 90_000;
const REFUND_RECONCILE_INTERVAL_MS = 5 * 60_000;
const REFUND_RECONCILE_BOOT_DELAY_MS = 30_000;
const PREPARED_ROUTE_STALE_MS = 5 * 60_000;

/**
 * Núcleo comercial dos dois modos de logística.
 *
 * - snapshot monotônico (deliveryId globalmente único);
 * - modo congelado no nascimento da rota;
 * - Essencial = 1 crédito por bloco iniciado de 5 entregas únicas;
 * - claim idempotente por empresa+motorista+data+bloco;
 * - lease + reconciliação no ledger cobre crash entre débito e confirmação;
 * - toda tentativa posterior a estorno recebe nova usageKey versionada.
 */
@Injectable()
export class LogisticaRouteBillingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LogisticaRouteBillingService.name);
  private refundReconcileTimer: ReturnType<typeof setInterval> | null = null;
  private refundReconcileBootTimer: ReturnType<typeof setTimeout> | null = null;
  private refundReconcileRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: CreditWalletService,
    private readonly config: LogisticaConfigService,
  ) {}

  onModuleInit(): void {
    this.refundReconcileTimer = setInterval(() => {
      void this.runRefundReconciliation().catch((error) => {
        this.logger.error(`[logistica] reconciliador de estorno falhou: ${errorText(error)}`);
      });
    }, REFUND_RECONCILE_INTERVAL_MS);
    this.refundReconcileTimer.unref?.();

    this.refundReconcileBootTimer = setTimeout(() => {
      void this.runRefundReconciliation().catch((error) => {
        this.logger.error(`[logistica] reconciliação inicial de estorno falhou: ${errorText(error)}`);
      });
    }, REFUND_RECONCILE_BOOT_DELAY_MS);
    this.refundReconcileBootTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.refundReconcileTimer) clearInterval(this.refundReconcileTimer);
    if (this.refundReconcileBootTimer) clearTimeout(this.refundReconcileBootTimer);
    this.refundReconcileTimer = null;
    this.refundReconcileBootTimer = null;
  }

  async prepareRoute(input: {
    companyId: number;
    entregadorId: number;
    routeDate: string;
    deliveryIds: string[];
    actorUserId?: number | null;
    /** START cobra; PLAN só cobra blocos novos quando a rota já está ACTIVE. */
    chargeEssential?: boolean;
    /** Planejamento pré-início não cria nem congela rota comercial. */
    createIfMissing?: boolean;
  }): Promise<PreparedLogisticaRoute | null> {
    const companyId = Number(input.companyId);
    const entregadorId = Number(input.entregadorId);
    const routeDate = canonicalRouteDate(input.routeDate);
    if (!Number.isInteger(companyId) || companyId <= 0) {
      throw new BadRequestException('Empresa não identificada');
    }
    if (!Number.isInteger(entregadorId) || entregadorId <= 0) {
      throw new BadRequestException('A rota precisa de um motorista definido.');
    }

    const driver = await this.prisma.user.findFirst({
      where: { id: entregadorId, companyId, isActive: true },
      select: { id: true },
    });
    if (!driver) throw new BadRequestException('Motorista inválido para esta empresa.');

    const route = await this.ensureRoute(companyId, entregadorId, routeDate, input.createIfMissing !== false);
    if (!route) return null;
    if (route.status === 'REFUNDING') {
      throw new ConflictException('A rota está concluindo um estorno. Tente novamente em instantes.');
    }
    await this.syncSnapshot(route, input.deliveryIds);

    const totalUniqueDeliveries = await (this.prisma as any).logisticaRouteStop.count({
      where: { companyId, routeId: route.id },
    });

    const newlyDebitedUsageKeys: string[] = [];
    const shouldChargeEssential = route.mode === 'ESSENTIAL' && (input.chargeEssential === true || route.status === 'ACTIVE');
    if (shouldChargeEssential) {
      const requiredBlocks = essentialBlocksForDeliveries(totalUniqueDeliveries);
      try {
        for (let blockIndex = 1; blockIndex <= requiredBlocks; blockIndex++) {
          const charged = await this.chargeEssentialBlock({
            route,
            blockIndex,
            actorUserId: input.actorUserId ?? null,
          });
          if (charged.newlyDebited) newlyDebitedUsageKeys.push(charged.usageKey);
        }
      } catch (error) {
        await this.refundUsageKeys(companyId, newlyDebitedUsageKeys, input.actorUserId ?? null, 'billing_batch_failed');
        throw error;
      }
    }

    return {
      routeId: route.id,
      mode: route.mode as LogisticaRouteMode,
      status: route.status,
      totalUniqueDeliveries,
      newlyDebitedUsageKeys,
      billingRevision: route.billingRevision,
    };
  }

  private async ensureRoute(
    companyId: number,
    entregadorId: number,
    routeDate: string,
    createIfMissing: boolean,
  ): Promise<RouteRow | null> {
    const delegate = (this.prisma as any).logisticaRoute;
    const where = { companyId_entregadorId_routeDate: { companyId, entregadorId, routeDate } };
    const existing = (await delegate.findUnique({ where })) as RouteRow | null;
    if (existing) return existing;
    if (!createIfMissing) return null;

    const mode = await this.config.resolveRouteMode(companyId);
    try {
      return (await delegate.create({
        data: { companyId, entregadorId, routeDate, mode, status: 'PLANNED' },
      })) as RouteRow;
    } catch (error) {
      if (!isUniqueError(error)) throw error;
      const winner = (await delegate.findUnique({ where })) as RouteRow | null;
      if (winner) return winner;
      throw error;
    }
  }

  private async syncSnapshot(route: RouteRow, deliveryIdsInput: string[]): Promise<void> {
    const deliveryIds = Array.from(new Set((deliveryIdsInput || []).map(String).filter(Boolean)));
    if (deliveryIds.length === 0) return;

    const deliveries = await this.prisma.entrega.findMany({
      where: {
        companyId: route.companyId,
        id: { in: deliveryIds },
        entregadorId: route.entregadorId,
      },
      select: { id: true },
    });
    if (deliveries.length !== deliveryIds.length) {
      throw new BadRequestException('A rota contém entrega de outra empresa ou de outro motorista.');
    }

    const stopDelegate = (this.prisma as any).logisticaRouteStop;
    const existing = (await stopDelegate.findMany({
      where: { companyId: route.companyId, deliveryId: { in: deliveryIds } },
      select: { deliveryId: true, routeId: true },
    })) as Array<{ deliveryId: string; routeId: string }>;
    const existingByDelivery = new Map(existing.map((row) => [row.deliveryId, row.routeId]));
    for (const [deliveryId, routeId] of existingByDelivery) {
      if (routeId !== route.id) {
        throw new ConflictException(`A entrega ${deliveryId} já pertence a outra rota comercial.`);
      }
    }

    for (const deliveryId of deliveryIds) {
      if (existingByDelivery.has(deliveryId)) continue;
      await this.appendStop(route, deliveryId);
    }
  }

  private async appendStop(route: RouteRow, deliveryId: string): Promise<void> {
    const stopDelegate = (this.prisma as any).logisticaRouteStop;
    for (let attempt = 0; attempt < 6; attempt++) {
      const aggregate = await stopDelegate.aggregate({
        where: { companyId: route.companyId, routeId: route.id },
        _max: { snapshotOrder: true },
      });
      const snapshotOrder = Number(aggregate?._max?.snapshotOrder ?? -1) + 1;
      try {
        await stopDelegate.create({
          data: { companyId: route.companyId, routeId: route.id, deliveryId, snapshotOrder },
        });
        return;
      } catch (error) {
        if (!isUniqueError(error)) throw error;
        const winner = await stopDelegate.findFirst({
          where: { companyId: route.companyId, deliveryId },
          select: { routeId: true },
        });
        if (winner?.routeId === route.id) return;
        if (winner) throw new ConflictException('Entrega já vinculada a outra rota comercial.');
      }
    }
    throw new ConflictException('Não foi possível congelar a ordem da rota. Tente novamente.');
  }

  private async chargeEssentialBlock(input: {
    route: RouteRow;
    blockIndex: number;
    actorUserId: number | null;
  }): Promise<{ usageKey: string; newlyDebited: boolean }> {
    const definition = getCreditActionDefinition(CREDIT_ACTION_KEYS.LOGISTICA_ESSENTIAL_BLOCK);
    if (!definition || definition.mode !== 'debit' || definition.cost !== 1) {
      throw new Error('Contrato de crédito da Rota Essencial inválido.');
    }

    let claim = await this.ensureClaim(input.route, input.blockIndex);
    claim = await this.reconcileClaim(claim);
    if (claim.status === 'DEBITED' && claim.debitUsageKey) {
      return { usageKey: claim.debitUsageKey, newlyDebited: false };
    }

    const acquisition = await this.acquireClaim(claim, input.route.billingRevision);
    if (!acquisition.acquiredByCaller) {
      if (!acquisition.claim.debitUsageKey) throw new Error('Claim debitado sem usageKey.');
      return { usageKey: acquisition.claim.debitUsageKey, newlyDebited: false };
    }
    const acquired = acquisition.claim;
    const usageKey = acquired.debitUsageKey!;
    try {
      const result = await this.wallet.debit(acquired.companyId, 1, {
        actionKey: CREDIT_ACTION_KEYS.LOGISTICA_ESSENTIAL_BLOCK,
        usageKey,
        userId: input.actorUserId,
        metadata: {
          routeId: acquired.routeId,
          routeDate: acquired.routeDate,
          entregadorId: acquired.entregadorId,
          blockIndex: acquired.blockIndex,
          billingAttempt: acquired.billingAttempt,
        },
      });

      if (result.debited !== 1 || result.partial) {
        if (result.debited > 0) {
          await this.wallet.refund(acquired.companyId, {
            usageKey,
            userId: input.actorUserId,
            metadata: { reason: 'essential_insufficient_balance', claimId: acquired.id },
          });
        }
        await this.setClaimAfterFailure(acquired, result.debited > 0 ? 'REFUNDED' : 'FAILED', 'insufficient_balance');
        throw commercialUnavailable();
      }

      const updated = await (this.prisma as any).logisticaEssentialCreditClaim.updateMany({
        where: {
          companyId: acquired.companyId,
          id: acquired.id,
          status: 'PROCESSING',
          processingToken: acquired.processingToken,
        },
        data: {
          status: 'DEBITED',
          debitedAt: new Date(),
          refundedAt: null,
          processingToken: null,
          leaseUntil: null,
          lastError: null,
        },
      });
      if (updated.count !== 1) {
        const reconciled = await this.reconcileClaim(acquired);
        if (reconciled.status !== 'DEBITED') {
          await this.wallet.refund(acquired.companyId, {
            usageKey,
            userId: input.actorUserId,
            metadata: { reason: 'essential_claim_finalize_failed', claimId: acquired.id },
          });
          throw new Error('Falha ao confirmar claim da Rota Essencial.');
        }
      }
      return { usageKey, newlyDebited: true };
    } catch (error) {
      // debit() pode lançar depois de o ledger já ter commitado. Reconcilia antes
      // de propagar e estorna se esta tentativa deixou dinheiro consumido.
      let reconciled: ClaimRow;
      try {
        reconciled = await this.reconcileClaim(acquired);
      } catch (reconcileError) {
        // Estado financeiro incerto nunca vira FAILED: o reconciliador durável
        // precisa continuar encontrando o claim PROCESSING e consultar o ledger
        // novamente. Marcar FAILED aqui poderia esconder um débito já commitado.
        await (this.prisma as any).logisticaEssentialCreditClaim.updateMany({
          where: {
            companyId: acquired.companyId,
            id: acquired.id,
            status: 'PROCESSING',
            processingToken: acquired.processingToken,
          },
          data: {
            lastError: `ledger_reconcile_pending:${errorText(reconcileError)}`.slice(0, 500),
          },
        }).catch(() => undefined);
        throw error;
      }
      if (reconciled.status === 'DEBITED') {
        await this.refundUsageKeys(acquired.companyId, [usageKey], input.actorUserId, 'essential_debit_failed');
      } else if (reconciled.status === 'PROCESSING') {
        await this.setClaimAfterFailure(acquired, 'FAILED', errorText(error));
      }
      throw error;
    }
  }

  private async ensureClaim(route: RouteRow, blockIndex: number): Promise<ClaimRow> {
    const delegate = (this.prisma as any).logisticaEssentialCreditClaim;
    const where = {
      companyId_entregadorId_routeDate_blockIndex: {
        companyId: route.companyId,
        entregadorId: route.entregadorId,
        routeDate: route.routeDate,
        blockIndex,
      },
    };
    const existing = (await delegate.findUnique({ where })) as ClaimRow | null;
    if (existing) {
      if (existing.routeId !== route.id) throw new ConflictException('Claim comercial vinculado a outra rota.');
      return existing;
    }
    try {
      return (await delegate.create({
        data: {
          companyId: route.companyId,
          routeId: route.id,
          entregadorId: route.entregadorId,
          routeDate: route.routeDate,
          blockIndex,
        },
      })) as ClaimRow;
    } catch (error) {
      if (!isUniqueError(error)) throw error;
      const winner = (await delegate.findUnique({ where })) as ClaimRow | null;
      if (winner?.routeId === route.id) return winner;
      throw error;
    }
  }

  private async acquireClaim(
    initial: ClaimRow,
    routeBillingRevision: number,
  ): Promise<{ claim: ClaimRow; acquiredByCaller: boolean }> {
    const delegate = (this.prisma as any).logisticaEssentialCreditClaim;
    let claim = initial;
    for (let retry = 0; retry < 6; retry++) {
      claim = await this.reconcileClaim(claim);
      if (claim.status === 'DEBITED' && claim.debitUsageKey) {
        return { claim, acquiredByCaller: false };
      }
      const now = new Date();
      if (claim.status === 'PROCESSING' && claim.leaseUntil && claim.leaseUntil > now) {
        throw new ConflictException('Cobrança da rota em processamento. Tente novamente.');
      }

      const sameAttempt = claim.status === 'PROCESSING' && !!claim.debitUsageKey;
      const billingAttempt = sameAttempt ? claim.billingAttempt : claim.billingAttempt + 1;
      const usageKey = sameAttempt
        ? claim.debitUsageKey!
        : essentialUsageKey(claim.companyId, claim.entregadorId, claim.routeDate, claim.blockIndex, billingAttempt);
      const token = randomUUID();
      const updated = await delegate.updateMany({
        where: {
          companyId: claim.companyId,
          id: claim.id,
          status: claim.status,
          billingAttempt: claim.billingAttempt,
          processingToken: claim.processingToken,
        },
        data: {
          status: 'PROCESSING',
          billingRevision: routeBillingRevision,
          billingAttempt,
          debitUsageKey: usageKey,
          processingToken: token,
          leaseUntil: new Date(now.getTime() + CLAIM_LEASE_MS),
          refundedAt: null,
          lastError: null,
        },
      });
      if (updated.count === 1) {
        return {
          claim: {
            ...claim,
            status: 'PROCESSING',
            billingRevision: routeBillingRevision,
            billingAttempt,
            debitUsageKey: usageKey,
            processingToken: token,
            leaseUntil: new Date(now.getTime() + CLAIM_LEASE_MS),
          },
          acquiredByCaller: true,
        };
      }
      claim = await delegate.findFirst({ where: { companyId: claim.companyId, id: claim.id } });
    }
    throw new ConflictException('Não foi possível reservar a cobrança da rota.');
  }

  private async reconcileClaim(claim: ClaimRow): Promise<ClaimRow> {
    if (!claim.debitUsageKey || (claim.status !== 'PROCESSING' && claim.status !== 'DEBITED')) return claim;
    const rows = await this.prisma.creditLedgerEntry.findMany({
      where: {
        companyId: claim.companyId,
        usageKey: { in: [claim.debitUsageKey, `refund:${claim.debitUsageKey}`] },
        kind: { in: ['debit', 'refund'] },
      },
      select: { kind: true, amount: true, usageKey: true },
    });
    const debited = rows
      .filter((row) => row.kind === 'debit' && row.usageKey === claim.debitUsageKey)
      .reduce((sum, row) => sum + row.amount, 0);
    const refunded = rows
      .filter((row) => row.kind === 'refund' && row.usageKey === `refund:${claim.debitUsageKey}`)
      .reduce((sum, row) => sum + row.amount, 0);
    const status = refunded >= debited && debited > 0 ? 'REFUNDED' : debited >= 1 ? 'DEBITED' : claim.status;
    if (status === claim.status) return claim;
    const now = new Date();
    const updated = await (this.prisma as any).logisticaEssentialCreditClaim.updateMany({
      where: {
        companyId: claim.companyId,
        id: claim.id,
        status: claim.status,
        billingAttempt: claim.billingAttempt,
        debitUsageKey: claim.debitUsageKey,
      },
      data: {
        status,
        debitedAt: debited > 0 ? now : claim.status === 'DEBITED' ? now : undefined,
        refundedAt: status === 'REFUNDED' ? now : null,
        processingToken: null,
        leaseUntil: null,
      },
    });
    if (updated.count !== 1) {
      const current = await (this.prisma as any).logisticaEssentialCreditClaim.findFirst({
        where: { companyId: claim.companyId, id: claim.id },
      });
      return current || claim;
    }
    return { ...claim, status, processingToken: null, leaseUntil: null };
  }

  async beginInitialization(
    companyId: number,
    routeId: string,
    expectedBillingRevision: number,
  ): Promise<{ token: string | null; alreadyActive: boolean }> {
    const delegate = (this.prisma as any).logisticaRoute;
    for (let retry = 0; retry < 5; retry++) {
      const route = (await delegate.findFirst({ where: { companyId, id: routeId } })) as RouteRow | null;
      if (!route) throw new BadRequestException('Rota não encontrada.');
      if (route.status === 'ACTIVE' || route.status === 'COMPLETED') {
        return { token: null, alreadyActive: true };
      }
      if (route.status === 'REFUNDING') {
        throw new ConflictException('A rota está concluindo um estorno. Tente novamente em instantes.');
      }
      if (route.billingRevision !== expectedBillingRevision) {
        throw new ConflictException('A preparação comercial da rota expirou. Recalcule antes de iniciar.');
      }
      await this.assertRouteBillingReady(route);
      const now = new Date();
      if (
        route.status === 'INITIALIZING' &&
        route.initializationLeaseUntil &&
        route.initializationLeaseUntil > now
      ) {
        throw new ConflictException('Rota já está sendo iniciada. Tente novamente.');
      }
      const token = randomUUID();
      const updated = await delegate.updateMany({
        where: {
          companyId,
          id: route.id,
          status: route.status,
          billingRevision: expectedBillingRevision,
          initializationToken: route.initializationToken,
        },
        data: {
          status: 'INITIALIZING',
          initializationToken: token,
          initializationLeaseUntil: new Date(now.getTime() + INITIALIZATION_LEASE_MS),
          failedAt: null,
          lastError: null,
        },
      });
      if (updated.count === 1) return { token, alreadyActive: false };
    }
    throw new ConflictException('Não foi possível reservar a inicialização da rota.');
  }

  private async assertRouteBillingReady(route: RouteRow): Promise<void> {
    if (route.mode !== 'ESSENTIAL') return;
    const stopCount = await (this.prisma as any).logisticaRouteStop.count({
      where: { companyId: route.companyId, routeId: route.id },
    });
    const requiredBlocks = essentialBlocksForDeliveries(stopCount);
    if (requiredBlocks === 0) throw commercialUnavailable();
    const debitedClaims = await (this.prisma as any).logisticaEssentialCreditClaim.count({
      where: {
        companyId: route.companyId,
        routeId: route.id,
        billingRevision: route.billingRevision,
        blockIndex: { lte: requiredBlocks },
        status: 'DEBITED',
      },
    });
    if (debitedClaims !== requiredBlocks) throw commercialUnavailable();
  }

  /**
   * Gate fail-closed da confirmação. Um stop da rota Essencial ACTIVE só pode
   * concluir se o bloco correspondente continua DEBITED. Entrega ainda fora do
   * snapshot de uma rota ativa do mesmo motorista/dia também é bloqueada.
   */
  async assertEssentialDeliveryCovered(companyId: number, deliveryId: string): Promise<void> {
    const stop = await (this.prisma as any).logisticaRouteStop.findFirst({
      where: { companyId, deliveryId },
      include: { route: true },
    });
    if (stop?.route) {
      const route = stop.route as RouteRow;
      if (route.mode !== 'ESSENTIAL') return;
      // Stop já congelado em rota Essencial nunca pode escapar pelo caminho
      // legado: PLANNED/FAILED/INITIALIZING ainda não é rota válida para entrega.
      if (route.status !== 'ACTIVE') throw commercialUnavailable();
      const blockIndex = Math.floor(Number(stop.snapshotOrder) / 5) + 1;
      const claim = (await (this.prisma as any).logisticaEssentialCreditClaim.findFirst({
        where: { companyId, routeId: route.id, blockIndex },
      })) as ClaimRow | null;
      const reconciled = claim ? await this.reconcileClaim(claim) : null;
      if (!reconciled || reconciled.status !== 'DEBITED') throw commercialUnavailable();
      return;
    }

    const delivery = await this.prisma.entrega.findFirst({
      where: { companyId, id: deliveryId },
      select: { entregadorId: true, scheduledAt: true },
    });
    if (!delivery?.entregadorId) return;
    const routeDate = canonicalRouteDate(undefined, delivery.scheduledAt ?? new Date());
    const activeRoute = await (this.prisma as any).logisticaRoute.findFirst({
      where: {
        companyId,
        entregadorId: delivery.entregadorId,
        routeDate,
        status: 'ACTIVE',
      },
      select: { id: true, mode: true },
    });
    if (activeRoute?.mode === 'ESSENTIAL') throw commercialUnavailable();
  }

  async activateRoute(companyId: number, routeId: string, token: string, startedAt: Date): Promise<void> {
    const updated = await (this.prisma as any).logisticaRoute.updateMany({
      where: { companyId, id: routeId, status: 'INITIALIZING', initializationToken: token },
      data: {
        status: 'ACTIVE',
        startedAt,
        initializationToken: null,
        initializationLeaseUntil: null,
        failedAt: null,
        lastError: null,
      },
    });
    if (updated.count !== 1) throw new ConflictException('A inicialização da rota perdeu a reserva.');
  }

  private async runRefundReconciliation(): Promise<void> {
    if (this.refundReconcileRunning) return;
    this.refundReconcileRunning = true;
    try {
      const result = await this.reconcilePendingRefunds();
      if (result.refundedClaims > 0 || result.failedRoutes > 0 || result.failures > 0) {
        this.logger.log(
          `[logistica] reconciliador de estorno: rotas=${result.scannedRoutes} ` +
            `falhadas=${result.failedRoutes} claims_estornados=${result.refundedClaims} erros=${result.failures}`,
        );
      }
    } finally {
      this.refundReconcileRunning = false;
    }
  }

  /**
   * Recuperação durável do saga financeiro. Toda busca de rota/claim é feita por
   * companyId: a listagem inicial só descobre tenants que já possuem config de
   * logística. `wallet.refund` e a usageKey derivada tornam cada repetição segura.
   */
  async reconcilePendingRefunds(now = new Date()): Promise<{
    scannedRoutes: number;
    failedRoutes: number;
    refundedClaims: number;
    failures: number;
  }> {
    const result = { scannedRoutes: 0, failedRoutes: 0, refundedClaims: 0, failures: 0 };
    const staleBefore = new Date(now.getTime() - PREPARED_ROUTE_STALE_MS);
    const configs = (await (this.prisma as any).logisticaConfig.findMany({
      select: { companyId: true },
    })) as Array<{ companyId: number }>;

    for (const config of configs) {
      const companyId = Number(config.companyId);
      if (!Number.isInteger(companyId) || companyId <= 0) continue;
      const routes = (await (this.prisma as any).logisticaRoute.findMany({
        where: {
          companyId,
          mode: 'ESSENTIAL',
          OR: [
            // REFUNDING também entra sem claims pendentes: se o processo caiu
            // depois do último refund e antes de voltar a FAILED, esta passada
            // conclui a transição sem deixar a rota travada para sempre.
            { status: 'REFUNDING' },
            {
              status: 'FAILED',
              essentialClaims: { some: { status: { in: ['PROCESSING', 'DEBITED'] } } },
            },
            {
              status: 'PLANNED',
              updatedAt: { lte: staleBefore },
              essentialClaims: { some: { status: { in: ['PROCESSING', 'DEBITED'] } } },
            },
            {
              status: 'INITIALIZING',
              initializationLeaseUntil: { lte: now },
              essentialClaims: { some: { status: { in: ['PROCESSING', 'DEBITED'] } } },
            },
          ],
        },
        select: { id: true, status: true, billingRevision: true },
        take: 100,
      })) as Array<{ id: string; status: string; billingRevision: number }>;

      for (const route of routes) {
        result.scannedRoutes += 1;
        try {
          const listedRevision = route.billingRevision;
          let reservedForRefund = route.status === 'REFUNDING';
          let refundRevision = listedRevision;
          if (route.status === 'PLANNED') {
            const reserved = await (this.prisma as any).logisticaRoute.updateMany({
              where: {
                companyId,
                id: route.id,
                status: 'PLANNED',
                billingRevision: listedRevision,
                updatedAt: { lte: staleBefore },
              },
              data: {
                status: 'REFUNDING',
                billingRevision: { increment: 1 },
                failedAt: now,
                lastError: 'stale_prepared_route_refund',
                initializationToken: null,
                initializationLeaseUntil: null,
              },
            });
            reservedForRefund = reserved.count === 1;
            if (reservedForRefund) refundRevision = listedRevision + 1;
            if (reservedForRefund) result.failedRoutes += 1;
          } else if (route.status === 'INITIALIZING') {
            const reserved = await (this.prisma as any).logisticaRoute.updateMany({
              where: {
                companyId,
                id: route.id,
                status: 'INITIALIZING',
                billingRevision: listedRevision,
                initializationLeaseUntil: { lte: now },
              },
              data: {
                status: 'REFUNDING',
                billingRevision: { increment: 1 },
                failedAt: now,
                lastError: 'expired_initialization_lease_refund',
                initializationToken: null,
                initializationLeaseUntil: null,
              },
            });
            reservedForRefund = reserved.count === 1;
            if (reservedForRefund) refundRevision = listedRevision + 1;
            if (reservedForRefund) result.failedRoutes += 1;
          } else if (route.status === 'FAILED') {
            const reserved = await (this.prisma as any).logisticaRoute.updateMany({
              where: {
                companyId,
                id: route.id,
                status: 'FAILED',
                billingRevision: listedRevision,
              },
              data: {
                status: 'REFUNDING',
                billingRevision: { increment: 1 },
                initializationToken: null,
                initializationLeaseUntil: null,
              },
            });
            reservedForRefund = reserved.count === 1;
            if (reservedForRefund) refundRevision = listedRevision + 1;
          }
          if (!reservedForRefund) continue;
          const refund = await this.refundRouteClaims(
            companyId,
            route.id,
            null,
            'route_refund_reconciler',
            now,
            refundRevision,
          );
          result.refundedClaims += refund.refundedClaims;
          if (refund.pendingClaims === 0) {
            await (this.prisma as any).logisticaRoute.updateMany({
              where: {
                companyId,
                id: route.id,
                status: 'REFUNDING',
                billingRevision: refundRevision,
              },
              data: { status: 'FAILED' },
            });
          }
        } catch (error) {
          result.failures += 1;
          this.logger.error(
            `[logistica] reconciliador não concluiu company=${companyId} route=${route.id}: ${errorText(error)}`,
          );
        }
      }
    }
    return result;
  }

  async failInitialization(input: {
    companyId: number;
    routeId: string;
    token: string;
    actorUserId?: number | null;
    error: unknown;
  }): Promise<void> {
    // CAS primeiro: se activateRoute já commitou ACTIVE e depois lançou, este
    // token não pode estornar uma rota válida. Só o dono da lease INITIALIZING
    // que conseguiu transicionar para FAILED ganha o direito de estornar.
    const failed = await (this.prisma as any).logisticaRoute.updateMany({
      where: {
        companyId: input.companyId,
        id: input.routeId,
        status: 'INITIALIZING',
        initializationToken: input.token,
      },
      data: {
        status: 'REFUNDING',
        billingRevision: { increment: 1 },
        failedAt: new Date(),
        lastError: errorText(input.error),
        initializationToken: null,
        initializationLeaseUntil: null,
      },
    });
    if (failed.count !== 1) return;
    await this.refundReservedRoute(
      input.companyId,
      input.routeId,
      input.actorUserId ?? null,
      'route_initialization_failed',
    );
  }

  /**
   * Fecha a janela entre o débito do START e a aquisição da lease de início.
   * Só aborta se a rota AINDA estiver PLANNED; se outra requisição já a colocou
   * INITIALIZING/ACTIVE, não estorna créditos que ela está usando.
   */
  async abortPreparedRoute(input: {
    companyId: number;
    routeId: string;
    actorUserId?: number | null;
    error: unknown;
  }): Promise<boolean> {
    const failed = await (this.prisma as any).logisticaRoute.updateMany({
      where: { companyId: input.companyId, id: input.routeId, status: 'PLANNED' },
      data: {
        status: 'REFUNDING',
        billingRevision: { increment: 1 },
        failedAt: new Date(),
        lastError: errorText(input.error),
        initializationToken: null,
        initializationLeaseUntil: null,
      },
    });
    if (failed.count !== 1) return false;
    await this.refundReservedRoute(
      input.companyId,
      input.routeId,
      input.actorUserId ?? null,
      'route_begin_failed',
    );
    return true;
  }

  private async refundReservedRoute(
    companyId: number,
    routeId: string,
    actorUserId: number | null,
    reason: string,
  ): Promise<void> {
    const route = await (this.prisma as any).logisticaRoute.findFirst({
      where: { companyId, id: routeId, status: 'REFUNDING' },
      select: { billingRevision: true },
    });
    if (!route) return;
    const refundRevision = Number(route.billingRevision);
    const refund = await this.refundRouteClaims(
      companyId,
      routeId,
      actorUserId,
      reason,
      new Date(),
      refundRevision,
    );
    if (refund.pendingClaims === 0) {
      await (this.prisma as any).logisticaRoute.updateMany({
        where: { companyId, id: routeId, status: 'REFUNDING', billingRevision: refundRevision },
        data: { status: 'FAILED' },
      });
    }
  }

  private async refundRouteClaims(
    companyId: number,
    routeId: string,
    actorUserId: number | null,
    reason: string,
    now: Date,
    refundRevision: number,
  ): Promise<{ refundedClaims: number; pendingClaims: number }> {
    let refundedClaims = 0;
    const claims = (await (this.prisma as any).logisticaEssentialCreditClaim.findMany({
      where: {
        companyId,
        routeId,
        billingRevision: { lt: refundRevision },
        status: { in: ['PROCESSING', 'DEBITED'] },
      },
    })) as ClaimRow[];
    for (const original of claims) {
      // Falha ao ler o ledger precisa abortar esta passada. Marcar/refundar com
      // estado incerto poderia perder um débito que acabou de commitar.
      const claim = await this.reconcileClaim(original);
      if (claim.billingRevision >= refundRevision) continue;
      if (claim.status === 'DEBITED' && claim.debitUsageKey) {
        await this.refundUsageKeys(companyId, [claim.debitUsageKey], actorUserId, reason);
        refundedClaims += 1;
      } else if (
        claim.status === 'PROCESSING' &&
        (!claim.leaseUntil || claim.leaseUntil <= now)
      ) {
        // O ledger acabou de confirmar ausência de débito e a lease expirou.
        // O CAS preserva qualquer finalização concorrente que tenha vencido.
        await (this.prisma as any).logisticaEssentialCreditClaim.updateMany({
          where: {
            companyId,
            id: claim.id,
            status: 'PROCESSING',
            processingToken: claim.processingToken,
            leaseUntil: claim.leaseUntil,
          },
          data: {
            status: 'FAILED',
            processingToken: null,
            leaseUntil: null,
            lastError: 'expired_claim_without_debit',
          },
        });
      }
    }
    const pendingClaims = await (this.prisma as any).logisticaEssentialCreditClaim.count({
      where: {
        companyId,
        routeId,
        billingRevision: { lt: refundRevision },
        status: { in: ['PROCESSING', 'DEBITED'] },
      },
    });
    return { refundedClaims, pendingClaims };
  }

  async refundUsageKeys(
    companyId: number,
    usageKeys: string[],
    actorUserId: number | null,
    reason: string,
  ): Promise<void> {
    for (const usageKey of Array.from(new Set(usageKeys.filter(Boolean)))) {
      try {
        await this.wallet.refund(companyId, {
          usageKey,
          userId: actorUserId,
          metadata: { reason },
        });
        await (this.prisma as any).logisticaEssentialCreditClaim.updateMany({
          where: { companyId, debitUsageKey: usageKey },
          data: {
            status: 'REFUNDED',
            refundedAt: new Date(),
            processingToken: null,
            leaseUntil: null,
            lastError: reason.slice(0, 500),
          },
        });
      } catch (error) {
        this.logger.error(
          `[logistica] estorno essencial falhou company=${companyId} usageKey=${usageKey}: ${errorText(error)}`,
        );
        throw error;
      }
    }
  }

  private async setClaimAfterFailure(claim: ClaimRow, status: 'FAILED' | 'REFUNDED', error: string) {
    await (this.prisma as any).logisticaEssentialCreditClaim.updateMany({
      where: { companyId: claim.companyId, id: claim.id, processingToken: claim.processingToken },
      data: {
        status,
        refundedAt: status === 'REFUNDED' ? new Date() : null,
        processingToken: null,
        leaseUntil: null,
        lastError: error.slice(0, 500),
      },
    });
  }
}

export function canonicalRouteDate(value?: string | null, now = new Date()): string {
  const raw = String(value || '').trim();
  if (raw) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (!match) throw new BadRequestException('Data da rota inválida. Use YYYY-MM-DD.');
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const test = new Date(Date.UTC(year, month - 1, day));
    if (
      test.getUTCFullYear() === year &&
      test.getUTCMonth() === month - 1 &&
      test.getUTCDate() === day
    ) {
      return raw;
    }
    throw new BadRequestException('Data da rota inválida.');
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function essentialUsageKey(
  companyId: number,
  entregadorId: number,
  routeDate: string,
  blockIndex: number,
  billingAttempt: number,
): string {
  return `logistica:essential:company:${companyId}:driver:${entregadorId}:date:${routeDate}:block:${blockIndex}:attempt:${billingAttempt}`;
}

export function essentialBlocksForDeliveries(deliveries: number): number {
  const uniqueDeliveries = Math.max(0, Math.trunc(Number(deliveries) || 0));
  return Math.ceil(uniqueDeliveries / 5);
}

function commercialUnavailable() {
  return new HttpException(
    { statusCode: 402, code: 'LOGISTICA_ROUTE_UNAVAILABLE', message: 'Rota indisponível. Fale com o administrador.' },
    402,
  );
}

function isUniqueError(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as any).code === 'P2002';
}

function errorText(error: unknown): string {
  return String(error instanceof Error ? error.message : error || 'erro desconhecido').slice(0, 500);
}
