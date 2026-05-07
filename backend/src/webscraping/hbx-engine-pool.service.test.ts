import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHbxEngineUrls, resolveConfiguredHbxEngineUrls } from './hbx-engine-pool.service';

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
});
