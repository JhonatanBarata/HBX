import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDockerHbxEngineUrls,
  buildHbxEngineUrls,
  buildLocalHbxEngineUrls,
  getConfiguredHbxEngineCount,
  getHbxEnginePurposeRange,
  HbxEnginePoolService,
  parseHostMemoryPressurePercent,
  parseProcStatCpuSample,
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

test('getConfiguredHbxEngineCount uses dev/local default of three', () => {
  assert.equal(getConfiguredHbxEngineCount({ NODE_ENV: 'development' }), 3);
  assert.deepEqual(resolveConfiguredHbxEngineUrls({ NODE_ENV: 'development' }), buildLocalHbxEngineUrls(3));
});

test('HBX engine purposes use the same common pool without Lead+ tail reservation', () => {
  withEnv({
    NODE_ENV: 'production',
    HBX_ENGINE_COUNT: '50',
    HBX_LIST_ENGINE_COUNT: '50',
  }, () => {
    assert.deepEqual(getHbxEnginePurposeRange('mass_data', 50), {
      start: 0,
      endExclusive: 50,
      label: '1-50',
    });
    assert.deepEqual(getHbxEnginePurposeRange('manual', 50), {
      start: 0,
      endExclusive: 50,
      label: '1-50',
    });
    assert.deepEqual(getHbxEnginePurposeRange('lead_plus_enrichment', 50), {
      start: 0,
      endExclusive: 50,
      label: '1-50',
    });
  });
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

test('parseHbxEngineUrls trims, removes trailing slashes, and uses three URLs by default', () => {
  assert.deepEqual(
    parseHbxEngineUrls(' http://engine-1:8001/ , http://engine-2:8001///,http://engine-3:8001,http://engine-4:8001,http://engine-5:8001 '),
    [
      'http://engine-1:8001',
      'http://engine-2:8001',
      'http://engine-3:8001',
    ],
  );
});

test('parseHbxEngineUrls supports HBX_ENGINE_COUNT up to two hundred URLs', () => {
  withEnv({ HBX_ENGINE_COUNT: '200', HBX_ENGINE_MAX_COUNT: '200' }, () => {
    assert.deepEqual(
      parseHbxEngineUrls(Array.from({ length: 201 }, (_, index) => `http://engine-${index + 1}:8001`)),
      Array.from({ length: 200 }, (_, index) => `http://engine-${index + 1}:8001`),
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

test('HBX_ENGINE_COUNT=200 accepts two hundred configured URLs', () => {
  assert.deepEqual(
    resolveConfiguredHbxEngineUrls({
      HBX_ENGINE_COUNT: '200',
      HBX_ENGINE_MAX_COUNT: '200',
      HBX_ENGINE_URLS: Array.from({ length: 200 }, (_, index) => `http://engine-${index + 1}:8001`).join(','),
    }),
    Array.from({ length: 200 }, (_, index) => `http://engine-${index + 1}:8001`),
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
  const fiftyDockerUrls = Array.from({ length: 50 }, (_, index) => `http://hbx-engine-${index + 1}:8001`);

  withHbxEngineCount('50', () => {
    assert.deepEqual(resolveConfiguredHbxEngineUrls({ NODE_ENV: 'production', HBX_ENGINE_COUNT: '50' }), fiftyDockerUrls);
    assert.deepEqual(
      resolveConfiguredHbxEngineUrls({
        NODE_ENV: 'production',
        HBX_ENGINE_COUNT: '50',
        HBX_ENGINE_URLS: Array.from({ length: 50 }, (_, index) => `http://localhost:${8001 + index}`).join(','),
      }),
      fiftyDockerUrls,
    );
  });

  assert.deepEqual(resolveConfiguredHbxEngineUrls({ NODE_ENV: 'production' }), dockerUrls);
});

test('invalid HBX_ENGINE_COUNT respects environment fallback', () => {
  assert.equal(getConfiguredHbxEngineCount({ NODE_ENV: 'development', HBX_ENGINE_COUNT: 'invalid' }), 3);
  assert.equal(getConfiguredHbxEngineCount({ NODE_ENV: 'production', HBX_ENGINE_COUNT: 'invalid' }), 20);

  withEnv({ NODE_ENV: 'development', HBX_ENGINE_COUNT: 'invalid' }, () => {
    assert.deepEqual(
      parseHbxEngineUrls(Array.from({ length: 20 }, (_, index) => `http://engine-${index + 1}:8001`)),
      Array.from({ length: 3 }, (_, index) => `http://engine-${index + 1}:8001`),
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

test('factory ignores legacy factoryMaxEngines cap and uses the full declared fleet (owner 24/06)', () => {
  // Sub-teto fixo da fábrica DELETADO: o teto é a frota declarada (configuredEngineCount),
  // a Elasticidade (memoryGuard) é o único freio. Um cap legado no banco não segura mais.
  withEnv({ NODE_ENV: 'production', HBX_ENGINE_COUNT: '50', HBX_FACTORY_MAX_ENGINES: '', HBX_FACTORY_START_HOUR: '0', HBX_FACTORY_END_HOUR: '0' }, () => {
    const service = new HbxEnginePoolService({} as any);
    const allowed = service.resolveFactoryAllowedEngines({
      engineCount: 50,
      onlineHealthyEngines: 50,
      manualReservedEngines: 0,
      memoryPressurePercent: 50,
      operationalConfig: { enabled: true, metadataJson: '{"factoryMaxEngines":12,"factoryMinEngines":12}' },
    });
    assert.equal(allowed.maxEngines, 50);
    assert.equal(allowed.allowedEngines, 50);
  });
});

test('factory stops only via emergencyStop, not via a zero engine count (owner 24/06)', () => {
  withEnv({ NODE_ENV: 'production', HBX_ENGINE_COUNT: '50', HBX_FACTORY_MAX_ENGINES: '', HBX_FACTORY_START_HOUR: '0', HBX_FACTORY_END_HOUR: '0' }, () => {
    const service = new HbxEnginePoolService({} as any);
    // Quantidade zero no banco NÃO para mais (cap fixo removido) — segue na frota cheia.
    const stillRuns = service.resolveFactoryAllowedEngines({
      engineCount: 50,
      onlineHealthyEngines: 50,
      manualReservedEngines: 0,
      memoryPressurePercent: 50,
      operationalConfig: { enabled: true, metadataJson: '{"factoryMaxEngines":0,"factoryMinEngines":0}' },
    });
    assert.equal(stillRuns.allowedEngines, 50);
    // O ÚNICO desliga é o emergencyStop (regra do dono: ativo roda, desativo para).
    const stopped = service.resolveFactoryAllowedEngines({
      engineCount: 50,
      onlineHealthyEngines: 50,
      manualReservedEngines: 0,
      memoryPressurePercent: 50,
      operationalConfig: { enabled: true, metadataJson: '{"emergencyStop":true}' },
    });
    assert.equal(stopped.allowedEngines, 0);
  });
});

test('factory scheduler blocks normal factory outside the operational window', () => {
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
    assert.equal(allowed.windowStatus, 'closed');
    assert.equal(allowed.reason, 'outside_factory_window');
    assert.equal(allowed.allowedEngines, 0);
  });
});

test('force night ignores the factory window but still respects memory guard', () => {
  withEnv({
    NODE_ENV: 'production',
    HBX_ENGINE_COUNT: '20',
    HBX_FACTORY_MAX_ENGINES: '',
    HBX_FACTORY_MEMORY_SOFT_PRESSURE_PERCENT: '82',
    HBX_FACTORY_MEMORY_HARD_PRESSURE_PERCENT: '85',
    HBX_FACTORY_MEMORY_PANIC_PRESSURE_PERCENT: '88',
  }, () => {
    const service = new HbxEnginePoolService({} as any);
    const forcedUntil = new Date(Date.now() + 60 * 60_000).toISOString();
    const forced = service.resolveFactoryAllowedEngines({
      engineCount: 20,
      onlineHealthyEngines: 20,
      manualReservedEngines: 0,
      memoryPressurePercent: 50,
      operationalConfig: { enabled: true, startHour: 22, startMinute: 0, endHour: 7, endMinute: 0, metadataJson: JSON.stringify({ forcedUntil }) },
      date: new Date('2026-05-09T15:00:00-03:00'),
    });
    const memoryStop = service.resolveFactoryAllowedEngines({
      engineCount: 20,
      onlineHealthyEngines: 20,
      manualReservedEngines: 0,
      memoryPressurePercent: 90,
      operationalConfig: { enabled: true, startHour: 22, startMinute: 0, endHour: 7, endMinute: 0, metadataJson: JSON.stringify({ forcedUntil }) },
      date: new Date('2026-05-09T15:00:00-03:00'),
    });
    assert.equal(forced.forcedActive, true);
    assert.equal(forced.windowStatus, 'open');
    assert.equal(forced.allowedEngines, 20);
    assert.equal(memoryStop.allowedEngines, 0);
    assert.equal(memoryStop.reason, 'memory_stop');
  });
});

test('factory emergency stop wins even when force night is active', () => {
  withEnv({ NODE_ENV: 'production', HBX_ENGINE_COUNT: '20', HBX_FACTORY_MAX_ENGINES: '' }, () => {
    const service = new HbxEnginePoolService({} as any);
    const allowed = service.resolveFactoryAllowedEngines({
      engineCount: 20,
      onlineHealthyEngines: 20,
      manualReservedEngines: 0,
      memoryPressurePercent: 50,
      operationalConfig: {
        enabled: true,
        startHour: 22,
        startMinute: 0,
        endHour: 7,
        endMinute: 0,
        metadataJson: JSON.stringify({
          forcedUntil: new Date(Date.now() + 60 * 60_000).toISOString(),
          emergencyStop: true,
        }),
      },
      date: new Date('2026-05-09T15:00:00-03:00'),
    });
    assert.equal(allowed.allowedEngines, 0);
    assert.equal(allowed.reason, 'emergency_stop');
    assert.equal(allowed.windowStatus, 'emergency_stop');
  });
});

test('factory scheduler reserves automatic capacity during client priority', () => {
  withEnv({ NODE_ENV: 'production', HBX_ENGINE_COUNT: '20', HBX_FACTORY_MAX_ENGINES: '', HBX_FACTORY_START_HOUR: '0', HBX_FACTORY_END_HOUR: '0' }, () => {
    const service = new HbxEnginePoolService({} as any);
    const allowed = service.resolveFactoryAllowedEngines({
      engineCount: 20,
      onlineHealthyEngines: 20,
      manualReservedEngines: 2,
      clientPriorityActive: true,
      memoryPressurePercent: 50,
      operationalConfig: { enabled: true, metadataJson: '{}' },
    });
    assert.equal(allowed.allowedEngines, 18);
    assert.equal(allowed.reservedEngines, 2);
    assert.equal(allowed.reason, 'client_priority');
  });
});

test('factory scheduler protects manual demand before automatic work', () => {
  withEnv({ NODE_ENV: 'production', HBX_ENGINE_COUNT: '20', HBX_FACTORY_MAX_ENGINES: '', HBX_FACTORY_START_HOUR: '0', HBX_FACTORY_END_HOUR: '0' }, () => {
    const service = new HbxEnginePoolService({} as any);
    const allowed = service.resolveFactoryAllowedEngines({
      engineCount: 20,
      onlineHealthyEngines: 20,
      manualReservedEngines: 2,
      clientPriorityActive: true,
      manualDemandActive: true,
      memoryPressurePercent: 50,
      operationalConfig: { enabled: true, metadataJson: '{}' },
    });
    assert.equal(allowed.allowedEngines, 18);
    assert.equal(allowed.reservedEngines, 2);
    assert.equal(allowed.reason, 'manual_demand');
  });
});

test('factory scheduler uses configured count inside the operational window', () => {
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

test('factory scheduler memory guard reduces and stops automatic work', () => {
  withEnv({
    NODE_ENV: 'production',
    HBX_ENGINE_COUNT: '50',
    HBX_FACTORY_MAX_ENGINES: '50',
    HBX_FACTORY_START_HOUR: '0',
    HBX_FACTORY_END_HOUR: '0',
    HBX_FACTORY_MEMORY_SOFT_PRESSURE_PERCENT: '82',
    HBX_FACTORY_MEMORY_HARD_PRESSURE_PERCENT: '85',
    HBX_FACTORY_MEMORY_PANIC_PRESSURE_PERCENT: '88',
  }, () => {
    const service = new HbxEnginePoolService({} as any);
    const at80 = service.resolveFactoryAllowedEngines({
      engineCount: 50,
      onlineHealthyEngines: 50,
      manualReservedEngines: 0,
      memoryPressurePercent: 80,
      operationalConfig: { enabled: true, metadataJson: '{}' },
    });
    const at83 = service.resolveFactoryAllowedEngines({
      engineCount: 50,
      onlineHealthyEngines: 50,
      manualReservedEngines: 0,
      memoryPressurePercent: 83,
      operationalConfig: { enabled: true, metadataJson: '{}' },
    });
    const at86 = service.resolveFactoryAllowedEngines({
      engineCount: 50,
      onlineHealthyEngines: 50,
      manualReservedEngines: 0,
      memoryPressurePercent: 86,
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
    assert.equal(at83.allowedEngines, 30);
    assert.equal(at83.reason, 'memory_guard');
    assert.equal(at86.allowedEngines, 12);
    assert.equal(at86.reason, 'memory_guard');
    assert.equal(at90.allowedEngines, 0);
    assert.equal(at90.reason, 'memory_stop');
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

test('factory scheduler respects business-day limiter when enabled', () => {
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
    assert.equal(weekend.allowedEngines, 0);
    assert.equal(weekend.reason, 'outside_business_days');
    assert.equal(monday.allowedEngines, 100);
  });
});

test('factory scheduler lets weekend always-on bypass only weekend window', () => {
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
    assert.equal(mondayAfternoon.allowedEngines, 0);
    assert.equal(mondayAfternoon.reason, 'outside_factory_window');
  });
});

test('HBX_ENGINE_MAX_COUNT can intentionally clamp engine count', () => {
  assert.equal(getConfiguredHbxEngineCount({ NODE_ENV: 'production', HBX_ENGINE_COUNT: '100', HBX_ENGINE_MAX_COUNT: '40' }), 40);
  assert.equal(getConfiguredHbxEngineCount({ NODE_ENV: 'production', HBX_ENGINE_COUNT: '220' }), 200);
  assert.equal(getConfiguredHbxEngineCount({ NODE_ENV: 'production', HBX_ENGINE_COUNT: '220', HBX_ENGINE_HARD_LIMIT: '120' }), 120);
});

function createPoolForCapacity(input: {
  queuedCount?: number;
  runningCount?: number;
  completedLast10Min?: number;
  partialLast10Min?: number;
  progressingRuns?: number;
  oldestQueuedAgeMinutes?: number;
  memoryPressurePercent?: number;
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
  service.resolveMemoryPressurePercent = () => Number(input.memoryPressurePercent ?? 50);
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

test('elastic sync wakes stopped engines below target and stops idle engines above target', async () => {
  await withEnv({
    NODE_ENV: 'production',
    HBX_ENGINE_COUNT: '5',
    HBX_ENGINE_MAX_COUNT: '5',
    HBX_ENGINE_WARM_MIN: '1',
    HBX_CLIENT_RESERVED_ENGINES: '0',
    // ENV override do ops = 4: com a elástica ligada o alvo SEGUE o headroom RAM+CPU mas o ENV explícito
    // ainda capa em 4 → desired=4, acorda 2/3 (standby) e para o 5 (acima do alvo). Valida a mecânica
    // de wake/stop com o novo contrato (elástica segue headroom, não o escalonador de fila legado).
    HBX_FACTORY_MAX_ENGINES: '4',
    HBX_FACTORY_START_HOUR: '0',
    HBX_FACTORY_END_HOUR: '0',
    // syncElasticEngineDesiredStates só roda quando o governor está habilitado por ENV (kill-switch
    // legado). Sem isso ele retorna cedo no warm e o teste mediria 1 em vez do alvo.
    HBX_ENGINE_GOVERNOR_ENABLED: '1',
  }, async () => {
    const rows = buildEngineRows(5);
    rows[1].status = 'stopped';
    rows[1].lastHealthStatus = 'offline';
    rows[2].status = 'stopped';
    rows[2].lastHealthStatus = 'offline';
    const updates: any[] = [];
    const service = createPoolForCapacity({ queuedCount: 100 }) as any;
    service.prisma = {
      hasTable: async (name: string) => name === 'HbxEngineLock',
      hbxEngineLock: {
        updateMany: async (input: any) => {
          updates.push(input);
          return { count: 1 };
        },
      },
      webscrapingSearchRun: {
        count: async () => 0,
      },
    };
    service.healthCheckEngines = async () => rows;
    service.getCurrentCapacityLevel = async () => ({
      activeEngineCount: 4,
      googleEmergencyMode: false,
      queuedCount: 100,
      runningCount: 0,
      operationalStatus: 'healthy',
      message: null,
      completedLast10Min: 0,
      partialLast10Min: 0,
      oldestQueuedAgeMinutes: 0,
      isTurboEnabled: false,
      isTurboWindowActive: false,
      isTurboForcedNow: false,
      forcedUntil: null,
      nextTurboAt: null,
    });

    const result = await service.syncElasticEngineDesiredStates();

    assert.equal(result.desiredRunningCount, 4);
    assert.equal(updates.some((input) => input.where.id === 'hbx-engine-2' && input.data.status === 'standby'), true);
    assert.equal(updates.some((input) => input.where.id === 'hbx-engine-3' && input.data.status === 'standby'), true);
    assert.equal(updates.some((input) => input.where.id === 'hbx-engine-5' && input.data.status === 'stopped'), true);
  });
});

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

test('automatic queue honors factory max while manual priority still sees the full pool', async () => {
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
    service.isWithinClientPriorityWindow = () => false;
    service.healthCheckEngines = async () => buildEngineRows(20);
    const automatic = await service.getEligibleEnginesForCurrentQueue('mass_data');
    const manual = await service.getEligibleEnginesForCurrentQueue('manual');
    assert.equal(automatic.length, 18);
    assert.equal(manual.length, 20);
  });
});

test('automatic queue reserves engines during client priority window', async () => {
  await withEnv({
    NODE_ENV: 'production',
    HBX_ENGINE_COUNT: '20',
    HBX_CLIENT_RESERVED_ENGINES: '2',
    HBX_FACTORY_MAX_ENGINES: '20',
    HBX_FACTORY_START_HOUR: '0',
    HBX_FACTORY_END_HOUR: '0',
    HBX_FACTORY_MEMORY_SOFT_PRESSURE_PERCENT: '100',
    HBX_FACTORY_MEMORY_HARD_PRESSURE_PERCENT: '100',
    HBX_FACTORY_MEMORY_PANIC_PRESSURE_PERCENT: '100',
  }, async () => {
    const service = createPoolForCapacity({ queuedCount: 100 }) as any;
    service.isWithinClientPriorityWindow = () => true;
    service.healthCheckEngines = async () => buildEngineRows(20);
    const automatic = await service.getEligibleEnginesForCurrentQueue('mass_data');
    const vendas = await service.getEligibleEnginesForCurrentQueue('vendas');
    assert.equal(automatic.length, 18);
    assert.equal(automatic.at(-1)?.id, 'hbx-engine-18');
    assert.equal(vendas.length, 20);
    assert.equal(vendas.at(-1)?.id, 'hbx-engine-20');
  });
});

test('automatic queue stops when memory pressure reaches panic threshold', async () => {
  await withEnv({
    NODE_ENV: 'production',
    HBX_ENGINE_COUNT: '20',
    HBX_CLIENT_RESERVED_ENGINES: '0',
    HBX_FACTORY_MAX_ENGINES: '20',
    HBX_FACTORY_START_HOUR: '0',
    HBX_FACTORY_END_HOUR: '0',
    HBX_FACTORY_MEMORY_SOFT_PRESSURE_PERCENT: '82',
    HBX_FACTORY_MEMORY_HARD_PRESSURE_PERCENT: '85',
    HBX_FACTORY_MEMORY_PANIC_PRESSURE_PERCENT: '88',
  }, async () => {
    const service = createPoolForCapacity({ queuedCount: 100, memoryPressurePercent: 90 }) as any;
    service.isWithinClientPriorityWindow = () => false;
    service.healthCheckEngines = async () => buildEngineRows(20);
    const automatic = await service.getEligibleEnginesForCurrentQueue('mass_data');
    const radar = await service.getEligibleEnginesForCurrentQueue('radar_digital');
    assert.equal(automatic.length, 0);
    assert.equal(radar.length, 20);
  });
});

test('automatic eligibility can use the full common pool when factory limit allows fifty', async () => {
  await withEnv({
    NODE_ENV: 'production',
    HBX_ENGINE_COUNT: '50',
    HBX_LIST_ENGINE_COUNT: '50',
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
    const enrichment = await service.getEligibleEnginesForCurrentQueue('lead_plus_enrichment');
    assert.equal(automatic.length, 50);
    assert.equal(automatic.some((engine: any) => engine.id === 'hbx-engine-21'), true);
    assert.equal(automatic.some((engine: any) => engine.id === 'hbx-engine-50'), true);
    assert.equal(enrichment.length, 50);
    assert.equal(enrichment[0]?.id, 'hbx-engine-1');
    assert.equal(enrichment.at(-1)?.id, 'hbx-engine-50');
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

test('eligible engines ignore draining and stopped engines without treating pause as stop', async () => {
  await withEnv({ NODE_ENV: 'production', HBX_ENGINE_COUNT: '4' }, async () => {
    const service = createPoolForCapacity({ queuedCount: 100 }) as any;
    const rows = buildEngineRows(4);
    rows[1].status = 'draining';
    rows[1].lockedRunId = 'campaign-1:mass:1';
    rows[1].lockedUntil = new Date(Date.now() + 60_000);
    rows[2].status = 'stopped';
    service.healthCheckEngines = async () => rows;
    const eligible = await service.getEligibleEnginesForCurrentQueue('manual');
    assert.deepEqual(eligible.map((engine: any) => engine.id), ['hbx-engine-1', 'hbx-engine-4']);
  });
});

test('drain marks busy engine as draining and keeps the active lease', async () => {
  const updates: any[] = [];
  const lockedUntil = new Date(Date.now() + 60_000);
  const row = {
    id: 'hbx-engine-2',
    engineIndex: 1,
    url: 'http://hbx-engine-2:8001',
    status: 'busy',
    lastHealthStatus: 'online',
    lockedRunId: 'campaign-1:mass:1',
    lockedUntil,
  };
  const service = new HbxEnginePoolService({
    hasTable: async (name: string) => name === 'HbxEngineLock',
    hbxEngineLock: {
      findUnique: async () => row,
      updateMany: async (input: any) => {
        updates.push(input);
        return { count: 1 };
      },
    },
  } as any) as any;
  service.refreshEngineRegistryFromEnv = async () => [];
  service.getDashboardEngineStatus = async () => ({ ok: true });
  service.getOperationalConfig = async () => ({ metadataJson: '{"drainTimeoutSeconds":30}' });

  await service.drainEngine('hbx-engine-2');

  assert.equal(updates[0].data.status, 'draining');
  assert.equal(updates[0].data.manualPaused, false);
  assert.equal(updates[0].data.lockedRunId, undefined);
  assert.equal(updates[0].data.pausedUntil instanceof Date, true);
});

test('release of draining engine moves it to stopped and clears the lease', async () => {
  const updates: any[] = [];
  const row = {
    id: 'hbx-engine-2',
    engineIndex: 1,
    url: 'http://hbx-engine-2:8001',
    status: 'draining',
    lastHealthStatus: 'online',
    lockedRunId: 'campaign-1:mass:1',
    lockedUntil: new Date(Date.now() + 60_000),
  };
  const service = new HbxEnginePoolService({
    hasTable: async (name: string) => name === 'HbxEngineLock',
    hbxEngineLock: {
      findUnique: async () => row,
      update: async (input: any) => {
        updates.push(input);
        return { ...row, ...input.data };
      },
    },
  } as any) as any;

  await service.releaseEngine('hbx-engine-2');

  assert.equal(updates[0].data.status, 'stopped');
  assert.equal(updates[0].data.lockedRunId, null);
  assert.equal(updates[0].data.pausedUntil, null);
});

test('stop on idle engine marks stopped without force requeue', async () => {
  const updates: any[] = [];
  const row = {
    id: 'hbx-engine-3',
    engineIndex: 2,
    url: 'http://hbx-engine-3:8001',
    status: 'online',
    lastHealthStatus: 'online',
    lockedRunId: null,
    lockedUntil: null,
  };
  const service = new HbxEnginePoolService({
    hasTable: async (name: string) => name === 'HbxEngineLock',
    hbxEngineLock: {
      findUnique: async () => row,
      updateMany: async (input: any) => {
        updates.push(input);
        return { count: 1 };
      },
    },
  } as any) as any;
  service.refreshEngineRegistryFromEnv = async () => [];
  service.getDashboardEngineStatus = async () => ({ ok: true });

  await service.stopEngine('hbx-engine-3');

  assert.equal(updates[0].data.status, 'stopped');
  assert.equal(updates[0].data.lockedRunId, null);
  assert.equal(updates[0].data.lastError, 'Motor aguardando parada fisica pelo governor.');
});

test('force stop requeues active campaign task and search run before stopping', async () => {
  const lockUpdates: any[] = [];
  const taskUpdates: any[] = [];
  const runUpdates: any[] = [];
  const row = {
    id: 'hbx-engine-4',
    engineIndex: 3,
    url: 'http://hbx-engine-4:8001',
    status: 'busy',
    lastHealthStatus: 'online',
    lockedRunId: 'campaign-1:mass:3',
    lockedUntil: new Date(Date.now() + 60_000),
  };
  const service = new HbxEnginePoolService({
    hasTable: async (name: string) => ['HbxEngineLock', 'WebscrapingCampaignTask', 'WebscrapingSearchRun'].includes(name),
    hbxEngineLock: {
      findUnique: async () => row,
      updateMany: async (input: any) => {
        lockUpdates.push(input);
        return { count: 1 };
      },
    },
    webscrapingCampaignTask: {
      updateMany: async (input: any) => {
        taskUpdates.push(input);
        return { count: 1 };
      },
    },
    webscrapingSearchRun: {
      updateMany: async (input: any) => {
        runUpdates.push(input);
        return { count: 1 };
      },
    },
  } as any) as any;
  service.refreshEngineRegistryFromEnv = async () => [];
  service.getDashboardEngineStatus = async () => ({ ok: true });

  await service.stopEngine('hbx-engine-4', { force: true });

  assert.equal(taskUpdates[0].where.lockedByEngineId, 'hbx-engine-4');
  assert.equal(taskUpdates[0].data.status, 'queued');
  assert.equal(runUpdates[0].where.assignedEngineId, 'hbx-engine-4');
  assert.equal(runUpdates[0].data.status, 'queued');
  assert.equal(lockUpdates.at(-1).data.status, 'stopped');
  assert.equal(lockUpdates.at(-1).data.lockedRunId, null);
});

test('factory drain keeps client reserved engine and drains factory engines', async () => {
  const drained: string[] = [];
  const rows = [
    {
      id: 'hbx-engine-1',
      engineIndex: 0,
      status: 'online',
      lockedRunId: null,
      lockedUntil: null,
    },
    {
      id: 'hbx-engine-2',
      engineIndex: 1,
      status: 'busy',
      lockedRunId: 'campaign-1:mass:1',
      lockedUntil: new Date(Date.now() + 60_000),
    },
    {
      id: 'hbx-engine-3',
      engineIndex: 2,
      status: 'online',
      lockedRunId: null,
      lockedUntil: null,
    },
  ];
  const service = new HbxEnginePoolService({
    hasTable: async (name: string) => name === 'HbxEngineLock',
    hbxEngineLock: {
      findMany: async () => rows,
    },
  } as any) as any;
  service.refreshEngineRegistryFromEnv = async () => [];
  service.getSchedulerStatus = async () => ({ manualReservedEngines: 1 });
  service.drainEngine = async (id: string) => {
    drained.push(id);
    return { ok: true };
  };

  const result = await service.drainFactoryEngines({ seconds: 30, reason: 'test' });

  assert.equal(result.affected, 2);
  assert.deepEqual(drained, ['hbx-engine-2', 'hbx-engine-3']);
});

test('operational turbo config scales demand-driven: full queue uses all engines', async () => {
  await withEnv({ NODE_ENV: 'production', HBX_ENGINE_COUNT: '20', HBX_CAPACITY_FULL_QUEUE_THRESHOLD: '100' }, async () => {
    const service = createPoolForCapacity({
      queuedCount: 100,
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

test('operational turbo config scales demand-driven: small queue uses proportional engines', async () => {
  await withEnv({ NODE_ENV: 'production', HBX_ENGINE_COUNT: '20', HBX_CAPACITY_FULL_QUEUE_THRESHOLD: '100' }, async () => {
    const service = createPoolForCapacity({
      queuedCount: 1,
      operationalConfig: {
        enabled: true,
        engineCount: 20,
        intensity: 'turbo',
      },
    });
    const capacity = await service.getCurrentCapacityLevel();
    assert.equal(capacity.activeEngineCount, 1);
  });
});

test('queue stats ignore queued tasks from sleeping campaigns', async () => {
  const taskCountQueries: any[] = [];
  const taskFindQueries: any[] = [];
  const service = new HbxEnginePoolService({
    hasTable: async (name: string) => name === 'WebscrapingCampaignTask',
    webscrapingSearchRun: {
      count: async () => 0,
      findFirst: async () => null,
    },
    webscrapingCampaignTask: {
      count: async (input: any) => {
        taskCountQueries.push(input);
        if (input?.where?.status === 'queued') {
          return input.where.campaign ? 0 : 3721;
        }
        return 0;
      },
      findFirst: async (input: any) => {
        taskFindQueries.push(input);
        return null;
      },
    },
  } as any) as any;

  const stats = await service.buildQueueStats();

  assert.equal(stats.queuedCount, 0);
  assert.equal(taskCountQueries[0]?.where?.campaign?.status?.in.includes('running'), true);
  assert.equal(taskFindQueries[0]?.where?.campaign?.status?.in.includes('queued'), true);
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

// ── Parallelism fix: all HTTP-healthy engines must count and be eligible ──────

test('all twenty HTTP-healthy engines count as onlineHealthyEngines (not just index 0)', async () => {
  // Before the fix, only engineIndex===0 was promoted to 'online'; others got 'standby'
  // and isHealthyEngine returned false for engines with lastHealthStatus 'offline'.
  // After the fix, all engines with lastHealthStatus 'online' count regardless of index.
  await withEnv({
    NODE_ENV: 'production',
    HBX_ENGINE_COUNT: '20',
    HBX_FACTORY_MAX_ENGINES: '',
    HBX_FACTORY_START_HOUR: '0',
    HBX_FACTORY_END_HOUR: '0',
    HBX_AUTONOMOUS_MAX_MEMORY_PRESSURE_PERCENT: '100',
  }, async () => {
    const service = createPoolForCapacity({ queuedCount: 100 }) as any;
    // Simulate 20 engines all reporting lastHealthStatus 'online' (as healthCheckEngines
    // would set after the fix: every HTTP-healthy engine becomes status 'online').
    service.healthCheckEngines = async () => buildEngineRows(20);
    const scheduler = await service.getSchedulerStatus();
    assert.equal(scheduler.onlineHealthyEngines, 20,
      'all 20 healthy engines must be counted; fix removes the engineIndex===0 gate');
  });
});

test('eligible engines reach the full allowed count when the fleet is healthy under load', async () => {
  // Manual/reserved engines aside, index > 0 engines must not be blocked by the old index-0 gate.
  // Use HBX_MANUAL_RESERVED_ENGINES=0 and HBX_CLIENT_RESERVED_ENGINES=0 so the full fleet is allowed.
  await withEnv({
    NODE_ENV: 'production',
    HBX_ENGINE_COUNT: '20',
    HBX_FACTORY_MAX_ENGINES: '',
    HBX_FACTORY_START_HOUR: '0',
    HBX_FACTORY_END_HOUR: '0',
    HBX_MANUAL_RESERVED_ENGINES: '0',
    HBX_CLIENT_RESERVED_ENGINES: '0',
    HBX_AUTONOMOUS_MAX_MEMORY_PRESSURE_PERCENT: '100',
    HBX_RADAR_CLIENT_PRIORITY_START_HOUR: '23',
    HBX_RADAR_CLIENT_PRIORITY_END_HOUR: '0',
  }, async () => {
    const service = createPoolForCapacity({ queuedCount: 100 }) as any;
    service.isWithinClientPriorityWindow = () => false;
    service.healthCheckEngines = async () => buildEngineRows(20);
    const eligible = await service.getEligibleEnginesForCurrentQueue('mass_data');
    assert.equal(eligible.length, 20,
      'all 20 engines must be eligible when healthy, queue is full, and no reservations');
    // Confirm the last engine (index 19) is included — it was previously stuck at standby.
    assert.equal(eligible.some((engine: any) => engine.engineIndex === 19), true,
      'engine at index 19 must be eligible after the engineIndex===0 gate removal');
  });
});

test('standby engines with stale offline health are excluded; only HTTP-healthy ones are eligible', async () => {
  // This simulates the pre-fix scenario: governor started engines but their
  // lastHealthStatus is still 'offline' (TTL skipped the re-poll). They must NOT be
  // eligible until health is confirmed. Once health is online, they must be eligible.
  await withEnv({
    NODE_ENV: 'production',
    HBX_ENGINE_COUNT: '5',
    HBX_FACTORY_MAX_ENGINES: '',
    HBX_FACTORY_START_HOUR: '0',
    HBX_FACTORY_END_HOUR: '0',
    HBX_MANUAL_RESERVED_ENGINES: '0',
    HBX_CLIENT_RESERVED_ENGINES: '0',
    HBX_AUTONOMOUS_MAX_MEMORY_PRESSURE_PERCENT: '100',
    HBX_RADAR_CLIENT_PRIORITY_START_HOUR: '23',
    HBX_RADAR_CLIENT_PRIORITY_END_HOUR: '0',
  }, async () => {
    const service = createPoolForCapacity({ queuedCount: 100 }) as any;
    service.isWithinClientPriorityWindow = () => false;
    const rows = buildEngineRows(5);
    // Engines 2-4 still have stale offline health (governor-started but not yet re-polled).
    rows[1].status = 'standby';
    (rows[1] as any).lastHealthStatus = 'offline';
    rows[2].status = 'standby';
    (rows[2] as any).lastHealthStatus = 'offline';
    rows[3].status = 'standby';
    (rows[3] as any).lastHealthStatus = 'offline';
    service.healthCheckEngines = async () => rows;
    const eligible = await service.getEligibleEnginesForCurrentQueue('mass_data');
    // Only engine-1 (index 0, online+healthy) and engine-5 (index 4, online+healthy) qualify.
    assert.equal(eligible.length, 2);
    assert.equal(eligible.some((engine: any) => engine.id === 'hbx-engine-1'), true);
    assert.equal(eligible.some((engine: any) => engine.id === 'hbx-engine-5'), true);
    // Once health flips to online, all five must become eligible.
    rows[1].status = 'online';
    (rows[1] as any).lastHealthStatus = 'online';
    rows[2].status = 'online';
    (rows[2] as any).lastHealthStatus = 'online';
    rows[3].status = 'online';
    (rows[3] as any).lastHealthStatus = 'online';
    const eligibleAfterHealthCheck = await service.getEligibleEnginesForCurrentQueue('mass_data');
    assert.equal(eligibleAfterHealthCheck.length, 5,
      'after health re-poll all five engines with online status must be eligible');
  });
});

// ── Elástico RAM+CPU: teto efetivo = min(RAM, CPU), travado em [warmMin, frota] ──────────────────

test('parseProcStatCpuSample reads idle+iowait and total from the aggregate cpu line', () => {
  // cpu user nice system idle iowait irq softirq steal ...
  const sample = parseProcStatCpuSample('cpu  100 0 50 800 40 0 10 0 0 0\ncpu0 ...');
  assert.deepEqual(sample, { idle: 840, total: 1000 });
  assert.equal(parseProcStatCpuSample('no cpu line here'), null);
});

test('elastic headroom never exceeds the declared fleet even with idle CPU and RAM', () => {
  withEnv({ NODE_ENV: 'production', HBX_ENGINE_COUNT: '20', HBX_ENGINE_WARM_MIN: '1' }, () => {
    const service = new HbxEnginePoolService({} as any) as any;
    service.resolveMemoryPressurePercent = () => 10;
    service.resolveCpuPressurePercent = () => 5;
    const headroom = service.resolveElasticHeadroomEngineCount({ enabled: true, metadataJson: '{}' });
    // Trava absoluta: nunca passa de getConfiguredHbxEngineCount() (=20), mesmo com tudo folgado.
    assert.equal(headroom, 20);
  });
});

test('elastic headroom is the min of the RAM ceiling and the CPU ceiling', () => {
  withEnv({
    NODE_ENV: 'production',
    HBX_ENGINE_COUNT: '20',
    HBX_ENGINE_WARM_MIN: '1',
    HBX_FACTORY_MEMORY_SOFT_PRESSURE_PERCENT: '82',
    HBX_FACTORY_MEMORY_HARD_PRESSURE_PERCENT: '85',
    HBX_FACTORY_CPU_SOFT_PRESSURE_PERCENT: '80',
    HBX_FACTORY_CPU_HARD_PRESSURE_PERCENT: '88',
  }, () => {
    const service = new HbxEnginePoolService({} as any) as any;
    // RAM folgada (teto 20), CPU em banda hard (>=88 → 0.25*20=5). min(20,5)=5.
    service.resolveMemoryPressurePercent = () => 50;
    service.resolveCpuPressurePercent = () => 90;
    const cpuBound = service.resolveElasticHeadroomEngineCount({ enabled: true, metadataJson: '{}' });
    assert.equal(cpuBound, 5);
  });
});

test('elastic ON neutralizes a forced low factoryMaxEngines from the DB metadata', async () => {
  await withEnv({
    NODE_ENV: 'production',
    HBX_ENGINE_COUNT: '20',
    HBX_ENGINE_WARM_MIN: '1',
    HBX_FACTORY_MAX_ENGINES: '',
    HBX_FACTORY_START_HOUR: '0',
    HBX_FACTORY_END_HOUR: '0',
    HBX_CLIENT_RESERVED_ENGINES: '0',
    HBX_RADAR_CLIENT_PRIORITY_START_HOUR: '23',
    HBX_RADAR_CLIENT_PRIORITY_END_HOUR: '0',
  }, async () => {
    const service = new HbxEnginePoolService({} as any) as any;
    service.isWithinClientPriorityWindow = () => false;
    service.healthCheckEngines = async () => buildEngineRows(20);
    service.hasManualDemand = async () => false;
    service.getConfiguredEngineUrls = async () => buildEngineRows(20).map((r: any) => r.url);
    service.resolveMemoryPressurePercent = () => 40;
    service.resolveCpuPressurePercent = () => 30;
    // turbo_noturno forçado em 1 (o cap que prendia a fábrica), mas elástica LIGADA (default).
    service.getOperationalConfig = async () => ({ enabled: true, metadataJson: '{"factoryMaxEngines":1,"factoryMinEngines":1}' });
    const scheduler = await service.getSchedulerStatus();
    assert.equal(scheduler.elasticEnabled, true);
    // O teto forçado (1) NÃO segura mais: RAM+CPU folgados → frota inteira liberada.
    assert.equal(scheduler.automaticAllowedEngines, 20);
    assert.equal(scheduler.elasticHeadroomEngines, 20);
  });
});

test('elastic OFF lets the forced DB factoryMaxEngines cap hold (manual override respected)', async () => {
  await withEnv({
    NODE_ENV: 'production',
    HBX_ENGINE_COUNT: '20',
    HBX_ENGINE_WARM_MIN: '1',
    HBX_FACTORY_MAX_ENGINES: '',
    HBX_FACTORY_START_HOUR: '0',
    HBX_FACTORY_END_HOUR: '0',
    HBX_CLIENT_RESERVED_ENGINES: '0',
    HBX_RADAR_CLIENT_PRIORITY_START_HOUR: '23',
    HBX_RADAR_CLIENT_PRIORITY_END_HOUR: '0',
  }, async () => {
    const service = new HbxEnginePoolService({} as any) as any;
    service.isWithinClientPriorityWindow = () => false;
    service.healthCheckEngines = async () => buildEngineRows(20);
    service.hasManualDemand = async () => false;
    service.getConfiguredEngineUrls = async () => buildEngineRows(20).map((r: any) => r.url);
    service.resolveMemoryPressurePercent = () => 40;
    service.resolveCpuPressurePercent = () => 30;
    // elasticEnabled=false → o teto forçado do banco (4) volta a valer como override manual.
    service.getOperationalConfig = async () => ({ enabled: true, metadataJson: '{"elasticEnabled":false,"factoryMaxEngines":4}' });
    const scheduler = await service.getSchedulerStatus();
    assert.equal(scheduler.elasticEnabled, false);
    assert.equal(scheduler.automaticAllowedEngines, 4);
  });
});
