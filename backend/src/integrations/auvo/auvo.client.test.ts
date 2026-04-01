import test from 'node:test';
import assert from 'node:assert/strict';

import { AuvoClient } from './auvo.client';

test('listRecords paginates AUVO tasks with appKey + token query auth', async () => {
  const previousBaseUrl = process.env.AUVO_API_BASE_URL;
  const previousTasksPath = process.env.AUVO_TASKS_PATH;
  const previousCustomersPath = process.env.AUVO_CUSTOMERS_PATH;
  const previousAuthMode = process.env.AUVO_AUTH_MODE;

  try {
    process.env.AUVO_API_BASE_URL = 'https://auvo.example.com';
    process.env.AUVO_TASKS_PATH = '/tasks';
    process.env.AUVO_CUSTOMERS_PATH = '/customers';
    process.env.AUVO_AUTH_MODE = 'app_key_token_query';

    const requestCalls: Array<any> = [];
    const client = new AuvoClient({
      requestJson: async (options: any) => {
        requestCalls.push(options);
        return {
          data:
            requestCalls.length === 1
              ? { items: [{ taskID: 1, orientation: 'Primeira OS' }, { taskID: 2, orientation: 'Segunda OS' }] }
              : { items: [{ taskID: 3, orientation: 'Terceira OS' }] },
          status: 200,
          headers: {},
          durationMs: 1,
        };
      },
      paginate: async ({ requestPage, extractItems }: any) => {
        const page1 = await requestPage(1);
        const page2 = await requestPage(2);
        return {
          items: [...extractItems(page1), ...extractItems(page2)],
          pagesFetched: 2,
          lastPage: 2,
          hasMore: false,
        };
      },
    } as any);

    const result = await client.listRecords(
      {
        token: 'auvo-token',
        appKey: 'auvo-app-key',
      },
      { updatedSince: '2026-04-01T00:00:00.000Z' },
    );

    assert.equal(result.source, 'remote');
    assert.equal(result.items.length, 3);
    assert.equal(String(result.items[0].taskID), '1');
    assert.equal(requestCalls.length, 2);
    assert.equal(requestCalls[0].path, '/tasks');
    assert.equal(requestCalls[0].params.token, 'auvo-token');
    assert.equal(requestCalls[0].params.appKey, 'auvo-app-key');
    assert.equal(requestCalls[0].params.updatedAt, '2026-04-01T00:00:00.000Z');
    assert.equal(requestCalls[0].params.page, 1);
    assert.equal(requestCalls[1].params.page, 2);
  } finally {
    if (previousBaseUrl === undefined) delete process.env.AUVO_API_BASE_URL;
    else process.env.AUVO_API_BASE_URL = previousBaseUrl;
    if (previousTasksPath === undefined) delete process.env.AUVO_TASKS_PATH;
    else process.env.AUVO_TASKS_PATH = previousTasksPath;
    if (previousCustomersPath === undefined) delete process.env.AUVO_CUSTOMERS_PATH;
    else process.env.AUVO_CUSTOMERS_PATH = previousCustomersPath;
    if (previousAuthMode === undefined) delete process.env.AUVO_AUTH_MODE;
    else process.env.AUVO_AUTH_MODE = previousAuthMode;
  }
});

test('listCustomers reports explicit fallback when AUVO customers endpoint is not configured', async () => {
  const previousCustomersPath = process.env.AUVO_CUSTOMERS_PATH;

  try {
    delete process.env.AUVO_CUSTOMERS_PATH;
    const client = new AuvoClient({} as any);
    const result = await client.listCustomers({ token: 'auvo-token' });

    assert.equal(result.items.length, 0);
    assert.match(String(result.note || ''), /customers endpoint nao configurado/i);
  } finally {
    if (previousCustomersPath === undefined) delete process.env.AUVO_CUSTOMERS_PATH;
    else process.env.AUVO_CUSTOMERS_PATH = previousCustomersPath;
  }
});