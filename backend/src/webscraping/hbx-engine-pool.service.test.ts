import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDockerHbxEngineUrls,
  buildHbxEngineUrls,
  buildLocalHbxEngineUrls,
  getConfiguredHbxEngineCount,
  HbxEnginePoolService,
  parseHbxEngineUrls,
  resolveConfiguredHbxEngineUrls,
} from './hbx-engine-pool.service';

function withHbxEngineCount<T>(value: string | undefined, fn: () => T) {
  const previous = process.env.HBX_ENGINE_COUNT;
  if (value == null) {
    delete process.env.HBX_ENGINE_COUNT;
  } else {
    process.env.HBX_ENGINE_COUNT = value;
  }
  try {
    return fn();
  } finally {
    if (previous == null) {
      delete process.env.HBX_ENGINE_COUNT;
    } else {
      process.env.HBX_ENGINE_COUNT = previous;
    }
  }
}

function withEnv<T>(patch: NodeJS.ProcessEnv, fn: () => T) {
  const previous = { ...process.env };
  const restore = () => {
    for (const key of Object.keys(process.env)) {
      if (!(key in previous)) delete process.env[key];
    }
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
  for (const key of Object.keys(patch)) {
    const value = patch[key];
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    const result = fn();
    if (result && typeof (result as any).finally === 'function') {
      return (result as any).finally(restore) as T;
    }
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

test('getConfiguredHbxEngineCount uses dev/local default of four', () => {
  assert.equal(getConfiguredHbxEngineCount({ NODE_ENV: 'development' }), 4);
  assert.deepEqual(resolveConfiguredHbxEngineUrls({ NODE_ENV: 'development' }), buildLocalHbxEngineUrls(4));
});

test('buildHbxEngineUrls builds local and docker URL ranges without hardcoded arrays', () => {
  assert.deepEqual(buildHbxEngineUrls('http://hbx-engine', 3), [
    'http://hbx-engine-1:8001',
    'http://hbx-engine-2:8001',
    'http://hbx-engine-3:8001',
  ]);
  assert.deepEqual(buildDockerHbxEngineUrls(2), ['http://hbx-engine-1:8001', 'http://hbx-engine-2:8001']);
  assert.deepEqual(buildLocalHbxEngineUrls(2), ['http://localhost:8001', 'http://localhost:8002']);
});

test('parseHbxEngineUrls trims, removes trailing slashes, and uses four URLs by default', () => {
  assert.deepEqual(
    parseHbxEngineUrls(' http://engine-1:8001/ , http://engine-2:8001///,http://engine-3:8001,http://engine-4:8001,http://engine-5:8001 '),
    [
      'http://engine-1:8001',
      'http://engine-2:8001',
      'http://engine-3:8001',
      'http://engine-4:8001',
    ],
  );
});

test('parseHbxEngineUrls supports HBX_ENGINE_COUNT up to twenty URLs', () => {
  withHbxEngineCount('20', () => {
    assert.deepEqual(
      parseHbxEngineUrls(Array.from({ length: 21 }, (_, index) => `http://engine-${index + 1}:8001`)),
      Array.from({ length: 20 }, (_, index) => `http://engine-${index + 1}:8001`),
    );
  });
});

test('HBX_ENGINE_COUNT=20 accepts twenty configured URLs', () => {
  assert.deepEqual(
    resolveConfiguredHbxEngineUrls({
      HBX_ENGINE_COUNT: '20',
      HBX_ENGINE_URLS: Array.from({ length: 20 }, (_, index) => `http://engine-${index + 1}:8001`).join(','),
    }),
    Array.from({ length: 20 }, (_, index) => `http://engine-${index + 1}:8001`),
  );
});

test('resolveConfiguredHbxEngineUrls prioritizes HBX_ENGINE_URLS over legacy/database URLs', () => {
  assert.deepEqual(
    resolveConfiguredHbxEngineUrls(
      {
        HBX_ENGINE_URLS: 'http://hbx-engine-a:8001,http://hbx-engine-b:8001',
        HBX_MASS_DATA_ENGINE_URLS: 'http://mass-data:8001',
        HBX_SCRAPING_ENGINE_URL: 'http://scraping:8001',
      },
      ['http://database:8001'],
    ),
    ['http://hbx-engine-a:8001', 'http://hbx-engine-b:8001'],
  );
});

test('resolveConfiguredHbxEngineUrls uses mass data engine URL sources before scraping fallback', () => {
  assert.deepEqual(
    resolveConfiguredHbxEngineUrls({
      HBX_MASS_DATA_ENGINE_URLS: 'http://mass-1:8001,http://mass-2:8001',
      HBX_MASS_DATA_ENGINE_URL_1: 'http://numbered-1:8001',
      HBX_SCRAPING_ENGINE_URL: 'http://scraping:8001',
    }),
    ['http://mass-1:8001', 'http://mass-2:8001'],
  );

  assert.deepEqual(
    resolveConfiguredHbxEngineUrls({
      HBX_MASS_DATA_ENGINE_URL_1: 'http://numbered-1:8001',
      HBX_MASS_DATA_ENGINE_URL_2: 'http://numbered-2:8001',
      HBX_SCRAPING_ENGINE_URL: 'http://scraping:8001',
    }),
    ['http://numbered-1:8001', 'http://numbered-2:8001'],
  );

  assert.deepEqual(
    resolveConfiguredHbxEngineUrls({
      HBX_SCRAPING_ENGINE_URL: 'http://scraping:8001,http://ignored:8001',
    }),
    ['http://scraping:8001'],
  );
});

test('resolveConfiguredHbxEngineUrls never returns localhost defaults in production', () => {
  const dockerUrls = Array.from({ length: 20 }, (_, index) => `http://hbx-engine-${index + 1}:8001`);

  withHbxEngineCount('20', () => {
    assert.deepEqual(resolveConfiguredHbxEngineUrls({ NODE_ENV: 'production', HBX_ENGINE_COUNT: '20' }), dockerUrls);
    assert.deepEqual(
      resolveConfiguredHbxEngineUrls({
        NODE_ENV: 'production',
        HBX_ENGINE_COUNT: '20',
        HBX_ENGINE_URLS: Array.from({ length: 20 }, (_, index) => `http://localhost:${8001 + index}`).join(','),
      }),
      dockerUrls,
    );
  });

  assert.deepEqual(resolveConfiguredHbxEngineUrls({ NODE_ENV: 'production' }), dockerUrls);
});

test('invalid HBX_ENGINE_COUNT respects environment fallback', () => {
  assert.equal(getConfiguredHbxEngineCount({ NODE_ENV: 'development', HBX_ENGINE_COUNT: 'invalid' }), 4);
  assert.equal(getConfiguredHbxEngineCount({ NODE_ENV: 'production', HBX_ENGINE_COUNT: 'invalid' }), 20);

  withEnv({ NODE_ENV: 'development', HBX_ENGINE_COUNT: 'invalid' }, () => {
    assert.deepEqual(
      parseHbxEngineUrls(Array.from({ length: 20 }, (_, index) => `http://engine-${index + 1}:8001`)),
      Array.from({ length: 4 }, (_, index) => `http://engine-${index + 1}:8001`),
    );
  });
});

test('HBX_ENGINE_COUNT above twenty is clamped to twenty', () => {
  assert.equal(getConfiguredHbxEngineCount({ NODE_ENV: 'production', HBX_ENGINE_COUNT: '25' }), 20);
  assert.equal(buildLocalHbxEngineUrls(25).length, 20);
});

function createPoolForCapacity(input: {
  queuedCount?: number;
  runningCount?: number;
  completedLast10Min?: number;
  partialLast10Min?: number;
  progressingRuns?: number;
  oldestQueuedAgeMinutes?: number;
  operationalConfig?: Record<string, any> | null;
}) {
  const service = new HbxEnginePoolService({} as any) as any;
  service.cleanupExpiredLocks = async () => undefined;
  service.getOperationalConfig = async () => input.operationalConfig || null;
  service.isWithinOperationalWindow = () => Boolean(input.operationalConfig?.enabled);
  service.isWithinConfiguredOperationalWindow = () => Boolean(input.operationalConfig?.enabled);
  service.isForcedTurboActive = () => false;
  service.nextOperationalWindowAt = () => null;
  service.buildQueueStats = async () => ({
    queuedCount: Number(input.queuedCount || 0),
    runningCount: Number(input.runningCount || 0),
    completedLast10Min: Number(input.completedLast10Min || 0),
    partialLast10Min: Number(input.partialLast10Min || 0),
    progressingRuns: Number(input.progressingRuns || 0),
    oldestQueuedAgeMinutes: Number(input.oldestQueuedAgeMinutes || 0),
  });
  return service as HbxEnginePoolService;
}

function buildEngineRows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `hbx-engine-${index + 1}`,
    engineIndex: index,
    url: `http://hbx-engine-${index + 1}:8001`,
    status: 'online',
    lastHealthStatus: 'online',
    lastUsedAt: null,
    lockedRunId: null,
    lockedUntil: null,
    cooldownUntil: null,
  }));
}

test('HBX_ENGINE_COUNT=20 with high queue activates all engines', async () => {
  await withEnv({
    NODE_ENV: 'production',
    HBX_ENGINE_COUNT: '20',
    HBX_CAPACITY_FULL_QUEUE_THRESHOLD: '100',
  }, async () => {
    const service = createPoolForCapacity({ queuedCount: 100 });
    const capacity = await service.getCurrentCapacityLevel();
    assert.equal(capacity.activeEngineCount, 20);
  });
});

test('HBX_ENGINE_COUNT=20 scales capacity proportionally to queue', async () => {
  await withEnv({
    NODE_ENV: 'production',
    HBX_ENGINE_COUNT: '20',
    HBX_CAPACITY_FULL_QUEUE_THRESHOLD: '100',
  }, async () => {
    const service = createPoolForCapacity({ queuedCount: 25 });
    const capacity = await service.getCurrentCapacityLevel();
    assert.equal(capacity.activeEngineCount, 5);
  });
});

test('eligible engines include hbx-engine-20 when active capacity is twenty', async () => {
  await withEnv({ NODE_ENV: 'production', HBX_ENGINE_COUNT: '20' }, async () => {
    const service = createPoolForCapacity({ queuedCount: 100 }) as any;
    service.healthCheckEngines = async () => buildEngineRows(20);
    const eligible = await service.getEligibleEnginesForCurrentQueue();
    assert.equal(eligible.length, 20);
    assert.equal(eligible.at(-1)?.id, 'hbx-engine-20');
  });
});

test('automatic queue never gets all engines when manual reservation is two', async () => {
  await withEnv({
    NODE_ENV: 'production',
    HBX_ENGINE_COUNT: '20',
    HBX_MANUAL_RESERVED_ENGINES: '2',
    HBX_AUTONOMOUS_MAX_MEMORY_PRESSURE_PERCENT: '100',
  }, async () => {
    const service = createPoolForCapacity({ queuedCount: 100 }) as any;
    service.healthCheckEngines = async () => buildEngineRows(20);
    const automatic = await service.getEligibleEnginesForCurrentQueue('mass_data');
    const manual = await service.getEligibleEnginesForCurrentQueue('manual');
    assert.equal(automatic.length, 18);
    assert.equal(manual.length, 20);
  });
});

test('manual acquisition can use reserved engine while automatic engines are busy', async () => {
  await withEnv({
    NODE_ENV: 'production',
    HBX_ENGINE_COUNT: '20',
    HBX_MANUAL_RESERVED_ENGINES: '2',
    HBX_AUTONOMOUS_MAX_MEMORY_PRESSURE_PERCENT: '100',
  }, async () => {
    const rows = buildEngineRows(20);
    for (let index = 0; index < 18; index += 1) {
      rows[index].status = 'busy';
      rows[index].lockedRunId = `campaign-1:mass:${index}`;
      rows[index].lockedUntil = new Date(Date.now() + 60_000);
    }
    const claimed: string[] = [];
    const prisma = {
      hasTable: async () => true,
      hbxEngineLock: {
        updateMany: async (input: any) => {
          if (!input?.where?.id) return { count: 0 };
          claimed.push(input.where.id);
          return { count: 1 };
        },
      },
      webscrapingSearchRun: {
        count: async () => 0,
      },
    };
    const service = createPoolForCapacity({ queuedCount: 100 }) as any;
    service.prisma = prisma;
    service.cleanupExpiredLocks = async () => undefined;
    service.healthCheckEngines = async () => rows;

    const lease = await service.acquireEngine('manual-run-1', 7, 9, { purpose: 'manual' });
    assert.equal(lease?.engineId, 'hbx-engine-19');
    assert.deepEqual(claimed, ['hbx-engine-19']);
  });
});

test('eligible engines ignore manually paused and timed paused engines', async () => {
  await withEnv({ NODE_ENV: 'production', HBX_ENGINE_COUNT: '4' }, async () => {
    const service = createPoolForCapacity({ queuedCount: 100 }) as any;
    const rows = buildEngineRows(4);
    rows[1].status = 'paused';
    (rows[1] as any).manualPaused = true;
    rows[2].status = 'paused';
    (rows[2] as any).pausedUntil = new Date(Date.now() + 60 * 60_000);
    service.healthCheckEngines = async () => rows;
    const eligible = await service.getEligibleEnginesForCurrentQueue();
    assert.deepEqual(eligible.map((engine: any) => engine.id), ['hbx-engine-1', 'hbx-engine-4']);
  });
});

test('operational turbo config with engineCount=20 activates twenty engines', async () => {
  await withEnv({ NODE_ENV: 'production', HBX_ENGINE_COUNT: '20' }, async () => {
    const service = createPoolForCapacity({
      queuedCount: 1,
      operationalConfig: {
        enabled: true,
        engineCount: 20,
        intensity: 'turbo',
      },
    });
    const capacity = await service.getCurrentCapacityLevel();
    assert.equal(capacity.activeEngineCount, 20);
  });
});

test('old queue with one stuck run does not degrade pool while nineteen engines are free', async () => {
  await withEnv({
    NODE_ENV: 'production',
    HBX_ENGINE_COUNT: '20',
    HBX_CAPACITY_FULL_QUEUE_THRESHOLD: '100',
    HBX_QUEUE_STUCK_MINUTES: '10',
  }, async () => {
    const service = createPoolForCapacity({
      queuedCount: 4447,
      runningCount: 1,
      completedLast10Min: 0,
      partialLast10Min: 0,
      progressingRuns: 0,
      oldestQueuedAgeMinutes: 900,
    });
    const capacity = await service.getCurrentCapacityLevel();
    assert.equal(capacity.activeEngineCount, 20);
    assert.equal(capacity.operationalStatus, 'healthy');
  });
});
