import test from 'node:test';
import assert from 'node:assert/strict';
import { RadarCountService, RADAR_COUNT_CEILING } from './radar-count.service';

function makeCnpjBaseQueryMock(opts: { available?: boolean; count?: number | null; throwError?: boolean; captureInput?: (input: any) => void } = {}) {
  return {
    countBase: async (input: any) => {
      opts.captureInput?.(input);
      if (opts.throwError) throw new Error('boom');
      return { available: opts.available ?? true, count: opts.count === undefined ? 0 : opts.count };
    },
  } as any;
}

test('count: contrato exato { available, count } — reusa CnpjBaseQueryService.countBase', async () => {
  const mock = makeCnpjBaseQueryMock({ available: true, count: 42 });
  const service = new RadarCountService(mock);

  const result = await service.count({ uf: 'SP' });
  assert.deepEqual(result, { available: true, count: 42 });
});

test('count: sem base carregada no ambiente -> { available:false, count:null } (degrade, nunca lanca)', async () => {
  const mock = makeCnpjBaseQueryMock({ available: false, count: null });
  const service = new RadarCountService(mock);

  const result = await service.count({ uf: 'SP' });
  assert.deepEqual(result, { available: false, count: null });
});

test('count: countBase lanca erro -> degrada pra available:false/count:null (NUNCA propaga)', async () => {
  const mock = makeCnpjBaseQueryMock({ throwError: true });
  const service = new RadarCountService(mock);

  const result = await service.count({ uf: 'SP' });
  assert.deepEqual(result, { available: false, count: null });
});

test('count: acima do teto devolve RADAR_COUNT_CEILING + approx:true (nunca o numero exato)', async () => {
  const mock = makeCnpjBaseQueryMock({ available: true, count: 1_500_000 });
  const service = new RadarCountService(mock);

  const result = await service.count({ situacao: ['ativa'] });
  assert.equal(result.available, true);
  assert.equal(result.count, RADAR_COUNT_CEILING);
  assert.equal(result.approx, true);
});

test('count: exatamente no teto NAO marca approx (so acima estoura)', async () => {
  const mock = makeCnpjBaseQueryMock({ available: true, count: RADAR_COUNT_CEILING });
  const service = new RadarCountService(mock);

  const result = await service.count({ uf: 'SP' });
  assert.equal(result.count, RADAR_COUNT_CEILING);
  assert.equal(result.approx, undefined);
});

test('count: abaixo do teto devolve numero exato, sem approx', async () => {
  const mock = makeCnpjBaseQueryMock({ available: true, count: 1243 });
  const service = new RadarCountService(mock);

  const result = await service.count({ uf: 'SP', city: 'Campinas' });
  assert.deepEqual(result, { available: true, count: 1243 });
});

test('count: NUNCA devolve amostra/contato — so as chaves available/count(/approx)', async () => {
  const mock = makeCnpjBaseQueryMock({ available: true, count: 10 });
  const service = new RadarCountService(mock);

  const result: any = await service.count({ uf: 'SP' });
  const keys = Object.keys(result).sort();
  assert.deepEqual(keys, ['available', 'count'].sort());
});

test('count: delega o mapeamento whitelist pro util (campo nao-whitelisted nao vaza pro WHERE)', async () => {
  let captured: any = null;
  const mock = makeCnpjBaseQueryMock({
    available: true,
    count: 5,
    captureInput: (input) => { captured = input; },
  });
  const service = new RadarCountService(mock);

  await service.count({
    uf: 'SP',
    city: 'Campinas',
    segment: 'Padarias',
    porte: ['ME'],
    situacao: ['ativa'],
    contato: { temTelefone: true, temEmail: true },
    ...({ donoConhecido: true, capitalMin: 1 } as any),
  });

  assert.deepEqual(captured.states, ['SP']);
  assert.deepEqual(captured.cities, ['Campinas']);
  assert.equal(captured.keyword, 'Padarias');
  assert.deepEqual(captured.porte, ['ME']);
  assert.deepEqual(captured.situacoes, ['ativa']);
  assert.equal(captured.contato.comTelefone, true);
  assert.equal(captured.contato.comEmail, true);
  assert.equal(captured.donoConhecido, undefined);
  assert.equal(captured.capitalMin, undefined);
});
