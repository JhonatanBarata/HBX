import assert from 'node:assert/strict';
import test from 'node:test';
import { LogisticaTrackingBonusService, trackingBonusUsageKey } from './logistica-tracking-bonus.service';

function setup(eligibleCredits: number) {
  let seq = 0;
  const claims: any[] = [
    {
      id: 'claim-paid', companyId: 4, sourceMonth: '2026-06', status: 'COMPLETED',
      paidCreditsConsumed: eligibleCredits, routeId: 'route-1', trackingSessionId: 'session-1',
      deliveryId: 'delivery-1', completedAt: new Date('2026-06-20T12:00:00.000Z'),
    },
    {
      id: 'claim-promo', companyId: 4, sourceMonth: '2026-06', status: 'COMPLETED',
      paidCreditsConsumed: 0, routeId: 'route-1', trackingSessionId: 'session-1',
      deliveryId: 'delivery-2', completedAt: new Date('2026-06-21T12:00:00.000Z'),
    },
    {
      id: 'other-company', companyId: 99, sourceMonth: '2026-06', status: 'COMPLETED',
      paidCreditsConsumed: 500, routeId: 'route-x', trackingSessionId: 'session-x',
      deliveryId: 'delivery-x', completedAt: new Date('2026-06-21T12:00:00.000Z'),
    },
  ];
  const bonuses: any[] = [];
  const grantCalls: any[] = [];

  const match = (row: any, where: any): boolean => Object.entries(where || {}).every(([key, expected]: any) => {
    if (expected?.not !== undefined && expected?.lt !== undefined) {
      return row[key] !== expected.not && row[key] < expected.lt;
    }
    if (expected?.not !== undefined) return row[key] !== expected.not;
    if (expected?.lt !== undefined) return row[key] < expected.lt;
    return row[key] === expected;
  });

  const prisma: any = {
    logisticaConfig: { findMany: async () => [{ companyId: 4 }] },
    logisticaTrackedCreditClaim: {
      aggregate: async ({ where }: any) => ({
        _sum: {
          paidCreditsConsumed: claims.filter((row) => match(row, where))
            .reduce((sum, row) => sum + row.paidCreditsConsumed, 0),
        },
      }),
      findMany: async ({ where, distinct, take }: any) => {
        let rows = claims.filter((row) => match(row, where));
        if (distinct?.includes('sourceMonth')) {
          rows = Array.from(new Map(rows.map((row) => [row.sourceMonth, row])).values());
        }
        return rows.slice(0, take ?? rows.length).map((row) => ({ ...row }));
      },
    },
    logisticaEssentialCreditClaim: {
      count: async ({ where }: any) => where.companyId === 4 && where.routeDate.startsWith === '2026-06' ? 3 : 0,
    },
    logisticaTrackingBonusGrant: {
      findUnique: async ({ where }: any) => {
        const key = where.companyId_sourceMonth;
        return bonuses.find((row) => row.companyId === key.companyId && row.sourceMonth === key.sourceMonth) || null;
      },
      findMany: async ({ where, take }: any) => bonuses.filter((row) => match(row, where)).slice(0, take ?? bonuses.length),
      create: async ({ data }: any) => {
        const row = {
          id: `bonus-${++seq}`, status: 'PENDING', eligiblePaidCredits: 0, bonusCredits: 0,
          usageKey: null, processingToken: null, leaseUntil: null, expiresAt: null, grantedAt: null,
          ...data,
        };
        bonuses.push(row);
        return { ...row };
      },
      updateMany: async ({ where, data }: any) => {
        const selected = bonuses.filter((row) => match(row, where));
        selected.forEach((row) => Object.assign(row, data));
        return { count: selected.length };
      },
    },
  };
  const wallet: any = {
    getBalance: async (companyId: number) => companyId === 4 ? 37 : 0,
    grant: async (companyId: number, amount: number, options: any) => {
      const previous = grantCalls.find((row) => row.options.usageKey === options.usageKey);
      if (previous) return { entryId: previous.entryId, amount, alreadyProcessed: true };
      const call = { entryId: `entry-${++seq}`, companyId, amount, options };
      grantCalls.push(call);
      return { entryId: call.entryId, amount, alreadyProcessed: false };
    },
  };
  return {
    service: new LogisticaTrackingBonusService(prisma, wallet),
    claims,
    bonuses,
    grantCalls,
  };
}

test('bônus concede floor(20%) só sobre créditos pagos e apenas uma vez', async () => {
  const h = setup(7);
  const now = new Date('2026-07-01T12:00:00.000Z');
  const first = await h.service.processCompanyMonth(4, '2026-06', now);
  const second = await h.service.processCompanyMonth(4, '2026-06', now);

  assert.deepEqual(first, { eligiblePaidCredits: 7, bonusCredits: 1, grantedNow: true });
  assert.deepEqual(second, { eligiblePaidCredits: 7, bonusCredits: 1, grantedNow: false });
  assert.equal(h.grantCalls.length, 1);
  assert.equal(h.grantCalls[0].amount, 1);
  assert.equal(h.grantCalls[0].options.kind, 'promo');
  assert.equal(h.grantCalls[0].options.grantType, 'promo');
  assert.equal(h.grantCalls[0].options.usageKey, trackingBonusUsageKey(4, '2026-06'));
  assert.equal(
    h.grantCalls[0].options.expiresAt.getTime() - now.getTime(),
    30 * 24 * 60 * 60 * 1000,
  );
  assert.equal(h.bonuses[0].status, 'GRANTED');
});

test('promo consumida não entra na base e bônus menor que 1 arredonda para baixo', async () => {
  const h = setup(4);
  const result = await h.service.processCompanyMonth(4, '2026-06', new Date('2026-07-02T12:00:00.000Z'));
  assert.deepEqual(result, { eligiblePaidCredits: 4, bonusCredits: 0, grantedNow: true });
  assert.equal(h.grantCalls.length, 0);
  assert.equal(h.bonuses[0].status, 'GRANTED');
});

test('competência atual não recebe bônus antecipado', async () => {
  const h = setup(20);
  await assert.rejects(
    () => h.service.processCompanyMonth(4, '2026-07', new Date('2026-07-14T12:00:00.000Z')),
    /mês seguinte/,
  );
  assert.equal(h.grantCalls.length, 0);
});

test('extrato é company-scoped e consolida os dois modos sem preço em reais', async () => {
  const h = setup(10);
  await h.service.processCompanyMonth(4, '2026-06', new Date('2026-07-01T12:00:00.000Z'));
  const statement = await h.service.getAdminStatement(4, '2026-06');

  assert.equal(statement.balanceCredits, 37);
  assert.equal(statement.totals.essentialCredits, 3);
  assert.equal(statement.totals.trackedDeliveries, 2);
  assert.equal(statement.totals.trackedCredits, 4);
  assert.equal(statement.totals.paidTrackedCredits, 10);
  assert.equal(statement.totals.bonusCredits, 2);
  assert.equal(statement.trackedDeliveries.some((row: any) => row.deliveryId === 'delivery-x'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(statement, 'price'), false);
});
