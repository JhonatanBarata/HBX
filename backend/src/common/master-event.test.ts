import test from 'node:test';
import assert from 'node:assert/strict';

import { emitMasterEvent } from './master-event';

// Mock do client tipado do Prisma restrito ao delegate masterEvent — é a única
// superfície que o emitMasterEvent pode tocar (contrato: nada de $executeRaw).
function buildPrismaMock(overrides: Record<string, any> = {}) {
  const createCalls: any[] = [];
  const findFirstCalls: any[] = [];

  return {
    createCalls,
    findFirstCalls,
    prisma: {
      masterEvent: {
        findFirst: async (args: any) => {
          findFirstCalls.push(args);
          if (typeof overrides.findFirst === 'function') return overrides.findFirst(args);
          return overrides.lastEvent ?? null;
        },
        create: async (args: any) => {
          createCalls.push(args);
          if (typeof overrides.create === 'function') return overrides.create(args);
          return args;
        },
      },
    },
  };
}

test('emitMasterEvent NAO lanca com prisma indisponivel (null/undefined/sem delegate)', async () => {
  // Contrato best-effort: banco fora do ar, client sem o model, o que for — engole.
  assert.equal(await emitMasterEvent(null, { type: 'sale.closed', severity: 'info' }), null);
  assert.equal(await emitMasterEvent(undefined, { type: 'sale.closed', severity: 'info' }), null);
  assert.equal(await emitMasterEvent({}, { type: 'sale.closed', severity: 'info' }), null);
});

test('emitMasterEvent NAO lanca com prisma quebrado (create/findFirst explodem)', async () => {
  const quebrado = {
    masterEvent: {
      findFirst: async () => {
        throw new Error('conexao caiu');
      },
      create: async () => {
        throw new Error('conexao caiu');
      },
    },
  };
  assert.equal(await emitMasterEvent(quebrado, { type: 'implantacao.sold', severity: 'action_required' }), null);
  assert.equal(
    await emitMasterEvent(quebrado, { type: 'implantacao.sold', severity: 'action_required', dedupKey: 'x' }),
    null,
  );
});

test('emitMasterEvent insere evento tipado e devolve o id', async () => {
  const mock = buildPrismaMock();

  const id = await emitMasterEvent(mock.prisma, {
    type: 'fullplan.requested',
    severity: 'action_required',
    companyId: 42,
    payload: { companyName: 'ACME' },
  });

  assert.equal(typeof id, 'string');
  assert.equal(mock.createCalls.length, 1);
  const data = mock.createCalls[0].data;
  assert.equal(data.type, 'fullplan.requested');
  assert.equal(data.severity, 'action_required');
  assert.equal(data.companyId, 42);
  assert.equal(data.dedupKey, null);
  assert.equal(data.payloadJson, JSON.stringify({ companyName: 'ACME' }));
  // sem dedupKey nao pode nem consultar dedup
  assert.equal(mock.findFirstCalls.length, 0);
});

test('emitMasterEvent sem type ou com severity invalida nao explode (type vazio = nao insere)', async () => {
  const mock = buildPrismaMock();

  assert.equal(await emitMasterEvent(mock.prisma, { type: '', severity: 'info' }), null);
  assert.equal(mock.createCalls.length, 0);

  // severity fora do vocabulario cai pra 'info' (nao lanca, nao grava lixo)
  const id = await emitMasterEvent(mock.prisma, { type: 'x.y', severity: 'grave' as any });
  assert.equal(typeof id, 'string');
  assert.equal(mock.createCalls[0].data.severity, 'info');
});

test('emitMasterEvent dedup: mesmo payload.state do ultimo evento com a chave = nao insere', async () => {
  const mock = buildPrismaMock({
    lastEvent: { createdAt: new Date(Date.now() - 60 * 60_000), payloadJson: JSON.stringify({ state: 'down' }) },
  });

  const id = await emitMasterEvent(mock.prisma, {
    type: 'chip.connection',
    severity: 'attention',
    dedupKey: 'chip:42',
    payload: { state: 'down' },
  });

  assert.equal(id, null);
  assert.equal(mock.createCalls.length, 0);
});

test('emitMasterEvent dedup: estado MUDOU = insere (mesmo com a mesma chave)', async () => {
  const mock = buildPrismaMock({
    lastEvent: { createdAt: new Date(Date.now() - 60 * 60_000), payloadJson: JSON.stringify({ state: 'down' }) },
  });

  const id = await emitMasterEvent(mock.prisma, {
    type: 'chip.connection',
    severity: 'attention',
    dedupKey: 'chip:42',
    payload: { state: 'up' },
  });

  assert.equal(typeof id, 'string');
  assert.equal(mock.createCalls.length, 1);
});

test('emitMasterEvent dedup: ultimo evento dentro da janela = nao insere', async () => {
  const mock = buildPrismaMock({
    lastEvent: { createdAt: new Date(Date.now() - 2 * 60_000), payloadJson: null },
  });

  const id = await emitMasterEvent(mock.prisma, {
    type: 'factory.stalled',
    severity: 'attention',
    dedupKey: 'factory',
    dedupWindowMinutes: 30,
  });

  assert.equal(id, null);
  assert.equal(mock.createCalls.length, 0);
});

test('emitMasterEvent dedup: fora da janela e sem state comparavel = insere', async () => {
  const mock = buildPrismaMock({
    lastEvent: { createdAt: new Date(Date.now() - 45 * 60_000), payloadJson: JSON.stringify({ foo: 1 }) },
  });

  const id = await emitMasterEvent(mock.prisma, {
    type: 'factory.stalled',
    severity: 'attention',
    dedupKey: 'factory',
    dedupWindowMinutes: 30,
  });

  assert.equal(typeof id, 'string');
  assert.equal(mock.createCalls.length, 1);
});
