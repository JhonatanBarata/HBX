import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  HBX_ENGINE_PURPOSES,
  buildDockerHbxEngineUrls,
  buildHbxEngineUrls,
  buildLocalHbxEngineUrls,
  getConfiguredHbxEngineCount,
  getConfiguredHbxEngineHardLimit,
  getConfiguredHbxEngineMaxCount,
  getHbxEnginePurposeRange,
  HbxEnginePoolService,
  isTimeoutLikeBatchError,
  parseHbxEngineUrls,
  parseHostMemoryPressurePercent,
  parseProcStatCpuSample,
  resolveConfiguredHbxEngineUrls,
} from './hbx-engine-pool.service';

function withEnv<T>(patch: NodeJS.ProcessEnv, fn: () => T): T {
  const previous = { ...process.env };
  for (const [key, value] of Object.entries(patch)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
  const restore = () => {
    for (const key of Object.keys(process.env)) {
      if (!(key in previous)) delete process.env[key];
    }
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  };
  try {
    const value = fn();
    if (value && typeof (value as any).finally === 'function') {
      return (value as any).finally(restore) as T;
    }
    restore();
    return value;
  } catch (error) {
    restore();
    throw error;
  }
}

test('pressão de memória usa MemAvailable do host', () => {
  assert.equal(parseHostMemoryPressurePercent([
    'MemTotal:       15988000 kB',
    'MemFree:        12000000 kB',
    'MemAvailable:   12649000 kB',
  ].join('\n')), 21);
  assert.equal(parseHostMemoryPressurePercent('MemAvailable: 10 kB'), null);
});

test('amostra de CPU agrega idle+iowait e rejeita entrada inválida', () => {
  assert.deepEqual(parseProcStatCpuSample('cpu  10 20 30 40 5 6 7 8 0 0'), {
    idle: 45,
    total: 126,
  });
  assert.equal(parseProcStatCpuSample('cpu nope'), null);
});

test('classificação de timeout cobre falhas transitórias sem confundir erros comuns', () => {
  assert.equal(isTimeoutLikeBatchError('request timed out'), true);
  assert.equal(isTimeoutLikeBatchError('ETIMEDOUT'), true);
  assert.equal(isTimeoutLikeBatchError('registro inválido'), false);
});

test('contagem e tetos respeitam limites explícitos', () => {
  assert.equal(getConfiguredHbxEngineCount({ NODE_ENV: 'development' }), 3);
  assert.equal(getConfiguredHbxEngineCount({ NODE_ENV: 'production' }), 20);
  assert.equal(getConfiguredHbxEngineHardLimit({ HBX_ENGINE_HARD_LIMIT: '9999' }), 200);
  assert.equal(getConfiguredHbxEngineMaxCount({ HBX_ENGINE_HARD_LIMIT: '8', HBX_ENGINE_MAX_COUNT: '12' }), 8);
  assert.equal(getConfiguredHbxEngineCount({ NODE_ENV: 'production', HBX_ENGINE_HARD_LIMIT: '8', HBX_ENGINE_COUNT: '12' }), 8);
});

test('URLs locais e Docker são derivadas, normalizadas e deduplicadas', () => {
  assert.deepEqual(buildHbxEngineUrls('http://hbx-engine', 3), [
    'http://hbx-engine-1:8001',
    'http://hbx-engine-2:8001',
    'http://hbx-engine-3:8001',
  ]);
  assert.deepEqual(buildDockerHbxEngineUrls(2), ['http://hbx-engine-1:8001', 'http://hbx-engine-2:8001']);
  assert.deepEqual(buildLocalHbxEngineUrls(2), ['http://localhost:8001', 'http://localhost:8002']);
  assert.deepEqual(parseHbxEngineUrls(' http://a:8001, http://a:8001\nhttp://b:8001 ', 5), [
    'http://a:8001',
    'http://b:8001',
  ]);
});

test('produção substitui localhost por rede interna e ignora variáveis de frota removidas', () => {
  const removedPoolKey = ['HBX', 'MASS', 'DATA', 'ENGINE', 'URLS'].join('_');
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: 'production',
    HBX_ENGINE_COUNT: '2',
    HBX_ENGINE_URLS: 'http://127.0.0.1:8001,http://localhost:8002',
    [removedPoolKey]: 'https://should-never-be-used.example',
  };
  assert.deepEqual(resolveConfiguredHbxEngineUrls(env), buildDockerHbxEngineUrls(2));

  delete env.HBX_ENGINE_URLS;
  const resolved = resolveConfiguredHbxEngineUrls(env);
  assert.deepEqual(resolved, buildDockerHbxEngineUrls(2));
  assert.equal(resolved.includes('should-never-be-used.example'), false);
});

test('todos os propósitos permitidos usam o pool comum do cliente', () => {
  for (const purpose of HBX_ENGINE_PURPOSES) {
    assert.deepEqual(getHbxEnginePurposeRange(purpose, 20), {
      start: 0,
      endExclusive: 20,
      label: '1-20',
    });
  }
});

test('propósitos autônomos removidos falham antes de consultar banco ou adquirir motor', async () => {
  const blocked = ['mass' + '_data', 'auto' + 'nomous', 'fac' + 'tory'];
  let dbTouched = false;
  const prisma = new Proxy({}, {
    get() {
      dbTouched = true;
      throw new Error('database must not be touched');
    },
  });
  const service = new HbxEnginePoolService(prisma as any);

  for (const purpose of blocked) {
    assert.throws(
      () => getHbxEnginePurposeRange(purpose as any, 20),
      new RegExp(`HBX_ENGINE_PURPOSE_BLOCKED:${purpose}`),
    );
    await assert.rejects(
      () => service.getEligibleEnginesForCurrentQueue(purpose as any),
      new RegExp(`HBX_ENGINE_PURPOSE_BLOCKED:${purpose}`),
    );
    await assert.rejects(
      () => service.acquireEngine('run-1', 1, 1, { purpose: purpose as any }),
      new RegExp(`HBX_ENGINE_PURPOSE_BLOCKED:${purpose}`),
    );
  }
  assert.equal(dbTouched, false);
});

test('estatística da fila lê exclusivamente execuções solicitadas por clientes', async () => {
  const countFilters: any[] = [];
  const searchRun = {
    count: async ({ where }: any) => {
      countFilters.push(where);
      if (where.status === 'queued') return 7;
      if (where.status === 'running' && where.lastFoundCountChangeAt) return 1;
      if (where.status === 'running') return 2;
      if (where.status === 'completed') return 3;
      if (where.status === 'partial_error') return 1;
      return 0;
    },
    findFirst: async () => ({ createdAt: new Date(Date.now() - 120_000) }),
  };
  const prisma = new Proxy({ webscrapingSearchRun: searchRun }, {
    get(target, property) {
      if (property in target) return (target as any)[property];
      throw new Error(`unexpected persistence access: ${String(property)}`);
    },
  });
  const stats = await (new HbxEnginePoolService(prisma as any) as any).buildQueueStats();
  assert.equal(stats.queuedCount, 7);
  assert.equal(stats.runningCount, 2);
  assert.equal(stats.completedLast10Min, 3);
  assert.equal(stats.partialLast10Min, 1);
  assert.equal(stats.progressingRuns, 1);
  assert.ok(stats.oldestQueuedAgeMinutes >= 1.9);
  assert.equal(countFilters.length, 5);
});

test('scheduler publicado é client-only e não expõe campos de execução autônoma', async () => withEnv({
  NODE_ENV: 'production',
  HBX_ENGINE_COUNT: '2',
  HBX_ENGINE_MEMORY_PRESSURE_PERCENT: '20',
  HBX_ENGINE_CPU_PRESSURE_PERCENT: '10',
}, async () => {
  const service = new HbxEnginePoolService({} as any) as any;
  service.getOperationalConfig = async () => null;
  service.hasManualDemand = async () => true;
  service.getConfiguredEngineUrls = async () => buildDockerHbxEngineUrls(2);
  service.resolveElasticHeadroomEngineCount = () => 2;
  const now = new Date();
  const engines = [0, 1].map((engineIndex) => ({
    id: `hbx-engine-${engineIndex + 1}`,
    engineIndex,
    url: `http://hbx-engine-${engineIndex + 1}:8001`,
    status: 'online',
    lastHealthStatus: 'online',
    lastCheckedAt: now,
    manualPaused: false,
  }));
  const scheduler = await service.buildSchedulerStatus(null, engines);
  assert.equal(scheduler.productionMode, 'client_only');
  assert.equal(scheduler.clientDemandActive, true);
  assert.equal(scheduler.onlineHealthyEngines, 2);
  assert.equal(scheduler.eligibleEnginesCount, 2);
  const removedKeys = ['factoryAllowance', 'automaticDemandActive', 'activeCampaignId'];
  for (const key of removedKeys) assert.equal(Object.hasOwn(scheduler, key), false);
}));

test('schema e motor Python não conservam tabelas nem serviço executável removidos', () => {
  const backendRoot = resolve(__dirname, '../..');
  const repoRoot = resolve(backendRoot, '..');
  const schema = readFileSync(resolve(backendRoot, 'prisma/schema.prisma'), 'utf8');
  const removedModels = [
    'Radar' + 'FactoryCursor',
    'Radar' + 'FactoryWorkLog',
    'Webscraping' + 'Campaign',
    'Webscraping' + 'CampaignTask',
    'Webscraping' + 'CampaignBatch',
  ];
  for (const model of removedModels) {
    assert.equal(new RegExp(`\\bmodel\\s+${model}\\b`).test(schema), false, model);
  }
  assert.equal(existsSync(resolve(repoRoot, 'hbx-scraping-engine/app/services/sweep_service.py')), false);
});
