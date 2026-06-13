/*
  Runtime check: multi-tenant isolation via companySlug + product scoping.

  Flow validated:
    1) Signup user + create company with slug
    2) Logout (discard token)
    3) Login again using companySlug
    4) Validate /products returns only user's company data
    5) Try to create/access product with different companyId and confirm blocked

  Requirements:
    - Backend running on APP_PORT (default 3000)

  Usage (PowerShell):
    node scripts/runtime-check-multitenant.js
*/

const { PrismaClient } = require('@prisma/client');

const PORT = process.env.APP_PORT || 3000;
const BASE = `http://localhost:${PORT}`;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function http(method, path, body, headers = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  return { status: res.status, json };
}

function rand(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

async function main() {
  const prisma = new PrismaClient();

  try {
    console.log('== Multi-tenant runtime check ==');

    // 1) Signup user + create company with slug
    const email1 = `${rand('u1')}@test.local`;
    const pass1 = 'pass123';
    const slug1 = rand('company1').toLowerCase().replace(/[^a-z0-9_]+/g, '-');

    console.log('1) Signup user #1...');
    const s1 = await http('POST', '/auth/signup', { email: email1, password: pass1, name: 'User 1' });
    assert(s1.status === 201 || s1.status === 200, `signup #1 failed: HTTP ${s1.status}`);
    const token1 = s1.json?.access_token;
    assert(typeof token1 === 'string' && token1.length > 10, 'signup #1 missing access_token');

    console.log('   Create company #1 with slug...');
    const c1 = await http('POST', '/companies', { name: 'Company 1', slug: slug1 }, { Authorization: `Bearer ${token1}` });
    assert(c1.status === 201 || c1.status === 200, `create company #1 failed: HTTP ${c1.status}`);
    assert(typeof c1.json?.id === 'number', 'company #1 missing id');
    const company1Id = c1.json.id;
    console.log('   company1Id:', company1Id, 'slug:', slug1);

    // 2) Logout: discard token
    console.log('2) Logout (discard token in client)...');

    // 3) Login again using companySlug
    console.log('3) Login again using companySlug...');
    const l1 = await http('POST', '/auth/login', { email: email1, password: pass1, companySlug: slug1 });
    assert(l1.status === 200 || l1.status === 201, `login #1 failed: HTTP ${l1.status}`);
    const token1b = l1.json?.access_token;
    assert(typeof token1b === 'string' && token1b.length > 10, 'login #1 missing access_token');

    // Create one product under company #1
    console.log('   Create product A under company #1...');
    const pA = await http(
      'POST',
      '/products',
      { name: 'Produto A', description: 'A', price: 10.5, stock: 1 },
      { Authorization: `Bearer ${token1b}` },
    );
    assert(pA.status === 201 || pA.status === 200, `create product A failed: HTTP ${pA.status} (${JSON.stringify(pA.json)})`);
    assert(typeof pA.json?.id === 'number', 'product A missing id');
    const productAId = pA.json.id;

    // Create a second user/company/product to prove isolation
    const email2 = `${rand('u2')}@test.local`;
    const pass2 = 'pass123';
    const slug2 = rand('company2').toLowerCase().replace(/[^a-z0-9_]+/g, '-');

    console.log('   Signup user #2 + create company #2 + product B...');
    const s2 = await http('POST', '/auth/signup', { email: email2, password: pass2, name: 'User 2' });
    assert(s2.status === 201 || s2.status === 200, `signup #2 failed: HTTP ${s2.status}`);
    const token2 = s2.json?.access_token;
    assert(typeof token2 === 'string' && token2.length > 10, 'signup #2 missing access_token');

    const c2 = await http('POST', '/companies', { name: 'Company 2', slug: slug2 }, { Authorization: `Bearer ${token2}` });
    assert(c2.status === 201 || c2.status === 200, `create company #2 failed: HTTP ${c2.status}`);
    assert(typeof c2.json?.id === 'number', 'company #2 missing id');
    const company2Id = c2.json.id;
    await ensureCompanyHasAdminPlan(prisma, company2Id);

    // Login #2 with slug to align with expected flow
    const l2 = await http('POST', '/auth/login', { email: email2, password: pass2, companySlug: slug2 });
    assert(l2.status === 200 || l2.status === 201, `login #2 failed: HTTP ${l2.status}`);
    const token2b = l2.json?.access_token;
    assert(typeof token2b === 'string' && token2b.length > 10, 'login #2 missing access_token');

    const pB = await http(
      'POST',
      '/products',
      { name: 'Produto B', description: 'B', price: 20.0, stock: 2 },
      { Authorization: `Bearer ${token2b}` },
    );
    assert(pB.status === 201 || pB.status === 200, `create product B failed: HTTP ${pB.status} (${JSON.stringify(pB.json)})`);
    const productBId = pB.json.id;

    // 4) Validate /products returns only user's company data
    console.log('4) Validate /products is scoped to company #1...');
    const list1 = await http('GET', '/products', null, { Authorization: `Bearer ${token1b}` });
    assert(list1.status === 200, `GET /products failed: HTTP ${list1.status}`);
    assert(Array.isArray(list1.json), 'GET /products should return an array');
    const ids = list1.json.map((p) => p.id);
    assert(ids.includes(productAId), 'Product A not visible for user #1');
    assert(!ids.includes(productBId), 'Product B leaked into user #1 list');
    assert(list1.json.every((p) => p.companyId === company1Id), 'Found product not belonging to company #1');
    console.log('   OK: user #1 sees only company #1 products');

    // 5) Try to create/access product with different companyId and confirm blocked
    console.log('5) Spoof attempts (companyId mismatch)...');

    const spoofCreate = await http(
      'POST',
      '/products',
      { name: 'Produto SPOOF', description: 'X', price: 1, stock: 1, companyId: company2Id },
      { Authorization: `Bearer ${token1b}` },
    );
    assert(spoofCreate.status === 403, `Expected 403 on spoof create, got HTTP ${spoofCreate.status}`);
    console.log('   OK: spoof create blocked (403)');

    const spoofRead = await http('GET', `/products/${productBId}`, null, { Authorization: `Bearer ${token1b}` });
    assert(spoofRead.status === 404, `Expected 404 on cross-company read, got HTTP ${spoofRead.status}`);
    console.log('   OK: cross-company read blocked (404)');

    const spoofUpdate = await http(
      'PATCH',
      `/products/${productAId}`,
      { companyId: company2Id },
      { Authorization: `Bearer ${token1b}` },
    );
    assert(spoofUpdate.status === 403, `Expected 403 on spoof update, got HTTP ${spoofUpdate.status}`);
    console.log('   OK: spoof update blocked (403)');

    console.log('\n✅ Runtime check PASSED');
    console.log(JSON.stringify({
      user1: { email: email1, companySlug: slug1, companyId: company1Id },
      user2: { email: email2, companySlug: slug2, companyId: company2Id },
      products: { productAId, productBId },
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('\n❌ Runtime check FAILED:', e?.message || e);
  process.exit(1);
});
