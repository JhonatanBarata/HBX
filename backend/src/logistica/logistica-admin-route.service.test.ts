import test from 'node:test';
import assert from 'node:assert/strict';
import { LogisticaAdminRouteService } from './logistica-admin-route.service';

const ADMIN = {
  id: 42,
  companyId: 7,
  role: 'ADMIN',
  isSystemMaster: false,
  canViewBilling: true,
};

const PLAN = {
  date: '2026-07-16',
  total: 1,
  semCoordenada: 0,
  distanciaTotalKm: 12.4,
  terminoPrevisto: '2026-07-16T15:00:00.000Z',
  velocidadeMediaKmH: 25,
  tempoParadaMin: 5,
  paradas: [{
    id: 'delivery-1',
    rotaOrdem: 0,
    etaAt: '2026-07-16T15:00:00.000Z',
    semCoordenada: false,
    lat: -23.5,
    lng: -46.6,
    status: 'agendada',
    nome: 'Cliente Um',
  }],
};

test('preparar usa hoje como data operacional, aceita origem de quarta e não cobra', async () => {
  let materializeInput: any = null;
  let planCall: any[] | null = null;
  let assignment: any = null;
  let openQuery: any = null;
  const prisma: any = {
    entrega: {
      updateMany: async (args: any) => {
        assignment = args;
        return { count: 1 };
      },
      findMany: async (args: any) => {
        openQuery = args;
        return [{ id: 'delivery-1' }];
      },
    },
  };
  const occurrences: any = {
    materialize: async (_companyId: number, input: any) => {
      materializeInput = input;
      return {
        date: '2026-07-16',
        sourceDates: ['2026-07-15'],
        criadas: 1,
        puladas: 0,
        avancados: 1,
        candidatos: 1,
        deliveryIds: ['delivery-1'],
      };
    },
  };
  const rota: any = {
    planejarRota: async (...args: any[]) => {
      planCall = args;
      return PLAN;
    },
  };
  const service = new LogisticaAdminRouteService(prisma, occurrences, rota, {} as any);

  const result = await service.prepare(7, {
    operationalDate: '2026-07-16',
    sourceDates: ['2026-07-15'],
  }, ADMIN);

  assert.deepEqual(materializeInput, {
    operationalDate: '2026-07-16',
    sourceDates: ['2026-07-15'],
    driverUserId: 42,
    actorUserId: 42,
  });
  assert.equal(assignment.where.companyId, 7);
  assert.equal(assignment.data.scheduledAt.toISOString(), '2026-07-16T03:00:00.000Z');
  assert.equal(openQuery.where.companyId, 7);
  assert.equal(openQuery.where.entregadorId, 42);
  assert.equal(openQuery.where.scheduledAt.gte.toISOString(), '2026-07-16T03:00:00.000Z');
  assert.equal(planCall?.[0], 7);
  assert.equal(planCall?.[1].date, '2026-07-16');
  assert.deepEqual(planCall?.[1].deliveryIds, ['delivery-1']);
  assert.equal(planCall?.[2], 42);
  assert.equal(planCall?.[3], 42);
  assert.equal(planCall?.[4], false, 'Traçar não ativa cobrança comercial');
  assert.equal(result.operationalDate, '2026-07-16');
  assert.equal(result.plan.total, 1);
});

test('começar é a operação separada que inicia e congela a rota', async () => {
  let startCall: any[] | null = null;
  const prisma: any = {
    entrega: {
      findMany: async (args: any) => {
        assert.equal(args.where.companyId, 7);
        assert.equal(args.where.entregadorId, 42);
        return [{ id: 'delivery-1' }];
      },
    },
  };
  const rota: any = {
    iniciarRota: async (...args: any[]) => {
      startCall = args;
      return { ...PLAN, routeStatus: 'ACTIVE' };
    },
  };
  const service = new LogisticaAdminRouteService(prisma, {} as any, rota, {} as any);

  await service.start(7, { operationalDate: '2026-07-16' }, ADMIN);

  assert.equal(startCall?.[0], 7);
  assert.equal(startCall?.[1].date, '2026-07-16');
  assert.deepEqual(startCall?.[1].deliveryIds, ['delivery-1']);
  assert.equal(startCall?.[2], 42);
  assert.equal(startCall?.[3], 42);
  assert.equal(startCall?.[4], true, 'o dono recebe o modo comercial somente ao começar');
});

test('tentar novamente move somente a própria parada para o fim', async () => {
  let lookup: any = null;
  let update: any = null;
  let recalculation: any[] | null = null;
  const prisma: any = {
    entrega: {
      findFirst: async (args: any) => {
        lookup = args;
        return {
          id: 'delivery-1',
          scheduledAt: new Date('2026-07-16T03:00:00.000Z'),
          entregadorId: 42,
          notes: null,
        };
      },
      aggregate: async () => ({ _max: { rotaOrdem: 3 } }),
      update: async (args: any) => {
        update = args;
        return { id: 'delivery-1' };
      },
    },
  };
  const rota: any = {
    recalcularEtaRestantes: async (...args: any[]) => {
      recalculation = args;
      return { recalculadas: 1 };
    },
  };
  const service = new LogisticaAdminRouteService(prisma, {} as any, rota, {} as any);

  const result = await service.retryLater(7, 'delivery-1', ADMIN);

  assert.equal(lookup.where.companyId, 7);
  assert.equal(update.data.rotaOrdem, 4);
  assert.equal(update.data.etaAt, null);
  assert.match(update.data.notes, /fim da rota/);
  assert.equal(recalculation?.[0], 7);
  assert.equal(recalculation?.[2], 42);
  assert.deepEqual(result, { id: 'delivery-1', rotaOrdem: 4 });
});
