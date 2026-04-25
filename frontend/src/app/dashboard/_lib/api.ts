"use client";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const DASHBOARD_API_PROXY_PREFIX = "/hbx/api";
const SHELL_GET_CACHE_TTL_MS = 30000;
const SHELL_GET_CACHE_PATHS = new Set([
  "/profile/current-user",
  "/modules/me",
  "/profile/theme-preferences",
]);

type ApiErrorPayload = {
  message?: string | string[];
  error?: string;
};

type ApiCacheEntry = {
  expiresAt: number;
  value?: unknown;
  promise?: Promise<unknown>;
};

type ApiFetchInit = RequestInit & {
  skipAuth?: boolean;
  requireAuth?: boolean;
  timeoutMs?: number;
};

const apiGetCache = new Map<string, ApiCacheEntry>();

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

function isApiErrorPayload(value: unknown): value is ApiErrorPayload {
  return Boolean(value) && typeof value === "object";
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return (
    localStorage.getItem("token") ||
    localStorage.getItem("access_token") ||
    localStorage.getItem("accessToken")
  );
}

export function setToken(token: string, options?: { notify?: boolean }) {
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
  clearApiCache();
  localStorage.removeItem("token");
  localStorage.removeItem("access_token");
  localStorage.removeItem("accessToken");
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new Event("auth-change"));
    } catch {
      // ignore event dispatch errors
    }
  }
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

function parseErrorMessage(data: unknown): string {
  if (!data) return "Erro";
  if (!isApiErrorPayload(data)) return "Erro";

  if (typeof data.message === "string") return data.message;
  if (Array.isArray(data.message)) return data.message.join(", ");
  if (typeof data.error === "string") return data.error;
  return "Erro";
}

function dispatchTechAssistantApiError(detail: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent("hbx-tech-assistant:api-error", {
        detail,
      }),
    );
  } catch {
    // ignore event dispatch errors
  }
}

export async function apiFetch<T>(
  path: string,
  init?: ApiFetchInit
): Promise<T> {
  const { skipAuth, requireAuth, timeoutMs, ...fetchInit } = init || {};
  const url = path.startsWith("http") ? path : `${getDashboardApiBaseUrl()}${path}`;
  const token = getToken();
  if (requireAuth && !skipAuth && !token) {
    throw new Error("Sessão expirada. Faça login novamente.");
  }
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
      const message = typeof data === "string" ? data : parseErrorMessage(data);
      dispatchTechAssistantApiError({
        path,
        url,
        method: String(fetchInit.method || "GET").toUpperCase(),
        status: res.status,
        message,
        response:
          typeof data === "string"
            ? data.slice(0, 1200)
            : JSON.stringify(data ?? null).slice(0, 1200),
        at: new Date().toISOString(),
      });
      throw new Error(message);
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
