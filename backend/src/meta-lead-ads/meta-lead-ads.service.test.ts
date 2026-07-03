import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'crypto';
import { MetaLeadAdsService } from './meta-lead-ads.service';
import { mapMetaLeadFields } from './meta-graph.client';

function buildService() {
  return new MetaLeadAdsService(null as any, null as any, null as any, null as any, null as any);
}

// Ledger fake que registra chamadas e simula dedup (recordReceived devolve duplicate=true
// para eventId já visto). Usado nos testes de webhook-só-recebe (ARQ11 S1).
function makeLedgerFake() {
  const received: any[] = [];
  const rejected: any[] = [];
  const seen = new Set<string>();
  return {
    received,
    rejected,
    async recordReceived(provider: string, eventId: string, payload: any, options: any) {
      received.push({ provider, eventId, payload, options });
      const key = `${provider}:${eventId}`;
      const duplicate = seen.has(key);
      seen.add(key);
      return { eventId, duplicate };
    },
    async markRejected(provider: string, eventId: string, status: string) {
      rejected.push({ provider, eventId, status });
      return { eventId, status: 'rejected' };
    },
    async wasProcessed() { return false; },
    async markProcessed() { return null; },
  } as any;
}

// Prisma fake com só a metaLeadConnection.findUnique que o webhook usa para resolver companyId.
function makePrismaFake(connectionByPageId: Record<string, any> = {}) {
  return {
    metaLeadConnection: {
      async findUnique({ where }: any) {
        return connectionByPageId[where?.pageId] || null;
      },
      async update() { return null; },
    },
  } as any;
}

// Graph fake que EXPLODE se alguém chamar fetchLead dentro do webhook (não pode acontecer no S1).
function makeGraphSpy() {
  const calls: string[] = [];
  return {
    calls,
    async fetchLead(id: string) { calls.push(id); return null; },
    async subscribePage() { return { subscribed: true }; },
  } as any;
}

test('verifyHandshake devolve o challenge com o token certo', () => {
  process.env.META_VERIFY_TOKEN = 'token-secreto';
  const service = buildService();
  const challenge = service.verifyHandshake({
    'hub.mode': 'subscribe',
    'hub.verify_token': 'token-secreto',
    'hub.challenge': '1234567890',
  });
  assert.equal(challenge, '1234567890');
});

test('verifyHandshake rejeita token errado', () => {
  process.env.META_VERIFY_TOKEN = 'token-secreto';
  const service = buildService();
  const challenge = service.verifyHandshake({
    'hub.mode': 'subscribe',
    'hub.verify_token': 'errado',
    'hub.challenge': '1234567890',
  });
  assert.equal(challenge, null);
});

test('verifySignature valida HMAC-SHA256 do corpo cru', () => {
  process.env.META_APP_SECRET = 'app-secret-de-teste';
  const service = buildService();
  const rawBody = Buffer.from(JSON.stringify({ object: 'page', entry: [] }));
  const signature = `sha256=${createHmac('sha256', 'app-secret-de-teste').update(rawBody).digest('hex')}`;
  assert.equal(service.verifySignature(rawBody, signature), true);
  assert.equal(service.verifySignature(rawBody, 'sha256=deadbeef'), false);
  assert.equal(service.verifySignature(rawBody, undefined), false);
});

test('verifySignature fail-closed sem app secret', () => {
  delete process.env.META_APP_SECRET;
  const service = buildService();
  const rawBody = Buffer.from('{}');
  assert.equal(service.verifySignature(rawBody, 'sha256=qualquer'), false);
});

test('extractLeadgenChanges extrai page_id e leadgen_id', () => {
  const service = buildService();
  const changes = service.extractLeadgenChanges({
    object: 'page',
    entry: [
      {
        id: 'page-123',
        changes: [
          { field: 'leadgen', value: { leadgen_id: 'lead-abc', page_id: 'page-123', form_id: 'form-9' } },
          { field: 'feed', value: { post_id: 'x' } },
        ],
      },
    ],
  });
  assert.equal(changes.length, 1);
  assert.equal(changes[0].pageId, 'page-123');
  assert.equal(changes[0].leadgenId, 'lead-abc');
  assert.equal(changes[0].formId, 'form-9');
});

test('extractLeadgenChanges ignora payload que não é de página', () => {
  const service = buildService();
  assert.equal(service.extractLeadgenChanges({ object: 'instagram', entry: [] }).length, 0);
  assert.equal(service.extractLeadgenChanges(null).length, 0);
});

test('mapMetaLeadFields mapeia nome, telefone e e-mail (inclui variantes pt)', () => {
  const mapped = mapMetaLeadFields([
    { name: 'full_name', values: ['Maria Silva'] },
    { name: 'phone_number', values: ['+55 11 99999-0000'] },
    { name: 'email', values: ['maria@exemplo.com'] },
    { name: 'cidade', values: ['Campinas'] },
  ]);
  assert.equal(mapped.name, 'Maria Silva');
  assert.equal(mapped.phone, '+55 11 99999-0000');
  assert.equal(mapped.email, 'maria@exemplo.com');
  assert.equal(mapped.city, 'Campinas');
});

test('mapMetaLeadFields monta nome a partir de first/last quando não há full_name', () => {
  const mapped = mapMetaLeadFields([
    { name: 'first_name', values: ['João'] },
    { name: 'last_name', values: ['Souza'] },
    { name: 'telefone', values: ['11988887777'] },
  ]);
  assert.equal(mapped.name, 'João Souza');
  assert.equal(mapped.phone, '11988887777');
  assert.equal(mapped.email, null);
});

// ---- ARQ11 S1: webhook SÓ RECEBE (nenhuma chamada Graph no handler) ----

function signedBody(body: any, secret = 'app-secret-de-teste') {
  process.env.META_APP_SECRET = secret;
  const rawBody = Buffer.from(JSON.stringify(body));
  const signatureHeader = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  return { rawBody, signatureHeader };
}

test('processWebhook só ENFILEIRA: grava o payload e NÃO chama a Graph', async () => {
  const ledger = makeLedgerFake();
  const prisma = makePrismaFake({ 'page-1': { id: 'c1', companyId: 7, status: 'active' } });
  const graph = makeGraphSpy();
  const service = new MetaLeadAdsService(prisma, ledger, null as any, graph, null as any);

  const body = {
    object: 'page',
    entry: [{ id: 'page-1', changes: [{ field: 'leadgen', value: { leadgen_id: 'lead-1', page_id: 'page-1', form_id: 'form-1' } }] }],
  };
  const { rawBody, signatureHeader } = signedBody(body);
  const result = await service.processWebhook({ rawBody, signatureHeader, body });

  assert.equal(result.ok, true);
  assert.equal(result.received, 1);
  assert.equal(result.enqueued, 1);
  assert.equal(result.duplicates, 0);
  assert.equal(graph.calls.length, 0, 'o webhook NÃO pode chamar a Graph (só o worker chama)');
  // Payload COMPLETO do change guardado para replay:
  assert.equal(ledger.received.length, 1);
  assert.equal(ledger.received[0].eventId, 'lead-1');
  assert.equal(ledger.received[0].payload.leadgenId, 'lead-1');
  assert.equal(ledger.received[0].options.companyId, 7);
  assert.equal(ledger.received[0].options.eventType, 'leadgen');
});

test('processWebhook: assinatura inválida vira markRejected e não enfileira', async () => {
  const ledger = makeLedgerFake();
  const service = new MetaLeadAdsService(makePrismaFake(), ledger, null as any, makeGraphSpy(), null as any);
  process.env.META_APP_SECRET = 'app-secret-de-teste';

  const body = { object: 'page', entry: [] };
  const rawBody = Buffer.from(JSON.stringify(body));
  const result = await service.processWebhook({ rawBody, signatureHeader: 'sha256=deadbeef', body });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid_signature');
  assert.equal(ledger.rejected.length, 1, 'assinatura inválida deixa rastro (markRejected)');
  assert.equal(ledger.rejected[0].status, 'invalid');
});

test('processWebhook: reentrega do mesmo leadgen_id conta como duplicata (corrida fechada)', async () => {
  const ledger = makeLedgerFake();
  const prisma = makePrismaFake({ 'page-1': { id: 'c1', companyId: 7, status: 'active' } });
  const service = new MetaLeadAdsService(prisma, ledger, null as any, makeGraphSpy(), null as any);

  const body = {
    object: 'page',
    entry: [{ id: 'page-1', changes: [{ field: 'leadgen', value: { leadgen_id: 'dup-1', page_id: 'page-1' } }] }],
  };
  const { rawBody, signatureHeader } = signedBody(body);

  const first = await service.processWebhook({ rawBody, signatureHeader, body });
  const second = await service.processWebhook({ rawBody, signatureHeader, body });
  assert.equal(first.enqueued, 1);
  assert.equal(first.duplicates, 0);
  assert.equal(second.enqueued, 0);
  assert.equal(second.duplicates, 1);
});

// ---- ARQ11 S1: subscribe-webhook (assinar a página) ----

test('subscribeConnectionWebhook: sucesso grava webhookSubscribedAt e devolve contrato fixo', async () => {
  const updates: any[] = [];
  const secrets = { decryptSecret: (c: string) => (c === 'CIPHER' ? 'plain-token' : null) } as any;
  const prisma = {
    metaLeadConnection: {
      async findUnique({ where }: any) {
        return where?.id === 'c1' ? { id: 'c1', companyId: 7, pageId: 'page-1', accessTokenCiphertext: 'CIPHER' } : null;
      },
      async update({ data }: any) { updates.push(data); return null; },
    },
    user: { async findFirst() { return null; } },
  } as any;
  const graph = { async subscribePage() { return { subscribed: true }; } } as any;
  const service = new MetaLeadAdsService(prisma, null as any, secrets, graph, null as any);

  const out = await service.subscribeConnectionWebhook({ role: 'ADMIN', companyId: 7 }, 'c1');
  assert.deepEqual(out, { subscribed: true });
  assert.equal(updates.length, 1);
  assert.ok(updates[0].webhookSubscribedAt instanceof Date);
});

test('subscribeConnectionWebhook: falha da Graph propaga { subscribed:false, error } e não grava data', async () => {
  const updates: any[] = [];
  const secrets = { decryptSecret: () => 'plain-token' } as any;
  const prisma = {
    metaLeadConnection: {
      async findUnique() { return { id: 'c1', companyId: 7, pageId: 'page-1', accessTokenCiphertext: 'CIPHER' }; },
      async update({ data }: any) { updates.push(data); return null; },
    },
  } as any;
  const graph = { async subscribePage() { return { subscribed: false, error: 'token inválido' }; } } as any;
  const service = new MetaLeadAdsService(prisma, null as any, secrets, graph, null as any);

  const out = await service.subscribeConnectionWebhook({ role: 'ADMIN', companyId: 7 }, 'c1');
  assert.deepEqual(out, { subscribed: false, error: 'token inválido' });
  assert.equal(updates.length, 0, 'não marca assinado quando a Graph recusa');
});
