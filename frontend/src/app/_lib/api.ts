"use client";

const DEFAULT_API_URL =
  process.env.NODE_ENV === "production"
    ? "https://api.hbxsystem.com.br"
    : "http://localhost:3000";
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_URL).replace(/\/+$/, "");
const DASHBOARD_API_PROXY_PREFIX = "/hbx/api";
const SHELL_GET_CACHE_TTL_MS = 30000;
const TOKEN_EXPIRY_SKEW_MS = 15000;
const AUTH_PROBE_CACHE_TTL_MS = 5000;
const SESSION_EXPIRED_MESSAGE = "Sessão expirada. Faça login novamente.";
const SHELL_GET_CACHE_PATHS = new Set([
  "/profile/current-user",
  "/modules/me",
  "/profile/theme-preferences",
]);
const AUTH_REQUIRED_PATHS = new Set([
  "/profile/current-user",
  "/profile/theme-preferences",
  "/companies/me/operational-status",
  "/modules/me",
]);

type ApiErrorPayload = {
  message?: string | string[];
  error?: string;
  code?: string;
  redirectTo?: string;
};

export type ApiFetchError = Error & {
  status?: number;
  code?: string;
  redirectTo?: string;
  payload?: unknown;
};

type ApiCacheEntry = {
  expiresAt: number;
  value?: unknown;
  promise?: Promise<unknown>;
};

type AuthProbeEntry = {
  token: string;
  expiresAt: number;
  promise: Promise<boolean>;
};

type ApiFetchInit = RequestInit & {
  skipAuth?: boolean;
  requireAuth?: boolean;
  timeoutMs?: number;
};

const apiGetCache = new Map<string, ApiCacheEntry>();
let authProbeEntry: AuthProbeEntry | null = null;
let authChangeQueued = false;

function normalizeApiBaseUrl(value: string) {
  return String(value || "").replace(/\/+$/, "");
}

export function getDashboardApiBaseUrl() {
  const rawBase = normalizeApiBaseUrl(API_URL);
  if (typeof window === "undefined") return rawBase;

  const sameOriginBase = `${window.location.origin}${DASHBOARD_API_PROXY_PREFIX}`;

  try {
    const resolved = new URL(rawBase || "/", window.location.origin);
    if (resolved.origin !== window.location.origin) {
      return sameOriginBase;
    }
    return normalizeApiBaseUrl(resolved.toString());
  } catch {
    return sameOriginBase;
  }
}

export function getDirectDashboardApiBaseUrl() {
  return normalizeApiBaseUrl(API_URL);
}

function isApiErrorPayload(value: unknown): value is ApiErrorPayload {
  return Boolean(value) && typeof value === "object";
}

function queueAuthChangeEvent() {
  if (typeof window === "undefined" || authChangeQueued) return;
  authChangeQueued = true;
  window.setTimeout(() => {
    authChangeQueued = false;
    try {
      window.dispatchEvent(new Event("auth-change"));
    } catch {
      // ignore event dispatch errors
    }
  }, 0);
}

function redirectToLogin() {
  if (typeof window === "undefined") return;
  const currentPath = `${window.location.pathname}${window.location.search}`;
  if (window.location.pathname === "/login") return;
  window.location.assign(`/login?from=${encodeURIComponent(currentPath)}`);
}

function removeStoredTokens(options?: { notify?: boolean }) {
  if (typeof window === "undefined") return;
  authProbeEntry = null;
  clearApiCache();
  localStorage.removeItem("token");
  localStorage.removeItem("access_token");
  localStorage.removeItem("accessToken");
  if (options?.notify === false) return;
  queueAuthChangeEvent();
}

function handleUnauthorized() {
  removeStoredTokens();
  redirectToLogin();
}

function decodeJwtPayload(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    return JSON.parse(atob(padded)) as { exp?: unknown };
  } catch {
    return null;
  }
}

function isExpiredJwt(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3) return true;
  const payload = decodeJwtPayload(token);
  if (!payload) return true;
  const exp = Number(payload.exp);
  if (!Number.isFinite(exp) || exp <= 0) return false;
  return exp * 1000 <= Date.now() + TOKEN_EXPIRY_SKEW_MS;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  const token = (
    localStorage.getItem("token") ||
    localStorage.getItem("access_token") ||
    localStorage.getItem("accessToken")
  );
  if (!token) return null;
  if (isExpiredJwt(token)) {
    removeStoredTokens();
    return null;
  }
  return token;
}

export function setToken(token: string, options?: { notify?: boolean }) {
  authProbeEntry = null;
  clearApiCache();
  localStorage.setItem("token", token);
  if (options?.notify === false) return;

  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new Event("auth-change"));
    } catch {
      // ignore event dispatch errors
    }
  }
}

export function clearToken() {
  removeStoredTokens();
}

export function clearApiCache(path?: string) {
  if (!path) {
    apiGetCache.clear();
    return;
  }

  for (const key of Array.from(apiGetCache.keys())) {
    if (key.includes(`|${path}`)) {
      apiGetCache.delete(key);
    }
  }
}

function shouldCacheGet(path: string, init?: ApiFetchInit) {
  const method = String(init?.method || "GET").toUpperCase();
  return method === "GET" && !init?.body && SHELL_GET_CACHE_PATHS.has(path);
}

function buildCacheKey(path: string, token: string | null, init?: ApiFetchInit) {
  const authKey = init?.skipAuth ? "anon" : token || "no-token";
  return `${authKey}|${path}`;
}

function getApiPathname(path: string) {
  if (!path || path.startsWith("http")) return path;
  const queryIndex = path.indexOf("?");
  return queryIndex >= 0 ? path.slice(0, queryIndex) : path;
}

function requiresAuth(path: string, init?: ApiFetchInit) {
  if (init?.skipAuth) return false;
  if (init?.requireAuth) return true;
  return AUTH_REQUIRED_PATHS.has(getApiPathname(path));
}

function shouldProbeAuth(path: string, init?: ApiFetchInit) {
  if (!requiresAuth(path, init)) return false;
  return getApiPathname(path) !== "/profile/current-user";
}

async function ensureValidSessionForProtectedPath(
  path: string,
  token: string | null,
  init?: ApiFetchInit,
) {
  if (!token || !shouldProbeAuth(path, init)) return;

  const now = Date.now();
  if (
    authProbeEntry &&
    authProbeEntry.token === token &&
    authProbeEntry.expiresAt > now
  ) {
    const isValid = await authProbeEntry.promise;
    if (!isValid) throw new Error(SESSION_EXPIRED_MESSAGE);
    return;
  }

  const probePromise = fetch(`${getDashboardApiBaseUrl()}/profile/current-user`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    credentials: "include",
  }).then((response) => {
    if (response.status === 401) {
      handleUnauthorized();
      return false;
    }
    return true;
  }).catch(() => true);

  authProbeEntry = {
    token,
    expiresAt: now + AUTH_PROBE_CACHE_TTL_MS,
    promise: probePromise,
  };

  const isValid = await probePromise;
  if (!isValid) throw new Error(SESSION_EXPIRED_MESSAGE);
}

function parseErrorMessage(data: unknown): string {
  if (!data) return "Erro";
  if (!isApiErrorPayload(data)) return "Erro";

  if (typeof data.message === "string") return data.message;
  if (Array.isArray(data.message)) return data.message.join(", ");
  if (typeof data.error === "string") return data.error;
  return "Erro";
}

function sanitizeErrorMessage(message: string, status?: number) {
  const normalized = String(message || "").trim();
  if (!normalized) return "Erro";
  if (/^\s*<!doctype html/i.test(normalized) || /^\s*<html[\s>]/i.test(normalized) || /<title>\s*502 Bad Gateway/i.test(normalized)) {
    return status === 502
      ? "API indisponível no momento. Tente novamente em instantes."
      : "A API retornou uma página de erro em vez de JSON.";
  }
  return normalized;
}

export async function apiFetch<T>(
  path: string,
  init?: ApiFetchInit
): Promise<T> {
  const { skipAuth, requireAuth, timeoutMs, ...fetchInit } = init || {};
  const url = path.startsWith("http") ? path : `${getDashboardApiBaseUrl()}${path}`;
  const token = getToken();
  if (!token && requiresAuth(path, { ...init, requireAuth, skipAuth })) {
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }
  await ensureValidSessionForProtectedPath(path, token, { ...init, requireAuth, skipAuth });
  const cacheable = shouldCacheGet(path, init);
  const cacheKey = cacheable ? buildCacheKey(path, token, init) : "";
  if (cacheable) {
    const cached = apiGetCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      if (cached.promise) return cached.promise as Promise<T>;
      return cached.value as T;
    }
    apiGetCache.delete(cacheKey);
  }
  const isFormData = typeof FormData !== "undefined" && fetchInit.body instanceof FormData;

  const headers = new Headers(fetchInit.headers);
  if (!headers.has("Content-Type") && fetchInit.body && !isFormData) {
    headers.set("Content-Type", "application/json");
  }
  if (!skipAuth && token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let signal = fetchInit.signal;
  if (typeof timeoutMs === "number" && timeoutMs > 0) {
    const controller = new AbortController();
    if (signal) {
      if (signal.aborted) {
        controller.abort();
      } else {
        signal.addEventListener("abort", () => controller.abort(), { once: true });
      }
    }
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    signal = controller.signal;
  }
  const request = fetch(url, { ...fetchInit, headers, signal }).then(async (res) => {
    let data: unknown = null;
    const text = await res.text();
    if (text) {
      try {
        data = JSON.parse(text) as unknown;
      } catch {
        data = text;
      }
    }

    if (!res.ok) {
      const message = sanitizeErrorMessage(typeof data === "string" ? data : parseErrorMessage(data), res.status);
      if (res.status === 401 && !skipAuth) {
        handleUnauthorized();
      } else {
        if (
          res.status === 402 &&
          isApiErrorPayload(data) &&
          typeof data.redirectTo === "string" &&
          data.redirectTo.startsWith("/") &&
          !data.redirectTo.startsWith("//") &&
          typeof window !== "undefined" &&
          window.location.pathname !== data.redirectTo.split("?")[0]
        ) {
          window.location.assign(data.redirectTo);
        }
      }
      const apiError = new Error(message) as ApiFetchError;
      apiError.status = res.status;
      apiError.payload = data;
      if (isApiErrorPayload(data)) {
        apiError.code = typeof data.code === "string" ? data.code : undefined;
        apiError.redirectTo = typeof data.redirectTo === "string" ? data.redirectTo : undefined;
      }
      throw apiError;
    }

    return data as T;
  }).catch((error) => {
    if (timedOut) {
      throw new Error("Tempo esgotado ao consultar a API.");
    }
    throw error;
  }).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });

  if (cacheable) {
    apiGetCache.set(cacheKey, {
      expiresAt: Date.now() + SHELL_GET_CACHE_TTL_MS,
      promise: request,
    });
    try {
      const value = await request;
      apiGetCache.set(cacheKey, {
        expiresAt: Date.now() + SHELL_GET_CACHE_TTL_MS,
        value,
      });
      return value;
    } catch (error) {
      apiGetCache.delete(cacheKey);
      throw error;
    }
  }

  return request;
}
