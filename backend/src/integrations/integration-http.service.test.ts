import test from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';

import { IntegrationHttpService } from './integration-http.service';

test('requestJson retries transient failures with bounded attempts', async () => {
  const originalRequest = axios.request;
  let attempts = 0;

  try {
    (axios as any).request = async () => {
      attempts += 1;
      if (attempts < 3) {
        const error: any = new Error('timeout');
        error.code = 'ECONNABORTED';
        throw error;
      }

      return {
        status: 200,
        data: { ok: true },
        headers: {},
      };
    };

    const service = new IntegrationHttpService();
    const response = await service.requestJson<{ ok: boolean }>({
      provider: 'AUVO',
      purpose: 'testConnection',
      method: 'GET',
      baseUrl: 'https://api.example.com',
      path: '/health',
      retryAttempts: 2,
      backoffMs: 0,
      timeoutMs: 1000,
    });

    assert.equal(response.data.ok, true);
    assert.equal(attempts, 3);
  } finally {
    (axios as any).request = originalRequest;
  }
});

test('computeBackoffDelay grows linearly by attempt', () => {
  const service = new IntegrationHttpService();
  assert.equal(service.computeBackoffDelay(250, 1), 250);
  assert.equal(service.computeBackoffDelay(250, 2), 500);
  assert.equal(service.computeBackoffDelay(250, 3), 750);
});

test('paginate walks pages until extractor returns less than page size', async () => {
  const service = new IntegrationHttpService();
  const requestedPages: number[] = [];
  const result = await service.paginate<{ items: string[] }, string>({
    provider: 'TAGPLUS',
    purpose: 'listReceivables',
    pageSize: 2,
    requestPage: async (page) => {
      requestedPages.push(page);
      if (page === 1) return { items: ['a', 'b'] };
      if (page === 2) return { items: ['c'] };
      return { items: [] };
    },
    extractItems: (payload) => payload.items,
  });

  assert.deepEqual(requestedPages, [1, 2]);
  assert.deepEqual(result.items, ['a', 'b', 'c']);
  assert.equal(result.pagesFetched, 2);
  assert.equal(result.hasMore, false);
});