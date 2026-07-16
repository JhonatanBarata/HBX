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

  const entregaFindMany = async ({ where }: any = {}) => {
    return Array.from(deliveries.values()).filter((delivery) => {
      if (where?.companyId != null && delivery.companyId !== where.companyId) return false;
      if (!matchesDate(delivery.scheduledAt, where?.scheduledAt)) return false;
      return true;
    }).map((delivery) => ({
      ...delivery,
      itens: Array.from(items.values())
        .filter((item) => item.entregaId === delivery.id)
        .map((item) => ({ ...item })),
    }));
  };

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
    $queryRawUnsafe: async () => undefined,
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
      findFirst: async ({ where }: any) => {
        return Array.from(deliveries.values()).find((delivery) => {
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
        }) ?? null;
      },
      create: async ({ data }: any) => {
        const id = data.id || `delivery-${++deliverySequence}`;
        const delivery = { id, createdAt: new Date(), rotaOrdem: null, etaAt: null, ...data, itens: undefined };
        deliveries.set(id, delivery);
        for (const item of data.itens?.create || []) {
          items.set(item.id, { ...item, entregaId: id });
        }
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
  const service = new LogisticaAdminRouteService(prisma, occurrences, rota, {} as any);
  const actor = { id: 42, companyId: 7, role: 'ADMIN', canViewBilling: true };

  const prepared = await service.prepare(7, {
    operationalDate: '2026-07-16',
    sourceDates: ['2026-07-15'],
  }, actor);

  assert.equal(prepared.plan.total, 2);
  assert.equal(planejarCalls.length, 1);
  assert.equal(planejarCalls[0][0], 7);
  assert.equal(planejarCalls[0][2], 42);
  assert.equal(planejarCalls[0][5], false, 'Traçar não pode cobrar/criar rota comercial');
  assert.equal(iniciarCalls.length, 0);

  await service.start(7, { operationalDate: '2026-07-16' }, actor);
  assert.equal(iniciarCalls.length, 1);
  assert.equal(iniciarCalls[0][0], 7);
  assert.equal(iniciarCalls[0][2], 42);
  assert.equal(iniciarCalls[0][4], true, 'Começar aplica a regra comercial para o dono');
});
