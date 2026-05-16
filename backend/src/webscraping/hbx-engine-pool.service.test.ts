import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDockerHbxEngineUrls,
  buildHbxEngineUrls,
  buildLocalHbxEngineUrls,
  getConfiguredHbxEngineCount,
  HbxEnginePoolService,
  parseHostMemoryPressurePercent,
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

test('host memory pressure uses MemAvailable instead of process heap pressure', () => {
  const pressure = parseHostMemoryPressurePercent([
    'MemTotal:       15988000 kB',
    'MemFree:        12000000 kB',
    'MemAvailable:   12649000 kB',
    'Buffers:          100000 kB',
    'Cached:           400000 kB',
  ].join('\n'));

  assert.equal(pressure, 21);
});

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

test('parseHbxEngineUrls supports HBX_ENGINE_COUNT up to fifty URLs', () => {
  withHbxEngineCount('50', () => {
    assert.deepEqual(
      parseHbxEngineUrls(Array.from({ length: 51 }, (_, index) => `http://engine-${index + 1}:8001`)),
      Array.from({ length: 50 }, (_, index) => `http://engine-${index + 1}:8001`),
    );
  });
});

test('parseHbxEngineUrls expands numbered URL template', () => {
  assert.deepEqual(
    parseHbxEngineUrls('http://hbx-engine-{n}:8001', 3),
    ['http://hbx-engine-1:8001', 'http://hbx-engine-2:8001', 'http://hbx-engine-3:8001'],
  );
});

test('HBX_ENGINE_COUNT=50 accepts fifty configured URLs', () => {
  assert.deepEqual(
    resolveConfiguredHbxEngineUrls({
      HBX_ENGINE_COUNT: '50',
      HBX_ENGINE_URLS: Array.from({ length: 50 }, (_, index) => `http://engine-${index + 1}:8001`).join(','),
    }),
    Array.from({ length: 50 }, (_, index) => `http://engine-${index + 1}:8001`),
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
  const dockerUrls = Array.from({ length: 50 }, (_, index) => `http://hbx-engine-${index + 1}:8001`);

  withHbxEngineCount('50', () => {
    assert.deepEqual(resolveConfiguredHbxEngineUrls({ NODE_ENV: 'production', HBX_ENGINE_COUNT: '50' }), dockerUrls);
    assert.deepEqual(
      resolveConfiguredHbxEngineUrls({
        NODE_ENV: 'production',
        HBX_ENGINE_COUNT: '50',
        HBX_ENGINE_URLS: Array.from({ length: 50 }, (_, index) => `http://localhost:${8001 + index}`).join(','),
      }),
      dockerUrls,
    );
  });

  assert.deepEqual(resolveConfiguredHbxEngineUrls({ NODE_ENV: 'production' }), dockerUrls);
});

test('invalid HBX_ENGINE_COUNT respects environment fallback', () => {
  assert.equal(getConfiguredHbxEngineCount({ NODE_ENV: 'development', HBX_ENGINE_COUNT: 'invalid' }), 4);
  assert.equal(getConfiguredHbxEngineCount({ NODE_ENV: 'production', HBX_ENGINE_COUNT: 'invalid' }), 50);

  withEnv({ NODE_ENV: 'development', HBX_ENGINE_COUNT: 'invalid' }, () => {
    assert.deepEqual(
      parseHbxEngineUrls(Array.from({ length: 20 }, (_, index) => `http://engine-${index + 1}:8001`)),
      Array.from({ length: 4 }, (_, index) => `http://engine-${index + 1}:8001`),
    );
  });
});

test('HBX_ENGINE_COUNT=50 is accepted without the old twenty-engine clamp', () => {
  assert.equal(getConfiguredHbxEngineCount({ NODE_ENV: 'production', HBX_ENGINE_COUNT: '50' }), 50);
  assert.equal(buildLocalHbxEngineUrls(50).length, 50);
});

test('factory scheduler defaults to configured engine count in production when max is empty', () => {
  withEnv({ NODE_ENV: 'production', HBX_ENGINE_COUNT: '50', HBX_FACTORY_MAX_ENGINES: '', HBX_FACTORY_START_HOUR: '0', HBX_FACTORY_END_HOUR: '0' }, () => {
    const service = new HbxEnginePoolService({} as any);
    const allowed = service.resolveFactoryAllowedEngines({
      engineCount: 50,
      onlineHealthyEngines: 50,
      manualReservedEngines: 0,
      memoryPressurePercent: 50,
      operationalConfig: { enabled: true, metadataJson: '{}' },
    });
    assert.equal(allowed.maxEngines, 50);
    assert.equal(allowed.allowedEngines, 50);
  });
});

test('factory scheduler keeps all engines available outside the old window rule', () => {
  withEnv({ NODE_ENV: 'production', HBX_ENGINE_COUNT: '100', HBX_FACTORY_MAX_ENGINES: '16' }, () => {
    const service = new HbxEnginePoolService({} as any);
    const allowed = service.resolveFactoryAllowedEngines({
      engineCount: 100,
      onlineHealthyEngines: 100,
      manualReservedEngines: 2,
      memoryPressurePercent: 50,
      operationalConfig: { enabled: true, startHour: 22, startMinute: 0, endHour: 7, endMinute: 0, metadataJson: '{}' },
      date: new Date('2026-05-09T15:00:00-03:00'),
    });
    assert.equal(allowed.windowStatus, 'open');
    assert.equal(allowed.reason, 'factory_max');
    assert.equal(allowed.allowedEngines, 100);
  });
});

test('factory scheduler ignores the old window max env and uses configured count', () => {
  withEnv({ NODE_ENV: 'production', HBX_ENGINE_COUNT: '100', HBX_FACTORY_MAX_ENGINES: '12' }, () => {
    const service = new HbxEnginePoolService({} as any);
    const allowed = service.resolveFactoryAllowedEngines({
      engineCount: 100,
      onlineHealthyEngines: 100,
      manualReservedEngines: 2,
      memoryPressurePercent: 50,
      operationalConfig: { enabled: true, startHour: 22, startMinute: 0, endHour: 7, endMinute: 0, metadataJson: '{}' },
      date: new Date('2026-05-09T23:30:00-03:00'),
    });
    assert.equal(allowed.windowStatus, 'open');
    assert.equal(allowed.allowedEngines, 100);
  });
});

test('factory scheduler memory guard is diagnostic and does not cap automatic work', () => {
  withEnv({ NODE_ENV: 'production', HBX_ENGINE_COUNT: '50', HBX_FACTORY_MAX_ENGINES: '50', HBX_FACTORY_START_HOUR: '0', HBX_FACTORY_END_HOUR: '0' }, () => {
    const service = new HbxEnginePoolService({} as any);
    const at80 = service.resolveFactoryAllowedEngines({
      engineCount: 50,
      onlineHealthyEngines: 50,
      manualReservedEngines: 0,
      memoryPressurePercent: 80,
      operationalConfig: { enabled: true, metadataJson: '{}' },
    });
    const at90 = service.resolveFactoryAllowedEngines({
      engineCount: 50,
      onlineHealthyEngines: 50,
      manualReservedEngines: 0,
      memoryPressurePercent: 90,
      operationalConfig: { enabled: true, metadataJson: '{}' },
    });
    assert.equal(at80.allowedEngines, 50);
    assert.equal(at80.reason, 'factory_max');
    assert.equal(at90.allowedEngines, 50);
    assert.equal(at90.reason, 'factory_max');
  });
});

test('factory scheduler emergency stop blocks automatic work immediately', () => {
  withEnv({ NODE_ENV: 'production', HBX_ENGINE_COUNT: '100', HBX_FACTORY_MAX_ENGINES: '16', HBX_FACTORY_START_HOUR: '0', HBX_FACTORY_END_HOUR: '0' }, () => {
    const service = new HbxEnginePoolService({} as any);
    const allowed = service.resolveFactoryAllowedEngines({
      engineCount: 100,
      onlineHealthyEngines: 100,
      manualReservedEngines: 2,
      memoryPressurePercent: 50,
      operationalConfig: { enabled: true, metadataJson: '{"emergencyStop":true}' },
    });
    assert.equal(allowed.allowedEngines, 0);
    assert.equal(allowed.reason, 'emergency_stop');
  });
});

test('factory scheduler ignores the old business-day limiter', () => {
  withEnv({ NODE_ENV: 'production', HBX_ENGINE_COUNT: '100', HBX_FACTORY_MAX_ENGINES: '16', HBX_FACTORY_START_HOUR: '0', HBX_FACTORY_END_HOUR: '0' }, () => {
    const service = new HbxEnginePoolService({} as any);
    const weekend = service.resolveFactoryAllowedEngines({
      engineCount: 100,
      onlineHealthyEngines: 100,
      manualReservedEngines: 2,
      memoryPressurePercent: 50,
      operationalConfig: { enabled: true, metadataJson: '{"weekdaysOnly":true}' },
      date: new Date('2026-05-09T12:00:00-03:00'),
    });
    const monday = service.resolveFactoryAllowedEngines({
      engineCount: 100,
      onlineHealthyEngines: 100,
      manualReservedEngines: 2,
      memoryPressurePercent: 50,
      operationalConfig: { enabled: true, metadataJson: '{"weekdaysOnly":true}' },
      date: new Date('2026-05-11T12:00:00-03:00'),
    });
    assert.equal(weekend.allowedEngines, 100);
    assert.equal(weekend.reason, 'factory_max');
    assert.equal(monday.allowedEngines, 100);
  });
});

test('factory scheduler keeps weekdays and weekends open all day', () => {
  withEnv({ NODE_ENV: 'production', HBX_ENGINE_COUNT: '100', HBX_FACTORY_MAX_ENGINES: '16' }, () => {
    const service = new HbxEnginePoolService({} as any);
    const saturdayAfternoon = service.resolveFactoryAllowedEngines({
      engineCount: 100,
      onlineHealthyEngines: 100,
      manualReservedEngines: 2,
      memoryPressurePercent: 50,
      operationalConfig: {
        enabled: true,
        startHour: 20,
        startMinute: 0,
        endHour: 8,
        endMinute: 0,
        metadataJson: '{"weekendAlwaysOn":true}',
      },
      date: new Date('2026-05-09T15:00:00-03:00'),
    });
    const mondayAfternoon = service.resolveFactoryAllowedEngines({
      engineCount: 100,
      onlineHealthyEngines: 100,
      manualReservedEngines: 2,
      memoryPressurePercent: 50,
      operationalConfig: {
        enabled: true,
        startHour: 20,
        startMinute: 0,
        endHour: 8,
        endMinute: 0,
        metadataJson: '{"weekendAlwaysOn":true}',
      },
      date: new Date('2026-05-11T15:00:00-03:00'),
    });

    assert.equal(saturdayAfternoon.allowedEngines, 100);
    assert.equal(saturdayAfternoon.reason, 'factory_max');
    assert.equal(mondayAfternoon.allowedEngines, 100);
    assert.equal(mondayAfternoon.reason, 'factory_max');
  });
});

test('HBX_ENGINE_MAX_COUNT can intentionally clamp engine count', () => {
  assert.equal(getConfiguredHbxEngineCount({ NODE_ENV: 'production', HBX_ENGINE_COUNT: '100', HBX_ENGINE_MAX_COUNT: '40' }), 40);
  assert.equal(getConfiguredHbxEngineCount({ NODE_ENV: 'production', HBX_ENGINE_COUNT: '220' }), 50);
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

test('automatic queue gets all engines even when old manual reservation env is set', async () => {
  await withEnv({
    NODE_ENV: 'production',
    HBX_ENGINE_COUNT: '20',
    HBX_MANUAL_RESERVED_ENGINES: '2',
    HBX_FACTORY_MAX_ENGINES: '18',
    HBX_FACTORY_START_HOUR: '0',
    HBX_FACTORY_END_HOUR: '0',
    HBX_RADAR_CLIENT_PRIORITY_START_HOUR: '23',
    HBX_RADAR_CLIENT_PRIORITY_END_HOUR: '0',
    HBX_AUTONOMOUS_MAX_MEMORY_PRESSURE_PERCENT: '100',
  }, async () => {
    const service = createPoolForCapacity({ queuedCount: 100 }) as any;
    service.healthCheckEngines = async () => buildEngineRows(20);
    const automatic = await service.getEligibleEnginesForCurrentQueue('mass_data');
    const manual = await service.getEligibleEnginesForCurrentQueue('manual');
    assert.equal(automatic.length, 20);
    assert.equal(manual.length, 20);
  });
});

test('automatic eligibility can include engines above twenty when factory limit allows it', async () => {
  await withEnv({
    NODE_ENV: 'production',
    HBX_ENGINE_COUNT: '50',
    HBX_FACTORY_MAX_ENGINES: '50',
    HBX_FACTORY_START_HOUR: '0',
    HBX_FACTORY_END_HOUR: '0',
    HBX_CLIENT_RESERVED_ENGINES: '0',
    HBX_RADAR_CLIENT_PRIORITY_START_HOUR: '23',
    HBX_RADAR_CLIENT_PRIORITY_END_HOUR: '0',
    HBX_AUTONOMOUS_MAX_MEMORY_PRESSURE_PERCENT: '100',
  }, async () => {
    const service = createPoolForCapacity({ queuedCount: 100 }) as any;
    service.healthCheckEngines = async () => buildEngineRows(50);
    const automatic = await service.getEligibleEnginesForCurrentQueue('mass_data');
    assert.equal(automatic.length, 50);
    assert.equal(automatic.some((engine: any) => engine.id === 'hbx-engine-21'), true);
    assert.equal(automatic.some((engine: any) => engine.id === 'hbx-engine-50'), true);
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

test('manual acquisition preempts automatic mass-data lock when every engine is busy', async () => {
  await withEnv({
    NODE_ENV: 'production',
    HBX_ENGINE_COUNT: '20',
    HBX_MANUAL_RESERVED_ENGINES: '2',
    HBX_AUTONOMOUS_MAX_MEMORY_PRESSURE_PERCENT: '100',
  }, async () => {
    const rows = buildEngineRows(20);
    for (let index = 0; index < rows.length; index += 1) {
      rows[index].status = 'busy';
      rows[index].lockedRunId = `campaign-1:mass:${index}`;
      rows[index].lockedUntil = new Date(Date.now() + 60_000);
    }
    const updates: any[] = [];
    const taskUpdates: any[] = [];
    const prisma = {
      hasTable: async () => true,
      hbxEngineLock: {
        updateMany: async (input: any) => {
          updates.push(input);
          if (input?.where?.lockedRunId) {
            rows[0].lockedRunId = null;
            rows[0].lockedUntil = null;
            rows[0].status = 'online';
            return { count: 1 };
          }
          if (input?.where?.id === 'hbx-engine-1') return { count: 1 };
          return { count: 0 };
        },
      },
      webscrapingCampaignTask: {
        updateMany: async (input: any) => {
          taskUpdates.push(input);
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

    const lease = await service.acquireEngine('manual-run-2', 7, 9, { purpose: 'manual' });
    assert.equal(lease?.engineId, 'hbx-engine-1');
    assert.equal(taskUpdates[0].data.status, 'queued');
    assert.equal(updates.some((input) => input?.where?.lockedRunId === 'campaign-1:mass:0'), true);
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

test('operational turbo config respects configured engine count', async () => {
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
