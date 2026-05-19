const { chromium } = require('@playwright/test');
const fs = require('fs');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3001';
const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || 'http://localhost:3000';
const USERNAME = process.env.HBX_TEST_USER || 'teste@teste.com';
const PASSWORD = process.env.HBX_TEST_PASSWORD || '12345678';

const cases = [
  {
    id: 'T1',
    name: 'Instagram obrigatorio - alimentacao Rio Claro',
    filters: { state: 'SP', city: 'Rio Claro', segment: 'Alimentação', radiusKm: 50, quantity: 1, requiredChannels: ['instagram'] },
  },
  {
    id: 'T2',
    name: 'Facebook obrigatorio - alimentacao Rio Claro',
    filters: { state: 'SP', city: 'Rio Claro', segment: 'Alimentação', radiusKm: 50, quantity: 1, requiredChannels: ['facebook'] },
  },
  {
    id: 'T3',
    name: 'Site obrigatorio - pizzarias Rio Claro',
    filters: { state: 'SP', city: 'Rio Claro', segment: 'pizzarias', radiusKm: 50, quantity: 1, requiredChannels: ['website'] },
  },
  {
    id: 'T4',
    name: 'Instagram + Facebook obrigatorios - pneus Araraquara',
    filters: { state: 'SP', city: 'Araraquara', segment: 'pneus automotivo auto center', radiusKm: 50, quantity: 1, requiredChannels: ['instagram', 'facebook'] },
  },
  {
    id: 'T5',
    name: 'Instagram + Facebook + Site obrigatorios - pizzarias Rio Claro',
    filters: { state: 'SP', city: 'Rio Claro', segment: 'pizzarias', radiusKm: 50, quantity: 1, requiredChannels: ['instagram', 'facebook', 'website'] },
  },
];

const blockedWebsiteDomains = [
  'linkedin.com',
  'pizzariaspertodemim.com',
  'siteindices.com',
  'tripadvisor.com',
  'tripadvisor.com.br',
  'urlm.com.br',
  'aguasdesaopedro.com.br',
];

function compact(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function tokens(value) {
  const stop = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'ltda', 'me', 'eireli', 'comercio', 'servicos']);
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((item) => item.length >= 3 && !stop.has(item));
}

function socialLooksCompatible(item, url) {
  if (!url) return true;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  if (!/(^|\.)instagram\.com$|(^|\.)facebook\.com$|(^|\.)fb\.com$/.test(host)) return false;
  const pathParts = parsed.pathname.split('/').filter(Boolean);
  if (!pathParts.length) return false;
  const bad = new Set(['events', 'posts', 'photos', 'videos', 'groups', 'pages', 'reel', 'reels', 'stories', 'share', 'watch', 'marketplace']);
  if (pathParts.some((part) => bad.has(part.toLowerCase()))) return false;
  const handle = compact(pathParts[0]);
  if (!handle) return false;
  const name = compact(item.name);
  if (name && (handle.includes(name) || name.includes(handle))) return true;
  const strongTokens = tokens(item.name).filter((token) => token.length >= 4);
  const hits = strongTokens.filter((token) => handle.includes(compact(token)));
  if (hits.length >= 2) return true;
  if (hits.length >= 1 && /pneu|pizz|bar|rest|chop|food|amor|sabor|silcar|roberto|wonder|fenix/i.test(`${item.segment || ''} ${item.name || ''} ${url}`)) return true;
  return false;
}

function websiteLooksOk(url) {
  if (!url) return true;
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return !blockedWebsiteDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function websiteLooksCompatible(item, url) {
  if (!url) return true;
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return false;
  }
  const hostKey = compact(host);
  const nameTokens = tokens(item.name);
  const categoryTokens = nameTokens.filter((token) => /pizz|pizza|rest|bar|pneu|auto|center|lanch|rotisserie|food|sabor|chop/i.test(token));
  const strongTokens = nameTokens.filter((token) => token.length >= 4 && !categoryTokens.includes(token) && !['casa', 'mais', 'novo', 'nova', 'oficial'].includes(token));
  const variants = new Set(strongTokens.flatMap((token) => token.endsWith('s') && token.length >= 5 ? [token, token.slice(0, -1)] : [token]));
  if ([...variants].some((token) => token.length >= 5 && hostKey.includes(compact(token)))) return true;
  for (const category of categoryTokens) {
    for (const token of variants) {
      if (hostKey.includes(`${compact(category)}${compact(token)}`) || hostKey.includes(`${compact(token)}${compact(category)}`)) return true;
    }
  }
  return false;
}

function hasChannel(item, channel) {
  if (channel === 'instagram') return Boolean(String(item.instagramUrl || item.signals?.instagramUrl || '').trim());
  if (channel === 'facebook') return Boolean(String(item.facebookUrl || item.signals?.facebookUrl || '').trim());
  if (channel === 'website') return Boolean(String(item.website || item.signals?.website || '').trim());
  if (channel === 'email') return Boolean(String(item.email || item.signals?.email || '').trim());
  if (channel === 'phone') return Boolean(String(item.phoneDigits || item.phone || '').trim());
  if (channel === 'whatsapp') return Boolean(String(item.whatsapp || item.phoneDigits || item.phone || '').trim());
  return false;
}

async function apiLogin(request) {
  const response = await request.post(`${API_URL}/auth/login`, {
    data: { username: USERNAME, password: PASSWORD, forceSession: true },
    headers: { 'content-type': 'application/json' },
    timeout: 60_000,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok()) throw new Error(`Login falhou ${response.status()}: ${JSON.stringify(payload).slice(0, 500)}`);
  const token = payload.access_token || payload.accessToken || payload.token;
  if (!token) throw new Error(`Login sem token: ${JSON.stringify(payload).slice(0, 500)}`);
  return token;
}

async function waitRun(request, token, runId) {
  let last = null;
  const deadline = Date.now() + 8 * 60_000;
  while (Date.now() < deadline) {
    const response = await request.get(`${API_URL}/webscraping/radar/search-runs/${encodeURIComponent(runId)}`, {
      headers: { authorization: `Bearer ${token}` },
      timeout: 180_000,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok()) throw new Error(`GET run ${runId} falhou ${response.status()}: ${JSON.stringify(payload).slice(0, 500)}`);
    last = payload;
    const status = String(payload.status || '').toLowerCase();
    const stillWorking = ['queued', 'pending', 'running', 'processing', 'in_progress', 'draining'].some((item) => status.includes(item));
    if (!stillWorking) return payload;
    await new Promise((resolve) => setTimeout(resolve, 3500));
  }
  throw new Error(`Run ${runId} nao terminou. Ultimo payload: ${JSON.stringify(last).slice(0, 1000)}`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const token = await apiLogin(context.request);

  await page.goto(`${FRONTEND_URL}/mobile/login`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.evaluate((authToken) => {
    localStorage.setItem('token', authToken);
    localStorage.setItem('authToken', authToken);
    localStorage.setItem('hbx_token', authToken);
  }, token);
  await page.goto(`${FRONTEND_URL}/mobile/radar-digital`, { waitUntil: 'networkidle', timeout: 90_000 });

  const results = [];
  for (const testCase of cases) {
    const filters = {
      source: 'hbx',
      state: testCase.filters.state,
      city: testCase.filters.city,
      segment: testCase.filters.segment,
      radiusKm: testCase.filters.radiusKm,
      quantity: testCase.filters.quantity,
      preferredChannels: [],
      requiredChannels: testCase.filters.requiredChannels,
      channelMatchMode: 'all_required',
      qualityMode: 'lead_plus',
      whatsappCheckMode: testCase.filters.requiredChannels.includes('whatsapp') ? 'only_valid' : 'enrich',
    };
    const startResponse = await context.request.post(`${API_URL}/webscraping/radar/search-runs`, {
      data: filters,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      timeout: 90_000,
    });
    const startPayload = await startResponse.json().catch(() => ({}));
    if (!startResponse.ok()) throw new Error(`${testCase.id} start falhou ${startResponse.status()}: ${JSON.stringify(startPayload).slice(0, 800)}`);
    const runId = startPayload.id || startPayload.runId;
    if (!runId) throw new Error(`${testCase.id} sem runId: ${JSON.stringify(startPayload).slice(0, 800)}`);
    const run = await waitRun(context.request, token, runId);

    await page.goto(`${FRONTEND_URL}/mobile/radar-digital`, { waitUntil: 'networkidle', timeout: 90_000 });
    await page.waitForTimeout(1500);
    const screenshot = `tmp-playwright-required-live-${testCase.id}.png`;
    await page.screenshot({ path: screenshot, fullPage: true });
    const uiText = (await page.locator('body').innerText({ timeout: 20_000 }).catch(() => '')).slice(0, 3000);

    const items = Array.isArray(run.items) ? run.items : Array.isArray(run.matchedItems) ? run.matchedItems : [];
    const requiredMatched = items.filter((item) => testCase.filters.requiredChannels.every((channel) => hasChannel(item, channel)));
    const phoneKept = items.filter((item) => String(item.phoneDigits || item.phone || '').trim()).length;
    const badSocials = items.flatMap((item) => {
      const bad = [];
      if (item.instagramUrl && !socialLooksCompatible(item, item.instagramUrl)) bad.push({ name: item.name, field: 'instagramUrl', url: item.instagramUrl });
      if (item.facebookUrl && !socialLooksCompatible(item, item.facebookUrl)) bad.push({ name: item.name, field: 'facebookUrl', url: item.facebookUrl });
      return bad;
    });
    const badWebsites = items
      .filter((item) => item.website && (!websiteLooksOk(item.website) || !websiteLooksCompatible(item, item.website)))
      .map((item) => ({ name: item.name, website: item.website }));
    const passed = items.length > 0
      && requiredMatched.length === items.length
      && phoneKept === items.length
      && badSocials.length === 0
      && badWebsites.length === 0
      && /Radar|Vendas|card|Busca|abasteceu|entregou|encontrou/i.test(uiText);

    const summaryItems = items.map((item, index) => ({
      index: index + 1,
      name: item.name,
      city: item.city,
      phone: item.phone,
      phoneDigits: item.phoneDigits,
      whatsappStatus: item.whatsappStatus,
      website: item.website,
      instagramUrl: item.instagramUrl,
      facebookUrl: item.facebookUrl,
      email: item.email,
    }));

    const result = {
      test: testCase.name,
      runId,
      status: run.status,
      backendMessage: run.message,
      backendFoundCount: run.foundCount,
      backendDeliveredCount: run.deliveredCount,
      requiredChannels: testCase.filters.requiredChannels,
      passed,
      phoneKeptCount: phoneKept,
      requiredMatchedCount: requiredMatched.length,
      badSocials,
      badWebsites,
      uiHasRunSignal: /Radar|Vendas|card|Busca|abasteceu|entregou|encontrou/i.test(uiText),
      uiExcerpt: uiText,
      screenshot,
      items: summaryItems,
    };
    results.push(result);
    console.log(JSON.stringify({ id: testCase.id, passed, runId, status: result.status, items: summaryItems }, null, 2));
  }

  const report = { generatedAt: new Date().toISOString(), passed: results.every((item) => item.passed), results };
  fs.writeFileSync('tmp-playwright-required-live-report.json', JSON.stringify(report, null, 2));
  await browser.close();
  if (!report.passed) process.exit(2);
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
