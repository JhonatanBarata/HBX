import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createOfflineRouteGrant,
  offlineRouteExpiresAt,
  signOfflineRouteGrant,
  verifyOfflineRouteGrant,
  type OfflineRouteGrantPayload,
} from './logistica-offline-grant';

const secret = 'offline-test-secret-with-enough-entropy';

function payload(overrides: Partial<OfflineRouteGrantPayload> = {}): OfflineRouteGrantPayload {
  return {
    version: 1,
    grantId: '2d458744-79a4-4fb6-ac5a-51dcfe52ea12',
    deviceId: 'device-1',
    userId: 10,
    companyId: 20,
    routeId: 'route-1',
    routeDate: '2026-07-16',
    routeMode: 'TRACKED',
    billingRevision: 3,
    issuedAt: 1_768_000_000,
    expiresAt: 1_768_010_000,
    ...overrides,
  };
}

test('grant offline é verificável e preso ao payload assinado', () => {
  const source = payload();
  const token = signOfflineRouteGrant(source, secret);
  const verified = verifyOfflineRouteGrant(token, new Date((source.issuedAt + 60) * 1000), secret);
  assert.deepEqual(verified, source);
});

test('grant alterado é rejeitado mesmo com JSON decodificável', () => {
  const source = payload();
  const token = signOfflineRouteGrant(source, secret);
  const [body, signature] = token.split('.');
  const changed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  changed.routeId = 'route-clonada';
  const tampered = `${Buffer.from(JSON.stringify(changed)).toString('base64url')}.${signature}`;
  assert.throws(
    () => verifyOfflineRouteGrant(tampered, new Date((source.issuedAt + 60) * 1000), secret),
    /offline_grant_invalid_signature/,
  );
});

test('grant expirado não autoriza novas ações, mas aceita graça limitada de sincronização', () => {
  const source = payload({ issuedAt: 1_000, expiresAt: 2_000 });
  const token = signOfflineRouteGrant(source, secret);
  assert.throws(
    () => verifyOfflineRouteGrant(token, new Date(2_100 * 1000), secret),
    /offline_grant_expired/,
  );
  const synchronized = verifyOfflineRouteGrant(
    token,
    new Date(2_100 * 1000),
    secret,
    { expiredGraceSeconds: 200 },
  );
  assert.equal(synchronized.routeId, source.routeId);
  assert.throws(
    () => verifyOfflineRouteGrant(token, new Date(2_201 * 1000), secret, { expiredGraceSeconds: 200 }),
    /offline_grant_expired/,
  );
});

test('expiração operacional é 06:00 do dia seguinte em São Paulo', () => {
  assert.equal(offlineRouteExpiresAt('2026-07-16').toISOString(), '2026-07-17T09:00:00.000Z');
});

test('factory preenche identidade e emissão sem confiar no cliente', () => {
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = secret;
  try {
    const now = new Date('2026-07-16T12:00:00.000Z');
    const expiresAt = Math.floor(new Date('2026-07-17T09:00:00.000Z').getTime() / 1000);
    const created = createOfflineRouteGrant({
      deviceId: 'device-2',
      userId: 11,
      companyId: 21,
      routeId: 'route-2',
      routeDate: '2026-07-16',
      routeMode: 'ESSENTIAL',
      billingRevision: 4,
      expiresAt,
    }, now);
    const verified = verifyOfflineRouteGrant(created.token, now, secret);
    assert.equal(verified.issuedAt, Math.floor(now.getTime() / 1000));
    assert.match(verified.grantId, /^[0-9a-f-]{36}$/i);
  } finally {
    if (previous === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous;
  }
});
