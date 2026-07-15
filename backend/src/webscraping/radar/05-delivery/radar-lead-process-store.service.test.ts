import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RADAR_LEAD_PROCESS_STATUSES,
  RadarLeadProcessStoreService,
} from './radar-lead-process-store.service';

function fakePrisma() {
  const rows = new Map<string, any>();
  let sequence = 0;

  const matches = (row: any, where: Record<string, any>) => Object.entries(where)
    .every(([key, value]) => row[key] === value);

  return {
    rows,
    user: {
      findFirst: async ({ where }: any) => where.id === 11 && where.companyId === 7
        ? { id: 11 }
        : null,
    },
    radarLeadPool: {
      findUnique: async ({ where }: any) => where.id === 'radar-1' ? { id: 'radar-1' } : null,
    },
    radarLeadProcessRun: {
      findFirst: async ({ where }: any) => Array.from(rows.values()).find((row) => matches(row, where)) || null,
      create: async ({ data }: any) => {
        if (data.idempotencyKey && Array.from(rows.values()).some((row) => (
          row.companyId === data.companyId && row.idempotencyKey === data.idempotencyKey
        ))) {
          throw Object.assign(new Error('unique conflict'), { code: 'P2002' });
        }
        const now = new Date();
        const id = `operation-${++sequence}`;
        const row = {
          id,
          errorCode: null,
          errorMessage: null,
          startedAt: null,
          finishedAt: null,
          version: 0,
          createdAt: now,
          updatedAt: now,
          ...data,
        };
        rows.set(id, row);
        return row;
      },
      updateMany: async ({ where, data }: any) => {
        const row = Array.from(rows.values()).find((candidate) => matches(candidate, where));
        if (!row) return { count: 0 };
        for (const [key, value] of Object.entries(data)) {
          if (key === 'version') {
            row.version += Number((value as any)?.increment || 0);
          } else {
            row[key] = value;
          }
        }
        row.updatedAt = new Date();
        return { count: 1 };
      },
    },
  };
}

test('contrato inclui todos os estados persistentes do pull', () => {
  assert.deepEqual(RADAR_LEAD_PROCESS_STATUSES, [
    'queued',
    'validating',
    'debit_pending',
    'credit_debited',
    'ownership_claimed',
    'rfb_hydrating',
    'base_revealed',
    'motor_enriching',
    'vendas_creating',
    'completed',
    'partial',
    'failed',
    'refund_pending',
    'refunded',
  ]);
});

test('cria claim tenant-scoped e reaproveita a mesma chave idempotente', async () => {
  const prisma = fakePrisma();
  const service = new RadarLeadProcessStoreService(prisma as any);
  const input = {
    companyId: 7,
    userId: 11,
    radarLeadId: 'radar-1',
    mode: 'claim' as const,
    idempotencyKey: 'claim:radar-1:company-7',
    snapshot: { masked: true },
  };

  const firstResult = await service.createOperation(input);
  const repeatedResult = await service.createOperation(input);
  const first = firstResult.operation;
  const repeated = repeatedResult.operation;

  assert.equal(first.id, repeated.id);
  assert.equal(firstResult.created, true);
  assert.equal(repeatedResult.created, false);
  assert.equal(prisma.rows.size, 1);
  assert.equal(first.companyId, 7);
  assert.equal(first.radarLeadId, 'radar-1');
  assert.equal(first.status, 'queued');
  assert.equal(first.stages[0].state, 'active');
  assert.equal(first.events[0].type, 'operation.created');
  assert.deepEqual(first.data, { masked: true });
});

test('duas criações concorrentes da mesma chave elegem somente um criador', async () => {
  const prisma = fakePrisma();
  const service = new RadarLeadProcessStoreService(prisma as any);
  const input = {
    companyId: 7,
    userId: 11,
    radarLeadId: 'radar-1',
    mode: 'claim' as const,
    idempotencyKey: 'claim:parallel',
  };

  const [left, right] = await Promise.all([
    service.createOperation(input),
    service.createOperation(input),
  ]);

  assert.equal(left.operation.id, right.operation.id);
  assert.deepEqual([left.created, right.created].sort(), [false, true]);
  assert.equal(prisma.rows.size, 1);
});

test('transição persiste estágio, evento e patch sem perder a linha do tempo', async () => {
  const prisma = fakePrisma();
  const service = new RadarLeadProcessStoreService(prisma as any);
  const { operation: created } = await service.createOperation({
    companyId: 7,
    userId: 11,
    radarLeadId: 'radar-1',
    mode: 'claim',
  });

  await service.transitionOperation({
    companyId: 7,
    operationId: created.id,
    status: 'validating',
    eventMessage: 'Lead elegível',
  });
  const debited = await service.transitionOperation({
    companyId: 7,
    operationId: created.id,
    status: 'credit_debited',
    eventType: 'credit.debited',
    snapshotPatch: { creditUsageKey: 'radar:radar-1' },
  });

  assert.equal(debited.status, 'credit_debited');
  assert.equal(debited.version, 2);
  assert.deepEqual(debited.events.map((event) => event.sequence), [0, 1, 2]);
  assert.deepEqual(debited.events.map((event) => event.type), [
    'operation.created',
    'status.validating',
    'credit.debited',
  ]);
  assert.equal(debited.stages.find((stage) => stage.key === 'debit_pending')?.state, 'completed');
  assert.equal(debited.stages.find((stage) => stage.key === 'credit_debited')?.state, 'active');
  assert.deepEqual(debited.data, { creditUsageKey: 'radar:radar-1' });
  assert.ok(debited.startedAt);
});

test('modo search não exige radarLeadId e não recebe etapas de débito', async () => {
  const service = new RadarLeadProcessStoreService(fakePrisma() as any);
  const { operation } = await service.createOperation({
    companyId: 7,
    userId: 11,
    mode: 'search',
  });

  assert.equal(operation.mode, 'search');
  assert.equal(operation.radarLeadId, null);
  assert.equal(operation.stages.some((stage) => stage.key === 'debit_pending'), false);
  assert.equal(operation.stages.some((stage) => stage.key === 'rfb_hydrating'), true);
  assert.equal(operation.stages.some((stage) => stage.key === 'motor_enriching'), true);
});
