/*
  Smoke test for WhatsApp integration.

  Requirements:
  - Backend running (APP_PORT)
  - Valid JWT token in env TOKEN (or skip enqueue and only test webhook)
  - For dry-run sending: WHATSAPP_ENABLED=false in backend env

  Usage:
    $env:APP_PORT=3000
    $env:TOKEN="<jwt>"
    node scripts/whatsapp-smoke.js
*/

const PORT = process.env.APP_PORT || 3000;
const BASE = `http://127.0.0.1:${PORT}`;

const httpMod = require('http');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function http(method, path, body, headers = {}) {
  const url = new URL(`${BASE}${path}`);
  const payload = body ? JSON.stringify(body) : null;

  const reqHeaders = {
    'Content-Type': 'application/json',
    ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
    ...headers,
  };

  return new Promise((resolve, reject) => {
    const req = httpMod.request(
      {
        method,
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        headers: reqHeaders,
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (text += chunk));
        res.on('end', () => {
          let json;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            json = { raw: text };
          }
          resolve({ status: res.statusCode || 0, json });
        });
      },
    );
    req.on('error', (err) => reject(err));
    if (payload) req.write(payload);
    req.end();
  });
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForBackend() {
  const maxAttempts = 25;
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const r = await http('GET', '/health', null);
      if (r.status === 200) return true;
    } catch (e) {
      // ignore
    }
    await sleep(400);
  }
  throw new Error('Backend not ready on /health');
}

async function httpWithRetry(method, path, body, headers = {}) {
  const maxAttempts = 4;
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      return await http(method, path, body, headers);
    } catch (e) {
      const msg = String(e && e.message ? e.message : e);
      const transient = /socket hang up|ECONNRESET|ECONNREFUSED/i.test(msg);
      if (!transient || i === maxAttempts) throw e;
      await sleep(250 * i);
    }
  }
}

async function main() {
  console.log('0) Aguardando backend ficar pronto (/health)...');
  await waitForBackend();

  console.log('1) Obtendo JWT (signup/login automático, sem seeds)...');
  let token = process.env.TOKEN;
  const slug = `smoke-co-${Date.now()}`;
  if (!token) {
    const email = `smoke_${Date.now()}@test.local`;
    const username = `smoke_${Date.now()}`;
    const password = 'smoke12345';
    const sr = await httpWithRetry('POST', '/auth/signup', { username, email, password, name: 'Smoke' });
    assert(sr.status === 201 || sr.status === 200, `signup failed: HTTP ${sr.status}`);
    token = sr.json?.access_token;
    assert(typeof token === 'string' && token.length > 10, 'signup missing access_token');
    console.log('   created user:', username);
    console.log('   company slug:', slug);
  } else {
    console.log('   using TOKEN from env');
  }

  console.log('2) Confirmando Company no contexto do JWT...');
  const meCompany = await httpWithRetry('GET', '/companies', null, { Authorization: `Bearer ${token}` });
  assert(meCompany.status === 200, `companies list failed: HTTP ${meCompany.status}`);
  assert(Array.isArray(meCompany.json) && meCompany.json.length === 1, 'expected exactly 1 company in context');
  console.log('   company id:', meCompany.json[0]?.id);

  console.log('3) Verificando status do WhatsApp (onboarding obrigatório)...');
  const sr = await httpWithRetry('GET', '/companies/me/whatsapp-status?refresh=true', null, { Authorization: `Bearer ${token}` });
  assert(sr.status === 200, `whatsapp status failed: HTTP ${sr.status}`);
  console.log('   whatsapp status:', sr.json);

  if (sr.json?.connected !== true) {
    console.log('ℹ️  WhatsApp ainda não conectado (status != CONNECTED). Envio deve retornar erro claro.');
    const br = await http(
      'POST',
      '/whatsapp/send',
      { to: '5511999999999', body: `smoke test ${new Date().toISOString()}` },
      { Authorization: `Bearer ${token}` },
    );
    assert(br.status >= 400, `expected blocked send when not connected; got HTTP ${br.status}`);
    console.log('   blocked send response:', br.json);
    console.log('✅ Smoke test finished (connection block check)');
    return;
  }

  console.log('4) Enviando mensagem via /whatsapp/send...');
  const sendRes = await http(
    'POST',
    '/whatsapp/send',
    { to: '5511999999999', body: `smoke test ${new Date().toISOString()}` },
    { Authorization: `Bearer ${token}` },
  );
  assert(sendRes.status === 201 || sendRes.status === 200, `send failed: HTTP ${sendRes.status}`);
  const conversationId = sendRes.json?.conversationId;
  assert(typeof conversationId === 'number', 'send response missing conversationId');
  console.log('   conversation id:', conversationId);

  console.log('5) Listando conversas (deve incluir a conversa criada)...');
  const convs = await http('GET', '/conversations?take=10', null, { Authorization: `Bearer ${token}` });
  assert(convs.status === 200, `list conversations failed: HTTP ${convs.status}`);
  assert(Array.isArray(convs.json), 'list conversations should be array');
  assert(convs.json.some((c) => c && c.id === conversationId), 'conversation not found in list');

  console.log('6) Lendo mensagens da conversa...');
  const msgs = await http('GET', `/conversations/${conversationId}/messages?take=50`, null, { Authorization: `Bearer ${token}` });
  assert(msgs.status === 200, `list messages failed: HTTP ${msgs.status}`);
  assert(Array.isArray(msgs.json), 'list messages should be array');
  assert(msgs.json.length >= 1, 'expected at least 1 message in conversation');
  console.log('   message count:', msgs.json.length);

  console.log('✅ Smoke test finished');
}

main().catch((e) => {
  console.error('❌ Smoke test failed:', e.message);
  process.exit(1);
});
