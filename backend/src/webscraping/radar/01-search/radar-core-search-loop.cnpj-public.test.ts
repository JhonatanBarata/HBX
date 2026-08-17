import test from 'node:test';
import assert from 'node:assert/strict';
import { RadarCoreSearchLoopMixin } from './radar-core-search-loop.mixin';

// Instancia o mixin isolado e injeta os stubs que o bloco aditivo de fonte Receita
// (cnpj_public soldada no run de cliente) usa: getRadarCnpjPublicSource, saveSearchRunResults,
// prisma e logger. Espelha o padrão de radar-core-factory-admin.abandon.test.ts.
//
// LOTE 2 (17/08 — PR17082026): o estado da drenagem deixou de morar num Map de processo e passou
// a viver no `metricsJson` do run (durável, sobrevive ao restart do publish). Por isso o stub
// agora precisa de um metricsJson DE VERDADE: `updateSearchRunMetrics` grava e o findUnique do
// prisma devolve — igual ao repositório real, que faz `{...rawMetrics, ...patch}`. Sem esse
// espelho, seca gravada num lote não seria vista no lote seguinte.
function makeLoop(sourceRunImpl: (input: any) => Promise<any>) {
  const instance: any = new (RadarCoreSearchLoopMixin as any)();
  const logs: string[] = [];
  const warns: string[] = [];
  instance.logger = {
    log: (msg: string) => logs.push(msg),
    warn: (msg: string) => warns.push(msg),
  };
  const metricasPorRun = new Map<string, Record<string, any>>();
  instance.updateSearchRunMetrics = async (runId: string, patch: Record<string, any>) => {
    const atual = metricasPorRun.get(runId) || {};
    const { increment: _increment, ...semIncrement } = patch || {};
    metricasPorRun.set(runId, { ...atual, ...semIncrement });
    return metricasPorRun.get(runId);
  };
  instance.prisma = {
    webscrapingSearchRun: {
      findUnique: async ({ where }: any) => ({
        metricsJson: JSON.stringify(metricasPorRun.get(where?.id) || {}),
      }),
    },
  };
  const savedCalls: any[] = [];
  instance.saveSearchRunResults = async (
    _context: any,
    _normalized: any,
    _runId: string,
    results: any[],
    source: string,
  ) => {
    savedCalls.push({ results, source });
    return { found: results.length, duplicate: 0, skipped: 0, invalid: 0 };
  };
  let sourceInstantiated = false;
  instance.getRadarCnpjPublicSource = () => {
    sourceInstantiated = true;
    return { run: sourceRunImpl };
  };
  return {
    instance,
    logs,
    warns,
    savedCalls,
    metricasPorRun,
    wasSourceInstantiated: () => sourceInstantiated,
  };
}

function baseNormalized(overrides: any = {}) {
  return {
    city: 'Goiania',
    state: 'GO',
    segment: 'barbearia',
    quantity: 10,
    engine: 'hbx',
    targetType: 'pj',
    ...overrides,
  } as any;
}

function withFlag(value: string | undefined, fn: () => Promise<void>) {
  const original = process.env.HBX_RADAR_CNPJ_PUBLIC_ENABLED;
  if (value === undefined) delete process.env.HBX_RADAR_CNPJ_PUBLIC_ENABLED;
  else process.env.HBX_RADAR_CNPJ_PUBLIC_ENABLED = value;
  return fn().finally(() => {
    if (original === undefined) delete process.env.HBX_RADAR_CNPJ_PUBLIC_ENABLED;
    else process.env.HBX_RADAR_CNPJ_PUBLIC_ENABLED = original;
  });
}

test('flag ON + pj + fonte devolve 2 records: saveSearchRunResults chamado com source cnpj_public', async () => {
  await withFlag('true', async () => {
    const { instance, savedCalls, wasSourceInstantiated } = makeLoop(async () => ({
      source: 'cnpj_public',
      status: 'completed',
      retryable: false,
      foundCount: 2,
      acceptedCount: 2,
      rejectedCount: 0,
      reason: 'ok',
      results: [{ cnpj: '11222333000181', name: 'A' }, { cnpj: '64711048000190', name: 'B' }],
    }));

    await instance.runCnpjPublicSourceForClientRunIfEligible(
      { companyId: 'c1' },
      baseNormalized(),
      'run-1',
      10,
    );

    assert.equal(wasSourceInstantiated(), true);
    assert.equal(savedCalls.length, 1);
    assert.equal(savedCalls[0].source, 'cnpj_public');
    assert.equal(savedCalls[0].results.length, 2);
  });
});

test('flag OFF: fonte nem instanciada', async () => {
  await withFlag('false', async () => {
    const { instance, savedCalls, wasSourceInstantiated } = makeLoop(async () => {
      throw new Error('nao deveria ser chamado');
    });

    await instance.runCnpjPublicSourceForClientRunIfEligible(
      { companyId: 'c1' },
      baseNormalized(),
      'run-2',
      10,
    );

    assert.equal(wasSourceInstantiated(), false);
    assert.equal(savedCalls.length, 0);
  });
});

test('targetType diferente de pj: fonte nem instanciada mesmo com flag ON', async () => {
  await withFlag('true', async () => {
    const { instance, wasSourceInstantiated } = makeLoop(async () => {
      throw new Error('nao deveria ser chamado');
    });

    await instance.runCnpjPublicSourceForClientRunIfEligible(
      { companyId: 'c1' },
      baseNormalized({ targetType: 'people' }),
      'run-3',
      10,
    );

    assert.equal(wasSourceInstantiated(), false);
  });
});

test('run ja no alvo (remainingQuantity=0): fonte nem instanciada', async () => {
  await withFlag('true', async () => {
    const { instance, wasSourceInstantiated } = makeLoop(async () => {
      throw new Error('nao deveria ser chamado');
    });

    await instance.runCnpjPublicSourceForClientRunIfEligible(
      { companyId: 'c1' },
      baseNormalized(),
      'run-4',
      0,
    );

    assert.equal(wasSourceInstantiated(), false);
  });
});

test('fonte lancando erro: nao propaga (batch do engine segue intacto)', async () => {
  await withFlag('true', async () => {
    const { instance, warns } = makeLoop(async () => {
      throw new Error('cnpj_public explodiu');
    });

    await assert.doesNotReject(() =>
      instance.runCnpjPublicSourceForClientRunIfEligible(
        { companyId: 'c1' },
        baseNormalized(),
        'run-5',
        10,
      ),
    );
    assert.ok(warns.some((w) => w.includes('cnpj_public explodiu')));
  });
});

// LOTE 2: este teste virou a prova do MARCADOR DE SECA. Zero aceito é o fim da linha da Receita
// naquele run — o que mudou é só onde o marcador mora (metricsJson, não mais Map de processo).
test('fonte 0 aceitos: segunda chamada do mesmo run nao re-executa', async () => {
  await withFlag('true', async () => {
    let callCount = 0;
    const { instance, savedCalls } = makeLoop(async () => {
      callCount += 1;
      return {
        source: 'cnpj_public',
        status: 'completed',
        retryable: false,
        foundCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        reason: 'sem_registros',
        results: [],
      };
    });

    await instance.runCnpjPublicSourceForClientRunIfEligible(
      { companyId: 'c1' },
      baseNormalized(),
      'run-6',
      10,
    );
    await instance.runCnpjPublicSourceForClientRunIfEligible(
      { companyId: 'c1' },
      baseNormalized(),
      'run-6',
      10,
    );

    assert.equal(callCount, 1, 'a fonte so deveria ser chamada 1x mesmo com 2 batches do mesmo run');
    assert.equal(savedCalls.length, 0, 'sem records, saveSearchRunResults nao deveria ser chamado');
  });
});

// VACINA DO LOTE 2 (17/08): este teste codificava a trava A4 (`ranThisRun` — a Receita rodava UMA
// vez por run e o resto do run era só web). A encomenda do dono é o contrário: enquanto a base
// não secou, a RFB repete A CADA LOTE. Por isso a asserção foi INVERTIDA de 1 pra 2.
test('a RFB repete a cada lote enquanto nao secou: dois batches do mesmo run chamam a fonte 2x', async () => {
  await withFlag('true', async () => {
    let callCount = 0;
    const { instance } = makeLoop(async () => {
      callCount += 1;
      return {
        source: 'cnpj_public',
        status: 'completed',
        retryable: false,
        foundCount: 1,
        acceptedCount: 1,
        rejectedCount: 0,
        reason: 'ok',
        results: [{ cnpj: '11222333000181', name: 'A' }],
      };
    });

    await instance.runCnpjPublicSourceForClientRunIfEligible(
      { companyId: 'c1' },
      baseNormalized(),
      'run-7',
      10,
    );
    await instance.runCnpjPublicSourceForClientRunIfEligible(
      { companyId: 'c1' },
      baseNormalized(),
      'run-7',
      10,
    );

    assert.equal(callCount, 2, 'sem seca, a RFB repete a cada lote (a trava ranThisRun morreu no Lote 2)');
  });
});
