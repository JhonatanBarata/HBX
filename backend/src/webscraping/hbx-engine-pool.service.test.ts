import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHbxEngineUrls, resolveConfiguredHbxEngineUrls } from './hbx-engine-pool.service';

test('parseHbxEngineUrls trims, removes trailing slashes, and limits to four URLs', () => {
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
  const dockerUrls = [
    'http://hbx-engine-1:8001',
    'http://hbx-engine-2:8001',
    'http://hbx-engine-3:8001',
    'http://hbx-engine-4:8001',
  ];

  assert.deepEqual(resolveConfiguredHbxEngineUrls({ NODE_ENV: 'production' }), dockerUrls);
  assert.deepEqual(
    resolveConfiguredHbxEngineUrls({
      NODE_ENV: 'production',
      HBX_ENGINE_URLS: 'http://localhost:8001,http://localhost:8002,http://localhost:8003,http://localhost:8004',
    }),
    dockerUrls,
  );
});
