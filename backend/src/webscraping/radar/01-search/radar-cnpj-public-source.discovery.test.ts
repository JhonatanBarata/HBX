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
      results: (input.records || []).map((record: any) => ({
        cnpj: record.cnpj,
        name: record.nomeFantasia,
      })),
    }),
  } as any;
}

test('fonte RFB usa exclusivamente o dataset local carregado', async () => {
  const records = [
    { cnpj: '11222333000181', nomeFantasia: 'Barbearia Nova', razaoSocial: 'Barbearia Nova Ltda' },
  ];
  const service = new RadarCnpjPublicSourceService(makeProviderStub(), makeDatasetStub(records));

  const result = await service.run({ normalized: baseNormalized(), limit: 20, prisma: {} });

  assert.equal(result.status, 'completed');
  assert.equal(result.foundCount, 1);
  assert.equal((result.results as any[])[0]?.cnpj, '11222333000181');
});

test('dataset RFB vazio não dispara descoberta web nem fallback externo', async () => {
  let providerCalls = 0;
  const provider = {
    search: async () => {
      providerCalls += 1;
      return { status: 'completed', retryable: false, reason: 'ok', foundCount: 0, acceptedCount: 0, rejectedCount: 0, results: [] };
    },
  } as any;
  const service = new RadarCnpjPublicSourceService(provider, makeDatasetStub([]));

  const result = await service.run({ normalized: baseNormalized(), limit: 20, prisma: {} });

  assert.equal(result.foundCount, 0);
  assert.equal(providerCalls, 1);
  assert.deepEqual(result.results, []);
});

test('flag legada não desliga a fonte RFB obrigatória', async () => {
  const original = process.env.HBX_RADAR_CNPJ_PUBLIC_ENABLED;
  process.env.HBX_RADAR_CNPJ_PUBLIC_ENABLED = 'false';
  try {
    const service = new RadarCnpjPublicSourceService(
      makeProviderStub(),
      makeDatasetStub([{ cnpj: '64711048000190', nomeFantasia: 'Empresa RFB' }]),
    );
    const result = await service.run({ normalized: baseNormalized(), limit: 20, prisma: {} });
    assert.equal(result.foundCount, 1);
  } finally {
    if (original === undefined) delete process.env.HBX_RADAR_CNPJ_PUBLIC_ENABLED;
    else process.env.HBX_RADAR_CNPJ_PUBLIC_ENABLED = original;
  }
});
