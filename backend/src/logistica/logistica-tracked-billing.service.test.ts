import assert from 'node:assert/strict';
import test from 'node:test';
import { LogisticaTrackedBillingService, saoPauloMonth } from './logistica-tracked-billing.service';

function setup(options?: { mode?: 'ESSENTIAL' | 'TRACKED'; validPosition?: boolean; balance?: number }) {
  process.env.HBX_LOGISTICA_TRACKING_ENABLED = 'true';
  let balance = options?.balance ?? 10;
  let seq = 0;
  const now = new Date('2026-07-14T12:00:00.000Z');
  const route: any = {
    id: 'route-1', companyId: 7, entregadorId: 9, routeDate: '2026-07-14',
    mode: options?.mode ?? 'TRACKED', status: 'ACTIVE', startedAt: new Date('2026-07-14T11:00:00.000Z'),
  };
  const session: any = {
    id: 'session-1', companyId: 7, routeId: route.id, entregadorId: 9,
    deviceId: 'device-1', status: 'ACTIVE', startedAt: route.startedAt,
    hasValidPositions: options?.validPosition !== false,
  };
  const stop: any = { id: 'stop-1', companyId: 7, routeId: route.id, deliveryId: 'delivery-1', snapshotOrder: 0 };
  const claims: any[] = [];
  const ledger: any[] = [
    { id: 'paid-lot', companyId: 7, kind: 'recharge', amount: 10, remaining: 10, grantType: 'paid' },
  ];
  const debitCalls: any[] = [];
  const refundCalls: any[] = [];

  const match = (row: any, where: any): boolean => Object.entries(where || {}).every(([key, expected]: any) => {
    if (key === 'OR') return expected.some((part: any) => match(row, part));
    if (expected?.in) return expected.in.includes(row[key]);
    if (expected?.not !== undefined) return row[key] !== expected.not;
    if (expected?.lte instanceof Date) return row[key] instanceof Date && row[key] <= expected.lte;
    if (expected?.gte instanceof Date) return row[key] instanceof Date && row[key] >= expected.gte;
    return row[key] === expected;
  });
  const select = (row: any, fields?: any) => {
    if (!fields) return { ...row };
    return Object.fromEntries(Object.keys(fields).filter((key) => fields[key]).map((key) => [key, row[key]]));
  };

  const prisma: any = {
    logisticaRouteStop: {
      findFirst: async ({ where, include }: any) => {
        if (!match(stop, where)) return null;
        return { ...stop, ...(include?.route ? { route: { ...route, trackingSession: { ...session } } } : {}) };
      },
    },
    logisticaRoute: {
      findFirst: async ({ where }: any) => match(route, where) ? { ...route } : null,
    },
    entrega: {
      findFirst: async ({ where }: any) => where.companyId === 7 && where.id === 'delivery-1'
        ? { id: 'delivery-1', entregadorId: 9, scheduledAt: now }
        : null,
    },
    logisticaTrackingSession: {
      findFirst: async ({ where, include }: any) => {
        if (!match(session, where)) return null;
        return { ...session, ...(include?.route ? { route: { ...route } } : {}) };
      },
    },
    logisticaTrackingPoint: {
      count: async ({ where }: any) => {
        if (!session.hasValidPositions || where.companyId !== 7 || where.sessionId !== session.id) return 0;
        const capturedAt = new Date('2026-07-14T11:30:00.000Z');
        return capturedAt >= where.capturedAt.gte && capturedAt <= where.capturedAt.lte ? 1 : 0;
      },
    },
    logisticaTrackedCreditClaim: {
      findUnique: async ({ where }: any) => {
        const key = where.companyId_trackingSessionId_deliveryId;
        return claims.find((row) => row.companyId === key.companyId && row.trackingSessionId === key.trackingSessionId && row.deliveryId === key.deliveryId) || null;
      },
      findFirst: async ({ where }: any) => claims.find((row) => match(row, where)) || null,
      findMany: async ({ where }: any) => claims.filter((row) => match(row, where)),
      create: async ({ data }: any) => {
        const row = {
          id: `claim-${++seq}`, status: 'PENDING', billingAttempt: 0, debitUsageKey: null,
          processingToken: null, leaseUntil: null, paidCreditsConsumed: 0, ...data,
        };
        claims.push(row);
        return { ...row };
      },
      updateMany: async ({ where, data }: any) => {
        const selected = claims.filter((row) => match(row, where));
        selected.forEach((row) => Object.assign(row, data));
        return { count: selected.length };
      },
    },
    creditLedgerEntry: {
      count: async ({ where }: any) => ledger.filter((row) => match(row, where)).length,
      findMany: async ({ where, select: fields }: any) => {
        let rows = ledger.filter((row) => match(row, where));
        if (where.id?.in) rows = ledger.filter((row) => where.id.in.includes(row.id) && row.companyId === where.companyId);
        return rows.map((row) => select(row, fields));
      },
    },
    logisticaConfig: {
      findMany: async () => [{ companyId: 7 }],
      findFirst: async ({ where }: any) => where.companyId === 7 ? { trackingAtivo: true } : null,
    },
    $executeRawUnsafe: async () => 0,
  };
  const wallet: any = {
    debit: async (companyId: number, amount: number, input: any) => {
      debitCalls.push({ companyId, amount, ...input });
      const existing = ledger.filter((row) => row.kind === 'debit' && row.usageKey === input.usageKey);
      if (existing.length) {
        const debited = existing.reduce((sum, row) => sum + row.amount, 0);
        return { debited, requested: amount, partial: debited < amount, balanceAfter: balance };
      }
      const debited = Math.min(balance, amount);
      balance -= debited;
      if (debited > 0) {
        ledger.push({
          id: `debit-${++seq}`, companyId, kind: 'debit', amount: debited,
          usageKey: input.usageKey, parentEntryId: 'paid-lot',
        });
      }
      return { debited, requested: amount, partial: debited < amount, balanceAfter: balance };
    },
    refund: async (companyId: number, input: any) => {
      refundCalls.push({ companyId, ...input });
      const refundKey = `refund:${input.usageKey}`;
      const previous = ledger.find((row) => row.kind === 'refund' && row.usageKey === refundKey);
      if (previous) return { refunded: previous.amount, balanceAfter: balance, alreadyProcessed: true };
      const debited = ledger.filter((row) => row.kind === 'debit' && row.usageKey === input.usageKey)
        .reduce((sum, row) => sum + row.amount, 0);
      if (debited > 0) {
        balance += debited;
        ledger.push({ id: `refund-${++seq}`, companyId, kind: 'refund', amount: debited, usageKey: refundKey });
      }
      return { refunded: debited, balanceAfter: balance, alreadyProcessed: false };
    },
  };
  const service = new LogisticaTrackedBillingService(prisma, wallet);
  return { service, prisma, route, session, claims, ledger, debitCalls, refundCalls, now, balance: () => balance };
}

test('Rota Rastreada debita 2 uma vez e conclui claim na mesma transação', async () => {
  const h = setup();
  const charge = await h.service.prepareDeliveryCompletion(7, 'delivery-1', 9, h.now);
  assert.ok(charge);
  assert.equal(h.debitCalls.length, 1);
  assert.equal(h.debitCalls[0].amount, 2);

  await h.service.completeWithinTransaction(h.prisma, charge!, h.now);
  assert.equal(h.claims[0].status, 'COMPLETED');
  assert.equal(h.claims[0].sourceMonth, '2026-07');
  assert.equal(h.claims[0].paidCreditsConsumed, 2);

  await assert.rejects(
    () => h.service.prepareDeliveryCompletion(7, 'delivery-1', 9, h.now),
    /já foi concluída/,
  );
  assert.equal(h.debitCalls.length, 1, 'retry não pode criar segundo débito');
});

test('Rota Essencial nunca passa pela cobrança rastreada', async () => {
  const h = setup({ mode: 'ESSENTIAL' });
  assert.equal(await h.service.prepareDeliveryCompletion(7, 'delivery-1', 9, h.now), null);
  assert.equal(h.debitCalls.length, 0);
});

test('sessão sem posição válida bloqueia antes do débito', async () => {
  const h = setup({ validPosition: false });
  await assert.rejects(
    () => h.service.prepareDeliveryCompletion(7, 'delivery-1', 9, h.now),
    /GPS válido/,
  );
  assert.equal(h.debitCalls.length, 0);
});

test('saldo parcial é estornado e nunca conclui a entrega rastreada', async () => {
  const h = setup({ balance: 1 });
  await assert.rejects(
    () => h.service.prepareDeliveryCompletion(7, 'delivery-1', 9, h.now),
    /Créditos insuficientes/,
  );
  assert.equal(h.refundCalls.length, 1);
  assert.equal(h.balance(), 1);
  assert.equal(h.claims[0].status, 'REFUNDED');
});

test('rollback da confirmação estorna de forma idempotente', async () => {
  const h = setup();
  const charge = await h.service.prepareDeliveryCompletion(7, 'delivery-1', 9, h.now);
  await h.service.refundFailedCompletion(charge!, new Error('rollback'), 9);
  await h.service.refundFailedCompletion(charge!, new Error('retry'), 9);
  assert.equal(h.claims[0].status, 'REFUNDED');
  assert.equal(h.balance(), 10);
  assert.equal(h.ledger.filter((row) => row.kind === 'refund').length, 1);
});

test('competência usa o fuso America/Sao_Paulo', () => {
  assert.equal(saoPauloMonth(new Date('2026-08-01T01:30:00.000Z')), '2026-07');
  assert.equal(saoPauloMonth(new Date('2026-08-01T04:00:00.000Z')), '2026-08');
});
