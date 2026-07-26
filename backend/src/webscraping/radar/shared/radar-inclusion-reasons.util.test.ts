import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRadarLeadInclusionReasons } from './radar-inclusion-reasons.util';

test('inclusionReasons: cnpj_public com segmento pedido usa cnae_compativel', () => {
  const reasons = buildRadarLeadInclusionReasons({
    requestedSegment: 'distribuidora',
    sourceEngine: 'cnpj_public',
  });
  assert.ok(reasons.includes('cnae_compativel'));
  assert.ok(!reasons.includes('nome_combina_segmento'));
});

test('inclusionReasons: lane web com segmento pedido usa nome_combina_segmento', () => {
  const reasons = buildRadarLeadInclusionReasons({
    requestedSegment: 'distribuidora',
    sourceEngine: 'hbx_scraping:free_pj',
  });
  assert.ok(reasons.includes('nome_combina_segmento'));
});

test('inclusionReasons: sem segmento pedido usa sem_segmento_pedido', () => {
  const reasons = buildRadarLeadInclusionReasons({ requestedSegment: '' });
  assert.deepEqual(reasons, ['sem_segmento_pedido']);
});

test('inclusionReasons: cidade/UF batendo entra cidade_uf_ok', () => {
  const reasons = buildRadarLeadInclusionReasons({
    requestedCity: 'Fortaleza',
    requestedState: 'CE',
    resultCity: 'Fortaleza',
    resultState: 'CE',
  });
  assert.ok(reasons.includes('cidade_uf_ok'));
});

test('inclusionReasons: contato e fontes somam sinais positivos', () => {
  const reasons = buildRadarLeadInclusionReasons({
    phoneDigits: '85999998888',
    whatsappStatus: 'confirmed',
    website: 'https://exemplo.com.br',
    sourceEngines: ['cnpj_public', 'google'],
  });
  assert.ok(reasons.includes('telefone_presente'));
  assert.ok(reasons.includes('whatsapp_confirmado'));
  assert.ok(reasons.includes('website_proprio'));
  assert.ok(reasons.includes('multiplas_fontes'));
});
