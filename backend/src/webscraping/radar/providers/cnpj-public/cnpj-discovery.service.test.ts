import test from 'node:test';
import assert from 'node:assert/strict';
import { CnpjDiscoveryService, extractValidCnpjsFromText, isCnpjDiscoveryEnabled } from './cnpj-discovery.service';
import { RadarCnpjL4EnrichmentService } from '../../03-enrichment/radar-cnpj-l4-enrichment.service';

const VALID_CNPJ = '11222333000181'; // DV valido (mod-11 classico, mesmo usado nos outros testes do radar)
const VALID_CNPJ_2 = '64711048000190'; // DV valido, real (cnpj.biz costuma expor no path)

test('extractValidCnpjsFromText: extrai CNPJ com mascara', () => {
  const text = `Padaria Central - CNPJ 11.222.333/0001-81 - Fortaleza/CE`;
  assert.deepEqual(extractValidCnpjsFromText(text), [VALID_CNPJ]);
});

test('extractValidCnpjsFromText: extrai CNPJ sem mascara', () => {
  const text = `padaria central 11222333000181 fortaleza`;
  assert.deepEqual(extractValidCnpjsFromText(text), [VALID_CNPJ]);
});

test('extractValidCnpjsFromText: extrai CNPJ na URL (estilo cnpj.biz)', () => {
  const text = `https://cnpj.biz/64711048000190`;
  assert.deepEqual(extractValidCnpjsFromText(text), [VALID_CNPJ_2]);
});

test('extractValidCnpjsFromText: rejeita CNPJ com DV invalido', () => {
  const text = `CNPJ 11.222.333/0001-80 invalido`;
  assert.deepEqual(extractValidCnpjsFromText(text), []);
});

test('extractValidCnpjsFromText: dedup quando o mesmo CNPJ aparece mascarado e solto', () => {
  const text = `11.222.333/0001-81 ... texto ... 11222333000181`;
  assert.deepEqual(extractValidCnpjsFromText(text), [VALID_CNPJ]);
});

test('extractValidCnpjsFromText: multiplos CNPJs validos distintos', () => {
  const text = `11.222.333/0001-81 e tambem 64711048000190`;
  const found = extractValidCnpjsFromText(text);
  assert.equal(found.length, 2);
  assert.ok(found.includes(VALID_CNPJ));
  assert.ok(found.includes(VALID_CNPJ_2));
});

test('isCnpjDiscoveryEnabled: default false', () => {
  const original = process.env.HBX_RADAR_CNPJ_DISCOVERY_ENABLED;
  delete process.env.HBX_RADAR_CNPJ_DISCOVERY_ENABLED;
  assert.equal(isCnpjDiscoveryEnabled(), false);
  if (original !== undefined) process.env.HBX_RADAR_CNPJ_DISCOVERY_ENABLED = original;
});

test('isCnpjDiscoveryEnabled: true quando env=true', () => {
  const original = process.env.HBX_RADAR_CNPJ_DISCOVERY_ENABLED;
  process.env.HBX_RADAR_CNPJ_DISCOVERY_ENABLED = 'true';
  assert.equal(isCnpjDiscoveryEnabled(), true);
  if (original === undefined) delete process.env.HBX_RADAR_CNPJ_DISCOVERY_ENABLED;
  else process.env.HBX_RADAR_CNPJ_DISCOVERY_ENABLED = original;
});

function baseNormalized() {
  return {
    city: 'Goiania',
    state: 'GO',
    segment: 'barbearia',
    radiusKm: 0,
    originLat: null,
    originLng: null,
    regionalCities: [],
    quantity: 10,
    engine: 'hbx',
    targetType: 'pj',
    filters: { minRating: null, minReviews: null, onlyWithWebsite: false },
    filtersJson: '{}',
    searchSignature: 'sig',
    cacheSignature: 'cache',
    normalizedCity: 'goiania',
    normalizedSegment: 'barbearia',
    excludePhoneDigits: [],
    salesProfile: null,
    preferredChannels: [],
    requiredChannels: [],
    channelMatchMode: 'prefer',
    freshness: 'live',
  } as any;
}

test('discover: cap HBX_RADAR_CNPJ_DISCOVERY_MAX_LOOKUPS respeitado (nao chama lookup alem do cap)', async () => {
  const originalFetch = globalThis.fetch;
  const originalMaxLookups = process.env.HBX_RADAR_CNPJ_DISCOVERY_MAX_LOOKUPS;
  const originalQueries = process.env.HBX_RADAR_CNPJ_DISCOVERY_QUERIES;
  process.env.HBX_RADAR_CNPJ_DISCOVERY_MAX_LOOKUPS = '1';
  process.env.HBX_RADAR_CNPJ_DISCOVERY_QUERIES = '3';

  // 3 CNPJs validos distintos no mesmo resultado de busca — cap=1 deve travar em 1 lookup.
  const cnpjA = '11222333000181';
  const cnpjB = '64711048000190';
  (globalThis as any).fetch = async () => ({
    ok: true,
    json: async () => ({
      query: 'x',
      count: 1,
      results: [{ title: `Empresa A ${cnpjA} Empresa B ${cnpjB}`, url: 'https://x.com', snippet: '' }],
    }),
  });

  let lookupCalls = 0;
  const l4Stub = {
    lookup: async (_prisma: any, cnpj: string) => {
      lookupCalls += 1;
      return { found: true, cnpj, razaoSocial: `Razao ${cnpj}` } as any;
    },
  } as unknown as RadarCnpjL4EnrichmentService;

  const service = new CnpjDiscoveryService(l4Stub);
  const result = await service.discover({ normalized: baseNormalized(), needed: 10, prisma: {} });

  assert.equal(lookupCalls, 1, 'cap deve limitar a 1 chamada de lookup');
  assert.equal(result.length, 1);

  (globalThis as any).fetch = originalFetch;
  if (originalMaxLookups === undefined) delete process.env.HBX_RADAR_CNPJ_DISCOVERY_MAX_LOOKUPS;
  else process.env.HBX_RADAR_CNPJ_DISCOVERY_MAX_LOOKUPS = originalMaxLookups;
  if (originalQueries === undefined) delete process.env.HBX_RADAR_CNPJ_DISCOVERY_QUERIES;
  else process.env.HBX_RADAR_CNPJ_DISCOVERY_QUERIES = originalQueries;
});

test('discover: budget estourado devolve parcial (nao quebra, so para de processar)', async () => {
  const originalFetch = globalThis.fetch;
  const originalBudget = process.env.HBX_RADAR_CNPJ_DISCOVERY_BUDGET_MS;
  const originalQueries = process.env.HBX_RADAR_CNPJ_DISCOVERY_QUERIES;
  // Budget zerado: timeLeft() <= 0 já na primeira iteração -> nenhuma query é feita.
  process.env.HBX_RADAR_CNPJ_DISCOVERY_BUDGET_MS = '0';
  process.env.HBX_RADAR_CNPJ_DISCOVERY_QUERIES = '3';

  let fetchCalls = 0;
  (globalThis as any).fetch = async () => {
    fetchCalls += 1;
    return { ok: true, json: async () => ({ results: [] }) };
  };

  const l4Stub = {
    lookup: async () => null,
  } as unknown as RadarCnpjL4EnrichmentService;

  const service = new CnpjDiscoveryService(l4Stub);
  const result = await service.discover({ normalized: baseNormalized(), needed: 10, prisma: {} });

  assert.deepEqual(result, [], 'budget zerado deve devolver array vazio sem lancar excecao');
  assert.equal(fetchCalls, 0, 'budget ja estourado nao deve nem chamar a busca web');

  (globalThis as any).fetch = originalFetch;
  if (originalBudget === undefined) delete process.env.HBX_RADAR_CNPJ_DISCOVERY_BUDGET_MS;
  else process.env.HBX_RADAR_CNPJ_DISCOVERY_BUDGET_MS = originalBudget;
  if (originalQueries === undefined) delete process.env.HBX_RADAR_CNPJ_DISCOVERY_QUERIES;
  else process.env.HBX_RADAR_CNPJ_DISCOVERY_QUERIES = originalQueries;
});

test('discover: lookup que devolve null (404/invalido) e ignorado, nao quebra o discovery', async () => {
  const originalFetch = globalThis.fetch;
  const cnpjOk = '11222333000181';
  const cnpjMiss = '64711048000190';
  (globalThis as any).fetch = async () => ({
    ok: true,
    json: async () => ({
      results: [{ title: `${cnpjOk} ${cnpjMiss}`, url: '', snippet: '' }],
    }),
  });

  const l4Stub = {
    lookup: async (_prisma: any, cnpj: string) => {
      if (cnpj === cnpjMiss) return null; // simula 404
      return { found: true, cnpj, razaoSocial: 'Razao Ok' } as any;
    },
  } as unknown as RadarCnpjL4EnrichmentService;

  const service = new CnpjDiscoveryService(l4Stub);
  const result = await service.discover({ normalized: baseNormalized(), needed: 10, prisma: {} });

  assert.equal(result.length, 1);
  assert.equal(result[0].cnpj, cnpjOk);

  (globalThis as any).fetch = originalFetch;
});

test('discover: sem segmento/cidade nao gera queries -> devolve vazio sem chamar fetch', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  (globalThis as any).fetch = async () => {
    fetchCalls += 1;
    return { ok: true, json: async () => ({ results: [] }) };
  };

  const l4Stub = { lookup: async () => null } as unknown as RadarCnpjL4EnrichmentService;
  const service = new CnpjDiscoveryService(l4Stub);
  const normalized = { ...baseNormalized(), city: '', segment: '' };
  const result = await service.discover({ normalized, needed: 10, prisma: {} });

  assert.deepEqual(result, []);
  assert.equal(fetchCalls, 0);

  (globalThis as any).fetch = originalFetch;
});
