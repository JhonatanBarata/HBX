import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import axios from 'axios';

import { WebwhatsOutboxConsumerService } from './webwhats-outbox-consumer.service';

/**
 * Aceite do CONSUMER DA OUTBOX (GATEWAY-WA S2): cursor avança por evento processado; idempotência
 * (reprocessar não duplica no motor — aqui provamos que o consumer só avança e só chama o core 1x
 * por evento novo); tolera 404 (endpoint ausente no motor) sem crashar e sem avançar cursor.
 */

function makeCursorPrisma(initial = 0n) {
  const state = { cursor: initial, exists: initial > 0n };
  return {
    _state: state,
    webwhatsEventCursor: {
      async findUnique() {
        return state.exists ? { name: 'webwhats_outbox', cursor: state.cursor } : null;
      },
      async upsert({ create, update }: any) {
        state.cursor = BigInt((update?.cursor ?? create?.cursor) as any);
        state.exists = true;
        return { name: 'webwhats_outbox', cursor: state.cursor };
      },
    },
  } as any;
}

function makeMessaging() {
  const calls: Array<{ payload: any; opts: any }> = [];
  return {
    calls,
    async processWebwhatsEventCore(payload: any, opts: any) {
      calls.push({ payload, opts });
      return { ok: true };
    },
  } as any;
}

function setMotorEnv() {
  process.env.WHATSAPP_MODAL_INTERNAL_URL = 'http://127.0.0.1:8080';
  process.env.WHATSAPP_MODAL_API_KEY = 'test-key';
  process.env.HBX_WEBWHATS_OUTBOX_CONSUMER_ENABLED = 'true';
}

function clearMotorEnv() {
  delete process.env.WHATSAPP_MODAL_INTERNAL_URL;
  delete process.env.WHATSAPP_MODAL_API_KEY;
  delete process.env.HBX_WEBWHATS_OUTBOX_CONSUMER_ENABLED;
}

// Invoca o tick privado uma vez (o serviço arma um setInterval no onModuleInit; aqui chamamos o
// miolo direto para determinismo — sem esperar timer).
async function runTick(svc: WebwhatsOutboxConsumerService) {
  await (svc as any).tick();
}

test('flag OFF: consumer não toca no motor nem no cursor', async () => {
  clearMotorEnv();
  const prisma = makeCursorPrisma();
  const messaging = makeMessaging();
  const svc = new WebwhatsOutboxConsumerService(prisma, messaging);
  const spy = mock.method(axios, 'request', async () => {
    throw new Error('não deveria chamar o motor com a flag OFF');
  });
  await runTick(svc);
  assert.equal(spy.mock.callCount(), 0);
  assert.equal(messaging.calls.length, 0);
  spy.mock.restore();
});

test('cursor avança por evento processado; core chamado 1x por evento', async () => {
  setMotorEnv();
  const prisma = makeCursorPrisma(0n);
  const messaging = makeMessaging();
  const svc = new WebwhatsOutboxConsumerService(prisma, messaging);

  const spy = mock.method(axios, 'request', async () => ({
    status: 200,
    data: {
      events: [
        { id: 1, instanceName: 'company-7', eventName: 'messages.upsert', payload: { a: 1 } },
        { id: 2, instanceName: 'company-7-user-3', eventName: 'messages.upsert', payload: { a: 2 } },
        { id: 3, instanceName: 'company-7', eventName: 'messages.upsert', payload: { a: 3 } },
      ],
    },
  }));

  await runTick(svc);

  assert.equal(messaging.calls.length, 3, 'cada evento deveria chamar o core 1x');
  assert.equal(prisma._state.cursor, 3n, 'cursor deveria avançar até o maior id processado');
  // tenantKeyOverride vem do instanceName da fila.
  assert.equal(messaging.calls[1].opts.tenantKeyOverride, 'company-7-user-3');
  assert.deepEqual(messaging.calls[0].opts.query, { instance: 'company-7' });
  spy.mock.restore();
  clearMotorEnv();
});

test('idempotência: reprocessar do mesmo cursor não re-chama eventos já consumidos', async () => {
  setMotorEnv();
  const prisma = makeCursorPrisma(0n);
  const messaging = makeMessaging();
  const svc = new WebwhatsOutboxConsumerService(prisma, messaging);

  // 1ª página: eventos 1..2. 2ª página (motor honra cursor=2): só evento 3.
  let call = 0;
  const spy = mock.method(axios, 'request', async (cfg: any) => {
    call += 1;
    const url = new URL(cfg.url);
    const cursor = url.searchParams.get('cursor');
    if (call === 1) {
      assert.equal(cursor, '0', 'primeira chamada parte do cursor 0');
      return { status: 200, data: { events: [{ id: 1, payload: {} }, { id: 2, payload: {} }] } };
    }
    assert.equal(cursor, '2', 'segunda chamada parte do cursor 2 (não reprocessa 1 e 2)');
    return { status: 200, data: { events: [{ id: 3, payload: {} }] } };
  });

  await runTick(svc);
  assert.equal(prisma._state.cursor, 2n);
  await runTick(svc);
  assert.equal(prisma._state.cursor, 3n);
  assert.equal(messaging.calls.length, 3, 'total de 3 eventos únicos processados, nenhum repetido');
  spy.mock.restore();
  clearMotorEnv();
});

test('404 do motor (endpoint ausente): não crasha e não avança cursor', async () => {
  setMotorEnv();
  const prisma = makeCursorPrisma(5n);
  const messaging = makeMessaging();
  const svc = new WebwhatsOutboxConsumerService(prisma, messaging);

  const spy = mock.method(axios, 'request', async () => ({ status: 404, data: 'Not Found' }));
  await runTick(svc); // não deve lançar
  assert.equal(messaging.calls.length, 0);
  assert.equal(prisma._state.cursor, 5n, 'cursor intocado quando o motor não expõe /events');
  spy.mock.restore();
  clearMotorEnv();
});

test('erro/timeout de rede: recua sem crashar, cursor mantido', async () => {
  setMotorEnv();
  const prisma = makeCursorPrisma(9n);
  const messaging = makeMessaging();
  const svc = new WebwhatsOutboxConsumerService(prisma, messaging);

  const spy = mock.method(axios, 'request', async () => {
    throw new Error('ECONNREFUSED (motor reiniciando no publish)');
  });
  await runTick(svc);
  assert.equal(messaging.calls.length, 0);
  assert.equal(prisma._state.cursor, 9n);
  spy.mock.restore();
  clearMotorEnv();
});

test('falha ao processar um evento: para na página e não avança além do último sucesso', async () => {
  setMotorEnv();
  const prisma = makeCursorPrisma(0n);
  const messaging = {
    calls: [] as any[],
    async processWebwhatsEventCore(payload: any) {
      this.calls.push(payload);
      if (payload?.boom) throw new Error('falha determinística no evento 2');
      return { ok: true };
    },
  } as any;
  const svc = new WebwhatsOutboxConsumerService(prisma, messaging);

  const spy = mock.method(axios, 'request', async () => ({
    status: 200,
    data: { events: [{ id: 1, payload: {} }, { id: 2, payload: { boom: true } }, { id: 3, payload: {} }] },
  }));

  await runTick(svc);
  // Evento 1 OK → cursor=1. Evento 2 falha → para; 3 nem é tentado.
  assert.equal(prisma._state.cursor, 1n, 'cursor só avança até o último sucesso antes da falha');
  assert.equal(messaging.calls.length, 2, 'tentou 1 e 2, parou antes do 3');
  spy.mock.restore();
  clearMotorEnv();
});
