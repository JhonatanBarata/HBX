import test from 'node:test';
import assert from 'node:assert/strict';
import { RadarCnpjPublicSourceService } from './radar-cnpj-public-source.service';

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

function makeDatasetStub(records: any[]) {
  return { fetchRecords: async () => records } as any;
}

function makeProviderStub() {
  return {
    search: async (input: any) => ({
      status: 'completed',
      retryable: false,
      reason: 'ok',
      foundCount: (input.records || []).length,
      acceptedCount: (input.records || []).length,
      rejectedCount: 0,
      results: (input.records || []).map((r: any) => ({ cnpj: r.cnpj, name: r.nomeFantasia })),
    }),
  } as any;
}

test('dataset vazio + flag ON: chama discovery e usa o resultado dela', async () => {
  const original = process.env.HBX_RADAR_CNPJ_PUBLIC_ENABLED;
  const originalDiscovery = process.env.HBX_RADAR_CNPJ_DISCOVERY_ENABLED;
  process.env.HBX_RADAR_CNPJ_PUBLIC_ENABLED = 'true';
  process.env.HBX_RADAR_CNPJ_DISCOVERY_ENABLED = 'true';

  let discoveryCalled = false;
  const discoveryStub = {
    discover: async () => {
      discoveryCalled = true;
      return [{ cnpj: '11222333000181', nomeFantasia: 'Barbearia Nova', razaoSocial: 'Barbearia Nova Ltda' }];
    },
  } as any;

  const service = new RadarCnpjPublicSourceService(makeProviderStub(), makeDatasetStub([]), discoveryStub);
  const result = await service.run({ normalized: baseNormalized(), limit: 20, prisma: {} });

  assert.equal(discoveryCalled, true, 'discovery deveria ter sido chamado (dataset vazio + flag on)');
  assert.equal(result.foundCount, 1);
  assert.equal(result.acceptedCount, 1);
  assert.ok(result.reason?.includes('discovery_encontrou_1'), `reason deveria mencionar discovery: ${result.reason}`);

  if (original === undefined) delete process.env.HBX_RADAR_CNPJ_PUBLIC_ENABLED;
  else process.env.HBX_RADAR_CNPJ_PUBLIC_ENABLED = original;
  if (originalDiscovery === undefined) delete process.env.HBX_RADAR_CNPJ_DISCOVERY_ENABLED;
  else process.env.HBX_RADAR_CNPJ_DISCOVERY_ENABLED = originalDiscovery;
});

test('flag OFF: nao chama discovery mesmo com dataset vazio', async () => {
  const original = process.env.HBX_RADAR_CNPJ_PUBLIC_ENABLED;
  const originalDiscovery = process.env.HBX_RADAR_CNPJ_DISCOVERY_ENABLED;
  process.env.HBX_RADAR_CNPJ_PUBLIC_ENABLED = 'true';
  process.env.HBX_RADAR_CNPJ_DISCOVERY_ENABLED = 'false';

  let discoveryCalled = false;
  const discoveryStub = {
    discover: async () => {
      discoveryCalled = true;
      return [];
    },
  } as any;

  const service = new RadarCnpjPublicSourceService(makeProviderStub(), makeDatasetStub([]), discoveryStub);
  const result = await service.run({ normalized: baseNormalized(), limit: 20, prisma: {} });

  assert.equal(discoveryCalled, false, 'discovery NAO deveria ser chamado com a flag off');
  assert.equal(result.foundCount, 0);

  if (original === undefined) delete process.env.HBX_RADAR_CNPJ_PUBLIC_ENABLED;
  else process.env.HBX_RADAR_CNPJ_PUBLIC_ENABLED = original;
  if (originalDiscovery === undefined) delete process.env.HBX_RADAR_CNPJ_DISCOVERY_ENABLED;
  else process.env.HBX_RADAR_CNPJ_DISCOVERY_ENABLED = originalDiscovery;
});

test('discovery com erro: degrade gracioso, devolve so o dataset (nao derruba a fonte)', async () => {
  const original = process.env.HBX_RADAR_CNPJ_PUBLIC_ENABLED;
  const originalDiscovery = process.env.HBX_RADAR_CNPJ_DISCOVERY_ENABLED;
  process.env.HBX_RADAR_CNPJ_PUBLIC_ENABLED = 'true';
  process.env.HBX_RADAR_CNPJ_DISCOVERY_ENABLED = 'true';

  const datasetRecords = [{ cnpj: '64711048000190', nomeFantasia: 'Barbearia Dataset', razaoSocial: 'Barbearia Dataset Ltda' }];
  const discoveryStub = {
    discover: async () => {
      throw new Error('engine indisponivel');
    },
  } as any;

  const service = new RadarCnpjPublicSourceService(makeProviderStub(), makeDatasetStub(datasetRecords), discoveryStub);
  const result = await service.run({ normalized: baseNormalized(), limit: 20, prisma: {} });

  assert.equal(result.status, 'completed', 'falha do discovery nao deve virar partial_error da fonte inteira');
  assert.equal(result.foundCount, 1, 'deve seguir so com o dataset');
  assert.equal((result.results as any[])[0]?.cnpj, '64711048000190');

  if (original === undefined) delete process.env.HBX_RADAR_CNPJ_PUBLIC_ENABLED;
  else process.env.HBX_RADAR_CNPJ_PUBLIC_ENABLED = original;
  if (originalDiscovery === undefined) delete process.env.HBX_RADAR_CNPJ_DISCOVERY_ENABLED;
  else process.env.HBX_RADAR_CNPJ_DISCOVERY_ENABLED = originalDiscovery;
});

test('dataset indisponivel: marca partial_error e nao mascara a falha com discovery', async () => {
  const original = process.env.HBX_RADAR_CNPJ_PUBLIC_ENABLED;
  const originalDiscovery = process.env.HBX_RADAR_CNPJ_DISCOVERY_ENABLED;
  process.env.HBX_RADAR_CNPJ_PUBLIC_ENABLED = 'true';
  process.env.HBX_RADAR_CNPJ_DISCOVERY_ENABLED = 'true';
  let discoveryCalled = false;
  const dataset = { fetchRecords: async () => { throw new Error('delegate indisponivel'); } } as any;
  const discovery = { discover: async () => { discoveryCalled = true; return []; } } as any;
  const service = new RadarCnpjPublicSourceService(makeProviderStub(), dataset, discovery);

  const result = await service.run({ normalized: baseNormalized(), limit: 20, prisma: {} });

  assert.equal(result.status, 'partial_error');
  assert.equal(result.retryable, true);
  assert.equal(discoveryCalled, false);
  assert.match(String(result.reason), /delegate indisponivel/);

  if (original === undefined) delete process.env.HBX_RADAR_CNPJ_PUBLIC_ENABLED;
  else process.env.HBX_RADAR_CNPJ_PUBLIC_ENABLED = original;
  if (originalDiscovery === undefined) delete process.env.HBX_RADAR_CNPJ_DISCOVERY_ENABLED;
  else process.env.HBX_RADAR_CNPJ_DISCOVERY_ENABLED = originalDiscovery;
});

test('merge dedup por cnpj: dataset primeiro, discovery so completa (sem duplicar)', async () => {
  const original = process.env.HBX_RADAR_CNPJ_PUBLIC_ENABLED;
  const originalDiscovery = process.env.HBX_RADAR_CNPJ_DISCOVERY_ENABLED;
  process.env.HBX_RADAR_CNPJ_PUBLIC_ENABLED = 'true';
  process.env.HBX_RADAR_CNPJ_DISCOVERY_ENABLED = 'true';

  const sharedCnpj = '11222333000181';
  const datasetRecords = [{ cnpj: sharedCnpj, nomeFantasia: 'Ja No Dataset', razaoSocial: 'Ja No Dataset Ltda' }];
  const discoveryStub = {
    discover: async () => [
      { cnpj: sharedCnpj, nomeFantasia: 'Duplicado Via Discovery', razaoSocial: 'Duplicado Ltda' },
      { cnpj: '64711048000190', nomeFantasia: 'Novo Via Discovery', razaoSocial: 'Novo Ltda' },
    ],
  } as any;

  const service = new RadarCnpjPublicSourceService(makeProviderStub(), makeDatasetStub(datasetRecords), discoveryStub);
  const result = await service.run({ normalized: baseNormalized(), limit: 20, prisma: {} });

  assert.equal(result.foundCount, 2, 'deve ter 2 registros unicos (1 dataset + 1 novo do discovery, sem duplicar o compartilhado)');
  const cnpjs = (result.results as any[]).map((r) => r.cnpj).sort();
  assert.deepEqual(cnpjs, ['11222333000181', '64711048000190'].sort());

  if (original === undefined) delete process.env.HBX_RADAR_CNPJ_PUBLIC_ENABLED;
  else process.env.HBX_RADAR_CNPJ_PUBLIC_ENABLED = original;
  if (originalDiscovery === undefined) delete process.env.HBX_RADAR_CNPJ_DISCOVERY_ENABLED;
  else process.env.HBX_RADAR_CNPJ_DISCOVERY_ENABLED = originalDiscovery;
});
