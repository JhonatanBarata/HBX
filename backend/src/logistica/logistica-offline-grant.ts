import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export type OfflineRouteGrantPayload = {
  version: 1;
  grantId: string;
  deviceId: string;
  userId: number;
  companyId: number;
  routeId: string;
  routeDate: string;
  routeMode: 'ESSENTIAL' | 'TRACKED';
  billingRevision: number;
  issuedAt: number;
  expiresAt: number;
};

export type OfflineGrantVerificationOptions = {
  /** Permite somente sincronizar dados já capturados; não autoriza novas ações. */
  expiredGraceSeconds?: number;
};

const GRANT_DOMAIN = 'hbx-offline-route:v1';

export function createOfflineRouteGrant(input: Omit<OfflineRouteGrantPayload, 'version' | 'grantId' | 'issuedAt'>, now = new Date()) {
  const payload: OfflineRouteGrantPayload = {
    version: 1,
    grantId: randomUUID(),
    issuedAt: Math.floor(now.getTime() / 1000),
    ...input,
  };
  return {
    payload,
    token: signOfflineRouteGrant(payload),
  };
}

export function signOfflineRouteGrant(payload: OfflineRouteGrantPayload, secretInput?: string): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = signatureFor(encoded, secretInput);
  return `${encoded}.${signature}`;
}

export function verifyOfflineRouteGrant(
  tokenInput: string,
  now = new Date(),
  secretInput?: string,
  options: OfflineGrantVerificationOptions = {},
): OfflineRouteGrantPayload {
  const token = String(tokenInput || '').trim();
  const [encoded, signature, ...rest] = token.split('.');
  if (!encoded || !signature || rest.length > 0) throw new Error('offline_grant_invalid');
  const expected = signatureFor(encoded, secretInput);
  const actualBuffer = Buffer.from(signature, 'base64url');
  const expectedBuffer = Buffer.from(expected, 'base64url');
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new Error('offline_grant_invalid_signature');
  }
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<OfflineRouteGrantPayload>;
  if (
    payload.version !== 1 ||
    !payload.grantId ||
    !payload.deviceId ||
    !Number.isInteger(payload.userId) ||
    !Number.isInteger(payload.companyId) ||
    !payload.routeId ||
    !/^\d{4}-\d{2}-\d{2}$/.test(String(payload.routeDate || '')) ||
    !['ESSENTIAL', 'TRACKED'].includes(String(payload.routeMode || '')) ||
    !Number.isInteger(payload.billingRevision) ||
    !Number.isInteger(payload.issuedAt) ||
    !Number.isInteger(payload.expiresAt)
  ) {
    throw new Error('offline_grant_invalid_payload');
  }
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const grace = Math.max(0, Math.trunc(Number(options.expiredGraceSeconds || 0)));
  if (Number(payload.expiresAt) + grace <= nowSeconds) throw new Error('offline_grant_expired');
  if (Number(payload.issuedAt) > nowSeconds + 120) throw new Error('offline_grant_future');
  return payload as OfflineRouteGrantPayload;
}

/** Data operacional termina às 06:00 do dia seguinte em America/Sao_Paulo. */
export function offlineRouteExpiresAt(routeDateInput: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(routeDateInput || '').trim());
  if (!match) throw new Error('offline_route_date_invalid');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // São Paulo não usa horário de verão desde 2019: 06:00 -03:00 = 09:00 UTC.
  const value = new Date(Date.UTC(year, month - 1, day + 1, 9, 0, 0, 0));
  if (!Number.isFinite(value.getTime())) throw new Error('offline_route_date_invalid');
  return value;
}

function signatureFor(encoded: string, secretInput?: string): string {
  const secret = String(secretInput ?? process.env.JWT_SECRET ?? '').trim();
  if (!secret) throw new Error('JWT_SECRET is required for offline route grants');
  return createHmac('sha256', `${secret}:${GRANT_DOMAIN}`).update(encoded).digest('base64url');
}
