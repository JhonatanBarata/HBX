'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../server');

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address()));
  });
}

async function waitForCompleted(baseUrl, id) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const response = await fetch(`${baseUrl}/local-lab/jobs/${id}`);
    const body = await response.json();
    if (['completed', 'failed', 'canceled'].includes(body.status)) return body;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error('job_timeout');
}

test('server cria job local, consulta status e exporta JSONL', async () => {
  const server = createServer();
  const address = await listen(server);
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const createdResponse = await fetch(`${baseUrl}/local-lab/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        city: 'Rio Claro',
        state: 'SP',
        segment: 'clinicas',
        targetEmails: 2,
        providers: ['web_query'],
        candidates: [{
          name: 'Clinica Real',
          website: 'https://clinicareal.com.br',
          sourceUrl: 'https://clinicareal.com.br',
        }],
      }),
    });
    assert.equal(createdResponse.status, 202);
    const created = await createdResponse.json();
    assert.equal(created.status, 'queued');

    const completed = await waitForCompleted(baseUrl, created.id);
    assert.equal(completed.status, 'completed');
    assert.equal(completed.exportReady, true);

    const leadsResponse = await fetch(`${baseUrl}/local-lab/jobs/${created.id}/export?file=leads`);
    assert.equal(leadsResponse.status, 200);
    assert.match(leadsResponse.headers.get('content-type') || '', /application\/x-ndjson/);
    const leadsText = await leadsResponse.text();
    assert.match(leadsText, /Clinica Real/);

    const batchResponse = await fetch(`${baseUrl}/local-lab/jobs/${created.id}/export`);
    const batch = await batchResponse.json();
    assert.equal(batch.batch.sourceMode, 'local_lab');
    assert.equal(batch.batch.leads.length, 1);

    const cancelResponse = await fetch(`${baseUrl}/local-lab/jobs/${created.id}/cancel`, { method: 'POST' });
    assert.equal(cancelResponse.status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
