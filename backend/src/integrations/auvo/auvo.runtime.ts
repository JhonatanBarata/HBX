import { AuvoConnectionCredentials } from './auvo.types';

export type AuvoAuthMode = 'bearer_token' | 'app_key_token_query';

export type AuvoRuntime = {
  baseUrl: string | null;
  authMode: AuvoAuthMode;
  token: string | null;
  appKey: string | null;
  externalAccountId: string | null;
  testPath: string | null;
  customersPath: string | null;
  tasksPath: string | null;
  updatedSinceParam: string;
  pageParam: string;
  pageSizeParam: string;
  pageSize: number;
  pendingStatusParam: string;
  pendingStatusValues: string[];
  timeoutMs: number;
  retryAttempts: number;
  backoffMs: number;
};

function normalizeText(value: unknown) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function normalizeNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function splitCsv(value: unknown, fallback: string[]) {
  const normalized = normalizeText(value);
  if (!normalized) return fallback;
  return normalized
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function resolveAuvoRuntime(credentials?: AuvoConnectionCredentials | null): AuvoRuntime {
  return {
    baseUrl: normalizeText(credentials?.baseUrl) || normalizeText(process.env.AUVO_API_BASE_URL),
    authMode: (normalizeText(credentials?.authMode) || normalizeText(process.env.AUVO_AUTH_MODE) || 'app_key_token_query') as AuvoAuthMode,
    token: normalizeText(credentials?.token),
    appKey: normalizeText(credentials?.appKey) || normalizeText(process.env.AUVO_APP_KEY),
    externalAccountId: normalizeText(credentials?.externalAccountId) || normalizeText(process.env.AUVO_EXTERNAL_ACCOUNT_ID),
    testPath: normalizeText(process.env.AUVO_TEST_PATH),
    customersPath: normalizeText(process.env.AUVO_CUSTOMERS_PATH),
    tasksPath: normalizeText(process.env.AUVO_TASKS_PATH),
    updatedSinceParam: normalizeText(process.env.AUVO_UPDATED_SINCE_PARAM) || 'updatedAt',
    pageParam: normalizeText(process.env.AUVO_PAGE_PARAM) || 'page',
    pageSizeParam: normalizeText(process.env.AUVO_PAGE_SIZE_PARAM) || 'pageSize',
    pageSize: normalizeNumber(process.env.AUVO_PAGE_SIZE, 100),
    pendingStatusParam: normalizeText(process.env.AUVO_PENDING_STATUS_PARAM) || 'status',
    pendingStatusValues: splitCsv(process.env.AUVO_PENDING_STATUS_VALUES, ['PENDING', 'OPEN', 'SCHEDULED', 'IN_PROGRESS']),
    timeoutMs: normalizeNumber(process.env.AUVO_TIMEOUT_MS, 15000),
    retryAttempts: normalizeNumber(process.env.AUVO_RETRY_ATTEMPTS, 2),
    backoffMs: normalizeNumber(process.env.AUVO_RETRY_BACKOFF_MS, 400),
  };
}