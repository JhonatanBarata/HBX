'use strict';

const { assertNonLocalDatabaseUrl, assertNonLocalHttpUrl, requireEnv, resolveOperationsEnv, run } = require('./lib/runtime');

async function requestJson(url) {
  const response = await fetch(url, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

async function requestText(url) {
  const response = await fetch(url, { method: 'GET' });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}: ${text.slice(0, 400)}`);
  }
  return text;
}

async function verifyProduction(inputEnv = resolveOperationsEnv()) {
  const env = inputEnv;
  const backendUrl = String(requireEnv(env, 'PROD_BACKEND_URL')).replace(/\/$/, '');
  const frontendUrl = String(env.PROD_FRONTEND_URL || '').trim().replace(/\/$/, '');
  const databaseUrl = String(env.PROD_DATABASE_URL || '').trim();

  assertNonLocalHttpUrl(backendUrl, 'PROD_BACKEND_URL');
  if (frontendUrl) {
    assertNonLocalHttpUrl(frontendUrl, 'PROD_FRONTEND_URL');
  }
  if (databaseUrl) {
    assertNonLocalDatabaseUrl(databaseUrl, 'PROD_DATABASE_URL');
  }

  const backendHealth = await requestJson(`${backendUrl}/health`);

  if (databaseUrl) {
    const prismaEnv = {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DIRECT_URL: databaseUrl,
    };

    run('npm', ['--prefix', 'backend', 'run', 'prisma:migrate:status'], { env: prismaEnv });
    run('node', ['backend/scripts/structural-seed.js', '--check', '--database-url', databaseUrl], { env: prismaEnv });
  }

  let frontendStatus = 'not-configured';
  let webscrapingHealth = null;
  if (frontendUrl) {
    const response = await fetch(frontendUrl, { method: 'GET' });
    frontendStatus = `${response.status}`;
    if (!response.ok) {
      throw new Error(`Frontend check failed with HTTP ${response.status} from ${frontendUrl}`);
    }

    const webscrapingHealthUrl = `${frontendUrl}/hbx/webscraping/healthz`;
    const webscrapingHealthText = await requestText(webscrapingHealthUrl);
    if (String(webscrapingHealthText).trim().toLowerCase() !== 'ok') {
      throw new Error(`Unexpected webscraping health payload from ${webscrapingHealthUrl}: ${webscrapingHealthText}`);
    }
    webscrapingHealth = {
      url: webscrapingHealthUrl,
      status: 'ok',
      body: webscrapingHealthText,
    };
  }

  return {
    ok: true,
    backendUrl,
    backendHealth,
    frontendUrl: frontendUrl || null,
    frontendStatus,
    webscrapingHealth,
    databaseChecked: Boolean(databaseUrl),
  };
}

if (require.main === module) {
  verifyProduction()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error && error.message ? error.message : error);
      process.exit(1);
    });
}

module.exports = {
  verifyProduction,
};