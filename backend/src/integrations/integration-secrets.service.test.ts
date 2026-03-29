import test from 'node:test';
import assert from 'node:assert/strict';

import { IntegrationSecretsService } from './integration-secrets.service';

test('encryptSecret requires INTEGRATION_SECRET_KEY', () => {
  const previousKey = process.env.INTEGRATION_SECRET_KEY;
  const previousNodeEnv = process.env.NODE_ENV;

  try {
    delete process.env.INTEGRATION_SECRET_KEY;
    process.env.NODE_ENV = 'development';

    const service = new IntegrationSecretsService();
    assert.throws(() => service.encryptSecret('token-123'), /INTEGRATION_SECRET_KEY/);
  } finally {
    if (previousKey === undefined) {
      delete process.env.INTEGRATION_SECRET_KEY;
    } else {
      process.env.INTEGRATION_SECRET_KEY = previousKey;
    }

    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
});

test('encryptSecret round-trips with configured INTEGRATION_SECRET_KEY', () => {
  const previousKey = process.env.INTEGRATION_SECRET_KEY;

  try {
    process.env.INTEGRATION_SECRET_KEY = 'integration-test-secret-key';
    const service = new IntegrationSecretsService();
    const encrypted = service.encryptSecret('token-123');

    assert.ok(encrypted);
    assert.notEqual(encrypted, 'token-123');
    assert.equal(service.decryptSecret(encrypted), 'token-123');
  } finally {
    if (previousKey === undefined) {
      delete process.env.INTEGRATION_SECRET_KEY;
    } else {
      process.env.INTEGRATION_SECRET_KEY = previousKey;
    }
  }
});