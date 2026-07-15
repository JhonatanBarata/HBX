import test from 'node:test';
import assert from 'node:assert/strict';
import { isRetiredWebscrapingPath } from './webscraping-runtime.util';

test('removed history and generic lead-harvest paths never fall through to the legacy proxy', () => {
  const removedPaths = [
    '/webscraping/history',
    '/webscraping/history?limit=20',
    '/hbx/webscraping/history',
    '/webscraping/lead-harvest/import',
    '/webscraping/lead-harvest/imports/batch-1',
    '/hbx/webscraping/lead-harvest/import',
  ];

  for (const path of removedPaths) {
    assert.equal(isRetiredWebscrapingPath(path), true, path);
  }

  assert.equal(isRetiredWebscrapingPath('/webscraping/radar/count'), false);
  assert.equal(isRetiredWebscrapingPath('/hbx/webscraping/web-search'), false);
});
