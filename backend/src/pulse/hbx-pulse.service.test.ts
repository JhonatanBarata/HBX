import test from 'node:test';
import assert from 'node:assert/strict';

import { HbxPulseService } from './hbx-pulse.service';

function buildPrismaMock(overrides: Record<string, any> = {}) {
  const countCalls: any[] = [];
  const aggregateCalls: any[] = [];
  const groupByCalls: any[] = [];
  const receivableAggregateCalls: any[] = [];
  const countValues = overrides.countValues || [5, 2, 3, 1];

  return {
    countCalls,
    aggregateCalls,
    groupByCalls,
    receivableAggregateCalls,
    prisma: {
      company: {
        findUnique: async ({ where }: any) => ({
          id: Number(where.id),
          name: overrides.companyName || 'WhatsApp do Master',
        }),
      },
      vendasLead: {
        count: async ({ where }: any) => {
          countCalls.push(where);
          return countValues[countCalls.length - 1] || 0;
        },
        aggregate: async ({ where }: any) => {
          aggregateCalls.push(where);
          return { _count: { _all: 2 }, _sum: { commissionAmount: 150 } };
        },
        groupBy: async ({ where }: any) => {
          groupByCalls.push(where);
          return [
            { segment: 'Saude', _count: { _all: 3 }, _sum: { saleValue: 900, commissionBaseAmount: 0 } },
            { segment: null, _count: { _all: 2 }, _sum: { saleValue: 0, commissionBaseAmount: 400 } },
          ];
        },
      },
      vendasCommissionReceivable: {
        aggregate: async ({ where }: any) => {
          receivableAggregateCalls.push(where);
          return { _count: { _all: 1 }, _sum: { amount: 40 } };
        },
      },
      user: {
        findUnique: async () => ({ brainPushMutedAt: overrides.mutedAt ?? null }),
        update: async () => ({}),
      },
    },
  };
}

test('HBX Pulse resume carteira do USER e limita comissao recorrente ao vendedor', async () => {
  const mock = buildPrismaMock({ companySlug: 'cliente-acme' });
  const service = new HbxPulseService(mock.prisma as any);

  const summary = await service.getSummaryForUser({
    id: 7,
    companyId: 11,
    role: 'USER',
    isSystemMaster: false,
  });

  assert.equal(summary.scope.type, 'user');
  assert.equal(summary.metrics.stalledCards, 5);
  assert.equal(summary.metrics.overdueReturns, 2);
  assert.equal(summary.metrics.pendingCommissionAmount, 190);
  assert.equal(summary.metrics.estimatedPotentialValue, 1300);
  assert.equal(summary.metrics.opportunitiesBySegment[0].segment, 'Saude');
  assert.equal(mock.receivableAggregateCalls[0].sellerUserId, 7);
  assert.match(JSON.stringify(mock.countCalls[0]), /"assignedUserId":7/);
  assert.match(summary.whatsappText, /^Hoje existem 5 oportunidades paradas/);
});

test('HBX Pulse trata System Master com empresa assumida como visao da empresa', async () => {
  const mock = buildPrismaMock();
  const service = new HbxPulseService(mock.prisma as any);

  const summary = await service.getSummaryForUser({
    id: 1,
    companyId: 99,
    role: 'USERMASTER',
    isSystemMaster: true,
    masterContext: {
      active: true,
      mode: 'empresa_assumida',
      companyId: 99,
    },
  });

  assert.equal(summary.scope.type, 'company');
  assert.equal(mock.receivableAggregateCalls[0].sellerUserId, undefined);
  assert.doesNotMatch(JSON.stringify(mock.countCalls[0]), /assignedUserId/);
  assert.match(summary.whatsappText, /na empresa/);
});

test('HBX Pulse nao usa slug da engine para transformar System Master em operacao', async () => {
  const mock = buildPrismaMock();
  const service = new HbxPulseService(mock.prisma as any);

  const summary = await service.getSummaryForUser({
    id: 1,
    companyId: 99,
    role: 'USERMASTER',
    isSystemMaster: true,
  });

  assert.equal(summary.scope.type, 'company');
  assert.equal(mock.receivableAggregateCalls[0].sellerUserId, undefined);
});

test('HBX Pulse nudge NAO dispara para System Master (so vendedor recebe recado)', async () => {
  const mock = buildPrismaMock();
  const service = new HbxPulseService(mock.prisma as any);

  const res = await service.generateNudgeForUser({
    id: 1,
    companyId: 99,
    role: 'USERMASTER',
    isSystemMaster: true,
  });

  assert.equal(res.notice, null);
});

test('HBX Pulse nudge respeita o mute do vendedor (push desativado)', async () => {
  const mock = buildPrismaMock({ mutedAt: new Date() });
  const service = new HbxPulseService(mock.prisma as any);

  const res = await service.generateNudgeForUser({
    id: 7,
    companyId: 11,
    role: 'USER',
    isSystemMaster: false,
  });

  assert.equal(res.notice, null);
  assert.equal((res as any).muted, true);
});
