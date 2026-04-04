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

async function requestJsonWithOptions(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

async function postJson(url, body, headers = {}) {
  return requestJsonWithOptions(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

async function verifyTransactionalMailReadiness(backendUrl, env) {
  const internalSecret = String(env.PROD_INTERNAL_SECRET || '').trim();
  if (!internalSecret) {
    return {
      checked: false,
      reason: 'PROD_INTERNAL_SECRET not configured',
    };
  }

  const summary = await requestJsonWithOptions(`${backendUrl}/internal/mail/config-summary`, {
    method: 'GET',
    headers: {
      'x-internal-secret': internalSecret,
    },
  });

  if (!summary || typeof summary !== 'object') {
    throw new Error('Transactional mail summary returned an unexpected payload');
  }

  const missing = Array.isArray(summary?.config?.missing)
    ? summary.config.missing.filter((item) => typeof item === 'string' && item.trim().length > 0)
    : [];

  const providerReady = Boolean(
    summary?.ok
    || summary?.config?.ready
    || summary?.config?.resendReady
    || summary?.config?.smtpReady,
  );

  if (!providerReady) {
    const suffix = missing.length ? ` Missing: ${missing.join(', ')}` : '';
    throw new Error(`Transactional email not ready in production (${summary.code || 'unknown'}).${suffix}`);
  }

  return {
    checked: true,
    code: String(summary.code || (summary?.config?.mode === 'resend' ? 'RESEND_READY' : 'SMTP_READY')),
    mode: summary?.config?.mode ? String(summary.config.mode) : null,
    missing,
  };
}

async function verifyTransactionalMailDelivery(backendUrl, env) {
  const internalSecret = String(env.PROD_INTERNAL_SECRET || '').trim();
  const testRecipient = String(env.PROD_TRANSACTIONAL_EMAIL_TEST_TO || '').trim().toLowerCase();

  if (!internalSecret) {
    return {
      checked: false,
      reason: 'PROD_INTERNAL_SECRET not configured',
    };
  }

  if (!testRecipient) {
    return {
      checked: false,
      reason: 'PROD_TRANSACTIONAL_EMAIL_TEST_TO not configured',
    };
  }

  const payload = await postJson(
    `${backendUrl}/internal/mail/test-transactional-email`,
    { to: testRecipient },
    { 'x-internal-secret': internalSecret },
  );

  if (!payload || typeof payload !== 'object') {
    throw new Error('Transactional email delivery test returned an unexpected payload');
  }

  if (!payload.ok) {
    throw new Error(`Transactional email delivery test failed (${payload.code || 'unknown'}): ${payload.message || 'unknown error'}`);
  }

  return {
    checked: true,
    code: String(payload.code || 'SMTP_TEST_OK'),
    recipient: testRecipient,
    message: String(payload.message || 'E-mail transacional enviado com sucesso.'),
  };
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
  const transactionalMail = await verifyTransactionalMailReadiness(backendUrl, env);
  const transactionalMailDelivery = await verifyTransactionalMailDelivery(backendUrl, env);

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
  if (frontendUrl) {
    const response = await fetch(frontendUrl, { method: 'GET' });
    frontendStatus = `${response.status}`;
    if (!response.ok) {
      throw new Error(`Frontend check failed with HTTP ${response.status} from ${frontendUrl}`);
    }
  }

  return {
    ok: true,
    backendUrl,
    backendHealth,
    transactionalMail,
    transactionalMailDelivery,
    frontendUrl: frontendUrl || null,
    frontendStatus,
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
