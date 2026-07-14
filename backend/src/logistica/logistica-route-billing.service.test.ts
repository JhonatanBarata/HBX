import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalRouteDate,
  essentialBlocksForDeliveries,
  essentialUsageKey,
  LogisticaRouteBillingService,
} from './logistica-route-billing.service';

function makeHarness(mode: 'ESSENTIAL' | 'TRACKED' = 'ESSENTIAL') {
  const routes: any[] = [];
  const stops: any[] = [];
  const claims: any[] = [];
  const ledger: any[] = [];
  const debitCalls: any[] = [];
  const refundCalls: any[] = [];
  let available = 100;
  let seq = 0;
  let raceClaimToDebited = false;
  let refundFailuresRemaining = 0;
  let ledgerReadFailuresRemaining = 0;
  let debitAfterCommitFailuresRemaining = 0;
  let pausedRefund:
    | { started: Promise<void>; markStarted: () => void; waitForRelease: Promise<void>; release: () => void }
    | null = null;
  let pausedClaimRefundRead:
    | { started: Promise<void>; markStarted: () => void; waitForRelease: Promise<void>; release: () => void }
    | null = null;
  const p2002 = () => Object.assign(new Error('unique'), { code: 'P2002' });
  const match = (row: any, where: any) => Object.entries(where || {}).every(([key, value]: any) => {
    if (key === 'OR' && Array.isArray(value)) return value.some((part) => match(row, part));
    if (key === 'status' && value?.in) return value.in.includes(row.status);
    if (key === 'id' && value?.in) return value.in.includes(row.id);
    if (key === 'deliveryId' && value?.in) return value.in.includes(row.deliveryId);
    if (value?.lte instanceof Date) return row[key] instanceof Date && row[key].getTime() <= value.lte.getTime();
    if (value?.lte !== undefined) return row[key] <= value.lte;
    if (value?.lt !== undefined) return row[key] < value.lt;
    return row[key] === value;
  });

  const prisma: any = {
    logisticaConfig: { findMany: async () => [{ companyId: 7 }] },
    user: { findFirst: async ({ where }: any) => where.id === 9 && where.companyId === 7 ? { id: 9 } : null },
    entrega: {
      findMany: async ({ where }: any) => (where.id.in as string[]).map((id) => ({ id })),
      findFirst: async ({ where }: any) => where.companyId === 7 ? {
        id: where.id, entregadorId: 9, scheduledAt: new Date('2026-07-13T12:00:00.000Z'),
      } : null,
    },
    logisticaRoute: {
      findUnique: async ({ where }: any) => {
        const key = where.companyId_entregadorId_routeDate;
        return routes.find((r) => r.companyId === key.companyId && r.entregadorId === key.entregadorId && r.routeDate === key.routeDate) || null;
      },
      create: async ({ data }: any) => {
        if (routes.some((r) => r.companyId === data.companyId && r.entregadorId === data.entregadorId && r.routeDate === data.routeDate)) throw p2002();
        const row = {
          id: `route-${++seq}`,
          initializationToken: null,
          initializationLeaseUntil: null,
          billingRevision: 0,
          updatedAt: new Date(),
          ...data,
        };
        routes.push(row);
        return row;
      },
      findFirst: async ({ where }: any) => routes.find((r) => match(r, where)) || null,
      findMany: async ({ where }: any) => routes.filter((route) => {
        if (route.companyId !== where.companyId || route.mode !== where.mode) return false;
        return where.OR.some((part: any) => {
          if (!match(route, Object.fromEntries(Object.entries(part).filter(([key]) => key !== 'essentialClaims')))) {
            return false;
          }
          const statuses = part.essentialClaims?.some?.status?.in;
          return !statuses || claims.some((claim) => claim.routeId === route.id && statuses.includes(claim.status));
        });
      }),
      updateMany: async ({ where, data }: any) => {
        const selected = routes.filter((r) => match(r, where));
        selected.forEach((row) => {
          const next = { ...data };
          if (data.billingRevision?.increment) {
            next.billingRevision = row.billingRevision + data.billingRevision.increment;
          }
          Object.assign(row, next);
        });
        return { count: selected.length };
      },
    },
    logisticaRouteStop: {
      count: async ({ where }: any) => stops.filter((r) => match(r, where)).length,
      findMany: async ({ where }: any) => stops.filter((r) => match(r, where)),
      findFirst: async ({ where, include }: any) => {
        const row = stops.find((r) => match(r, where));
        if (!row) return null;
        return include?.route ? { ...row, route: routes.find((r) => r.id === row.routeId) || null } : row;
      },
      aggregate: async ({ where }: any) => ({
        _max: { snapshotOrder: Math.max(-1, ...stops.filter((r) => match(r, where)).map((r) => r.snapshotOrder)) },
      }),
      create: async ({ data }: any) => {
        if (stops.some((r) => r.deliveryId === data.deliveryId || (r.routeId === data.routeId && r.snapshotOrder === data.snapshotOrder))) throw p2002();
        const row = { id: `stop-${++seq}`, ...data };
        stops.push(row);
        return row;
      },
    },
    logisticaEssentialCreditClaim: {
      count: async ({ where }: any) => claims.filter((r) => match(r, where)).length,
      findUnique: async ({ where }: any) => {
        const key = where.companyId_entregadorId_routeDate_blockIndex;
        return claims.find((r) => r.companyId === key.companyId && r.entregadorId === key.entregadorId && r.routeDate === key.routeDate && r.blockIndex === key.blockIndex) || null;
      },
      findFirst: async ({ where }: any) => claims.find((r) => match(r, where)) || null,
      findMany: async ({ where }: any) => {
        if (pausedClaimRefundRead) {
          const gate = pausedClaimRefundRead;
          pausedClaimRefundRead = null;
          gate.markStarted();
          await gate.waitForRelease;
        }
        return claims.filter((r) => match(r, where));
      },
      create: async ({ data }: any) => {
        if (claims.some((r) => r.companyId === data.companyId && r.entregadorId === data.entregadorId && r.routeDate === data.routeDate && r.blockIndex === data.blockIndex)) throw p2002();
        const row = {
          id: `claim-${++seq}`,
          status: 'PENDING', billingRevision: 0, billingAttempt: 0, debitUsageKey: null,
          processingToken: null, leaseUntil: null, ...data,
        };
        claims.push(row);
        return row;
      },
      updateMany: async ({ where, data }: any) => {
        const selected = claims.filter((r) => match(r, where));
        if (raceClaimToDebited && data.status === 'PROCESSING' && selected.length > 0) {
          const row = selected[0];
          row.status = 'DEBITED';
          row.billingAttempt = row.billingAttempt + 1;
          row.debitUsageKey = essentialUsageKey(row.companyId, row.entregadorId, row.routeDate, row.blockIndex, row.billingAttempt);
          row.processingToken = null;
          row.leaseUntil = null;
          ledger.push({ companyId: row.companyId, kind: 'debit', amount: 1, usageKey: row.debitUsageKey });
          raceClaimToDebited = false;
          return { count: 0 };
        }
        selected.forEach((row) => Object.assign(row, data));
        return { count: selected.length };
      },
    },
    creditLedgerEntry: {
      findMany: async ({ where }: any) => {
        if (ledgerReadFailuresRemaining > 0) {
          ledgerReadFailuresRemaining -= 1;
          throw new Error('ledger temporariamente indisponível');
        }
        return ledger.filter((row) => {
          if (row.companyId !== where.companyId) return false;
          if (where.usageKey?.in && !where.usageKey.in.includes(row.usageKey)) return false;
          if (where.kind?.in && !where.kind.in.includes(row.kind)) return false;
          return true;
        });
      },
    },
  };
  const wallet: any = {
    debit: async (companyId: number, amount: number, opts: any) => {
      debitCalls.push({ companyId, amount, ...opts });
      const previous = ledger.filter((r) => r.kind === 'debit' && r.usageKey === opts.usageKey);
      if (previous.length) return { debited: 1, requested: 1, partial: false, balanceAfter: available };
      if (available < amount) return { debited: 0, requested: amount, partial: true, balanceAfter: available };
      available -= amount;
      ledger.push({ companyId, kind: 'debit', amount, usageKey: opts.usageKey });
      if (debitAfterCommitFailuresRemaining > 0) {
        debitAfterCommitFailuresRemaining -= 1;
        throw new Error('resposta do débito caiu após commit');
      }
      return { debited: amount, requested: amount, partial: false, balanceAfter: available };
    },
    refund: async (companyId: number, opts: any) => {
      refundCalls.push({ companyId, ...opts });
      if (pausedRefund) {
        const gate = pausedRefund;
        pausedRefund = null;
        gate.markStarted();
        await gate.waitForRelease;
      }
      if (refundFailuresRemaining > 0) {
        refundFailuresRemaining -= 1;
        throw new Error('refund temporariamente indisponível');
      }
      const debit = ledger.find((r) => r.kind === 'debit' && r.usageKey === opts.usageKey);
      if (debit && !ledger.some((r) => r.kind === 'refund' && r.usageKey === `refund:${opts.usageKey}`)) {
        available += debit.amount;
        ledger.push({ companyId, kind: 'refund', amount: debit.amount, usageKey: `refund:${opts.usageKey}` });
      }
      return { refunded: debit?.amount || 0, balanceAfter: available, alreadyProcessed: false };
    },
  };
  prisma.$queryRawUnsafe = async () => [];
  prisma.$transaction = async (callback: any) => callback(prisma);
  const config: any = { resolveRouteMode: async () => mode };
  const service = new LogisticaRouteBillingService(prisma, wallet, config);
  return {
    service, routes, stops, claims, ledger, debitCalls, refundCalls,
    setAvailable: (n: number) => { available = n; },
    failNextRefunds: (count = 1) => { refundFailuresRemaining = count; },
    failNextLedgerReads: (count = 1) => { ledgerReadFailuresRemaining = count; },
    failNextDebitsAfterCommit: (count = 1) => { debitAfterCommitFailuresRemaining = count; },
    pauseNextRefund: () => {
      let markStarted!: () => void;
      let release!: () => void;
      const started = new Promise<void>((resolve) => { markStarted = resolve; });
      const waitForRelease = new Promise<void>((resolve) => { release = resolve; });
      pausedRefund = { started, markStarted, waitForRelease, release };
      return { started, release };
    },
    pauseNextClaimRefundRead: () => {
      let markStarted!: () => void;
      let release!: () => void;
      const started = new Promise<void>((resolve) => { markStarted = resolve; });
      const waitForRelease = new Promise<void>((resolve) => { release = resolve; });
      pausedClaimRefundRead = { started, markStarted, waitForRelease, release };
      return { started, release };
    },
    raceNextClaimToForeignDebit: () => { raceClaimToDebited = true; },
  };
}

test('Essencial cobra uma vez por bloco e só abre novo claim na 6ª entrega', async () => {
  const h = makeHarness();
  const base = { companyId: 7, entregadorId: 9, routeDate: '2026-07-13' };
  assert.equal(await h.service.prepareRoute({
    ...base, deliveryIds: ['d1', 'd2', 'd3', 'd4', 'd5'], createIfMissing: false,
  }), null);
  assert.equal(h.routes.length, 0, 'planejamento pré-início não cria nem congela modo comercial');
  assert.equal(h.stops.length, 0);
  assert.equal(h.debitCalls.length, 0);
  await h.service.prepareRoute({ ...base, deliveryIds: ['d1', 'd2', 'd3', 'd4', 'd5'], chargeEssential: true });
  await h.service.prepareRoute({ ...base, deliveryIds: ['d1', 'd2', 'd3', 'd4', 'd5'], chargeEssential: true });
  assert.equal(h.debitCalls.length, 1, 'retry/reopen não debita novamente');
  h.routes[0].status = 'ACTIVE';
  await h.service.prepareRoute({ ...base, deliveryIds: ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'] });
  assert.equal(h.debitCalls.length, 2, '6ª entrega abre exatamente o bloco 2');
  assert.equal(h.claims.length, 2);
  assert.equal(new Set(h.stops.map((s) => s.deliveryId)).size, 6);
});

test('COMPLETED é terminal: START não anexa, não cobra e não reabre o modo congelado', async () => {
  const h = makeHarness('ESSENTIAL');
  const base = { companyId: 7, entregadorId: 9, routeDate: '2026-07-13' };
  const first = await h.service.prepareRoute({
    ...base,
    deliveryIds: ['d1'],
    chargeEssential: true,
  });
  assert.ok(first);
  h.routes[0].status = 'COMPLETED';
  h.routes[0].completedAt = new Date();
  const frozenMode = h.routes[0].mode;
  const claimsBefore = h.claims.length;
  const debitsBefore = h.debitCalls.length;

  await assert.rejects(
    h.service.prepareRoute({
      ...base,
      deliveryIds: ['d1', 'd2'],
      chargeEssential: true,
    }),
    /já foi concluída/i,
  );
  assert.deepEqual(h.stops.map((stop) => stop.deliveryId), ['d1']);
  assert.equal(h.claims.length, claimsBefore);
  assert.equal(h.debitCalls.length, debitsBefore);
  assert.equal(h.routes[0].mode, frozenMode);

  const readOnly = await h.service.prepareRoute({
    ...base,
    deliveryIds: ['d1', 'd2'],
    chargeEssential: false,
  });
  assert.equal(readOnly?.status, 'COMPLETED');
  assert.equal(readOnly?.totalUniqueDeliveries, 1);
  assert.deepEqual(h.stops.map((stop) => stop.deliveryId), ['d1']);
  await assert.rejects(
    h.service.beginInitialization(7, h.routes[0].id, h.routes[0].billingRevision),
    /já foi concluída/i,
  );
});

test('falha de saldo em lote novo estorna os débitos feitos na mesma tentativa', async () => {
  const h = makeHarness();
  h.setAvailable(1);
  await assert.rejects(h.service.prepareRoute({
    companyId: 7,
    entregadorId: 9,
    routeDate: '2026-07-13',
    deliveryIds: ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'],
    chargeEssential: true,
  }));
  assert.equal(h.debitCalls.length, 2);
  assert.equal(h.refundCalls.length, 1, 'bloco 1 debitado foi estornado quando bloco 2 falhou');
  assert.equal(h.claims.find((c) => c.blockIndex === 1)?.status, 'REFUNDED');
});

test('falha antes da lease de início aborta PLANNED, estorna e versiona o retry', async () => {
  const h = makeHarness();
  const input = {
    companyId: 7, entregadorId: 9, routeDate: '2026-07-13', deliveryIds: ['d1'], chargeEssential: true,
  };
  const prepared = await h.service.prepareRoute(input);
  assert.ok(prepared);
  const firstUsageKey = h.debitCalls[0].usageKey;
  assert.equal(await h.service.abortPreparedRoute({
    companyId: 7, routeId: prepared.routeId, error: new Error('begin caiu'),
  }), true);
  assert.equal(h.routes[0].status, 'FAILED');
  assert.equal(h.refundCalls.length, 1);
  await assert.rejects(
    h.service.assertEssentialDeliveryCovered(7, 'd1'),
    /Rota indisponível/,
    'stop de rota FAILED não pode concluir após o estorno',
  );
  assert.equal(await h.service.abortPreparedRoute({
    companyId: 7, routeId: prepared.routeId, error: new Error('retry duplicado'),
  }), false, 'abort é idempotente e não estorna novamente');

  await h.service.prepareRoute(input);
  assert.equal(h.debitCalls.length, 2);
  assert.notEqual(h.debitCalls[1].usageKey, firstUsageKey);
  assert.match(h.debitCalls[1].usageKey, /attempt:2$/);
});

test('reconciliador repete estorno temporariamente falho até confirmar no ledger', async () => {
  const h = makeHarness();
  const prepared = await h.service.prepareRoute({
    companyId: 7, entregadorId: 9, routeDate: '2026-07-13', deliveryIds: ['d1'], chargeEssential: true,
  });
  assert.ok(prepared);
  h.failNextRefunds(1);
  await assert.rejects(h.service.abortPreparedRoute({
    companyId: 7, routeId: prepared.routeId, error: new Error('início falhou'),
  }), /temporariamente indisponível/);
  assert.equal(h.routes[0].status, 'REFUNDING', 'falha do estorno mantém a rota não reabrível');
  assert.equal(h.claims[0].status, 'DEBITED');

  const firstSweep = await h.service.reconcilePendingRefunds(new Date('2026-07-13T15:00:00.000Z'));
  assert.equal(firstSweep.refundedClaims, 1);
  assert.equal(firstSweep.failures, 0);
  assert.equal(h.claims[0].status, 'REFUNDED');
  assert.equal(h.routes[0].status, 'FAILED');
  assert.equal(h.ledger.filter((row) => row.kind === 'refund').length, 1);

  const secondSweep = await h.service.reconcilePendingRefunds(new Date('2026-07-13T15:05:00.000Z'));
  assert.equal(secondSweep.refundedClaims, 0);
  assert.equal(h.ledger.filter((row) => row.kind === 'refund').length, 1, 'retry não duplica estorno');
});

test('REFUNDING bloqueia reabertura concorrente até o estorno terminar', async () => {
  const h = makeHarness();
  const prepared = await h.service.prepareRoute({
    companyId: 7, entregadorId: 9, routeDate: '2026-07-13', deliveryIds: ['d1'], chargeEssential: true,
  });
  assert.ok(prepared);
  h.routes[0].status = 'FAILED';
  const gate = h.pauseNextRefund();
  const sweepPromise = h.service.reconcilePendingRefunds(new Date('2026-07-13T15:00:00.000Z'));
  await gate.started;

  assert.equal(h.routes[0].status, 'REFUNDING');
  await assert.rejects(
    h.service.beginInitialization(7, prepared.routeId, prepared.billingRevision),
    /concluindo um estorno/,
  );
  gate.release();
  const sweep = await sweepPromise;

  assert.equal(sweep.refundedClaims, 1);
  assert.equal(h.routes[0].status, 'FAILED');
  assert.equal(h.claims[0].status, 'REFUNDED');
  await assert.rejects(
    h.service.beginInitialization(7, prepared.routeId, prepared.billingRevision),
    /preparação comercial da rota expirou/,
    'contexto suspenso antes do estorno não pode reabrir a rota depois dele',
  );

  const reprepared = await h.service.prepareRoute({
    companyId: 7, entregadorId: 9, routeDate: '2026-07-13', deliveryIds: ['d1'], chargeEssential: true,
  });
  assert.ok(reprepared);
  assert.ok(reprepared.billingRevision > prepared.billingRevision);
  assert.equal(h.debitCalls.length, 2, 'nova preparação usa uma tentativa versionada e debita novamente após o estorno');
  const retry = await h.service.beginInitialization(7, prepared.routeId, reprepared.billingRevision);
  assert.ok(retry.token, 'somente a nova preparação paga libera a inicialização');
});

test('reconciliador libera REFUNDING após crash entre o último refund e a transição final', async () => {
  const h = makeHarness();
  await h.service.prepareRoute({
    companyId: 7, entregadorId: 9, routeDate: '2026-07-13', deliveryIds: ['d1'], chargeEssential: true,
  });
  h.routes[0].status = 'REFUNDING';
  h.claims[0].status = 'REFUNDED';
  h.ledger.push({
    companyId: 7,
    kind: 'refund',
    amount: 1,
    usageKey: `refund:${h.claims[0].debitUsageKey}`,
  });

  const sweep = await h.service.reconcilePendingRefunds(new Date('2026-07-13T15:00:00.000Z'));
  assert.equal(sweep.scannedRoutes, 1);
  assert.equal(sweep.refundedClaims, 0);
  assert.equal(h.routes[0].status, 'FAILED');
});

test('reconciliador atrasado nunca estorna a geração nova já ativa', async () => {
  const h = makeHarness();
  const initial = await h.service.prepareRoute({
    companyId: 7, entregadorId: 9, routeDate: '2026-07-13', deliveryIds: ['d1'], chargeEssential: true,
  });
  assert.ok(initial);
  const oldUsageKey = h.claims[0].debitUsageKey;
  h.routes[0].status = 'FAILED';

  const gate = h.pauseNextClaimRefundRead();
  const staleSweepPromise = h.service.reconcilePendingRefunds(new Date('2026-07-13T15:00:00.000Z'));
  await gate.started;
  assert.equal(h.routes[0].status, 'REFUNDING');

  const winnerSweep = await h.service.reconcilePendingRefunds(new Date('2026-07-13T15:00:01.000Z'));
  assert.equal(winnerSweep.refundedClaims, 1);
  assert.equal(h.routes[0].status, 'FAILED');
  assert.equal(h.claims[0].status, 'REFUNDED');

  const reprepared = await h.service.prepareRoute({
    companyId: 7, entregadorId: 9, routeDate: '2026-07-13', deliveryIds: ['d1'], chargeEssential: true,
  });
  assert.ok(reprepared);
  const newUsageKey = h.claims[0].debitUsageKey;
  assert.notEqual(newUsageKey, oldUsageKey);
  assert.equal(h.claims[0].billingRevision, reprepared.billingRevision);
  const initialization = await h.service.beginInitialization(7, reprepared.routeId, reprepared.billingRevision);
  assert.ok(initialization.token);
  await h.service.activateRoute(7, reprepared.routeId, initialization.token!, new Date('2026-07-13T15:00:02.000Z'));
  assert.equal(h.routes[0].status, 'ACTIVE');

  gate.release();
  await staleSweepPromise;
  assert.equal(h.routes[0].status, 'ACTIVE');
  assert.equal(h.claims[0].status, 'DEBITED');
  assert.equal(h.claims[0].debitUsageKey, newUsageKey);
  assert.equal(h.ledger.filter((row) => row.usageKey === `refund:${oldUsageKey}`).length, 1);
  assert.equal(h.ledger.filter((row) => row.usageKey === `refund:${newUsageKey}`).length, 0);
});

test('falha ao ler ledger após commit mantém claim reconciliável e o estorno é recuperado', async () => {
  const h = makeHarness();
  h.failNextDebitsAfterCommit(1);
  h.failNextLedgerReads(1);
  await assert.rejects(h.service.prepareRoute({
    companyId: 7, entregadorId: 9, routeDate: '2026-07-13', deliveryIds: ['d1'], chargeEssential: true,
  }), /resposta do débito caiu após commit/);
  assert.equal(h.claims[0].status, 'PROCESSING', 'estado financeiro incerto não pode ser escondido como FAILED');
  assert.equal(h.ledger.filter((row) => row.kind === 'debit').length, 1);
  h.routes[0].updatedAt = new Date('2026-07-13T14:00:00.000Z');

  const sweep = await h.service.reconcilePendingRefunds(new Date('2026-07-13T15:00:00.000Z'));
  assert.equal(sweep.failedRoutes, 1);
  assert.equal(sweep.refundedClaims, 1);
  assert.equal(h.claims[0].status, 'REFUNDED');
  assert.equal(h.ledger.filter((row) => row.kind === 'refund').length, 1);
});

test('reconciliador aborta rota PLANNED obsoleta após crash entre débito e begin', async () => {
  const h = makeHarness();
  await h.service.prepareRoute({
    companyId: 7, entregadorId: 9, routeDate: '2026-07-13', deliveryIds: ['d1'], chargeEssential: true,
  });
  h.routes[0].updatedAt = new Date('2026-07-13T14:00:00.000Z');

  const sweep = await h.service.reconcilePendingRefunds(new Date('2026-07-13T15:00:00.000Z'));
  assert.equal(sweep.failedRoutes, 1);
  assert.equal(sweep.refundedClaims, 1);
  assert.equal(h.routes[0].status, 'FAILED');
  assert.equal(h.claims[0].status, 'REFUNDED');
});

test('reconciliador estorna lease INITIALIZING expirada sem afetar uma lease válida', async () => {
  const expired = makeHarness();
  const expiredPrepared = await expired.service.prepareRoute({
    companyId: 7, entregadorId: 9, routeDate: '2026-07-13', deliveryIds: ['d1'], chargeEssential: true,
  });
  assert.ok(expiredPrepared);
  expired.routes[0].status = 'INITIALIZING';
  expired.routes[0].initializationToken = 'lease-expirada';
  expired.routes[0].initializationLeaseUntil = new Date('2026-07-13T14:59:59.000Z');

  const expiredSweep = await expired.service.reconcilePendingRefunds(new Date('2026-07-13T15:00:00.000Z'));
  assert.equal(expiredSweep.failedRoutes, 1);
  assert.equal(expiredSweep.refundedClaims, 1);
  assert.equal(expired.routes[0].status, 'FAILED');
  assert.equal(expired.claims[0].status, 'REFUNDED');

  const activeLease = makeHarness();
  const activePrepared = await activeLease.service.prepareRoute({
    companyId: 7, entregadorId: 9, routeDate: '2026-07-13', deliveryIds: ['d1'], chargeEssential: true,
  });
  assert.ok(activePrepared);
  activeLease.routes[0].status = 'INITIALIZING';
  activeLease.routes[0].initializationToken = 'lease-valida';
  activeLease.routes[0].initializationLeaseUntil = new Date('2026-07-13T15:01:00.000Z');

  const activeSweep = await activeLease.service.reconcilePendingRefunds(new Date('2026-07-13T15:00:00.000Z'));
  assert.equal(activeSweep.scannedRoutes, 0);
  assert.equal(activeLease.routes[0].status, 'INITIALIZING');
  assert.equal(activeLease.claims[0].status, 'DEBITED');
});

test('failInitialization com token velho não estorna rota que já ficou ACTIVE', async () => {
  const h = makeHarness();
  const prepared = await h.service.prepareRoute({
    companyId: 7, entregadorId: 9, routeDate: '2026-07-13', deliveryIds: ['d1'], chargeEssential: true,
  });
  assert.ok(prepared);
  h.routes[0].status = 'ACTIVE';
  h.routes[0].initializationToken = null;
  await h.service.failInitialization({
    companyId: 7, routeId: prepared.routeId, token: 'lease-antiga', error: new Error('resposta caiu'),
  });
  assert.equal(h.refundCalls.length, 0);
  assert.equal(h.claims[0].status, 'DEBITED');
});

test('claim debitado por concorrente não entra como newlyDebited do chamador', async () => {
  const h = makeHarness();
  h.raceNextClaimToForeignDebit();
  const prepared = await h.service.prepareRoute({
    companyId: 7, entregadorId: 9, routeDate: '2026-07-13', deliveryIds: ['d1'], chargeEssential: true,
  });
  assert.ok(prepared);
  assert.equal(h.debitCalls.length, 0, 'o chamador não repete wallet.debit da concorrente');
  assert.deepEqual(prepared.newlyDebitedUsageKeys, []);
  assert.equal(h.claims[0].status, 'DEBITED');
});

test('duas requisições concorrentes do mesmo bloco geram no máximo um débito', async () => {
  const h = makeHarness();
  const input = {
    companyId: 7, entregadorId: 9, routeDate: '2026-07-13', deliveryIds: ['d1'], chargeEssential: true,
  };
  const results = await Promise.allSettled([h.service.prepareRoute(input), h.service.prepareRoute(input)]);
  assert.ok(results.some((result) => result.status === 'fulfilled'));
  assert.equal(h.debitCalls.length, 1);
  assert.equal(h.ledger.filter((row) => row.kind === 'debit').length, 1);
});

test('gate de confirmação bloqueia a 6ª entrega quando o bloco 2 ficou sem saldo', async () => {
  const h = makeHarness();
  const base = { companyId: 7, entregadorId: 9, routeDate: '2026-07-13' };
  await h.service.prepareRoute({ ...base, deliveryIds: ['d1', 'd2', 'd3', 'd4', 'd5'], chargeEssential: true });
  h.routes[0].status = 'ACTIVE';
  h.setAvailable(0);
  await assert.rejects(h.service.prepareRoute({ ...base, deliveryIds: ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'] }));
  await assert.doesNotReject(h.service.assertEssentialDeliveryCovered(7, 'd1'));
  await assert.rejects(h.service.assertEssentialDeliveryCovered(7, 'd6'), /Rota indisponível/);
});

test('Rota Rastreada congela snapshot sem cobrança Essencial', async () => {
  const h = makeHarness('TRACKED');
  const result = await h.service.prepareRoute({
    companyId: 7, entregadorId: 9, routeDate: '2026-07-13', deliveryIds: ['d1', 'd2'],
  });
  assert.equal(result.mode, 'TRACKED');
  assert.equal(h.debitCalls.length, 0);
  assert.equal(h.stops.length, 2);
});

test('usageKey inclui tenant, motorista, data, bloco e versão; data inválida é rejeitada', () => {
  assert.equal(
    essentialUsageKey(7, 9, '2026-07-13', 2, 3),
    'logistica:essential:company:7:driver:9:date:2026-07-13:block:2:attempt:3',
  );
  assert.throws(() => canonicalRouteDate('2026-02-30'), /Data da rota inválida/);
  assert.equal(canonicalRouteDate(undefined, new Date('2026-07-14T02:30:00.000Z')), '2026-07-13');
});

test('fronteiras da fórmula Essencial: 0/1/5/6/10/11', () => {
  assert.deepEqual(
    [0, 1, 5, 6, 10, 11].map(essentialBlocksForDeliveries),
    [0, 1, 1, 2, 2, 3],
  );
});
