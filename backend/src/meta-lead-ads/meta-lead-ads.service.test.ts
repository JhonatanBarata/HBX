import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'crypto';
import { MetaLeadAdsService } from './meta-lead-ads.service';
import { mapMetaLeadFields } from './meta-graph.client';

function buildService() {
  return new MetaLeadAdsService(null as any, null as any, null as any, null as any, null as any);
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
