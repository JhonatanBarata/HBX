import test from 'node:test';
import assert from 'node:assert/strict';
import { RadarCoreSearchLoopMixin } from './radar-core-search-loop.mixin';

// Instancia o mixin isolado e injeta os stubs que o bloco aditivo de fonte Receita
// (cnpj_public soldada no run de cliente) usa: getRadarCnpjPublicSource, saveSearchRunResults,
// prisma e logger. Espelha o padrão de radar-core-factory-admin.abandon.test.ts.
function makeLoop(sourceRunImpl: (input: any) => Promise<any>) {
  const instance: any = new (RadarCoreSearchLoopMixin as any)();
  const logs: string[] = [];
  const warns: string[] = [];
  instance.logger = {
    log: (msg: string) => logs.push(msg),
    warn: (msg: string) => warns.push(msg),
  };
  instance.prisma = {};
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
  return { instance, logs, warns, savedCalls, wasSourceInstantiated: () => sourceInstantiated };
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

test('fonte RFB é obrigatória para PJ e ignora a antiga flag OFF', async () => {
  await withFlag('false', async () => {
    const { instance, savedCalls, wasSourceInstantiated } = makeLoop(async () => ({ results: [], foundCount: 0 }));

    await instance.runCnpjPublicSourceForClientRunIfEligible(
      { companyId: 'c1' },
      baseNormalized(),
      'run-2',
      10,
    );

    assert.equal(wasSourceInstantiated(), true);
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

test('run já no alvo ainda registra tentativa obrigatória da RFB', async () => {
  await withFlag('true', async () => {
    const { instance, wasSourceInstantiated } = makeLoop(async () => ({ results: [], foundCount: 0 }));

    await instance.runCnpjPublicSourceForClientRunIfEligible(
      { companyId: 'c1' },
      baseNormalized(),
      'run-4',
      0,
    );

    assert.equal(wasSourceInstantiated(), true);
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

test('maximo 1x por batch: dois batches distintos do mesmo run so chamam a fonte 1x quando a primeira aceitou registros', async () => {
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

    assert.equal(callCount, 1, 'ranThisRun deveria travar novas execucoes no mesmo run');
  });
});
