import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addCivilDays,
  isoWeekdayForDate,
  LogisticaOccurrenceService,
  occurrenceItemId,
  saoPauloDateKey,
} from './logistica-occurrence.service';
import { LogisticaAdminRouteService } from './logistica-admin-route.service';

type RecurrenceSeed = {
  id: string;
  companyId: number;
  customerProfileId: string;
  productId: number;
  localId: string | null;
  qtdPadrao: number;
  precoAcordado: number | null;
  frequenciaDias: number | null;
  diasSemana: string | null;
  proximaData: Date | null;
  product: { id: number; name: string; price: number | null; priceCents: number | null };
  customerProfile: {
    id: string;
    name: string;
    precoPadrao: number | null;
    lat: number | null;
    lng: number | null;
    geoFonte: string | null;
  };
  local: { apelido: string | null; lat: number | null; lng: number | null; geoFonte: string | null } | null;
};

function buildOccurrenceHarness(input: RecurrenceSeed[], validDriverId = 42) {
  const recurrences = input.map((row) => ({ ...row }));
  const deliveries = new Map<string, any>();
  const items = new Map<string, any>();
  let deliverySequence = 0;

  const matchesDate = (value: Date | null | undefined, range: any) => {
    if (!range) return true;
    if (!value) return false;
    const time = value.getTime();
    if (range.gte && time < new Date(range.gte).getTime()) return false;
    if (range.gt && time <= new Date(range.gt).getTime()) return false;
    if (range.lte && time > new Date(range.lte).getTime()) return false;
    if (range.lt && time >= new Date(range.lt).getTime()) return false;
    return true;
  };

  const entregaFindMany = async ({ where }: any = {}) => Array.from(deliveries.values())
    .filter((delivery) => {
      if (where?.companyId != null && delivery.companyId !== where.companyId) return false;
      return matchesDate(delivery.scheduledAt, where?.scheduledAt);
    })
    .map((delivery) => ({
      ...delivery,
      itens: Array.from(items.values())
        .filter((item) => item.entregaId === delivery.id)
        .map((item) => ({ ...item })),
    }));

  const entregaItemFindMany = async ({ where }: any = {}) => {
    if (where?.id?.in) {
      return where.id.in.flatMap((id: string) => {
        const item = items.get(id);
        if (!item) return [];
        const delivery = deliveries.get(item.entregaId);
        return [{
          ...item,
          entrega: delivery
            ? { companyId: delivery.companyId, scheduledAt: delivery.scheduledAt, status: delivery.status }
            : null,
        }];
      });
    }
    if (where?.entregaId) {
      return Array.from(items.values())
        .filter((item) => item.entregaId === where.entregaId)
        .map((item) => ({ ...item }));
    }
    return Array.from(items.values()).map((item) => ({ ...item }));
  };

  const tx: any = {
    $executeRawUnsafe: async () => 0,
    contato: { findFirst: async () => null },
    clienteProduto: {
      findMany: async ({ where }: any) => recurrences.filter((row) => row.companyId === where.companyId),
      updateMany: async ({ where, data }: any) => {
        const row = recurrences.find((candidate) => candidate.id === where.id && candidate.companyId === where.companyId);
        if (!row) return { count: 0 };
        row.proximaData = data.proximaData ?? null;
        return { count: 1 };
      },
    },
    entregaItem: {
      findMany: entregaItemFindMany,
      createMany: async ({ data }: any) => {
        let count = 0;
        for (const row of data || []) {
          if (items.has(row.id)) continue;
          items.set(row.id, { ...row });
          count++;
        }
        return { count };
      },
    },
    entrega: {
      findMany: entregaFindMany,
      findFirst: async ({ where }: any) => Array.from(deliveries.values()).find((delivery) => {
        if (delivery.companyId !== where.companyId) return false;
        if (delivery.customerProfileId !== where.customerProfileId) return false;
        if ((delivery.localId ?? null) !== (where.localId ?? null)) return false;
        if (where.status?.in && !where.status.in.includes(delivery.status)) return false;
        if (!matchesDate(delivery.scheduledAt, where.scheduledAt)) return false;
        if (Array.isArray(where.OR)) {
          const driverAllowed = where.OR.some((clause: any) => clause.entregadorId === delivery.entregadorId);
          if (!driverAllowed) return false;
        }
        return true;
      }) ?? null,
      create: async ({ data }: any) => {
        const id = data.id || `delivery-${++deliverySequence}`;
        const delivery = { id, createdAt: new Date(), rotaOrdem: null, etaAt: null, ...data, itens: undefined };
        deliveries.set(id, delivery);
        for (const item of data.itens?.create || []) items.set(item.id, { ...item, entregaId: id });
        return { id, notes: delivery.notes ?? null, entregadorId: delivery.entregadorId ?? null };
      },
      update: async ({ where, data }: any) => {
        const current = deliveries.get(where.id);
        if (!current) throw new Error(`Entrega inexistente: ${where.id}`);
        const updated = { ...current, ...data };
        deliveries.set(where.id, updated);
        return updated;
      },
    },
  };

  const prisma: any = {
    ...tx,
    user: {
      findFirst: async ({ where }: any) =>
        where.id === validDriverId && where.companyId === 7 && where.isActive === true ? { id: validDriverId } : null,
    },
    $transaction: async (callback: (transaction: any) => Promise<any>) => callback(tx),
  };

  return {
    service: new LogisticaOccurrenceService(prisma),
    recurrences,
    deliveries,
    items,
  };
}

function weeklySeed(overrides: Partial<RecurrenceSeed> = {}): RecurrenceSeed {
  return {
    id: 'rec-wed',
    companyId: 7,
    customerProfileId: 'customer-1',
    productId: 10,
    localId: null,
    qtdPadrao: 2,
    precoAcordado: 5,
    frequenciaDias: null,
    diasSemana: '3',
    proximaData: new Date('2026-07-15T03:00:00.000Z'),
    product: { id: 10, name: 'Galão 20L', price: 6, priceCents: null },
    customerProfile: {
      id: 'customer-1',
      name: 'Mercado Central',
      precoPadrao: null,
      lat: -23.5,
      lng: -46.6,
      geoFonte: 'gps_cadastro',
    },
    local: null,
    ...overrides,
  };
}

test('datas civis e identificador de ocorrência seguem São Paulo sem escorregar o dia', () => {
  assert.equal(addCivilDays('2026-07-16', -1), '2026-07-15');
  assert.equal(isoWeekdayForDate('2026-07-16'), 4);
  assert.equal(occurrenceItemId('rec-wed', '2026-07-15'), 'occ_20260715_rec-wed');
});

test('quinta inclui a ocorrência de quarta na rota de quinta, preserva a agenda e não duplica no retry', async () => {
  const harness = buildOccurrenceHarness([weeklySeed()]);

  const first = await harness.service.materialize(7, {
    operationalDate: '2026-07-16',
    sourceDates: ['2026-07-15'],
    driverUserId: 42,
    actorUserId: 42,
  });

  assert.equal(first.date, '2026-07-16');
  assert.deepEqual(first.sourceDates, ['2026-07-15']);
  assert.equal(first.avancados, 1);
  assert.equal(harness.deliveries.size, 1);
  assert.equal(harness.items.size, 1);

  const delivery = Array.from(harness.deliveries.values())[0];
  assert.equal(saoPauloDateKey(delivery.scheduledAt), '2026-07-16');
  assert.equal(delivery.entregadorId, 42);
  assert.ok(harness.items.has('occ_20260715_rec-wed'));
  assert.equal(saoPauloDateKey(harness.recurrences[0].proximaData), '2026-07-22');

  const replay = await harness.service.materialize(7, {
    operationalDate: '2026-07-16',
    sourceDates: ['2026-07-15'],
    driverUserId: 42,
    actorUserId: 42,
  });

  assert.equal(replay.avancados, 0);
  assert.equal(replay.puladas, 1);
  assert.equal(harness.deliveries.size, 1);
  assert.equal(harness.items.size, 1);
});

test('quarta e sexta do mesmo cliente/local viram uma única parada operacional com duas ocorrências', async () => {
  const harness = buildOccurrenceHarness([
    weeklySeed(),
    weeklySeed({
      id: 'rec-fri',
      productId: 11,
      qtdPadrao: 1,
      precoAcordado: 8,
      diasSemana: '5',
      proximaData: new Date('2026-07-17T03:00:00.000Z'),
      product: { id: 11, name: 'Fardo', price: 8, priceCents: null },
    }),
  ]);

  const result = await harness.service.materialize(7, {
    operationalDate: '2026-07-16',
    sourceDates: ['2026-07-15', '2026-07-17'],
    driverUserId: 42,
    actorUserId: 42,
  });

  assert.equal(result.avancados, 2);
  assert.equal(result.criadas, 1);
  assert.equal(harness.deliveries.size, 1);
  assert.equal(harness.items.size, 2);
  assert.ok(harness.items.has('occ_20260715_rec-wed'));
  assert.ok(harness.items.has('occ_20260717_rec-fri'));

  const delivery = Array.from(harness.deliveries.values())[0];
  assert.equal(delivery.quantidade, 3);
  assert.match(String(delivery.notes), /15\/07\/2026/);
  assert.match(String(delivery.notes), /17\/07\/2026/);
  assert.equal(saoPauloDateKey(harness.recurrences[0].proximaData), '2026-07-22');
  assert.equal(saoPauloDateKey(harness.recurrences[1].proximaData), '2026-07-24');
});

test('materialização mantém dados de outra empresa fora da operação', async () => {
  const harness = buildOccurrenceHarness([
    weeklySeed(),
    weeklySeed({
      id: 'foreign-recurrence',
      companyId: 8,
      customerProfileId: 'foreign-customer',
      productId: 99,
      product: { id: 99, name: 'Produto externo', price: 99, priceCents: null },
      customerProfile: {
        id: 'foreign-customer',
        name: 'Outra empresa',
        precoPadrao: null,
        lat: null,
        lng: null,
        geoFonte: null,
      },
    }),
  ]);

  await harness.service.materialize(7, {
    operationalDate: '2026-07-16',
    sourceDates: ['2026-07-15'],
    driverUserId: 42,
    actorUserId: 42,
  });

  assert.equal(harness.deliveries.size, 1);
  assert.ok(harness.items.has('occ_20260715_rec-wed'));
  assert.ok(!harness.items.has('occ_20260715_foreign-recurrence'));
});

test('motorista precisa pertencer à mesma empresa antes de materializar', async () => {
  const harness = buildOccurrenceHarness([weeklySeed()], 99);
  await assert.rejects(
    () => harness.service.materialize(7, {
      operationalDate: '2026-07-16',
      sourceDates: ['2026-07-15'],
      driverUserId: 42,
      actorUserId: 42,
    }),
    /Motorista inválido para esta empresa/,
  );
  assert.equal(harness.deliveries.size, 0);
});

test('preparar traça sem cobrar e começar é a única etapa que inicia a rota comercial', async () => {
  const planejarCalls: any[] = [];
  const iniciarCalls: any[] = [];
  const prisma: any = {
    // F0: prepare/start chamam encerrarDiasAnteriores — tx-mock inerte dedicado
    // (não polui os contadores de entrega.* deste teste).
    $transaction: async (cb: any) => cb({
      logisticaRoute: { updateMany: async () => ({ count: 0 }) },
      entrega: { findMany: async () => [], updateMany: async () => ({ count: 0 }) },
    }),
    entrega: {
      updateMany: async () => ({ count: 1 }),
      findMany: async () => [{ id: 'delivery-1' }, { id: 'delivery-2' }],
    },
  };
  const occurrences: any = {
    materialize: async () => ({
      date: '2026-07-16',
      sourceDates: ['2026-07-15'],
      criadas: 1,
      puladas: 0,
      avancados: 2,
      candidatos: 2,
      deliveryIds: ['delivery-1', 'delivery-2'],
    }),
  };
  const rota: any = {
    planejarRota: async (...args: any[]) => {
      planejarCalls.push(args);
      return {
        date: '2026-07-16',
        total: 2,
        semCoordenada: 0,
        distanciaTotalKm: 12.5,
        terminoPrevisto: null,
        velocidadeMediaKmH: 25,
        tempoParadaMin: 5,
        paradas: [],
      };
    },
    iniciarRota: async (...args: any[]) => {
      iniciarCalls.push(args);
      return { date: '2026-07-16', total: 2, paradas: [] };
    },
  };
  // PR27072026 F2 — prepare() agora chama logistica.resolverDevedorNaRota pro
  // filtro EXCLUIR da parada amarela de devedor; stub devolve Map vazio (ninguém
  // é EXCLUIR), preservando o comportamento anterior deste teste.
  const service = new LogisticaAdminRouteService(prisma, occurrences, rota, { resolverDevedorNaRota: async () => new Map() } as any);
  const actor = { id: 42, companyId: 7, role: 'ADMIN', canViewBilling: true };

  const prepared = await service.prepare(7, {
    operationalDate: '2026-07-16',
    sourceDates: ['2026-07-15'],
  }, actor);

  assert.equal(prepared.plan.total, 2);
  assert.equal(planejarCalls.length, 1);
  assert.equal(planejarCalls[0][0], 7);
  assert.equal(planejarCalls[0][2], 42);
  assert.equal(planejarCalls[0][4], false, 'Traçar não pode cobrar/criar rota comercial');
  assert.equal(iniciarCalls.length, 0);

  await service.start(7, { operationalDate: '2026-07-16' }, actor);
  assert.equal(iniciarCalls.length, 1);
  assert.equal(iniciarCalls[0][0], 7);
  assert.equal(iniciarCalls[0][2], 42);
  assert.equal(iniciarCalls[0][4], true, 'Começar aplica a regra comercial para o dono');
});

// PR27072026 F2 — PARADA AMARELA DE DEVEDOR, modo EXCLUIR: a entrega do devedor
// NÃO entra na MONTAGEM (nunca vira deliveryId pro planejador) — mas o teste
// prova SÓ o filtro: nenhum mock de escrita (update/updateMany de cancelamento)
// é chamado pra parada excluída, porque prepare() não tem NENHUM caminho de
// escrita entre ler openRows e filtrar — a ocorrência segue 'agendada' no banco.
test('preparar filtra a parada EXCLUIR da montagem (nunca ganha rotaOrdem), sem cancelar nada', async () => {
  const planejarCalls: any[] = [];
  const prisma: any = {
    $transaction: async (cb: any) => cb({
      logisticaRoute: { updateMany: async () => ({ count: 0 }) },
      entrega: { findMany: async () => [], updateMany: async () => ({ count: 0 }) },
    }),
    entrega: {
      updateMany: async () => ({ count: 2 }),
      findMany: async () => [
        { id: 'delivery-devedor', customerProfileId: 'cliente-devedor' },
        { id: 'delivery-em-dia', customerProfileId: 'cliente-em-dia' },
      ],
    },
  };
  const occurrences: any = {
    materialize: async () => ({
      date: '2026-07-16',
      sourceDates: ['2026-07-15'],
      criadas: 0,
      puladas: 0,
      avancados: 2,
      candidatos: 2,
      deliveryIds: ['delivery-devedor', 'delivery-em-dia'],
    }),
  };
  const rota: any = {
    planejarRota: async (...args: any[]) => {
      planejarCalls.push(args);
      return { date: '2026-07-16', total: 1, semCoordenada: 0, distanciaTotalKm: 0, terminoPrevisto: null, velocidadeMediaKmH: 25, tempoParadaMin: 5, paradas: [] };
    },
  };
  const devedorMapCalls: any[] = [];
  const logistica: any = {
    resolverDevedorNaRota: async (companyId: number, clienteIds: string[]) => {
      devedorMapCalls.push([companyId, clienteIds]);
      return new Map([
        ['cliente-devedor', { devedor: true, modo: 'EXCLUIR', saldoAberto: 40, motivo: null }],
        ['cliente-em-dia', { devedor: false, modo: 'NORMAL', saldoAberto: 0, motivo: null }],
      ]);
    },
  };
  const service = new LogisticaAdminRouteService(prisma, occurrences, rota, logistica);
  const actor = { id: 42, companyId: 7, role: 'ADMIN', canViewBilling: true };

  await service.prepare(7, { operationalDate: '2026-07-16', sourceDates: ['2026-07-15'] }, actor);

  assert.equal(devedorMapCalls.length, 1, 'consultou a fonte única 1x');
  assert.deepEqual(
    [...devedorMapCalls[0][1]].sort(),
    ['cliente-devedor', 'cliente-em-dia'],
    'perguntou pelos DOIS clientes antes de decidir quem fica de fora',
  );
  assert.equal(planejarCalls.length, 1);
  const deliveryIdsEnviados: string[] = planejarCalls[0][1].deliveryIds;
  assert.deepEqual(deliveryIdsEnviados, ['delivery-em-dia'], 'só a parada em dia chega no planejador — devedor EXCLUIR nunca ganha rotaOrdem');
});

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
    $transaction: async (cb: any) => cb({
      logisticaRoute: { updateMany: async () => ({ count: 0 }) },
      entrega: { findMany: async () => [], updateMany: async () => ({ count: 0 }) },
    }),
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
  const service = new LogisticaAdminRouteService(prisma, occurrences, rota, { resolverDevedorNaRota: async () => new Map() } as any);

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
    $transaction: async (cb: any) => cb({
      logisticaRoute: { updateMany: async () => ({ count: 0 }) },
      entrega: { findMany: async () => [], updateMany: async () => ({ count: 0 }) },
    }),
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
  const service = new LogisticaAdminRouteService(prisma, {} as any, rota, { resolverDevedorNaRota: async () => new Map() } as any);

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
    $transaction: async (cb: any) => cb({
      logisticaRoute: { updateMany: async () => ({ count: 0 }) },
      entrega: { findMany: async () => [], updateMany: async () => ({ count: 0 }) },
    }),
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
  const service = new LogisticaAdminRouteService(prisma, {} as any, rota, { resolverDevedorNaRota: async () => new Map() } as any);

  const result = await service.retryLater(7, 'delivery-1', ADMIN);

  assert.equal(lookup.where.companyId, 7);
  assert.equal(update.data.rotaOrdem, 4);
  assert.equal(update.data.etaAt, null);
  assert.match(update.data.notes, /fim da rota/);
  assert.equal(recalculation?.[0], 7);
  assert.equal(recalculation?.[2], 42);
  assert.deepEqual(result, { id: 'delivery-1', rotaOrdem: 4 });
});

// ── L4-A (18/07) — movePending (carry-forward de pendência pro dia novo)
// clona a Entrega original: precisa herdar `origem` (nunca reclassificar uma
// pendência avulsa como recorrente só por ter sido movida de dia).
test('preparar com pendência: clone do dia novo herda a origem da entrega original', async () => {
  const companyId = 7;
  const operationalDate = '2026-07-19';
  const originalId = 'pending-1';
  const original = {
    id: originalId,
    customerProfileId: 'customer-1',
    contatoId: null,
    localId: null,
    productId: 10,
    quantidade: 2,
    valor: 20,
    scheduledAt: new Date('2026-07-17T03:00:00.000Z'), // dia anterior, ainda aberta
    notes: null,
    origem: 'avulsa',
    itens: [],
  };
  let createdData: any = null;
  let cancelledUpdate: any = null;
  const tx: any = {
    $executeRawUnsafe: async () => 0,
    entrega: {
      findMany: async () => [original],
      findUnique: async () => null, // sem clone existente ainda
      findFirst: async () => null, // sem entrega aberta pro cliente no dia novo
      create: async ({ data }: any) => {
        createdData = data;
        return { id: data.id, notes: data.notes };
      },
      update: async (args: any) => {
        if (args.where.id === originalId) cancelledUpdate = args;
        return { id: args.where.id };
      },
    },
  };
  let txCalls = 0;
  const prisma: any = {
    entrega: {
      updateMany: async () => ({ count: 0 }),
      findMany: async () => [{ id: createdData?.id ?? 'sem-clone' }],
    },
    // F0: a 1ª $transaction do prepare é o encerrarDiasAnteriores (fechamento
    // de caixa) — recebe um tx inerte dedicado pra não engolir a `original`
    // como "presa de dia passado". A 2ª em diante é o movePending (o alvo).
    $transaction: async (callback: any) => {
      txCalls += 1;
      if (txCalls === 1) {
        return callback({
          logisticaRoute: { updateMany: async () => ({ count: 0 }) },
          entrega: { findMany: async () => [], updateMany: async () => ({ count: 0 }) },
        });
      }
      return callback(tx);
    },
  };
  const occurrences: any = {
    materialize: async () => ({
      date: operationalDate,
      sourceDates: [operationalDate],
      criadas: 0,
      puladas: 0,
      avancados: 0,
      candidatos: 0,
      deliveryIds: [],
    }),
  };
  const rota: any = {
    planejarRota: async () => ({
      date: operationalDate,
      total: 1,
      semCoordenada: 0,
      distanciaTotalKm: 1,
      terminoPrevisto: null,
      velocidadeMediaKmH: 25,
      tempoParadaMin: 5,
      paradas: [],
    }),
  };
  const service = new LogisticaAdminRouteService(prisma, occurrences, rota, { resolverDevedorNaRota: async () => new Map() } as any);

  await service.prepare(companyId, {
    operationalDate,
    pendingDeliveryIds: [originalId],
  }, ADMIN);

  assert.ok(createdData, 'a pendência precisa ser clonada pro dia novo');
  assert.equal(createdData.origem, 'avulsa', 'o clone herda a origem da entrega original');
  assert.equal(cancelledUpdate?.data?.status, 'cancelada', 'a original vira cancelada após mover');
});
