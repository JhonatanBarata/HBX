"use client";

// Cliente HTTP mínimo do frontend novo (handoff docs/TEMAS).
// Mesmo contrato do app antigo: token em localStorage ("token"),
// backend via NEXT_PUBLIC_API_URL ou proxy same-origin /hbx/api.

const DEFAULT_API_URL =
  process.env.NODE_ENV === "production"
    ? "https://api.hbxsystem.com.br"
    : "http://localhost:3000";
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_URL).replace(/\/+$/, "");
const PROXY_PREFIX = "/hbx/api";

export type ApiError = Error & { status?: number; payload?: unknown };

export function getApiBase(): string {
  if (typeof window === "undefined") return API_URL;
  try {
    const resolved = new URL(API_URL || "/", window.location.origin);
    if (resolved.origin !== window.location.origin) {
      return `${window.location.origin}${PROXY_PREFIX}`;
    }
    return API_URL;
  } catch {
    return `${window.location.origin}${PROXY_PREFIX}`;
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return (
    localStorage.getItem("token") ||
    localStorage.getItem("access_token") ||
    localStorage.getItem("accessToken")
  );
}

export function setToken(token: string) {
  localStorage.setItem("token", token);
}

export function clearToken() {
  localStorage.removeItem("token");
  localStorage.removeItem("access_token");
  localStorage.removeItem("accessToken");
}

export async function apiFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${getApiBase()}${path}`, { ...init, headers });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const payload = (data ?? {}) as { message?: string | string[]; error?: string };
    const rawMessage = Array.isArray(payload.message) ? payload.message[0] : payload.message;
    const err = new Error(rawMessage || payload.error || `Erro ${res.status}`) as ApiError;
    err.status = res.status;
    err.payload = data;
    throw err;
  }

  return data as T;
}
