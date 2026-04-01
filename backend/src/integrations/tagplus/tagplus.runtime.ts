import { TagPlusConnectionCredentials } from './tagplus.types';

export type TagPlusAuthMode = 'bearer_token' | 'query_token';

export type TagPlusRuntime = {
  baseUrl: string | null;
  authMode: TagPlusAuthMode;
  token: string | null;
  externalAccountId: string | null;
  testPath: string | null;
  customersPath: string | null;
  receivablesPath: string | null;
  updatedSinceParam: string;
  pageParam: string;
  pageSizeParam: string;
  pageSize: number;
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

export function resolveTagPlusRuntime(credentials?: TagPlusConnectionCredentials | null): TagPlusRuntime {
  return {
    baseUrl: normalizeText(credentials?.baseUrl) || normalizeText(process.env.TAGPLUS_API_BASE_URL),
    authMode: (normalizeText(credentials?.authMode) || normalizeText(process.env.TAGPLUS_AUTH_MODE) || 'bearer_token') as TagPlusAuthMode,
    token: normalizeText(credentials?.token),
    externalAccountId: normalizeText(credentials?.externalAccountId) || normalizeText(process.env.TAGPLUS_EXTERNAL_ACCOUNT_ID),
    testPath: normalizeText(process.env.TAGPLUS_TEST_PATH),
    customersPath: normalizeText(process.env.TAGPLUS_CUSTOMERS_PATH),
    receivablesPath: normalizeText(process.env.TAGPLUS_RECEIVABLES_PATH),
    updatedSinceParam: normalizeText(process.env.TAGPLUS_UPDATED_SINCE_PARAM) || 'updatedAt',
    pageParam: normalizeText(process.env.TAGPLUS_PAGE_PARAM) || 'page',
    pageSizeParam: normalizeText(process.env.TAGPLUS_PAGE_SIZE_PARAM) || 'pageSize',
    pageSize: normalizeNumber(process.env.TAGPLUS_PAGE_SIZE, 100),
    timeoutMs: normalizeNumber(process.env.TAGPLUS_TIMEOUT_MS, 15000),
    retryAttempts: normalizeNumber(process.env.TAGPLUS_RETRY_ATTEMPTS, 2),
    backoffMs: normalizeNumber(process.env.TAGPLUS_RETRY_BACKOFF_MS, 400),
  };
}