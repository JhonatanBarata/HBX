import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addCivilDays,
  isoWeekdayForDate,
  LogisticaOccurrenceService,
  occurrenceItemId,
  saoPauloDateKey,
} from './logistica-occurrence.service';

test('datas civis e virada de São Paulo não escorregam para UTC', () => {
  assert.equal(addCivilDays('2026-07-15', 1), '2026-07-16');
  assert.equal(isoWeekdayForDate('2026-07-15'), 3);
  assert.equal(saoPauloDateKey(new Date('2026-07-16T02:30:00.000Z')), '2026-07-15');
  assert.throws(() => addCivilDays('2026-02-30', 1), /calendário inválida/);
});

test('quarta selecionada na quinta vira ocorrência da quinta sem duplicar nem mudar a origem', async () => {
  const companyId = 7;
  const driverUserId = 42;
  const sourceDate = '2026-07-15';
  const operationalDate = '2026-07-16';
  const occurrenceId = occurrenceItemId('recurrence-1', sourceDate);
  let occurrenceExists = false;
  let createCount = 0;
  let recurrenceNext = new Date('2026-07-15T03:00:00.000Z');
  let createdData: any = null;
  let recurrenceUpdate: any = null;
  const queriedCompanies: number[] = [];

  const recurrenceRow = () => ({
    id: 'recurrence-1',
    companyId,
    customerProfileId: 'customer-1',
    productId: 11,
    localId: null,
    qtdPadrao: 2,
    precoAcordado: 8.5,
    frequenciaDias: null,
    diasSemana: '3',
    proximaData: recurrenceNext,
    product: { id: 11, name: 'Galão', price: 9, priceCents: null },
    customerProfile: {
      id: 'customer-1',
      name: 'Cliente Um',
      precoPadrao: 10,
      lat: -23.5,
      lng: -46.6,
      geoFonte: 'gps_cadastro',
    },
    local: null,
  });

  const tx: any = {
    $executeRawUnsafe: async () => 0,
    contato: { findFirst: async () => null },
    entregaItem: {
      findMany: async (args: any) => {
        if (args?.where?.id?.in) {
          return occurrenceExists
            ? [{
                id: occurrenceId,
                entregaId: 'delivery-1',
                entrega: {
                  companyId,
                  scheduledAt: new Date('2026-07-16T03:00:00.000Z'),
                  status: 'agendada',
                },
              }]
            : [];
        }
        return [];
      },
      createMany: async () => ({ count: 0 }),
    },
    entrega: {
      // Leitor de compatibilidade com ocorrências legadas.
      findMany: async () => [],
      findFirst: async () => null,
      create: async ({ data }: any) => {
        createCount += 1;
        createdData = data;
        occurrenceExists = true;
        return { id: 'delivery-1', notes: data.notes, entregadorId: data.entregadorId };
      },
      update: async () => ({ id: 'delivery-1' }),
    },
    clienteProduto: {
      updateMany: async (args: any) => {
        recurrenceUpdate = args;
        recurrenceNext = args.data.proximaData;
        return { count: 1 };
      },
    },
  };

  const prisma: any = {
    user: {
      findFirst: async (args: any) => {
        assert.deepEqual(args.where, { id: driverUserId, companyId, isActive: true });
        return { id: driverUserId };
      },
    },
    clienteProduto: {
      findMany: async (args: any) => {
        queriedCompanies.push(args.where.companyId);
        return [recurrenceRow()];
      },
    },
    $transaction: async (callback: any) => callback(tx),
  };

  const service = new LogisticaOccurrenceService(prisma);
  const first = await service.materialize(companyId, {
    operationalDate,
    sourceDates: [sourceDate],
    driverUserId,
    actorUserId: driverUserId,
  });

  assert.equal(first.date, operationalDate);
  assert.deepEqual(first.sourceDates, [sourceDate]);
  assert.deepEqual(first.deliveryIds, ['delivery-1']);
  assert.equal(createCount, 1);
  assert.equal(createdData.scheduledAt.toISOString(), '2026-07-16T03:00:00.000Z');
  assert.equal(createdData.itens.create[0].id, occurrenceId);
  assert.match(createdData.notes, /15\/07\/2026/);
  assert.equal(recurrenceUpdate.data.proximaData.toISOString(), '2026-07-22T03:00:00.000Z');
  assert.deepEqual(queriedCompanies, [companyId]);

  const replay = await service.materialize(companyId, {
    operationalDate,
    sourceDates: [sourceDate],
    driverUserId,
    actorUserId: driverUserId,
  });

  assert.equal(createCount, 1, 'repetir a preparação não cria nova entrega');
  assert.equal(replay.puladas, 1);
  assert.deepEqual(replay.deliveryIds, ['delivery-1']);
  assert.deepEqual(queriedCompanies, [companyId, companyId]);
});

test('ocorrência cancelada volta para a prévia e é reaberta sem duplicar', async () => {
  const companyId = 7;
  const sourceDate = '2026-07-21';
  const operationalDate = '2026-07-17';
  const occurrenceId = occurrenceItemId('recurrence-1', sourceDate);
  const recurrence = {
    id: 'recurrence-1',
    companyId,
    customerProfileId: 'customer-1',
    productId: 11,
    localId: null,
    qtdPadrao: 2,
    precoAcordado: 8.5,
    frequenciaDias: null,
    diasSemana: '2',
    proximaData: new Date('2026-07-21T03:00:00.000Z'),
    product: { id: 11, name: 'Galão', price: 9, priceCents: null },
    customerProfile: { id: 'customer-1', name: 'Cliente Um', precoPadrao: 10, lat: -23.5, lng: -46.6, geoFonte: 'gps_cadastro' },
    local: null,
  };
  const cancelledItem = {
    id: occurrenceId,
    entregaId: 'delivery-cancelled',
    entrega: { companyId, scheduledAt: new Date('2026-07-17T03:00:00.000Z'), status: 'cancelada' },
  };
  let reopened: any = null;
  const tx: any = {
    $executeRawUnsafe: async () => 0,
    entregaItem: { findMany: async () => [cancelledItem] },
    entrega: {
      findMany: async () => [],
      updateMany: async (args: any) => { reopened = args; return { count: 1 }; },
    },
    clienteProduto: { updateMany: async () => assert.fail('recorrência já avançada não pode avançar novamente') },
  };
  const prisma: any = {
    clienteProduto: { findMany: async () => [recurrence] },
    entregaItem: { findMany: async () => [cancelledItem] },
    entrega: { findMany: async () => [] },
    $transaction: async (callback: any) => callback(tx),
  };

  const service = new LogisticaOccurrenceService(prisma);
  const preview = await service.preview(companyId, sourceDate);
  assert.equal(preview.clientes.length, 1);

  const result = await service.materialize(companyId, { operationalDate, sourceDates: [sourceDate] });
  assert.deepEqual(result.deliveryIds, ['delivery-cancelled']);
  assert.deepEqual(reopened.where, { id: { in: ['delivery-cancelled'] }, companyId, status: 'cancelada' });
  assert.equal(reopened.data.status, 'agendada');
  assert.equal(reopened.data.scheduledAt.toISOString(), '2026-07-17T03:00:00.000Z');
});
