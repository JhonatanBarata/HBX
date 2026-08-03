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
export type ApiLifecycleDetail = {
  path: string;
  method: string;
  phase: "start" | "success" | "error";
  status?: number;
  message?: string;
};

// Evento leve e sem payload sensível: telas com operações longas podem reagir ao
// ciclo REAL do apiFetch sem duplicar request, monkey-patch de fetch ou estado global.
export const API_LIFECYCLE_EVENT = "hbx:api-lifecycle";

function emitApiLifecycle(detail: ApiLifecycleDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ApiLifecycleDetail>(API_LIFECYCLE_EVENT, { detail }));
}

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

// Token "vivo": existe E (não dá pra ler o exp OU o exp ainda não passou). Decodifica
// o payload do JWT só pra ler `exp` — não valida assinatura (isso é do servidor). Erro de
// parse / sem exp = trata como VIVO de propósito: um 401 nunca pode derrubar a sessão só
// porque o cliente não conseguiu ler o token. Base para "aproveitar o token sempre".
export function isTokenLive(): boolean {
  const token = getToken();
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length < 2) return true; // não é JWT decodificável → mantém
  try {
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const json = JSON.parse(typeof atob === "function" ? atob(b64) : "");
    const exp = Number((json as { exp?: unknown })?.exp);
    if (!Number.isFinite(exp)) return true; // sem exp → mantém
    return exp * 1000 > Date.now();
  } catch {
    return true; // não conseguiu ler → mantém (não desloga à toa)
  }
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

/**
 * 🔴 03/08/2026 — "A TELA FICOU PRESA EM 'Preparando seu espaço de trabalho…'".
 *
 * O guard antigo era só `!isTokenLive()`: deslogava apenas com token VENCIDO pelo
 * `exp`. Só que a morte mais comum da sessão aqui não vence o `exp` — é o servidor
 * REVOGANDO (login único: entrar numa segunda máquina derruba a primeira). O token
 * continuava "vivo" no relógio, o guard nunca disparava, e a pessoa ficava olhando
 * um carregando eterno enquanto TODA chamada voltava 401. Medido em produção
 * (03/08, 19:28): `GET /profile/current-user -> 401 AUTH_SESSION_EXPIRED :: Sessão
 * revogada`, dezenas de vezes, tela congelada.
 *
 * É o MESMO bug que o comentário abaixo diz ter matado em 12/06 — o conserto do
 * "poll de fundo expulsava todo mundo" reabriu o caso original justamente pro
 * login único, que era a cena de origem.
 *
 * O servidor já dizia a diferença e o front jogava fora: o corpo do 401 traz
 * `code` do catálogo (`AUTH_SESSION_EXPIRED`) e `action: 'login'`. Então:
 *  · servidor diz que a SESSÃO morreu → desloga, mesmo com token no prazo;
 *  · 401 sem esse selo + token vivo → é daquele endpoint (permissão, token de
 *    celular, transiente): NÃO derruba o app, exatamente como hoje;
 *  · token morto no relógio → desloga, como já fazia.
 *
 * Vale pros 5 acessos de vendedora em 5 navegadores: sem isto, qualquer uma que
 * perdesse a sessão veria a tela congelar sem uma palavra do que aconteceu.
 */
export function sessaoMorreu(payload: unknown, tokenVivo: boolean): boolean {
  if (!tokenVivo) return true;
  const corpo = (payload ?? {}) as { code?: unknown; error?: unknown; action?: unknown };
  return (
    corpo.code === "AUTH_SESSION_EXPIRED" ||
    corpo.error === "AUTH_SESSION_EXPIRED" ||
    corpo.action === "login"
  );
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

  const method = String(init.method || "GET").toUpperCase();
  emitApiLifecycle({ path, method, phase: "start" });

  let res: Response;
  try {
    res = await fetch(`${getApiBase()}${path}`, { ...init, headers });
  } catch (error) {
    emitApiLifecycle({
      path,
      method,
      phase: "error",
      message: error instanceof Error ? error.message : "Falha de conexão com o servidor.",
    });
    throw error;
  }

  let text: string;
  try {
    text = await res.text();
  } catch (error) {
    emitApiLifecycle({
      path,
      method,
      phase: "error",
      status: res.status,
      message: error instanceof Error ? error.message : "A resposta do servidor foi interrompida.",
    });
    throw error;
  }

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
      window.location.pathname !== "/" &&
      sessaoMorreu(data, isTokenLive())
    ) {
      try { sessionStorage.setItem("hbx:session-notice", "expired"); } catch { /* sem storage */ }
      clearToken();
      leaveWithFade("/?entrar");
    }
    const payload = (data ?? {}) as { message?: string | string[]; error?: string };
    const rawMessage = Array.isArray(payload.message) ? payload.message[0] : payload.message;
    const message = rawMessage || payload.error || `Erro ${res.status}`;
    emitApiLifecycle({ path, method, phase: "error", status: res.status, message });
    const err = new Error(message) as ApiError;
    err.status = res.status;
    err.payload = data;
    throw err;
  }

  emitApiLifecycle({ path, method, phase: "success", status: res.status });
  return data as T;
}
