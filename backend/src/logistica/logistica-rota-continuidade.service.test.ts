import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalRouteDate } from './logistica-route-billing.util';
import { LogisticaRotaContinuidadeService } from './logistica-rota-continuidade.service';

const actor = { id: 9, companyId: 7, role: 'ADMIN' };

function target(overrides: Record<string, unknown> = {}) {
  return {
    ref: 'route:route-old-123',
    kind: 'route',
    routeId: 'route-old-123',
    routeDate: '2026-08-12',
    effectiveDate: '2026-08-12',
    ownerId: 8,
    sourceOwnerId: 8,
    ownerName: 'André',
    routeStatus: 'PLANNED',
    operationalEndedAt: null,
    routeStartedAt: null,
    parked: false,
    deliveries: [
      { id: 'done', status: 'entregue', entregadorId: 8, scheduledAt: new Date(), rotaOrdem: 0, startedAt: null, arrivedAt: new Date() },
      { id: 'open-a', status: 'agendada', entregadorId: 8, scheduledAt: new Date(), rotaOrdem: 1, startedAt: null, arrivedAt: null },
      { id: 'open-b', status: 'agendada', entregadorId: 8, scheduledAt: new Date(), rotaOrdem: 2, startedAt: null, arrivedAt: null },
    ],
    ...overrides,
  } as any;
}

test('Puxar leva só abertas, preserva o snapshot e gateia assento no dia de destino', async () => {
  const calls: any = { gate: null, countWhere: null, plan: null };
  const tx: any = {
    $executeRawUnsafe: async () => 1,
    entrega: {
      findMany: async () => [{ id: 'open-a' }, { id: 'open-b' }],
      updateMany: async () => ({ count: 2 }),
    },
    logisticaRoute: {
      findFirst: async ({ where }: any) => where?.id
        ? { status: 'PLANNED', routeDate: '2026-08-12', operationalEndedAt: null, startedAt: null }
        : null,
      updateMany: async () => ({ count: 1 }),
    },
    logisticaRouteStop: {
      findMany: async () => [
        { deliveryId: 'open-a', delivery: { entregadorId: 8 } },
        { deliveryId: 'open-b', delivery: { entregadorId: 8 } },
      ],
    },
  };
  const prisma: any = {
    user: { findFirst: async () => ({ id: 9, companyId: 7, role: 'ADMIN', isSystemMaster: false }) },
    userTeamPolicy: { findUnique: async () => null },
    logisticaRoute: { findFirst: async () => null },
    entrega: {
      count: async ({ where }: any) => { calls.countWhere = where; return 1; },
    },
    $transaction: async (fn: any) => fn(tx),
  };
  const rota: any = {
    planejarRota: async (...args: any[]) => { calls.plan = args; return { paradas: [] }; },
  };
  const cobranca: any = {
    assertAssentoDoDia: async (...args: any[]) => { calls.gate = args; },
  };
  const service = new LogisticaRotaContinuidadeService(
    prisma, {} as any, rota, cobranca, { assertCapacidade: async () => undefined } as any,
  );
  (service as any).resolve = async () => target();

  const result = await service.puxar(actor, 'route:route-old-123', 8);
  const today = canonicalRouteDate();
  assert.equal(result.date, today);
  assert.deepEqual(calls.countWhere.id.notIn, ['open-a', 'open-b'], 'entregue não sai da conta do motorista A');
  assert.equal(calls.gate[2], today, 'carry-over deve gatear o assento de hoje');
  assert.deepEqual(calls.plan[1].deliveryIds, ['open-a', 'open-b']);
});

test('Continuar rota velha deixa concluídos e snapshot na execução antiga até o novo Iniciar', async () => {
  const calls: any = { plan: null };
  const tx: any = {
    $executeRawUnsafe: async () => 1,
    entrega: {
      findMany: async () => [{ id: 'open-a' }, { id: 'open-b' }],
      updateMany: async () => ({ count: 2 }),
    },
    logisticaRoute: {
      findFirst: async ({ where }: any) => where?.id
        ? { status: 'PLANNED', routeDate: '2026-08-12', operationalEndedAt: null, startedAt: null }
        : null,
      updateMany: async () => ({ count: 1 }),
    },
    logisticaRouteStop: {
      findMany: async () => [
        { deliveryId: 'open-a', delivery: { entregadorId: 9 } },
        { deliveryId: 'open-b', delivery: { entregadorId: 9 } },
      ],
    },
    logisticaTrackingSession: { updateMany: async () => ({ count: 0 }) },
  };
  const prisma: any = { $transaction: async (fn: any) => fn(tx) };
  const rota: any = { planejarRota: async (...args: any[]) => { calls.plan = args; return {}; } };
  const cobranca: any = { assertAssentoDoDia: async () => undefined };
  const service = new LogisticaRotaContinuidadeService(
    prisma, {} as any, rota, cobranca, { assertCapacidade: async () => undefined } as any,
  );
  (service as any).resolve = async () => target({
    ownerId: 9,
    sourceOwnerId: 9,
    ownerName: 'Dono',
    deliveries: target().deliveries.map((row: any) => ({ ...row, entregadorId: 9 })),
  });

  await service.retomar(actor, 'route:route-old-123', 9);
  assert.deepEqual(calls.plan[1].ordemManual, ['open-a', 'open-b']);
});

test('Puxar é recusado antes de mudar dono quando o destino já está em rota ativa', async () => {
  let transactions = 0;
  const prisma: any = {
    user: { findFirst: async () => ({ id: 9, companyId: 7, role: 'ADMIN', isSystemMaster: false }) },
    userTeamPolicy: { findUnique: async () => null },
    logisticaRoute: { findFirst: async () => ({ id: 'active-b' }) },
    $transaction: async () => { transactions += 1; },
  };
  const service = new LogisticaRotaContinuidadeService(
    prisma, {} as any, {} as any, {} as any, { assertCapacidade: async () => undefined } as any,
  );
  (service as any).resolve = async () => target();

  await assert.rejects(
    () => service.puxar(actor, 'route:route-old-123', 8),
    /já está com uma rota em andamento/i,
  );
  assert.equal(transactions, 0);
});

test('Cancelar rascunho usa escopo exato e nunca encerra rota formal do dia', async () => {
  let input: any = null;
  const rota: any = { limparDia: async (_c: number, value: any) => { input = value; return { ok: true }; } };
  const service = new LogisticaRotaContinuidadeService(
    {} as any, {} as any, rota, {} as any, { assertCapacidade: async () => undefined } as any,
  );
  (service as any).resolve = async () => target({
    ref: 'draft:9:2026-08-12', kind: 'draft', routeId: null, ownerId: 9,
    deliveries: [{ id: 'draft-a', status: 'agendada', entregadorId: 9 }],
  });

  await service.cancelar(actor, 'draft:9:2026-08-12');
  assert.equal(input.skipRoute, true);
  assert.deepEqual(input.deliveryIds, ['draft-a']);
});

// ── A ROTA FANTASMA (14/08, print do dono): "51 paradas · 0 entregues" com
// dock Cancelar|Iniciar|Montagem, e Cancelar devolvia 409 "Esta rota não tem
// mais paradas abertas." — o `resolve()` usava a MESMA checagem pra todos os
// verbos, inclusive cancelar, que é o único verbo de ESCAPE. Estes testes
// batem no `resolve()` DE VERDADE (sem mock de `resolve`), porque o bug mora
// justamente aí dentro.
function routeGhostPrisma(overrides: Record<string, unknown> = {}) {
  return {
    logisticaRoute: {
      findFirst: async () => ({
        id: 'route-ghost-1',
        routeDate: '2026-08-12',
        status: 'PLANNED',
        startedAt: null,
        operationalEndedAt: null,
        entregadorId: 8,
        entregador: { name: 'André' },
        stops: [
          {
            delivery: {
              id: 'd1', status: 'cancelada', entregadorId: 8, entregador: null,
              scheduledAt: new Date(), rotaOrdem: 3, startedAt: null, arrivedAt: null,
            },
          },
          {
            delivery: {
              id: 'd2', status: 'entregue', entregadorId: 8, entregador: null,
              scheduledAt: new Date(), rotaOrdem: 1, startedAt: null, arrivedAt: new Date(),
            },
          },
        ],
        ...overrides,
      }),
    },
  } as any;
}

test('Cancelar rota fantasma (route: sem nenhuma parada aberta) alcança a saída graciosa, nunca 409', async () => {
  const service = new LogisticaRotaContinuidadeService(
    routeGhostPrisma(), {} as any, {} as any, {} as any, { assertCapacidade: async () => undefined } as any,
  );

  const result = await service.cancelar(actor, 'route:route-ghost-1', 8);
  assert.deepEqual(result, { ok: true, resumo: { canceladas: 0 } }, 'beco fechado: cancelar sempre sai, mesmo sem abertas');
});

test('Abrir rota fantasma (route: sem paradas abertas) continua informando/barrando', async () => {
  const service = new LogisticaRotaContinuidadeService(
    routeGhostPrisma(), {} as any, {} as any, {} as any, { assertCapacidade: async () => undefined } as any,
  );

  await assert.rejects(
    () => service.abrir(actor, 'route:route-ghost-1'),
    /Esta rota não tem mais paradas abertas/,
  );
});

test('Retomar rota fantasma (route: sem paradas abertas) continua informando/barrando', async () => {
  const service = new LogisticaRotaContinuidadeService(
    routeGhostPrisma(), {} as any, {} as any, {} as any, { assertCapacidade: async () => undefined } as any,
  );

  await assert.rejects(
    () => service.retomar(actor, 'route:route-ghost-1', 8),
    /Esta rota não tem mais paradas abertas/,
  );
});

test('Puxar rota fantasma (route: sem paradas abertas) continua informando/barrando', async () => {
  const service = new LogisticaRotaContinuidadeService(
    routeGhostPrisma(), {} as any, {} as any, {} as any, { assertCapacidade: async () => undefined } as any,
  );

  await assert.rejects(
    () => service.puxar(actor, 'route:route-ghost-1', 8),
    /Esta rota não tem mais paradas abertas/,
  );
});
