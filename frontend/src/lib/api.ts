"use client";

// Cliente HTTP mínimo do frontend novo (handoff docs/TEMAS).
// Mesmo contrato do app antigo: token em localStorage ("token"),
// backend via NEXT_PUBLIC_API_URL ou proxy same-origin /hbx/api.

import { leaveWithFade } from "@/lib/leave";

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
  // Lê localStorage primeiro (sessão persistente); cai pra sessionStorage (sessão de aba).
  return (
    localStorage.getItem("token") ||
    localStorage.getItem("access_token") ||
    localStorage.getItem("accessToken") ||
    sessionStorage.getItem("token") ||
    sessionStorage.getItem("access_token") ||
    sessionStorage.getItem("accessToken")
  );
}

export function setToken(token: string, persist: boolean = true) {
  if (persist) {
    // Persistente: fica no localStorage; garante que não sobra cópia no sessionStorage.
    localStorage.setItem("token", token);
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("access_token");
    sessionStorage.removeItem("accessToken");
  } else {
    // Sessão de aba: vai pro sessionStorage; garante que não sobra cópia no localStorage.
    sessionStorage.setItem("token", token);
    localStorage.removeItem("token");
    localStorage.removeItem("access_token");
    localStorage.removeItem("accessToken");
  }
}

export function clearToken() {
  // Limpa ambos os stores — logout/401 não pode deixar token em lugar nenhum.
  localStorage.removeItem("token");
  localStorage.removeItem("access_token");
  localStorage.removeItem("accessToken");
  sessionStorage.removeItem("token");
  sessionStorage.removeItem("access_token");
  sessionStorage.removeItem("accessToken");
}

export async function apiFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  // FormData define o próprio Content-Type (boundary do multipart)
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
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
    // Sessão expirada/derrubada (login único): limpa o cliente e volta pra
    // LANDING com o card de login aberto ("/?entrar", W1 10/07 — /login morreu
    // como tela) e com aviso — sem isso a tela morria em "Carregando…" quando
    // outra sessão substituía a atual (relato do dono, 12/06/2026). pathname
    // "/" é a própria landing (login embutido) — não redireciona em cima dela.
    if (
      res.status === 401 &&
      !path.startsWith("/auth/") &&
      typeof window !== "undefined" &&
      window.location.pathname !== "/"
    ) {
      try { sessionStorage.setItem("hbx:session-notice", "expired"); } catch { /* sem storage */ }
      clearToken();
      leaveWithFade("/?entrar");
    }
    const payload = (data ?? {}) as { message?: string | string[]; error?: string };
    const rawMessage = Array.isArray(payload.message) ? payload.message[0] : payload.message;
    const err = new Error(rawMessage || payload.error || `Erro ${res.status}`) as ApiError;
    err.status = res.status;
    err.payload = data;
    throw err;
  }

  return data as T;
}
