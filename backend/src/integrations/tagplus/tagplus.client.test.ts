import test from 'node:test';
import assert from 'node:assert/strict';

import { TagPlusClient } from './tagplus.client';

test('listReceivables paginates TagPlus with bearer token auth', async () => {
  const previousBaseUrl = process.env.TAGPLUS_API_BASE_URL;
  const previousReceivablesPath = process.env.TAGPLUS_RECEIVABLES_PATH;
  const previousAuthMode = process.env.TAGPLUS_AUTH_MODE;

  try {
    process.env.TAGPLUS_API_BASE_URL = 'https://tagplus.example.com';
    process.env.TAGPLUS_RECEIVABLES_PATH = '/receivables';
    process.env.TAGPLUS_AUTH_MODE = 'bearer_token';

    const requestCalls: Array<any> = [];
    const client = new TagPlusClient({
      requestJson: async (options: any) => {
        requestCalls.push(options);
        return {
          data:
            requestCalls.length === 1
              ? { items: [{ invoiceId: 'inv-1', customerId: 'cust-1' }, { invoiceId: 'inv-2', customerId: 'cust-2' }] }
              : { items: [{ invoiceId: 'inv-3', customerId: 'cust-3' }] },
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

    const result = await client.listReceivables(
      {
        token: 'tagplus-token',
      },
      { updatedSince: '2026-04-01T00:00:00.000Z' },
    );

    assert.equal(result.source, 'remote');
    assert.equal(result.items.length, 3);
    assert.equal(requestCalls.length, 2);
    assert.equal(requestCalls[0].path, '/receivables');
    assert.equal(requestCalls[0].headers.Authorization, 'Bearer tagplus-token');
    assert.equal(requestCalls[0].params.updatedAt, '2026-04-01T00:00:00.000Z');
    assert.equal(requestCalls[0].params.page, 1);
    assert.equal(requestCalls[1].params.page, 2);
  } finally {
    if (previousBaseUrl === undefined) delete process.env.TAGPLUS_API_BASE_URL;
    else process.env.TAGPLUS_API_BASE_URL = previousBaseUrl;
    if (previousReceivablesPath === undefined) delete process.env.TAGPLUS_RECEIVABLES_PATH;
    else process.env.TAGPLUS_RECEIVABLES_PATH = previousReceivablesPath;
    if (previousAuthMode === undefined) delete process.env.TAGPLUS_AUTH_MODE;
    else process.env.TAGPLUS_AUTH_MODE = previousAuthMode;
  }
});

test('listCustomers reports explicit fallback when TagPlus customers endpoint is not configured', async () => {
  const previousCustomersPath = process.env.TAGPLUS_CUSTOMERS_PATH;

  try {
    delete process.env.TAGPLUS_CUSTOMERS_PATH;
    const client = new TagPlusClient({} as any);
    const result = await client.listCustomers({ token: 'tagplus-token' });

    assert.equal(result.items.length, 0);
    assert.match(String(result.note || ''), /customers endpoint nao configurado/i);
  } finally {
    if (previousCustomersPath === undefined) delete process.env.TAGPLUS_CUSTOMERS_PATH;
    else process.env.TAGPLUS_CUSTOMERS_PATH = previousCustomersPath;
  }
});